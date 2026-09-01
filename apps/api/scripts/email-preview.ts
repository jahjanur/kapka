/**
 * Renders the emails Kapka sends to files, and optionally mails them somewhere
 * real.
 *
 * The unit tests assert the rules Gmail, Outlook and Apple Mail impose on the
 * markup. They cannot assert how it looks — that needs the mail opened in
 * those clients, which needs it sent. This is how you send it.
 *
 *   npm run email:preview                    write the fixtures to preview/
 *   npm run email:preview -- you@gmail.com   also mail them there
 *
 * Sending uses PREVIEW_SMTP_* and goes to the address you name on the command
 * line. It deliberately does not use the application's mailer: that one is
 * pinned to Mailpit outside production so it can never reach a donor by
 * accident, and that guard is worth more than the convenience of reusing it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { buildEmail, type RequestSummary } from '../src/notify/email';
import { buildVerificationEmail } from '../src/notify/verifyEmail';
import type { OutgoingEmail } from '../src/notify/mailer';

const LINKS = {
  request: 'https://kapka.mk/requests/11111111-1111-4111-8111-111111111111',
  pauseNotifications: 'https://kapka.mk/me/notifications',
};

/** Long enough to wrap in a narrow client, like the real ones. */
const CONFIRMATION_LINK =
  'https://kapka.mk/verify-email?token=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdo';

/**
 * The cases worth looking at with your own eyes, not the happy path four
 * times. Each one has broken a client for somebody at some point.
 */
const FIXTURES: { name: string; donor: string; request: RequestSummary }[] = [
  {
    name: '01-critical-o-neg',
    donor: 'Ana',
    request: {
      id: 'r1',
      bloodType: 'O-',
      unitsNeeded: 2,
      urgency: 'critical',
      hospitalName: 'City General',
      city: 'Skopje',
    },
  },
  {
    name: '02-routine-single-unit',
    donor: 'Bojan',
    request: {
      id: 'r2',
      bloodType: 'AB+',
      unitsNeeded: 1,
      urgency: 'routine',
      hospitalName: 'Re-Medika',
      city: 'Bitola',
    },
  },
  {
    // Cyrillic and a long name: the subject truncates, and the heading wraps.
    name: '03-cyrillic-long-name',
    donor: 'Марија',
    request: {
      id: 'r3',
      bloodType: 'B-',
      unitsNeeded: 4,
      urgency: 'urgent',
      hospitalName: 'Универзитетска клиника за хируршки болести Св. Наум Охридски',
      city: 'Скопје',
    },
  },
  {
    // An ampersand and a quote, which is where escaping goes wrong.
    name: '04-awkward-characters',
    donor: "O'Brien",
    request: {
      id: 'r4',
      bloodType: 'A+',
      unitsNeeded: 3,
      urgency: 'urgent',
      hospitalName: 'Mother & Child "Annex"',
      city: 'Tetovo',
    },
  },
];

async function main(): Promise<void> {
  const recipient = process.argv[2];
  const outDir = join(import.meta.dirname, '..', 'preview');
  mkdirSync(outDir, { recursive: true });

  const built: { name: string; email: OutgoingEmail }[] = [
    ...FIXTURES.map((fixture) => ({
      name: fixture.name,
      email: buildEmail(fixture.request, fixture.donor, LINKS),
    })),
    /* The confirmation email shares the shell with the notification, so it
       breaks in the same clients and belongs in the same walk-through. */
    {
      name: '05-confirm-email',
      email: buildVerificationEmail('Ana', CONFIRMATION_LINK),
    },
  ];

  for (const { name, email } of built) {
    writeFileSync(join(outDir, `${name}.html`), email.html, 'utf8');
    writeFileSync(join(outDir, `${name}.txt`), email.text, 'utf8');
    console.log(`${name}\n  ${email.subject}`);
  }
  console.log(`\nWritten to ${outDir}`);

  if (!recipient) {
    console.log('\nA browser is not an email client. To check the real thing:');
    console.log('  npm run email:preview -- you@example.com');
    return;
  }

  const transport = nodemailer.createTransport({
    host: process.env.PREVIEW_SMTP_HOST ?? '127.0.0.1',
    port: Number(process.env.PREVIEW_SMTP_PORT ?? '1025'),
    secure: process.env.PREVIEW_SMTP_SECURE === 'true',
    auth: process.env.PREVIEW_SMTP_USER
      ? {
          user: process.env.PREVIEW_SMTP_USER,
          pass: process.env.PREVIEW_SMTP_PASS ?? '',
        }
      : undefined,
  });

  for (const { name, email } of built) {
    await transport.sendMail({
      from: process.env.PREVIEW_SMTP_FROM ?? 'Kapka <no-reply@kapka.mk>',
      to: recipient,
      subject: `[${name}] ${email.subject}`,
      text: email.text,
      html: email.html,
    });
    console.log(`sent ${name} -> ${recipient}`);
  }
  console.log('\nNow work through src/notify/EMAIL-TESTING.md in each client.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
