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
npm run dev          # web on http://localhost:5173
npm run dev:api      # api on http://localhost:4000 (second terminal)
```

Copy `apps/api/.env.example` to `apps/api/.env` before starting the API.

| Script (from the root) | What it does |
|---|---|
| `npm run dev` | Vite dev server for the web app |
| `npm run dev:api` | Express API with watch |
| `npm run build` | Builds every workspace |
| `npm run typecheck` | Typechecks every workspace |

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

## Known gaps

- **Inter is not self-hosted yet.** §6.4 makes that a P1 performance
  requirement. The font stack currently falls through to the platform UI face,
  which looks correct and costs nothing. Drop a subsetted `InterVariable.woff2`
  into `web/public/fonts/` and uncomment the two blocks in `web/index.html`.
- **`--text-xs` conflicts with the responsive QA checklist.** §6.4 defines it as
  12–13px; §7.6 says no text anywhere below 14px. The tokens follow §6.4 as
  written. Decide which wins before §9 screens start using `--text-xs` for real
  content — right now it is only used in kitchen-sink chrome.
- No tests yet. The unit tests in §13 are backend-side; visual regression (§13,
  P2) should point Playwright at `/kitchen-sink/frame`, which is built to be
  screenshotted at a fixed width.
