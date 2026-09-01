# Deploying to Render

**Status: not deployed.** There is no Render account reachable from here — no
credentials, no CLI, no service to talk to. And production is the one action in
this repo that reaches strangers: it emails real donors and puts a hospital's
phone number on the public internet. Even with the keys, that is a button
somebody should press deliberately.

What is here is `render.yaml` — the whole thing, staging and production — and
the order to apply it in. Everything in it that could be checked without an
account has been.

## What was verified locally

- The blueprint parses, and names six services and two databases.
- `npm run migrate:deploy --workspace @kapka/api` applies all eight migrations
  with only `DATABASE_URL` in the environment and no `.env` file, and is
  idempotent on a second run. Without `DATABASE_URL` it exits 1 rather than
  quietly reaching for a default.
- The API boots under exactly the variables the blueprint sets —
  `NODE_ENV=production`, a generated `JWT_ACCESS_SECRET`, `MAIL_TRANSPORT=smtp`
  — and `/api/health` answers 200.
- `VITE_API_URL=/api npm run build --workspace @kapka/web` succeeds, and the
  built bundle calls `` `/api` `` through the real HTTP client. Not the seed
  client, which is what a missing `VITE_API_URL` would have shipped.

## Two things this repo got wrong for Render, now fixed

**`_headers` and `_redirects` do nothing here.** They are the Netlify and
Cloudflare Pages convention, and README's deployment note flagged them as
unverified. Render does not read either file. Without the `routes` block in
`render.yaml`, every deep link — every `/requests/<id>` in every email we send
— would have returned 404, and every security header would have been lost.
Both are now expressed the way Render listens to. **They are duplicated: change
one, change both.**

**`tsx` was a devDependency.** `npm start` is `tsx src/index.ts`, so tsx runs
the server. With `NODE_ENV=production` set, `npm ci` omits devDependencies and
the service would have failed to start. It is a runtime dependency now.

## Why the browser must only see one origin

The static site and the API are separate services with separate hostnames, and
the blueprint rewrites `/api/*` from the site to the API. That is not
decoration. Two things in the app refuse to work cross-origin:

- `index.html` ships `connect-src 'self'`. A cross-origin API call is refused
  by the browser before it is sent — no CORS header can rescue it.
- The refresh cookie is `SameSite=Strict`. Cross-origin it is never attached,
  so every reload signs the user out.

`VITE_API_URL` is therefore `/api`, and must stay relative.

## Before the first apply

Four values the blueprint cannot carry, marked `sync: false` — set them in the
dashboard:

| Service             | Key                      | What                                                                                                                                                                         |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kapka-api-staging` | `SMTP_HOST`, `SMTP_PORT` | A mail catcher. Mailtrap or equivalent. This is the only thing stopping staging emailing real people.                                                                        |
| `kapka-api`         | `SENDGRID_API_KEY`       | The live key. `env.ts` refuses to boot with `MAIL_TRANSPORT=sendgrid` and no key, so a missing one is a failed deploy rather than a silent evening of nobody being notified. |

Two more, for error reporting — `SENTRY_DSN` on each API service and
`VITE_SENTRY_DSN` on each static site. Both are `sync: false`. The web one is
read at **build time**, so setting it needs a redeploy to take effect. See
[monitoring.md](monitoring.md).

Also confirm before applying:

- **`preDeployCommand` is available on the instance type you choose.** It is
  not on every plan. If it is not, the migration must be run by hand against
  the new database before the service takes traffic — and the deploy is not
  safe until it has been.
- **No plan or instance size is specified anywhere in the blueprint.** That is
  deliberate: pick them in the dashboard rather than have this file assert
  costs. Region is `frankfurt` throughout, as the closest to Skopje.

## Applying it

### 1. Staging

Create the blueprint from `render.yaml`. Then, **before testing anything**:

> **Check the API's real hostname.** `onrender.com` names are globally unique.
> If `kapka-api-staging` was taken, Render assigned something else, and the
> rewrite destination in `render.yaml` is now pointing at a service that is not
> ours. Correct `destination`, `APP_BASE_URL` and `CORS_ORIGINS` together, and
> redeploy. The same applies to any custom domain later.

### 2. Verify staging

The point of staging is the things localhost cannot show. In order:

- [ ] `/api/health` returns 200.
- [ ] A deep link opens the app rather than 404 — paste
      `https://kapka-staging.onrender.com/requests/anything`. This is the
      `_redirects` question, answered for real.
- [ ] Response headers on the site include `X-Frame-Options: DENY` and
      `Strict-Transport-Security`. `curl -sI` is enough.
- [ ] Register through the UI. The row lands in the staging database and the
      confirmation email arrives **in the catcher and nowhere else**. Check the
      catcher before believing it.
- [ ] Follow the link in that email. It has to point at the staging site, not
      at localhost — that is `APP_BASE_URL` doing its job.
- [ ] Reload a signed-in page. Still signed in, which proves the refresh cookie
      survived the proxy.
- [ ] Post a request, approve it as an admin, confirm the notification email
      lands in the catcher.
- [ ] Rate limiting is on. Six failed logins in a minute should be refused —
      staging runs `NODE_ENV=production` precisely so this is testable.
- [ ] The cron job: trigger `kapka-expire-staging` by hand once and read its
      log.

Do not skip to production because staging "looks fine". Each line above is a
thing that has only ever been true on a laptop.

### 3. Production

Same blueprint, same hostname check. Then walk the staging list again against
production, with one difference: **stop before approving a request**, because
approving emails real people. Approve only when a real request from a real
hospital is in the queue.

### Rolling back

Render keeps previous deploys; roll back from the dashboard. Migrations do not
roll back with the service — every migration in this repo has a down section
(README's rule), so a schema rollback is `npm run migrate:down` against that
database, run deliberately and one step at a time.

## Still outstanding

Carried from earlier work, and all of it is a production concern:

- `TRUST_PROXY_HOPS` is 1, which is right for a service behind Render alone.
  Putting a CDN in front makes it 2. Wrong in either direction is a security
  bug: too low and the whole internet shares one rate-limit bucket, too high
  and anyone can spoof their way out of it.
- `privacy@kapka.mk` is printed in the privacy notice. Confirm the mailbox
  exists before the notice is public.
- `MAIL_FROM` is `no-reply@kapka.mk`. SendGrid will not deliver from a domain
  it has not verified — do the sender authentication before the first approval,
  not after.
- The uptime check itself is not set up: it needs an account somewhere
  off-platform, watching `/api/ready`. `monitoring.md` says what to configure
  and why it must not run on Render.
- The two protocols in this directory, `device-pass.md` and
  `usability-sessions.md`, are both unrun and both are about the phone in
  somebody's hand. Staging is the first URL they can be run against.
