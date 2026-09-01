# Testing the donor notification in real clients

`email.test.ts` covers what can be asserted about the markup: tables not divs,
no stylesheet, a 600px cap expressed both ways, the Outlook conditionals, the
VML button, the preheader, the colour-scheme pins, and escaping.

It cannot cover what the email **looks like**. Nothing running in CI can. That
needs the mail opened in the clients donors actually use, and it is a person's
job.

## Sending yourself the fixtures

```bash
cd apps/api
npm run email:preview                      # write preview/*.html
npm run email:preview -- you@example.com   # and send them
```

Sending defaults to Mailpit on `127.0.0.1:1025` (`docker compose up`). To reach
a real inbox, point it at an SMTP account you control:

```bash
PREVIEW_SMTP_HOST=smtp.gmail.com PREVIEW_SMTP_PORT=465 PREVIEW_SMTP_SECURE=true \
PREVIEW_SMTP_USER=you@gmail.com PREVIEW_SMTP_PASS='<app password>' \
npm run email:preview -- you@example.com
```

This does not go through the application's mailer. That one is pinned to
Mailpit outside production so it can never reach a donor by accident, and that
guard is worth keeping.

Five fixtures are sent, subject-prefixed with the fixture name:

|                          |                                                                            |
| ------------------------ | -------------------------------------------------------------------------- |
| `01-critical-o-neg`      | the ordinary case                                                          |
| `02-routine-single-unit` | singular "1 unit", lowest urgency                                          |
| `03-cyrillic-long-name`  | Cyrillic; a hospital name that truncates the subject and wraps the heading |
| `04-awkward-characters`  | `&`, `"` and `'` — where escaping goes wrong                               |
| `05-confirm-email`       | the confirmation link; same shell, so the same clients break it            |

## The checklist

Work through it per client. The four that matter most are marked ★.

### Every client

- [ ] ★ The **See the request** button is a filled crimson box with white text,
      not bare underlined text. This is the one element the whole email exists
      for.
- [ ] ★ The card is ~600px and centred, not stretched to the window width.
- [ ] Blood type, hospital, city and unit count are all visible without
      scrolling on a phone.
- [ ] The heading reads as a heading — larger and heavier than the body.
- [ ] "Pause these emails" is present, and clicking it goes somewhere real.
- [ ] Cyrillic renders as Cyrillic, not as `?` or mojibake (fixture 03).
- [ ] `&` and `"` render as themselves, with no stray `&amp;` (fixture 04).
- [ ] The inbox preview line reads "2 units needed in Skopje. You are a match."
      and **not** "Hello Ana, someone at" — that is the preheader working.

### Gmail — web, Android, iOS

- [ ] ★ The layout survives. Gmail strips `<style>`, so if anything depends on
      a stylesheet it collapses here first.
- [ ] Gmail has not clipped the message ("[Message clipped] View entire
      message"). That means the HTML crossed ~102KB.
- [ ] The Android app in dark mode has not inverted the crimson to a green.

### Outlook — desktop Windows (2016/2019/365), and outlook.com

- [ ] ★ **Desktop is the one that breaks.** It renders through Word. Check the
      button is still a crimson box — if it is plain blue underlined text, the
      VML roundrect is not being picked up.
- [ ] The card has not stretched to fill a maximised window (the `[if mso]`
      fixed-width table).
- [ ] Text is not oversized — that is the 96 DPI declaration failing.
- [ ] Corners: Word ignores `border-radius`, so square corners on desktop
      Outlook are expected and fine. Everywhere else they should be rounded.
- [ ] outlook.com dark mode has not inverted the card to dark grey with
      unreadable text.

### Apple Mail — macOS and iOS

- [ ] ★ In **dark mode**, the card stays white with dark text. Apple Mail
      auto-inverts a light email unless `color-scheme` is honoured.
- [ ] iOS has not shrunk the text to fit
      (`x-apple-disable-message-reformatting`).
- [ ] Rotating the phone to landscape does not introduce a horizontal scroll.

### Plain text

- [ ] View source / "plain text alternative": both URLs are present and
      clickable, and there is no HTML in it.

## Known and accepted

- **Square corners in desktop Outlook.** Word has no `border-radius`. The VML
  button keeps its rounded corners via `arcsize`; the card does not. Not worth
  a background image to fix.
- **No logo or images.** Nothing to block, nothing to alt-text, nothing to slow
  the load. Add one only with a real reason.
- **Light only.** A dark variant would need `prefers-color-scheme` in a
  `<style>` block, which Gmail strips — so it would work in Apple Mail and not
  in Gmail. Pinning to light is the more predictable half.

## When you change the template

Rerun the fixtures and walk the ★ items again at minimum. The unit tests will
catch a deleted conditional comment; they will not catch an email that is
merely ugly.
