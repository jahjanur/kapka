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

const URGENCY_WORD: Record<Urgency, string> = {
  routine: 'Needed',
  urgent: 'Urgent',
  critical: 'Critical',
};

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
 * Table-based layout, inline styles, no flexbox or grid, 600px wide (§5.4).
 * Email clients are not browsers and Outlook in particular is not close.
 */
export function buildEmail(
  request: RequestSummary,
  donorName: string,
  links: { request: string; pauseNotifications: string },
): OutgoingEmail {
  const bloodType = formatBloodType(request.bloodType);
  const units = `${String(request.unitsNeeded)} ${request.unitsNeeded === 1 ? 'unit' : 'units'}`;

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

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1b1d21;">
      <tr><td style="padding:28px 28px 8px 28px;">
        <p style="margin:0 0 4px 0;font-size:14px;color:#5b6068;">${escapeHtml(URGENCY_WORD[request.urgency])}</p>
        <h1 style="margin:0;font-size:24px;line-height:1.25;">${escapeHtml(bloodType)} blood needed</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 0 28px;font-size:16px;line-height:1.55;">
        <p style="margin:0 0 16px 0;">Hello ${escapeHtml(donorName)}, someone at <strong>${escapeHtml(request.hospitalName)}</strong> in ${escapeHtml(request.city)} needs ${escapeHtml(bloodType)} blood &mdash; ${escapeHtml(units)}.</p>
        <p style="margin:0 0 24px 0;">Your blood type can help with this request.</p>
      </td></tr>
      <tr><td style="padding:0 28px 28px 28px;">
        <a href="${escapeHtml(links.request)}" style="display:inline-block;background:#c0392b;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:16px;font-weight:600;">See the request</a>
      </td></tr>
      <tr><td style="padding:0 28px 28px 28px;font-size:13px;line-height:1.5;color:#5b6068;border-top:1px solid #e6e8eb;">
        <p style="margin:16px 0 0 0;">Not able to give right now? <a href="${escapeHtml(links.pauseNotifications)}" style="color:#5b6068;">Pause these emails</a>.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

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
