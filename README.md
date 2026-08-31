# Kapka

Urgent blood donation matching. Someone posts a request; the system finds every
compatible, eligible donor nearby and emails them.

The build spec is the **Blood Donor Finder — Development Plan**. Section numbers
referenced in code comments (§6.3, §7.4, …) point at it. Read it before writing
code.

## Layout

An npm-workspaces monorepo. The frontend and backend share one set of Zod
schemas, so validation cannot drift between them.

```
apps/
  web/                 React + Vite SPA
  api/                 Node + Express API
packages/
  shared/              domain vocabulary + Zod schemas — used by BOTH sides
  tokens/              design tokens (CSS) + the JS mirrors of the scales
```

**`@kapka/shared`** is the point of the monorepo. One schema per form, imported
by the React form and by the Express route that receives it, so the two can
never disagree about what is valid. It is split deliberately:

- `bloodType.ts`, `cities.ts`, `domain.ts` — plain data and types, **no Zod**.
- `schemas/` — the Zod schemas, built from those same const arrays.

That split is load-bearing, not tidiness: the feed imports `CITIES` to fill a
dropdown, and if that pulled Zod along it would add ~14KB gzipped to the
initial bundle for nothing. Keep new vocabulary out of the schema modules.

**`@kapka/tokens`** holds `tokens.css`, `scale.css` and `global.css` plus the
JS mirrors of the breakpoint and spacing scales. Import the CSS by path:

```ts
import '@kapka/tokens/tokens.css';
```

Both packages export TypeScript source directly — there is no build step, so
there is no stale `dist/` to get out of sync. Vite and tsx compile them as part
of the consuming app.

Nothing is connected to Postgres yet. The feed runs on seed data in
`apps/web/src/lib/seedRequests.ts`, and the request endpoints validate against
the shared schemas but return `501 NOT_IMPLEMENTED`.

## Running it

```bash
npm install          # once, at the root — it installs every workspace
cp apps/api/.env.example apps/api/.env
npm run db:up        # Postgres + Mailpit in Docker
npm run dev          # web on http://localhost:5173
npm run dev:api      # api on http://localhost:4000 (second terminal)
```

Every value in `.env.example` already matches `compose.yaml`, so an empty
`.env` works for local development.

### Local infrastructure

`compose.yaml` runs Postgres and Mailpit. The apps themselves run on the host,
not in Docker — this file exists so nobody installs Postgres by hand, and so
nobody emails a real donor from a laptop.

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| Postgres     | `localhost:5432`, user/password/db all `kapka`          |
| Mailpit SMTP | `localhost:1025` — where the API sends                  |
| Mailpit UI   | **http://localhost:8025** — where you read what it sent |

| Script             | What it does                                            |
| ------------------ | ------------------------------------------------------- |
| `npm run db:up`    | Start both, waiting until Postgres accepts queries      |
| `npm run db:down`  | Stop them, keeping the data                             |
| `npm run db:reset` | Stop them and **delete the database**, then start fresh |
| `npm run db:psql`  | A psql shell in the container                           |
| `npm run mail`     | Open the Mailpit inbox                                  |

Both services bind to `127.0.0.1`, not `0.0.0.0`. Without that, Docker
publishes on every interface and a trust-me-it's-only-dev database ends up
reachable from the café wifi.

`docker/postgres/init/` runs once on an empty volume and creates the `citext`
extension, which `users.email` needs before any migration can run.

### Nobody sends real email by accident

The API **refuses to start** if `SENDGRID_API_KEY` is set, or if
`MAIL_TRANSPORT=sendgrid`, while `NODE_ENV` is anything but `production`. The
realistic accident is a production `.env` copied onto a laptop, so a live key
is rejected outright rather than merely left unused — unused today is one
careless line away from used tomorrow. The error names the Mailpit URL so the
fix is obvious. This is covered by tests, not just convention.

| Script (from the root) | What it does                    |
| ---------------------- | ------------------------------- |
| `npm run dev`          | Vite dev server for the web app |
| `npm run dev:api`      | Express API with watch          |
| `npm run build`        | Builds every workspace          |
| `npm run typecheck`    | Typechecks every workspace      |

**`/kitchen-sink`** is the component gallery: every token and every Tier 1
component, in both themes, with the whole gallery embedded at 360px and 1280px
side by side in real iframes. It stands in for Storybook (§8 ground rule 2).
Check your component there before you call it done.

## The two rules that matter most

**1. No hard-coded visual values.** Every colour, size, radius, spacing and
duration comes from `tokens.css` or `scale.css`. If a value is not a token, it
is a bug. Add a token rather than a literal.

**2. Mobile-first.** Write the narrow layout, then add `min-width` queries
upward — never the reverse. 360px is the floor and must have zero horizontal
scroll.

Supporting conventions, all enforced in the components already here:

- **Container queries for what a component does to itself**; media queries only
  for page-level layout. This is what makes a component portable between the
  feed and a narrow sidebar.
- **Every interactive element ships all five states** — rest, hover,
  focus-visible, active, disabled — in both themes. Hover styling goes inside
  `@media (hover: hover)` so a phone never gets a stuck hover.
- **No component sets its own outer margin.** Spacing is the parent's job; use
  `Stack`, `Cluster` or `Grid`.
- **Props are semantic** (`variant="danger"`), never presentational
  (`color="red"`).
- **Logical properties throughout** (`padding-inline`, `margin-block`). Costs
  nothing now, survives a right-to-left translation later.
- **Every form control goes through `<Field>`**, which owns the label, help
  text, error text and the ARIA linking them. `Input` deliberately has no
  `label` prop, so a placeholder can never stand in for one.
- **Dark mode is not optional.** It is defined alongside light in the token
  layer, and elevation swaps from shadow to a hairline border automatically —
  components never branch on theme.

## Deployment note

`web/public/_redirects` sends all paths to `index.html` so client-side routes
survive a refresh on the static host. Verify it applies on Render before the
first deploy.

## Tests and CI

```bash
npm test              # everything, ~0.7s
npm run test:watch    # while working
npm run test:coverage
```

Vitest runs as three projects so each gets the environment it needs: `shared`
and `api` in Node, `web` in jsdom. 54 tests covering the schema contract
(unknown-key rejection, canonical cities, unit and note bounds, future
donation dates), the blood-type vocabulary and its screen-reader announcement,
the §4 error envelope, and the API routes end to end via supertest.

`.github/workflows/ci.yml` runs on every push and pull request: install from
the lockfile, then lint, formatting, typecheck, test with coverage, and build.
Cheapest checks first so a trivial mistake fails in seconds. The whole run is
a few seconds of actual work.

CI and the pre-commit hook run the same commands, so a green commit locally is
a green CI run — the hook is the fast feedback, CI is the thing that cannot be
skipped with `--no-verify`.

**After pulling, run `npm install` once at the root.** That triggers the
`prepare` script that installs the git hooks. Without it the pre-commit checks
silently do not run for you.

## Known gaps

- **Inter is not self-hosted yet.** §6.4 makes that a P1 performance
  requirement. The font stack currently falls through to the platform UI face,
  which looks correct and costs nothing. Drop a subsetted `InterVariable.woff2`
  into `web/public/fonts/` and uncomment the two blocks in `web/index.html`.
- **`--text-xs` conflicts with the responsive QA checklist.** §6.4 defines it as
  12–13px; §7.6 says no text anywhere below 14px. The tokens follow §6.4 as
  written. Decide which wins before §9 screens start using `--text-xs` for real
  content — right now it is only used in kitchen-sink chrome.
- **The P0 compatibility tests do not exist yet.** §13 wants all 64
  (recipient, donor) pairs asserted — 27 valid, 37 invalid. That matrix lives
  in the database by design (§3), not in JS conditionals, so those tests land
  with the schema and the §5.1 matching query. This is the one piece of logic
  where a bug has real-world consequences, so it should not slip.
- **`compose.yaml` has never been run.** Docker was not installed on the
  machine it was written on, so the YAML is validated and internally
  consistent but unproven. Expect to shake out image tags or a healthcheck on
  first `npm run db:up`.
- No E2E tests. §13 wants two Playwright flows at 390px and 1280px. Visual
  regression (P2) should point Playwright at `/kitchen-sink/frame`, which is
  built to be screenshotted at a fixed width.
- No Lighthouse CI. §11 wants the build to fail when a performance budget is
  exceeded; the budgets are written down but nothing enforces them yet.
