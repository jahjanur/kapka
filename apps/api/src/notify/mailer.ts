import nodemailer from 'nodemailer';
import { env } from '../env';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  /** The provider's id for the message, stored so a bounce can be traced. */
  providerId: string;
}

/**
 * Anything that can deliver an email.
 *
 * An interface rather than a direct SendGrid call so dispatch can be tested
 * without a network — and so the local transport, which must never reach a
 * real inbox, is the same shape as the production one.
 */
export interface Mailer {
  send(email: OutgoingEmail): Promise<SendResult>;
}

/** Delivers to Mailpit locally. Nothing leaves the machine (§2). */
export function createSmtpMailer(): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Mailpit speaks plain SMTP on localhost; there is no certificate and
    // nothing to protect between two processes on one machine.
    secure: false,
    ignoreTLS: true,
  });

  return {
    async send(email) {
      const info = await transport.sendMail({ from: env.MAIL_FROM, ...email });
      return { providerId: info.messageId };
    },
  };
}

/**
 * SendGrid's v3 API, over fetch rather than their SDK — it is one POST, and a
 * dependency that ships its own HTTP stack is not worth it for that.
 */
export function createSendGridMailer(): Mailer {
  return {
    async send(email) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email.to }] }],
          from: { email: env.MAIL_FROM },
          subject: email.subject,
          content: [
            { type: 'text/plain', value: email.text },
            { type: 'text/html', value: email.html },
          ],
        }),
      });

      if (!response.ok) {
        // The body carries SendGrid's reason; the caller records it against
        // the notification row rather than losing it.
        throw new Error(
          `SendGrid responded ${String(response.status)}: ${(await response.text()).slice(0, 200)}`,
        );
      }
      return { providerId: response.headers.get('x-message-id') ?? '' };
    },
  };
}

/**
 * The transport this environment is allowed to use.
 *
 * env.ts already refuses `sendgrid` outside production, so this cannot quietly
 * reach a real inbox from a laptop.
 */
export function createMailer(): Mailer {
  return env.MAIL_TRANSPORT === 'sendgrid' ? createSendGridMailer() : createSmtpMailer();
}
