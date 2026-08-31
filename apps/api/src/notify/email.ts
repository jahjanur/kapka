import {
  announceBloodType,
  formatBloodType,
  type BloodType,
  type Urgency,
} from '@kapka/shared';
import type { OutgoingEmail } from './mailer';

export interface RequestSummary {
  id: string;
  bloodType: BloodType;
  unitsNeeded: number;
  urgency: Urgency;
  hospitalName: string;
  city: string;
}

// The subject reads "<word>: O- blood needed at ...", so 'Needed' here would
// say needed twice in the one line that has to be scannable at a glance.
const URGENCY_WORD: Record<Urgency, string> = {
  routine: 'Requested',
  urgent: 'Urgent',
  critical: 'Critical',
};

/**
 * Literal colours, and the one place in the codebase where that is correct.
 *
 * The house rule is that every colour comes from the design tokens (§7). Email
 * cannot follow it: Outlook's Word rendering engine has no custom properties,
 * no external stylesheets and no <style> block worth trusting, so every colour
 * has to be a literal hex in an inline style attribute. OKLCH is out for the
 * same reason.
 *
 * These mirror the tokens named beside them. If a token changes, change these
 * too — the pairing is the only thing keeping the email looking like the site.
 */
const COLOR = {
  pageBg: '#f6f7f9', // --bg-subtle
  cardBg: '#ffffff', // --bg-surface
  text: '#1b1d21', // --fg-primary
  textMuted: '#5b6068', // --fg-secondary
  rule: '#e6e8eb', // --border-subtle
  accent: '#c0392b', // --accent (crimson-500)
  onAccent: '#ffffff', // --fg-onAccent
} as const;

const FONT_STACK = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/**
 * The notification a donor receives (§5.4).
 *
 * The subject does most of the work — it has to be readable in a notification
 * preview, where perhaps forty characters are visible before it truncates.
 */
export function subjectFor(request: RequestSummary): string {
  return `${URGENCY_WORD[request.urgency]}: ${formatBloodType(request.bloodType)} blood needed at ${request.hospitalName}, ${request.city}`;
}

/**
 * The line the inbox shows after the subject, before anyone opens anything.
 *
 * Without one, clients scrape the first text in the body — which is the
 * greeting, so every notification would preview as "Hello Ana, someone at".
 * That is a wasted second line in the exact place a donor decides whether this
 * is worth opening now.
 */
function preheaderFor(request: RequestSummary, units: string): string {
  return `${units} needed in ${request.city}. You are a match.`;
}

/**
 * Table-based layout, inline styles, no flexbox or grid, 600px wide (§5.4).
 * Email clients are not browsers and Outlook in particular is not close.
 *
 * The parts that look redundant are not:
 *   - the mso conditional table, because Outlook ignores max-width and would
 *     otherwise stretch this to the full window width;
 *   - the VML roundrect, because Outlook drops padding on an inline-block
 *     anchor and the call to action would collapse to bare underlined text;
 *   - the duplicated width="600" attribute beside the CSS, because attribute
 *     widths are what the older Outlooks actually read;
 *   - color-scheme, because Apple Mail and Outlook.com auto-invert a light
 *     email otherwise, and they invert the crimson too.
 */
export function buildEmail(
  request: RequestSummary,
  donorName: string,
  links: { request: string; pauseNotifications: string },
): OutgoingEmail {
  const bloodType = formatBloodType(request.bloodType);
  const units = `${String(request.unitsNeeded)} ${request.unitsNeeded === 1 ? 'unit' : 'units'}`;
  const preheader = preheaderFor(request, units);

  const text = [
    `Hello ${donorName},`,
    '',
    `Someone at ${request.hospitalName} in ${request.city} needs ${bloodType} blood — ${units}.`,
    `Your blood type can help with this request.`,
    '',
    `See the request: ${links.request}`,
    '',
    `If you would rather not receive these, pause them here: ${links.pauseNotifications}`,
  ].join('\n');

  const requestHref = escapeHtml(links.request);

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subjectFor(request))}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:${COLOR.pageBg};">
<span style="display:none;font-size:1px;color:${COLOR.pageBg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.pageBg};padding:24px 0;">
  <tr><td align="center">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COLOR.cardBg};border-radius:12px;font-family:${FONT_STACK};color:${COLOR.text};">
      <tr><td style="padding:28px 28px 8px 28px;">
        <p style="margin:0 0 4px 0;font-size:14px;color:${COLOR.textMuted};">${escapeHtml(URGENCY_WORD[request.urgency])}</p>
        <h1 style="margin:0;font-size:24px;line-height:1.25;">${escapeHtml(bloodType)} blood needed</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 0 28px;font-size:16px;line-height:1.55;">
        <p style="margin:0 0 16px 0;">Hello ${escapeHtml(donorName)}, someone at <strong>${escapeHtml(request.hospitalName)}</strong> in ${escapeHtml(request.city)} needs ${escapeHtml(bloodType)} blood &mdash; ${escapeHtml(units)}.</p>
        <p style="margin:0 0 24px 0;">Your blood type can help with this request.</p>
      </td></tr>
      <tr><td style="padding:0 28px 28px 28px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${requestHref}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="17%" stroke="f" fillcolor="${COLOR.accent}">
          <w:anchorlock/>
          <center style="color:${COLOR.onAccent};font-family:${FONT_STACK};font-size:16px;font-weight:600;">See the request</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${requestHref}" style="display:inline-block;background:${COLOR.accent};color:${COLOR.onAccent};text-decoration:none;padding:14px 24px;border-radius:8px;font-size:16px;font-weight:600;">See the request</a>
        <!--<![endif]-->
      </td></tr>
      <tr><td style="padding:0 28px 28px 28px;font-size:13px;line-height:1.5;color:${COLOR.textMuted};border-top:1px solid ${COLOR.rule};">
        <p style="margin:16px 0 0 0;">Not able to give right now? <a href="${escapeHtml(links.pauseNotifications)}" style="color:${COLOR.textMuted};">Pause these emails</a>.</p>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`;

  return { to: '', subject: subjectFor(request), text, html };
}

/** A hospital name or a note is user-supplied and goes straight into markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { announceBloodType };
