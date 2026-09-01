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
npm run migrate      # apply the schema
npm run seed         # synthetic donors, an admin, sample requests
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

### Migrations

**node-pg-migrate**, with plain `.sql` migration files in `apps/api/migrations/`.

Chosen over Drizzle because the heart of this system is hand-written SQL — the
§5.1 matching query, whose join direction is the most consequential detail in
the codebase — and the compatibility matrix is deliberately data in the
database rather than TypeScript. Drizzle's payoff is typed CRUD, but it would
add a third place the schema is declared (a TS schema, the `@kapka/shared`
types, and the database). SQL-first keeps it to two. **The choice is made; do
not mix in a second tool.**

| Script                                | What it does                            |
| ------------------------------------- | --------------------------------------- |
| `npm run migrate`                     | Apply everything pending                |
| `npm run migrate:status`              | Show what would run, without running it |
| `npm run migrate:down`                | Roll back the last migration            |
| `npm run migrate:create -- some-name` | New empty `.sql` migration              |

**The schema is never edited by hand.** Not in psql, not in a GUI, not in
production. Every change is a new migration with both an `-- Up Migration` and
a `-- Down Migration` section — a test enforces that both exist, because
without a down section a bad deploy cannot be walked back.

Current migrations:

| File                                           | What it does                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `…120000000_initial-schema`                    | All six tables, five enums, the §3 indexes, `citext`, `updated_at` triggers          |
| `…120100000_seed-blood-compatibility`          | The 27 valid (recipient, donor) pairs                                                |
| `…120200000_deletable-users-and-query-indexes` | `ON DELETE SET NULL` so users are deletable (§12), plus indexes for the §4 endpoints |
| `…120300000_lock-blood-compatibility`          | Makes the matrix read-only outside migrations                                        |

`apps/api/src/schema.test.ts` holds a manifest of every table, enum and index
the schema must contain, checked against the up sections of all migrations.
Deleting a `CREATE INDEX` line is easy to do and otherwise impossible to
notice until a query gets slow in production.

The enums in `20260831120000000_initial-schema.sql` mirror
`packages/shared/src/domain.ts`. Change one and you change the other in the
same commit; a test compares the `blood_type` enum against `BLOOD_TYPES` and
fails if they drift.

### The compatibility matrix

`20260831120100000_seed-blood-compatibility.sql` holds the 27 valid
(recipient, donor) pairs of 64 possible. `recipient_type` is what the
**patient needs**; `donor_type` is **who can give** to them. Reversing those
produces a system that looks like it works and is medically wrong.

It is guarded twice over:

- The migration will not complete unless the table holds exactly 27 pairs,
  O− accepts exactly one donor type, AB+ accepts all eight, and O− can give to
  all eight. The last one fails loudly if the columns were ever swapped.
- `apps/api/src/compatibility.test.ts` reads the migration and checks all 64
  combinations against the ABO/Rh rule expressed independently — a second
  opinion, not a restatement. It runs without a database, so a wrong matrix
  fails in CI rather than in a hospital.

Both guards were mutation-tested: reversing the columns, dropping a pair, and
adding an unsafe Rh pairing each fail the suite.

**The table is read-only at runtime**, and that is enforced rather than
assumed. A trigger rejects INSERT, UPDATE, DELETE and TRUNCATE on
`blood_compatibility`. A GRANT could not express this — the API connects as
the table's owner, and owners bypass privileges. A migration that legitimately
needs to change the matrix opts in first:

```sql
SET LOCAL kapka.allow_compatibility_write = 'on';
```

`SET LOCAL`, so the permission dies with the transaction instead of leaking
into a pooled connection.

⚠️ **The matrix was derived, not transcribed.** The copy of the development
plan used to build this was truncated partway through §13, so its appendix was
never seen. The 27 pairs come from the ABO/Rh rule and match the three
reference points in §5.1, but they have not been diffed against the plan's own
table. Do that before going live.

### "If a value is not a token, it is a bug"

`packages/tokens/src/usage.test.ts` enforces that rather than leaving it to
code review. On every commit it checks all web CSS for:

- **No colour literals.** Zero hex, `rgb()`, `hsl()` or raw `oklch()` outside
  the token files.
- **No duration literals.** Motion timing is a design decision (§6.6:
  entrances 220ms, exits 140ms), not a per-component choice.
- **Every `var(--x)` resolves** to a token, a property defined in the same
  file, or one the components set at runtime through inline styles.

That last check is the one that earns its keep. A typo in
`var(--bourder-subtle)` is **not** a CSS error — the declaration is dropped,
the element renders with no border, and nothing tells you: not the build, not
the console, not the type checker. All three guards were mutation-tested.

Four values were untokenised when the check was first written:

| Added                             | Replaced                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--header-height`                 | The header said `3.5rem` inner and the feed's rail hard-coded `4.5rem` separately — changing either would have misaligned the other |
| `--opacity-disabled`              | Four components had drifted to `0.5`, `0.55` and `0.6` for the same state                                                           |
| `--blur-chrome` / `--tint-chrome` | Sticky bars used `blur(10px)`/90% and `blur(8px)`/88%, reading as different materials                                               |
| `--dur-pulse`                     | The skeleton animation's `1.4s`                                                                                                     |

### Layout primitives

`Container`, `Stack`, `Cluster`, `Grid` and `WithSidebar` live in
[apps/web/src/components/layout](apps/web/src/components/layout). They
reflow without any breakpoint, which is what keeps the media-query count low.

The app has 22 `@media` rules. Only **five** are about width:

| Query                   | Why it is a media query                                        |
| ----------------------- | -------------------------------------------------------------- |
| `AppHeader` ×2 at 48rem | Nav collapse — page-level, which §7.2 assigns to media queries |
| `AppHeader` at 30rem    | Short vs long button label                                     |
| `Feed` at 64rem         | Filters become a sticky rail                                   |
| `Feed` at 48rem         | Hides the mobile CTA bar                                       |

The other 17 are capability queries — `hover: hover`, `pointer: coarse`,
`prefers-reduced-motion`, `forced-colors` — which detect the device, not the
width. No primitive can or should remove those.

Component-internal reflow uses **container** queries instead: `RequestCard`
rearranges from its own width, so the same card works full-width in the feed
and narrow in a rail with no breakpoint anywhere.

### Fonts

Inter, self-hosted and subsetted (§6.4, a P1 performance requirement). Two
WOFF2 files, which is the maximum §11 allows:

| File                   | Size | When it downloads                    |
| ---------------------- | ---- | ------------------------------------ |
| `inter-latin.woff2`    | 47KB | Always — preloaded                   |
| `inter-cyrillic.woff2` | 18KB | Only when the page contains Cyrillic |

Split by `unicode-range`, so an English page costs 47KB and a Macedonian one
65KB, and neither pays for the other. **Cyrillic is not optional** — Macedonian
is written in it, and without that subset every Cyrillic hospital name would
fall back to a different face mid-sentence.

Subsetting is by **script, not by observed glyphs**. The pages render
user-supplied hospital names and notes, so any Latin or Cyrillic character can
appear; a subset built from the text currently on screen would break on real
data.

Two details that are silent when wrong, both covered by tests:

- **`tnum` is not in fontTools' default retain list.** Dropping it would
  quietly break `font-variant-numeric: tabular-nums`, which §6.4 requires so
  counts and dates do not jitter. The build script keeps it explicitly.
- **`crossorigin` on the preload.** Fonts are fetched in CORS mode even
  same-origin; without it the preloaded file is discarded and downloaded
  again — strictly worse than not preloading.

Inter's `opsz` axis is pinned to 14. That costs optical refinement on the
largest headings and saves 25KB — 35% of the Latin file — which is the better
trade on the 3G device profile in §2. Remove the instancer step in
`scripts/build-fonts.sh` to get it back.

Regenerate with:

```bash
pip install "fonttools[woff]" brotli
./scripts/build-fonts.sh path/to/InterVariable.ttf
```

Inter is SIL Open Font License; the licence ships beside the fonts.

### Colour and contrast

`packages/tokens/src/tokens.css` holds the OKLCH crimson and slate scales and
every semantic token, with dark defined alongside light rather than bolted on.

`contrast.test.ts` verifies **every** foreground/background pairing in **both**
themes on every commit — 4.5:1 for text, 3:1 for non-text (§10). It reads
`tokens.css` itself, so changing a token without checking it fails the build.
It also asserts the two dark blocks stay identical, since plain CSS cannot
share a declaration list across a media-query boundary and they drift silently.

That audit found four real failures the first time it ran, all now fixed:

| Token                  | Was         | Why it changed                                                                       |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `--crimson-500`        | L 0.60      | White on it was 4.33:1 — under AA, and it carries every primary button label         |
| `--fg-secondary`       | slate-600   | One step darker; the old value failed on `--bg-inset`                                |
| `--fg-muted`           | slate-500   | Same — and it carries a card's city, units and time-ago, which is content            |
| dark `--accent-active` | crimson-500 | `--fg-onAccent` is dark ink in dark mode, so a _darker_ active state lowers contrast |

`--border-control` is new: on an input or a filter chip the border is the only
thing marking where the control is, which WCAG 1.4.11 puts at 3:1.
`--border-subtle` / `--border-default` stay lighter for dividers, which the
same rule exempts — raising those would give exactly the heavy borders §6.1
rules out.

Badge outlines are deliberately **not** held to 3:1. The Rh sign is carried by
the badge text, which does clear 4.5:1; the outline is redundant
reinforcement, not the only channel.

### Configuration and secrets

`apps/api/.env.example` documents every variable the API reads — what it does,
whether it is required, and its default. `.env` has been gitignored since the
first commit, and no `.env` has ever been committed in any commit on any
branch.

Three checks in `apps/api/src/secrets.test.ts`, because each of these only
shows up once it has already gone wrong:

- **The schema and the example agree, in both directions.** A variable added to
  `env.ts` without documenting it means a teammate pulls, starts the API, and
  gets a validation error naming something they have never heard of. One left
  in the example but not the schema is dead configuration people keep setting.
- **Every variable has a comment and a stated default.** A name and a value
  tell nobody whether it is required.
- **No `.env` is tracked, ignored, or present in history.** A `.env` deleted
  later is still in the history, and the keys in it are still compromised.

**`apps/web/.env.example` is a different kind of file and says so.** Vite
inlines every `VITE_`-prefixed variable into the JavaScript it serves to
browsers — it is not hidden, and it looks exactly like a server-side variable,
which is what makes putting a key there an easy mistake rather than a careless
one. A test fails if any `VITE_` name looks secret-shaped.

**Logs are redacted** (§12: never log passwords, tokens or full email
addresses). `redact()` strips connection-string passwords, bearer tokens, JWTs,
bcrypt hashes and provider keys, and masks emails to `a***@example.com` — which
domain and roughly which account is usually what the log was for. The error
handler runs everything through it before logging, and before putting it in a
development response body.

### Notification dispatch

`apps/api/src/notify/dispatch.ts` is §5.3 — what turns an approval into email.

**The notification row is written and committed before the provider is
called.** That ordering is the whole guarantee. The worst case becomes a row
saying `queued` for a message that never went, which a retry can fix — rather
than a message that went with nothing recorded, which sends again on the next
approval. Holding the transaction open across the network call would
reintroduce exactly that.

A unique violation on `(request_id, donor_id)` means **already notified**, so
it is skipped silently. That is the guarantee working, not a failure.

|               |                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Batch cap     | 50 per approval — §5.3 rules out blocking an HTTP response on hundreds of sequential API calls             |
| Daily ceiling | 100, SendGrid's free tier. When it is spent the remainder is **queued, never dropped**                     |
| Order         | By time since last donation, never-donated first, so a cap takes the donors most likely to be able to come |
| Failures      | Recorded against their own row and reported. A provider outage never rolls back an approval                |

Dispatch runs **after** the approval transaction commits, so a delivery
problem cannot undo the approval — there is nothing left to roll back. The
response carries sent, failed, skipped-as-duplicate, queued,
`dailyBudgetRemaining` and a `warning`.

The warning is a **sentence, not a flag**, because §5.3 asks for a clear
warning in the dashboard and a boolean is something an admin has to interpret:

> Today's email budget is spent: 100 of 100 sent. 3 donors have not been
> contacted about this request and are queued for tomorrow. Reach them another
> way if this cannot wait.

It is also logged server-side — an admin closing the tab is not a reason for a
shortfall to go unrecorded.

Every one of those is mutation-tested. Sending before writing the row fails 8
tests; letting a delivery failure escape fails 5; ignoring the daily ceiling
fails 1; and removing the unique-violation skip fails the test written
specifically for it — which was needed because the matching query already
excludes notified donors, so the ordinary path never reaches that branch.

### Request endpoints

|                         |                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/requests`    | Signed in. Lands as `pending` — nothing reaches a donor before an admin approves it                      |
| `GET /api/requests`     | Public feed. Approved and unexpired only, filterable by city, blood type, urgency and `compatibleWithMe` |
| `GET /api/requests/:id` | Detail, including hospital coordinates (§9.4)                                                            |

**The requester's phone number is not in a public response** (§4, §12), and the
guarantee is made in the SQL rather than after it: without a viewer the column
is not selected at all. A field that was never fetched cannot be leaked by a
serialisation change later.

That is worth stating precisely, because there are two layers here and only
one of them is obvious. The mapper builds the public shape without the field
regardless — so a test that only checks the response passes even if the SQL
changes. Three separate tests assert the query itself, by recording the SQL
the repository issues.

Other rules the tests pin down:

- A client cannot choose its own status. `createRequestSchema` has no status
  field and rejects unknown keys, so asking to be `approved` is a validation
  error rather than a way past moderation entirely.
- A pending request answers **exactly** as a missing one does. A different
  answer would confirm it exists.
- A malformed id is a 404, not a 500. `blood_requests.id` is a `uuid` column
  and Postgres raises on a bad one, which would turn a stale link into a
  server error.
- An invalid token on the feed is treated as no token. A stale token in
  someone's browser must not break a public page.
- `compatibleWithMe` joins the matrix in the same direction as §5.1 — tested
  by asserting an O− donor sees every request and an AB+ donor sees only the
  AB+ one, which is the pair that swaps if the join is reversed.

### The matching query

`apps/api/src/matching/repository.ts` holds §5.1 — the query that decides who
gets emailed. Compatibility, city and the 56-day eligibility rule in one
statement, run when an admin approves a request.

**Read the join direction before changing it.**
`bc.recipient_type = r.blood_type` — the request's blood type is what the
_patient needs_, matching the recipient side of the matrix.
`dp.blood_type = bc.donor_type` — the donor's type matches the donor side.
Swapping those produces a system that runs, returns donors, and is medically
wrong: it would email O− donors for an AB+ patient.

Eligibility is computed in SQL against `CURRENT_DATE`, not in JavaScript,
where the server's timezone would decide who is eligible (§5.2).

Results are ordered by time since last donation, never-donated first, so that
capping a batch at the free-tier ceiling (§5.3) takes the donors most likely
to be able to come rather than an arbitrary slice.

### Testing against a real database

`apps/api/src/test/database.ts` starts a **real PostgreSQL 18** for the test
run — `embedded-postgres` downloads a server binary, so this needs no Docker
and no service in CI — applies the actual migrations with the actual migration
tool, and hands back a pool.

This matters most for the matching query. It is entirely SQL, and §13 calls it
the one piece of logic where a bug has consequences outside the software.
Testing it against a mock would only confirm the mock agrees with itself.

What the database tests cover:

- **All 64 (recipient, donor) combinations** through the real query, each its
  own test case so a failure names the exact pair. See below.
- The eligibility boundary — see below.
- Every exclusion: wrong city, availability paused, notifications off,
  unverified email, deactivated account, already notified.
- The schema's own promises: `CHECK` constraints, CITEXT case-insensitivity,
  `ON DELETE SET NULL` letting a moderator be deleted, and the unique index
  that stops a donor being logged twice for one request.
- The seed script, whose INSERTs had also never met a database.

All of it mutation-tested. Reversing the compatibility join fails five tests
including all three §5.1 reference points; changing 56 to 55, dropping the
city join, and dropping the already-notified guard each fail too.

The whole suite runs in about 7 seconds.

### Eligibility boundaries

The 56-day rule (§5.2) at every edge, against a real database:

| Last donated        | Eligible | Why it is worth a test                                 |
| ------------------- | -------- | ------------------------------------------------------ |
| never (`NULL`)      | yes      | `NULL` means never donated, not "unknown"              |
| exactly 56 days ago | yes      | the boundary is **inclusive**                          |
| 57 days ago         | yes      |                                                        |
| 55 days ago         | no       | the off-by-one that would ask someone to give too soon |
| today               | no       |                                                        |
| **in the future**   | no       | see below                                              |

Both sides are decided in SQL. The donor's date is stored relative to
`CURRENT_DATE` and the query compares against `CURRENT_DATE`, so a session in
any timezone gets the same answer — asserted by running the boundary case
through connections set to UTC, Kiritimati (UTC+14) and Niue (UTC−11).

**A future date is not a small thing.** It does not make a donor temporarily
ineligible; it makes them _permanently invisible_, because
`last_donation_date <= CURRENT_DATE - 56 days` can never be true for a date
that keeps being ahead of today. They register, see nothing wrong, and are
never told about a single request.

`registerSchema` rejects those, but the API is not the only way a row arrives —
an import, a fix-up script, a skewed clock on a bulk load. A trigger now
refuses them at the table, on insert and on update. It has to be a trigger:
Postgres requires `CHECK` expressions to be immutable and `CURRENT_DATE` is
not.

Every boundary is mutation-tested. Changing 56 to 55 or 57, turning `<=` into
`<`, dropping the `IS NULL` branch, or disabling the trigger each fail.

### The 64-pair test

§13 asks for all 64 pairs asserted against a **hand-written table** — 27 valid,
37 invalid. Hand-written is the point: the query, the seed migration and the
ABO/Rh rule are all derivations of the same idea, and checking one derivation
against another agrees without proving anything.

`apps/api/src/matching/compatibilityTable.ts` holds that table as a grid, so
someone who does not read TypeScript can check it against a transfusion chart:

```
            O-  O+  A-  A+  B-  B+  AB- AB+
   O-        Y   .   .   .   .   .   .   .
   O+        Y   Y   .   .   .   .   .   .
   ...
   AB+       Y   Y   Y   Y   Y   Y   Y   Y
```

Rows are what the **patient needs**; columns are **who can give**. The first
row reads: a patient needing O− can receive from O− only. The first column
reads: an O− donor can give to everyone.

That gives **three independent statements** of the same truth — the grid, the
migration that seeds the database, and the rule derived from first principles.
A mistake in any one shows up as a disagreement rather than passing quietly in
all three.

Mutation-tested in each direction:

| Broken                                   | Caught by                                                |
| ---------------------------------------- | -------------------------------------------------------- |
| One cell flipped in the grid             | 4 tests — the pair, the count, and both agreement checks |
| Compatibility join reversed in the query | 42 of 72                                                 |
| A pair changed in the seed migration     | the migration refuses to apply at all                    |

### Cities

City is a controlled list and never free text, because §5.1 matches on an
exact string — a donor whose city does not match a request's is simply never
told about it, with nothing anywhere reporting a problem.

`CITIES` in `@kapka/shared` holds all 34 North Macedonian cities. `GET
/api/cities` serves that same constant, so the dropdown and the validator
cannot disagree.

**Input is normalised, not rejected.** §3 names `"Bitola"` vs `"bitola "` vs
`"Битола"` as the failure mode. All three now resolve to `Bitola`:

| Sent       | Stored                                                      |
| ---------- | ----------------------------------------------------------- |
| `bitola `  | `Bitola` — trimmed, case-folded                             |
| `Битола`   | `Bitola` — Macedonian Cyrillic is transliterated            |
| `Stip`     | `Štip` — diacritics folded, so a plain keyboard works       |
| `Atlantis` | rejected — normalisation resolves spellings, not inventions |

Cyrillic matters rather than being a nicety: **the country writes in Cyrillic**,
so refusing `Битола` would mean refusing the spelling a Macedonian keyboard
produces. `Demir` resolves to nothing, because guessing between Demir Hisar
and Demir Kapija would put a donor in the wrong place.

### Auth

Four endpoints: `register`, `login`, `refresh`, `logout`.

|               |                                                                              |
| ------------- | ---------------------------------------------------------------------------- |
| Access token  | JWT, HS256, **15 minutes**, returned in the response body                    |
| Refresh token | opaque random bytes in an httpOnly cookie, **30 days**, rotated on every use |

**The refresh token is not a JWT.** A signed refresh token stays valid until it
expires whatever the server decides, which is the one property rotation and
logout need it _not_ to have. It is 32 random bytes, stored as a SHA-256 hash —
a leaked database backup hands over no working sessions, for the same reason
passwords are hashed. There is no `JWT_REFRESH_SECRET`.

The cookie is `httpOnly`, `SameSite=Strict`, `Secure` outside local
development, and scoped to `Path=/api/auth` so it is not sent with every API
request. Because it is `httpOnly` the client cannot read it — which is what
makes §12's "never store JWTs in localStorage" enforceable rather than a
convention.

**Rotation and reuse detection.** Each refresh issues a new token and revokes
the old one, linked by `replaced_by`. Presenting an already-revoked token means
someone is replaying a copy, so _every_ session for that user is revoked and
they sign in again. Revoked rows are kept rather than deleted — presenting one
is how token theft announces itself.

**Login says one thing.** Wrong password, unknown email and disabled account
all return the same status and the same message, and an unknown email still
runs a bcrypt comparison against a dummy hash so the timing matches. Without
that, "no such user" returns in a millisecond and "wrong password" takes a
hundred, which enumerates accounts however carefully the response is worded.

`JWT_ACCESS_SECRET` is required in production — the API refuses to start
without at least 32 characters. Locally it falls back to an obviously fake
development key, so nothing signed with it could be mistaken for a secret.

`20260831130000000_refresh-tokens.sql` adds the table. §3 has none, because
§3 does not describe rotation.

### Configuration and secrets

`apps/api/.env.example` documents every variable the API reads — what it does,
whether it is required, and its default. `.env` has been gitignored since the
first commit, and no `.env` has ever been committed in any commit on any
branch.

Three checks in `apps/api/src/secrets.test.ts`, because each of these only
shows up once it has already gone wrong:

- **The schema and the example agree, in both directions.** A variable added to
  `env.ts` without documenting it means a teammate pulls, starts the API, and
  gets a validation error naming something they have never heard of. One left
  in the example but not the schema is dead configuration people keep setting.
- **Every variable has a comment and a stated default.** A name and a value
  tell nobody whether it is required.
- **No `.env` is tracked, ignored, or present in history.** A `.env` deleted
  later is still in the history, and the keys in it are still compromised.

**`apps/web/.env.example` is a different kind of file and says so.** Vite
inlines every `VITE_`-prefixed variable into the JavaScript it serves to
browsers — it is not hidden, and it looks exactly like a server-side variable,
which is what makes putting a key there an easy mistake rather than a careless
one. A test fails if any `VITE_` name looks secret-shaped.

**Logs are redacted** (§12: never log passwords, tokens or full email
addresses). `redact()` strips connection-string passwords, bearer tokens, JWTs,
bcrypt hashes and provider keys, and masks emails to `a***@example.com` — which
domain and roughly which account is usually what the log was for. The error
handler runs everything through it before logging, and before putting it in a
development response body.

### Notification dispatch

`apps/api/src/notify/dispatch.ts` is §5.3 — what turns an approval into email.

**The notification row is written and committed before the provider is
called.** That ordering is the whole guarantee. The worst case becomes a row
saying `queued` for a message that never went, which a retry can fix — rather
than a message that went with nothing recorded, which sends again on the next
approval. Holding the transaction open across the network call would
reintroduce exactly that.

A unique violation on `(request_id, donor_id)` means **already notified**, so
it is skipped silently. That is the guarantee working, not a failure.

|               |                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Batch cap     | 50 per approval — §5.3 rules out blocking an HTTP response on hundreds of sequential API calls             |
| Daily ceiling | 100, SendGrid's free tier. When it is spent the remainder is **queued, never dropped**                     |
| Order         | By time since last donation, never-donated first, so a cap takes the donors most likely to be able to come |
| Failures      | Recorded against their own row and reported. A provider outage never rolls back an approval                |

Dispatch runs **after** the approval transaction commits, so a delivery
problem cannot undo the approval — there is nothing left to roll back. The
response carries sent, failed, skipped-as-duplicate, queued,
`dailyBudgetRemaining` and a `warning`.

The warning is a **sentence, not a flag**, because §5.3 asks for a clear
warning in the dashboard and a boolean is something an admin has to interpret:

> Today's email budget is spent: 100 of 100 sent. 3 donors have not been
> contacted about this request and are queued for tomorrow. Reach them another
> way if this cannot wait.

It is also logged server-side — an admin closing the tab is not a reason for a
shortfall to go unrecorded.

Every one of those is mutation-tested. Sending before writing the row fails 8
tests; letting a delivery failure escape fails 5; ignoring the daily ceiling
fails 1; and removing the unique-violation skip fails the test written
specifically for it — which was needed because the matching query already
excludes notified donors, so the ordinary path never reaches that branch.

### Request endpoints

|                         |                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/requests`    | Signed in. Lands as `pending` — nothing reaches a donor before an admin approves it                      |
| `GET /api/requests`     | Public feed. Approved and unexpired only, filterable by city, blood type, urgency and `compatibleWithMe` |
| `GET /api/requests/:id` | Detail, including hospital coordinates (§9.4)                                                            |

**The requester's phone number is not in a public response** (§4, §12), and the
guarantee is made in the SQL rather than after it: without a viewer the column
is not selected at all. A field that was never fetched cannot be leaked by a
serialisation change later.

That is worth stating precisely, because there are two layers here and only
one of them is obvious. The mapper builds the public shape without the field
regardless — so a test that only checks the response passes even if the SQL
changes. Three separate tests assert the query itself, by recording the SQL
the repository issues.

Other rules the tests pin down:

- A client cannot choose its own status. `createRequestSchema` has no status
  field and rejects unknown keys, so asking to be `approved` is a validation
  error rather than a way past moderation entirely.
- A pending request answers **exactly** as a missing one does. A different
  answer would confirm it exists.
- A malformed id is a 404, not a 500. `blood_requests.id` is a `uuid` column
  and Postgres raises on a bad one, which would turn a stale link into a
  server error.
- An invalid token on the feed is treated as no token. A stale token in
  someone's browser must not break a public page.
- `compatibleWithMe` joins the matrix in the same direction as §5.1 — tested
  by asserting an O− donor sees every request and an AB+ donor sees only the
  AB+ one, which is the pair that swaps if the join is reversed.

### The matching query

`apps/api/src/matching/repository.ts` holds §5.1 — the query that decides who
gets emailed. Compatibility, city and the 56-day eligibility rule in one
statement, run when an admin approves a request.

**Read the join direction before changing it.**
`bc.recipient_type = r.blood_type` — the request's blood type is what the
_patient needs_, matching the recipient side of the matrix.
`dp.blood_type = bc.donor_type` — the donor's type matches the donor side.
Swapping those produces a system that runs, returns donors, and is medically
wrong: it would email O− donors for an AB+ patient.

Eligibility is computed in SQL against `CURRENT_DATE`, not in JavaScript,
where the server's timezone would decide who is eligible (§5.2).

Results are ordered by time since last donation, never-donated first, so that
capping a batch at the free-tier ceiling (§5.3) takes the donors most likely
to be able to come rather than an arbitrary slice.

### Testing against a real database

`apps/api/src/test/database.ts` starts a **real PostgreSQL 18** for the test
run — `embedded-postgres` downloads a server binary, so this needs no Docker
and no service in CI — applies the actual migrations with the actual migration
tool, and hands back a pool.

This matters most for the matching query. It is entirely SQL, and §13 calls it
the one piece of logic where a bug has consequences outside the software.
Testing it against a mock would only confirm the mock agrees with itself.

What the database tests cover:

- **All 64 (recipient, donor) combinations** through the real query, each its
  own test case so a failure names the exact pair. See below.
- The eligibility boundary — see below.
- Every exclusion: wrong city, availability paused, notifications off,
  unverified email, deactivated account, already notified.
- The schema's own promises: `CHECK` constraints, CITEXT case-insensitivity,
  `ON DELETE SET NULL` letting a moderator be deleted, and the unique index
  that stops a donor being logged twice for one request.
- The seed script, whose INSERTs had also never met a database.

All of it mutation-tested. Reversing the compatibility join fails five tests
including all three §5.1 reference points; changing 56 to 55, dropping the
city join, and dropping the already-notified guard each fail too.

The whole suite runs in about 7 seconds.

### Eligibility boundaries

The 56-day rule (§5.2) at every edge, against a real database:

| Last donated        | Eligible | Why it is worth a test                                 |
| ------------------- | -------- | ------------------------------------------------------ |
| never (`NULL`)      | yes      | `NULL` means never donated, not "unknown"              |
| exactly 56 days ago | yes      | the boundary is **inclusive**                          |
| 57 days ago         | yes      |                                                        |
| 55 days ago         | no       | the off-by-one that would ask someone to give too soon |
| today               | no       |                                                        |
| **in the future**   | no       | see below                                              |

Both sides are decided in SQL. The donor's date is stored relative to
`CURRENT_DATE` and the query compares against `CURRENT_DATE`, so a session in
any timezone gets the same answer — asserted by running the boundary case
through connections set to UTC, Kiritimati (UTC+14) and Niue (UTC−11).

**A future date is not a small thing.** It does not make a donor temporarily
ineligible; it makes them _permanently invisible_, because
`last_donation_date <= CURRENT_DATE - 56 days` can never be true for a date
that keeps being ahead of today. They register, see nothing wrong, and are
never told about a single request.

`registerSchema` rejects those, but the API is not the only way a row arrives —
an import, a fix-up script, a skewed clock on a bulk load. A trigger now
refuses them at the table, on insert and on update. It has to be a trigger:
Postgres requires `CHECK` expressions to be immutable and `CURRENT_DATE` is
not.

Every boundary is mutation-tested. Changing 56 to 55 or 57, turning `<=` into
`<`, dropping the `IS NULL` branch, or disabling the trigger each fail.

### The 64-pair test

§13 asks for all 64 pairs asserted against a **hand-written table** — 27 valid,
37 invalid. Hand-written is the point: the query, the seed migration and the
ABO/Rh rule are all derivations of the same idea, and checking one derivation
against another agrees without proving anything.

`apps/api/src/matching/compatibilityTable.ts` holds that table as a grid, so
someone who does not read TypeScript can check it against a transfusion chart:

```
            O-  O+  A-  A+  B-  B+  AB- AB+
   O-        Y   .   .   .   .   .   .   .
   O+        Y   Y   .   .   .   .   .   .
   ...
   AB+       Y   Y   Y   Y   Y   Y   Y   Y
```

Rows are what the **patient needs**; columns are **who can give**. The first
row reads: a patient needing O− can receive from O− only. The first column
reads: an O− donor can give to everyone.

That gives **three independent statements** of the same truth — the grid, the
migration that seeds the database, and the rule derived from first principles.
A mistake in any one shows up as a disagreement rather than passing quietly in
all three.

Mutation-tested in each direction:

| Broken                                   | Caught by                                                |
| ---------------------------------------- | -------------------------------------------------------- |
| One cell flipped in the grid             | 4 tests — the pair, the count, and both agreement checks |
| Compatibility join reversed in the query | 42 of 72                                                 |
| A pair changed in the seed migration     | the migration refuses to apply at all                    |

### Cities

City is a controlled list and never free text, because §5.1 matches on an
exact string — a donor whose city does not match a request's is simply never
told about it, with nothing anywhere reporting a problem.

`CITIES` in `@kapka/shared` holds all 34 North Macedonian cities. `GET
/api/cities` serves that same constant, so the dropdown and the validator
cannot disagree.

**Input is normalised, not rejected.** §3 names `"Bitola"` vs `"bitola "` vs
`"Битола"` as the failure mode. All three now resolve to `Bitola`:

| Sent       | Stored                                                      |
| ---------- | ----------------------------------------------------------- |
| `bitola `  | `Bitola` — trimmed, case-folded                             |
| `Битола`   | `Bitola` — Macedonian Cyrillic is transliterated            |
| `Stip`     | `Štip` — diacritics folded, so a plain keyboard works       |
| `Atlantis` | rejected — normalisation resolves spellings, not inventions |

Cyrillic matters rather than being a nicety: **the country writes in Cyrillic**,
so refusing `Битола` would mean refusing the spelling a Macedonian keyboard
produces. `Demir` resolves to nothing, because guessing between Demir Hisar
and Demir Kapija would put a donor in the wrong place.

### Authorisation

Three guards, in `middleware/auth.ts`. **Each is self-sufficient** — none
depends on another running first, because a silent ordering requirement is a
guard that fails open the moment someone mounts it alone.

| Guard                  | Checks                                                | Used by                             |
| ---------------------- | ----------------------------------------------------- | ----------------------------------- |
| `requireAuth(repo)`    | Valid token **and** an active account in the database | `GET /api/me`, `POST /api/requests` |
| `requireRole(repo, …)` | The same, plus the role — **from the database**       | admin routes, when they exist       |
| `optionalAuth()`       | Token only; a bad token is treated as no token        | `GET /api/requests`                 |

**The role comes from the database, not the token.** A 15-minute access token
carries whatever role was true when it was issued, so trusting the claim means
a demoted admin keeps admin powers for up to fifteen minutes — and on this
system an admin action emails every matching donor. The extra lookup is a
primary-key read, and it also catches an account deactivated mid-session.
Tested by minting a valid admin token, demoting the account, and asserting the
next request gets 403.

`optionalAuth` is the exception: token-only, no database read. It runs on the
busiest public route, and being wrong there shows one extra phone number
rather than granting a permission. A bad token must never turn a public page
into an error.

Authorisation is checked **before** validation, so an unauthorised caller does
not learn which fields the schema wants.

### Seed data

`npm run seed` loads synthetic data: donors covering all eight blood types
across six cities, one admin, two requesters, and seven requests spanning
every status and urgency. Every account's password is printed when it runs.

It is **destructive** — it truncates `users`, `donor_profiles`,
`blood_requests`, `notification_log` and `audit_log` first, so running it twice
gives the same database rather than duplicates. `blood_compatibility` is never
touched; that is reference data owned by a migration, and the read-only trigger
would reject the write anyway. The script asserts all 27 pairs are still there
when it finishes.

Two refusals, because this truncates tables:

- `NODE_ENV=production` — refused outright.
- A `DATABASE_URL` host that is not local — refused unless you set
  `SEED_ALLOW_REMOTE=yes-i-am-sure`.

Emails use the `.test` TLD, which RFC 2606 reserves so it can never resolve.
If a message somehow escapes Mailpit, it has nowhere to go.

The donor set is built to exercise the §5.1 matching query rather than just to
look populated. In Skopje, as O−, there is a donor for each reason to be
_excluded_ — paused availability, email notifications off, unverified email,
deactivated account, and one donated a day short of the 56-day interval — plus
one at exactly 56 days, who is eligible. One O− request in Skopje therefore
hits every branch of that query. Without those rows, a query that forgot a
filter would still look correct.

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

`apps/web/public/_redirects` sends all paths to `index.html` so client-side
routes survive a refresh on the static host, and `_headers` beside it carries
the security headers a `<meta>` element cannot.

**Render reads neither.** Both files are the Netlify and Cloudflare Pages
convention. On Render the same two rules live in `render.yaml`, as `routes` and
`headers` on the static site — so they are said twice, and changing one means
changing both. Without them every deep link would 404 and every security header
would be lost.

The whole deployment — staging and production, and the order to apply them in
— is `render.yaml` and [docs/deploy.md](docs/deploy.md).

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
  machine it was written on. The migrations and the seed are now verified
  against a real PostgreSQL by the test suite, so what remains unproven is the
  Compose file itself — the service definitions, ports and healthcheck.
- **The auth repository's SQL is still untested.** Its endpoints are covered
  over real HTTP against an in-memory repository. Now that the test harness
  starts a real database, those queries can be covered the same way the
  matching query is.
- No E2E tests. §13 wants two Playwright flows at 390px and 1280px. Visual
  regression (P2) should point Playwright at `/kitchen-sink/frame`, which is
  built to be screenshotted at a fixed width.
- No Lighthouse CI. §11 wants the build to fail when a performance budget is
  exceeded; the budgets are written down but nothing enforces them yet.
