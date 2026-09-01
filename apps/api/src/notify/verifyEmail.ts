import { escapeHtml, renderShell } from './emailLayout';
import type { OutgoingEmail } from './mailer';

/**
 * The confirmation email (§12).
 *
 * It has exactly one job, and the subject says what the tap is for rather than
 * what we want: a donor who registered ninety seconds ago is looking for this
 * message in a list of forty others.
 */
export const VERIFICATION_SUBJECT = 'Confirm your email to join the donor list';

/**
 * What a donor gets straight after registering, and again whenever they ask.
 *
 * The link points at the web app, not at this API: mail scanners in corporate
 * inboxes follow links before the recipient does, and a GET that spends the
 * token would be spent by the scanner before the donor ever saw it. The page
 * the link opens posts the token back — which a link-follower does not do.
 */
export function buildVerificationEmail(donorName: string, link: string): OutgoingEmail {
  const text = [
    `Hello ${donorName},`,
    '',
    'You registered as a blood donor on Kapka. Confirming your email address is',
    'the last step — until you do, we cannot add you to the list we contact when',
    'someone near you needs your blood type.',
    '',
    `Confirm your email: ${link}`,
    '',
    'The link works for 24 hours.',
    'If you did not register on Kapka, ignore this email and nothing happens.',
  ].join('\n');

  const html = renderShell({
    title: VERIFICATION_SUBJECT,
    // The preview line says what happens next, not what has happened.
    preheader: 'One tap and you are on the donor list.',
    eyebrow: 'Kapka',
    heading: 'Confirm your email',
    bodyHtml: `<p style="margin:0 0 16px 0;">Hello ${escapeHtml(donorName)}, you registered as a blood donor. Confirming your email address is the last step.</p>
        <p style="margin:0 0 24px 0;">Until you do, we cannot add you to the list we contact when someone near you needs your blood type.</p>`,
    // Wider than the notification's button: the label is longer, and Outlook
    // draws the VML box at exactly the width it is told.
    cta: { href: link, label: 'Confirm my email', width: 220 },
    // No second link here on purpose: the one thing someone who did not
    // register should be told is that doing nothing is the correct move.
    footerHtml: `<p style="margin:16px 0 0 0;">The link works for 24 hours. If you did not register on Kapka, ignore this email — nothing happens until somebody confirms the address.</p>`,
  });

  return { to: '', subject: VERIFICATION_SUBJECT, text, html };
}
