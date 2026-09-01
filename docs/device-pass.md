# Real device pass

**Status: not yet run.** It needs hardware in a hand, and there is none attached
to the machine this was written on — no `adb`, no Xcode device tooling, no
phone. Everything below is the pass, ready to run, plus four things found by
reading the CSS that it should confirm or clear first.

## Why this cannot be done in a browser

Chrome's device toolbar and the iOS Simulator both report
`env(safe-area-inset-*)` as **zero**. Every rule guarding against the notch and
the home indicator therefore evaluates to its fallback, and the layout looks
correct because the hazard has been emulated away. The same is true of the
keyboard: a simulator's keyboard is a picture of a keyboard, and it is the real
one — with its accessory bar, its autofill strip, its scroll-into-view
behaviour and its differing Android resize modes — that moves the page.

The responsive QA pass (`2737698`) covered 360/390/480/768/1024/1280/1440 plus
phone landscape and 200% zoom, in a desktop browser. Everything it could see,
it saw. This pass exists for what it could not.

## Getting the app onto a phone

```sh
npm run dev --workspace @kapka/web -- --host
```

Vite prints a `Network:` URL — open that on the phone, on the same wifi.
Verified working: `http://192.168.0.21:5173/`.

No API needed. Without `VITE_API_URL` the app serves its seed data in-process
(see `createApiClient` in `apps/web/src/lib/api.ts`), which is exactly right
here: this pass is about what the keyboard and the screen edges do, and running
a database on the LAN only adds ways for it to fail for an unrelated reason.
The registration form still submits — the demo client answers it.

## Devices

|                                              | Why this one                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **An iPhone with a notch or Dynamic Island** | The only way to get non-zero `safe-area-inset-*`. iOS Safari, not Chrome for iOS — same engine, different chrome, and Safari is what people use.                               |
| **An older Android, Chrome not up to date**  | Two different risks: whether the bundle parses at all (see suspect 4), and Android's keyboard resizing the viewport rather than overlaying it. A current Pixel proves neither. |

Test both **portrait and landscape** on the iPhone. Landscape is where the
horizontal insets appear, and it is the case suspect 2 is about.

## Four suspects, found by reading

Confirm or clear these first — they are specific enough to check in a minute
each, and if they reproduce they explain anything else that looks wrong.

### 1. A bottom sheet can run under the browser chrome

`apps/web/src/components/Modal/Modal.module.css:37`, and again at `131` and
`154`:

```css
max-block-size: 85vh;
```

On mobile Safari `vh` is the **large** viewport — the height with the URL bar
hidden. With the bar showing, 85vh is more than 85% of what is actually
visible, so a full sheet's footer can sit below the fold. The project already
knows this rule: `packages/tokens/src/global.css:31` uses `100dvh` and says
"dvh, not vh — the mobile URL bar (§7.4)". These three did not get the memo.

**Check:** open the feed on the iPhone with the URL bar visible, open the
filter sheet, and look for the "Show N requests" button. It should be fully on
screen and tappable without scrolling the page.

### 2. Nothing anywhere accounts for the horizontal insets

`env(safe-area-inset-bottom)` is used in five places and is right in all of
them. `safe-area-inset-left` and `safe-area-inset-right` appear **nowhere**.

The page gutter is `--container-gutter: clamp(var(--space-4), 4vw, var(--space-12))`
(`packages/tokens/src/scale.css:143`). In landscape on a 844pt-wide iPhone that
is about 34px. The notch inset is around 44px, and around 59px on the Dynamic
Island models. The two fixed bars are worse: both span `inset-inline: 0` with a
16px `padding-inline` — `RequestDetail.module.css:288` and
`Feed.module.css:246`.

**Check:** iPhone, **landscape**, notch on the left. Read the feed, open a
request, look at the sticky call/directions bar. Anything clipped, or sitting
under the camera housing, is this.

### 3. `100dvh` with no fallback

`packages/tokens/src/global.css:31`:

```css
body {
  min-block-size: 100dvh;
}
```

`dvh` arrived in Chrome 108 and Safari 15.4. Older than that, the declaration
is invalid and dropped — and there is no `100vh` line above it to fall back to,
so `body` ends up with no minimum height at all.

**Check:** on the older Android, open a short page — a request that has no
note, or the offline state. The canvas background should reach the bottom of
the screen rather than stopping where the content does.

### 4. Nothing declares which browsers this has to run in

There is no `browserslist` and no `build.target` in `apps/web/vite.config.ts`,
so the floor is whatever Vite's default happens to be today. The built entry
ships logical assignment (`??=`, `||=`, `&&=`), which needs **Chrome 85 or
Safari 14**. Below that the file does not parse and the app is a white screen —
not a degraded layout, nothing at all.

**Check:** this is the first thing to do on the older Android, before anything
else. Note the Chrome version from `chrome://version`. If the app loads, record
the version as the lowest one actually known to work; if it does not, that is
the finding and the rest of the Android pass is blocked.

## The pass

### Keyboard

On both phones, for every text field — registration (both steps on the phone),
post a request, the reject-reason box in the moderation queue, profile editing
on the dashboard:

- [ ] Tapping the field does **not** zoom the page. (Controls are `--text-base`,
      16px at its floor, specifically to prevent this — confirm it holds.)
- [ ] The focused field is visible above the keyboard, not behind it.
- [ ] The keyboard type matches the field: email keyboard for email, number pad
      for phone.
- [ ] The submit/Continue button is reachable without dismissing the keyboard,
      or the page scrolls so it can be.
- [ ] Dismissing the keyboard returns the layout to where it was — no gap left
      behind, no page stuck scrolled.
- [ ] Android: whether the keyboard resizes the viewport or overlays it, the
      sticky footer on the registration and request forms behaves either way.
- [ ] Autofill: accepting a suggested email or name leaves the field validated
      correctly, and blur validation does not fire against a stale value.
- [ ] Rotating with the keyboard open does not strand the layout.

### Safe areas

- [ ] Portrait, iPhone: the fixed action bar on a request detail clears the home
      indicator, and the indicator does not sit on top of the buttons.
- [ ] Portrait: the feed's sticky CTA, once it appears, clears it too.
- [ ] Portrait: a toast clears it.
- [ ] Landscape, notch **left**, then rotate 180° so it is **right**: no clipped
      text, no control under the housing, on the feed, a request detail, and the
      registration form.
- [ ] Bottom sheets: grabber reachable, footer fully visible, drag to dismiss
      lands somewhere sensible.
- [ ] Scrolled to the very bottom of a long page, the last element is not under
      a fixed bar.

### While the phone is in hand

Cheap to check and impossible to fake:

- [ ] Tap targets are actually comfortable, not merely 44px in the CSS.
- [ ] `tel:` on a request detail opens the dialler with the right number.
- [ ] Directions opens the platform's map app, not a broken web link.
- [ ] Dark mode follows the phone's own setting.
- [ ] Text at the phone's largest accessibility font size still fits.
- [ ] Reachability: is anything important stranded at the top of a big screen?

## Results

Fill in as it is run. A blank row is a check nobody did, not a check that
passed.

| Device | OS / browser version | Suspect 1 | 2   | 3   | 4   | Keyboard | Safe areas | Notes |
| ------ | -------------------- | --------- | --- | --- | --- | -------- | ---------- | ----- |
|        |                      |           |     |     |     |          |            |       |
|        |                      |           |     |     |     |          |            |       |
