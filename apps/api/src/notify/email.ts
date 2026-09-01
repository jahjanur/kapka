import {
  announceBloodType,
  formatBloodType,
  type BloodType,
  type Urgency,
} from '@kapka/shared';
import { COLOR, escapeHtml, renderShell } from './emailLayout';
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
 * The layout, the colours and the client workarounds all live in
 * emailLayout.ts, shared with the confirmation email. What is here is what
 * this particular message has to say.
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

  const html = renderShell({
    title: subjectFor(request),
    preheader: preheaderFor(request, units),
    eyebrow: URGENCY_WORD[request.urgency],
    heading: `${bloodType} blood needed`,
    bodyHtml: `<p style="margin:0 0 16px 0;">Hello ${escapeHtml(donorName)}, someone at <strong>${escapeHtml(request.hospitalName)}</strong> in ${escapeHtml(request.city)} needs ${escapeHtml(bloodType)} blood &mdash; ${escapeHtml(units)}.</p>
        <p style="margin:0 0 24px 0;">Your blood type can help with this request.</p>`,
    cta: { href: links.request, label: 'See the request' },
    footerHtml: `<p style="margin:16px 0 0 0;">Not able to give right now? <a href="${escapeHtml(links.pauseNotifications)}" style="color:${COLOR.textMuted};">Pause these emails</a>.</p>`,
  });

  return { to: '', subject: subjectFor(request), text, html };
}

export { announceBloodType };
