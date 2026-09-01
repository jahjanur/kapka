# Visual regression

Every component variant, photographed at 360, 768 and 1280 in both themes.
Fifty-eight specimens, six combinations, 348 baselines.

```sh
npm run test:visual          # compare against the baselines
npm run test:visual:update   # accept what is on screen as the new baselines
```

A failure opens an HTML report with the baseline, the new shot and a diff.
Look at the diff before running `:update` — that command's whole job is to
overwrite the evidence that something changed.

## What is photographed

The specimens live in `apps/web/visual-harness/catalogue.tsx`. Adding a
component means adding an entry there; the spec reads the list off the running
page, so there is no second list to keep in step.

The harness is a page on the dev server — `visual-harness.html` — and not a
route in the app. Vite builds `index.html` and only `index.html`, so it is not
in `dist/` and there is no way to reach it in production.

Two components are deliberately absent:

- **HospitalMap**, which draws map tiles fetched over the network. What it
  photographs would be OpenStreetMap's rendering on the day, not ours.
- **Anything requiring the API.** The harness makes no requests at all; every
  specimen is handed its props. A component that could only be photographed by
  fetching would be photographing the fixture.

## Why the snapshots are under a platform directory

`visual/__screenshots__/darwin/...`

The same CSS does not rasterise identically on macOS and Linux — subpixel
positioning and hinting differ, so text moves by a fraction and every
text-bearing snapshot fails. This is a property of visual regression, not of
this setup, and the usual workarounds make it worse: a pixel tolerance wide
enough to absorb the difference is also wide enough to hide a real one.

So the platform is in the path. A baseline shot on macOS is never silently
compared against Linux; the failure is "no snapshot here", which is true and
actionable, rather than a diff of the antialiasing.

**The baselines committed here are macOS.** That is why this suite is a
separate command and is not part of the CI job that gates every push — CI runs
on Linux and has no baselines to compare against.

## Turning it on in CI

One thing is missing: Linux baselines. Generate them once, in the container CI
would use, so the rendering environment is pinned rather than whatever the
runner happens to have:

```sh
docker run --rm -v "$PWD":/w -w /w --network host \
  mcr.microsoft.com/playwright:v1.62.1-noble \
  npx playwright test --config=playwright.visual.config.ts --update-snapshots
```

That writes `visual/__screenshots__/linux/`. Commit it, then add a job to
`.github/workflows/ci.yml` that runs in the same image:

```yaml
visual:
  runs-on: ubuntu-latest
  container: mcr.microsoft.com/playwright:v1.62.1-noble
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version-file: .nvmrc, cache: npm }
    - run: npm ci
    - run: npm run test:visual
    - uses: actions/upload-artifact@v4
      if: failure()
      with: { name: visual-report, path: playwright-report/ }
```

Pin the image tag to the Playwright version in `package.json` and move both
together: a different browser build renders differently, which is the same
problem as a different platform.

## What is pinned, and why each one

A snapshot suite is only worth having if a failure means something changed.
Everything that could move on its own is held still:

| Source of movement            | Held by                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `timeAgo` in RequestCard      | `page.clock.setFixedTime` to the instant the fixtures are written against |
| Toast dismissal timers        | `duration: 0` in the specimen — the supported "until dismissed"           |
| Skeleton shimmer, transitions | Playwright disables animations for screenshots                            |
| Webfont swap                  | `document.fonts.ready` before the first shot                              |
| Text caret                    | Playwright hides it                                                       |
| Network                       | The harness makes no requests                                             |

Tolerance is `maxDiffPixels: 0`. With the above pinned there is nothing left
for a threshold to absorb except a real regression.
