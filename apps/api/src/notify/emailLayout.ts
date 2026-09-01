/**
 * The parts every Kapka email shares: the colours, the 600px card, and the
 * client workarounds that keep it from falling apart in Outlook.
 *
 * Extracted rather than copied. The mso conditional table, the VML button and
 * the duplicated width attribute are not things anyone should re-derive by
 * hand for a second message — a copy is a copy that drifts, and the drift only
 * shows up in somebody's inbox, months later, in a client nobody here runs.
 */

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
export const COLOR = {
  pageBg: '#f6f7f9', // --bg-subtle
  cardBg: '#ffffff', // --bg-surface
  text: '#1b1d21', // --fg-primary
  textMuted: '#5b6068', // --fg-secondary
  rule: '#e6e8eb', // --border-subtle
  accent: '#c0392b', // --accent (crimson-500)
  onAccent: '#ffffff', // --fg-onAccent
} as const;

export const FONT_STACK = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/** Anything user-supplied — a hospital name, a donor's name — goes through this. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface EmailShell {
  /** The document title. Usually the subject. Escaped here. */
  title: string;
  /**
   * The line the inbox shows after the subject, before anyone opens anything.
   * Without one, clients scrape the first text in the body — which is the
   * greeting, so every message would preview as "Hello Ana, someone at".
   * Escaped here.
   */
  preheader: string;
  /** The small line above the heading. Escaped here. */
  eyebrow: string;
  /** Escaped here. */
  heading: string;
  /** Body markup, already escaped by the caller — it contains its own tags. */
  bodyHtml: string;
  cta: {
    href: string;
    label: string;
    /** Outlook draws the VML button at a fixed width; nothing else uses it. */
    width?: number;
  };
  /** Footer markup, already escaped by the caller. */
  footerHtml: string;
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
export function renderShell(parts: EmailShell): string {
  const href = escapeHtml(parts.cta.href);
  const label = escapeHtml(parts.cta.label);
  const ctaWidth = String(parts.cta.width ?? 200);

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(parts.title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:${COLOR.pageBg};">
<span style="display:none;font-size:1px;color:${COLOR.pageBg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(parts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.pageBg};padding:24px 0;">
  <tr><td align="center">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COLOR.cardBg};border-radius:12px;font-family:${FONT_STACK};color:${COLOR.text};">
      <tr><td style="padding:28px 28px 8px 28px;">
        <p style="margin:0 0 4px 0;font-size:14px;color:${COLOR.textMuted};">${escapeHtml(parts.eyebrow)}</p>
        <h1 style="margin:0;font-size:24px;line-height:1.25;">${escapeHtml(parts.heading)}</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 0 28px;font-size:16px;line-height:1.55;">
        ${parts.bodyHtml}
      </td></tr>
      <tr><td style="padding:0 28px 28px 28px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${ctaWidth}px;" arcsize="17%" stroke="f" fillcolor="${COLOR.accent}">
          <w:anchorlock/>
          <center style="color:${COLOR.onAccent};font-family:${FONT_STACK};font-size:16px;font-weight:600;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${href}" style="display:inline-block;background:${COLOR.accent};color:${COLOR.onAccent};text-decoration:none;padding:14px 24px;border-radius:8px;font-size:16px;font-weight:600;">${label}</a>
        <!--<![endif]-->
      </td></tr>
      <tr><td style="padding:0 28px 28px 28px;font-size:13px;line-height:1.5;color:${COLOR.textMuted};border-top:1px solid ${COLOR.rule};">
        ${parts.footerHtml}
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`;
}
