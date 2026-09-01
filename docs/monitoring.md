# Error tracking and uptime

## The two probes

|                   | Answers                | Who watches it               | What happens when it fails  |
| ----------------- | ---------------------- | ---------------------------- | --------------------------- |
| `GET /api/health` | Is the process alive?  | Render, as `healthCheckPath` | Render restarts the service |
| `GET /api/ready`  | Can it actually serve? | An external uptime monitor   | Somebody is paged           |

They are separate on purpose, and the separation is the whole point.

`/health` deliberately does not touch the database. Render restarts a service
that fails its health check, so if liveness depended on Postgres, a database
blip would restart the API — turning a database problem into an API outage and
then into a restart loop. Liveness must not care about anything it cannot fix
by restarting.

`/ready` runs `SELECT 1` with a three-second timeout and answers 200 or 503.
This is the one worth alerting on. Before it existed the only endpoint a
monitor could watch was `/health`, which would have reported a green service
for as long as it took a human to notice that nothing worked.

Both sit above the rate limiter, so a monitor polling on a schedule can never
be throttled into reporting an outage that is not one.

## Setting up the uptime check

**Not done — it needs an account this repo has no access to.** UptimeRobot,
Better Stack, Pingdom, any of them. What to configure:

- **URL:** `https://kapka.onrender.com/api/ready` — through the static site, so
  the check exercises the rewrite as well as the API. A check pointed straight
  at the API service would stay green through a routing failure that made the
  site useless.
- **Interval:** one minute.
- **Expect:** HTTP 200. Optionally the body containing `"status":"ready"`.
- **Alert after:** two consecutive failures, so one slow response at 3am does
  not wake anybody.
- Do the same for staging at a longer interval, or not at all. Nobody should be
  paged for staging.

**It has to be off-platform.** A cron job on Render checking a Render service
tells you nothing when Render is the thing that is down, which is the outage
you most need to hear about. That is why there is no uptime cron in
`render.yaml`, and it is not an oversight.

## Error tracking

Sentry, errors only — no tracing, no profiling, no session replay. Off
entirely unless a DSN is set, which keeps every local run and every CI run out
of the project production reports into.

Four values to set, all `sync: false` in `render.yaml`:

| Service                          | Key               | Note                                                                                                                                                                          |
| -------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kapka-api-staging`, `kapka-api` | `SENTRY_DSN`      | Read at run time.                                                                                                                                                             |
| `kapka-staging`, `kapka`         | `VITE_SENTRY_DSN` | **Read at build time.** Vite inlines it, so setting it requires a rebuild to take effect — and a build without it does not merely disable reporting, it compiles the SDK out. |

`SENTRY_ENVIRONMENT` and `VITE_SENTRY_ENVIRONMENT` are set in the blueprint.
They exist because staging runs `NODE_ENV=production` on purpose, so `NODE_ENV`
cannot tell the two apart, and an alert that cannot say which environment broke
is an alert nobody can act on.

### What is never sent

This is the one dependency that can turn a bug into a privacy incident, so the
rules are enforced by tests rather than by settings:

- **API.** Every event goes through the same `redact()` the logs use —
  passwords, bearer tokens, JWTs, bcrypt hashes, connection-string passwords,
  and email addresses masked to `an***@example.com`. The `request`, `user` and
  `breadcrumbs` fields are deleted outright rather than sanitised, so a future
  change that starts attaching them cannot quietly start sending them. What
  does travel is the method and the route — enough to find the handler,
  incapable of carrying a donor.
- **Web.** The `token` query parameter is redacted from the request URL and
  from every breadcrumb. That token arrives in the URL of `/verify-email`, it
  confirms an account, and Sentry attaches the page URL to every event — so
  without this, one unrelated error thrown on that page would hand a live
  credential to a third party. The Breadcrumbs and CaptureConsole integrations
  are removed, because this app has a password field and a phone field.
- `sendDefaultPii` is `false` on both.

See `apps/api/src/observability/sentry.test.ts` and
`apps/web/src/lib/sentry.test.ts`. Both assert the redaction rather than
describing it.

### What it costs

29kB gzipped in the initial bundle, taking it from 81kB to 110kB of the 150kB
budget in §11.

That is deliberate and was measured both ways. Loading the SDK dynamically
keeps it out of the entry, but a dynamic import defeats tree-shaking — the
whole namespace becomes one chunk, 178kB gzipped. Deferring six times the bytes
is not a saving for a donor on 3G, and the errors it would miss are the ones
thrown during load, which is exactly what a boundary is for.

CI builds with a placeholder DSN for the same reason. Without one Vite
tree-shakes the SDK out, so the budget check would have measured an app 29kB
lighter than the one production ships — the check that exists to catch that
becoming the thing that hid it.

## The white screen this replaced

The web app had no error boundary. A component that threw took the whole app
to a blank page, and with nothing watching, nobody found out. There is one now,
around the whole app, and it renders a real screen with one action.
