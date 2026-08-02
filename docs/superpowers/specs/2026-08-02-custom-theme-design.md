# Custom Colour Theme — Design

Date: 2026-08-02

## Problem

The palette is fixed, and light/dark follows the device with no way to
override. Users want the app to look like theirs, and to be able to force one
mode regardless of the system setting.

## Scope

**The accent colour only**, plus an explicit light/dark/system choice. Surfaces,
text, and the income/expense green and red stay as designed — those carry
meaning and legibility that a colour picker would break.

## Why a single picked colour is not enough

`--accent` is used two incompatible ways in the existing stylesheets:

- **As a background** with `--bg` as the text on it: the FAB, `.btn--primary`,
  active chips, active tabs, the type switch, the language switch.
- **As a foreground** on `--bg`: the active nav label, the focus ring, the
  selected heat cell outline, progress fills.

A mid-tone accent breaks both at once — too light and the text on it vanishes,
too dark and the text made of it does. Picking `#eda100` today would leave the
FAB's `+` unreadable.

So the picker sets one colour and `utils/theme.ts` derives two more:

| token | meaning |
|---|---|
| `--accent` | exactly what the user picked |
| `--on-accent` | white or near-black, whichever wins on contrast against the accent |
| `--accent-strong` | the accent, lightness-shifted until it clears 4.5:1 against the current surface |

Stylesheets then use `var(--on-accent)` where text sits on accent, and
`var(--accent-strong)` where the accent *is* text, a thin indicator, or an
outline. Large fills with nothing on top keep plain `--accent`.

## Derived, not stored

Only the accent hex and the appearance choice are persisted. Everything else is
derived, so there is no way for the stored values to disagree with each other.

The heat ramp and the hero card derive in CSS rather than JavaScript, guarded by
an attribute the script sets:

```css
:root[data-accent] {
  --heat-1: color-mix(in oklab, var(--accent) 22%, var(--heat-0));
  /* …through --heat-4 */
  --hero-bg: var(--accent);
  --hero-text: var(--on-accent);
}
```

Without a custom accent the attribute is absent and every current default
applies unchanged — including the per-mode accent (near-black in light,
near-white in dark) and the neutral hero. A custom accent is a single hue in
both modes, which is what choosing one means.

`color-mix(in oklab, …)` is already used in the sheet for the instalment row
tints, so this introduces no new requirement.

## Light / dark / system

`data-theme="light" | "dark"` on `<html>`; System means the attribute is absent
and `prefers-color-scheme` decides. Each existing dark block becomes two
selectors:

```css
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { … } }
:root[data-theme='dark'] { … }
```

Three files hold such a block: `index.css`, `styles/forms.css`, and
`features/transactions/PeriodBar.css`.

## Applied before first paint

A small inline script in `index.html` reads localStorage and sets `data-theme`,
`data-accent` and the three accent variables before the bundle loads.

Doing this in a React effect would flash the default theme on every cold start,
which is the one thing that would make the feature feel broken. The script is
deliberately tiny and duplicates only the two-line derivation it needs; the
richer version in `utils/theme.ts` is what the panel uses, and a test asserts
the two agree on the same inputs.

## Pieces

**`utils/theme.ts`** — pure: `relativeLuminance`, `contrastRatio`, `onAccent`,
`readableOn`, `themeVars(accent, mode)`.

**`components/ThemePanel.tsx`** — a third item in the `⋯` menu: the
Light/Dark/System control, preset swatches, a custom `<input type="color">`,
and a preview strip so the effect is visible before it is committed.

**`config/theme.ts`** — reads and writes localStorage, matching how the locale
is already stored. A device preference, not sheet data.

## Testing

`utils/theme.test.ts` — luminance against known values, contrast ratio being
symmetric and hitting 21:1 for black on white, `onAccent` choosing correctly at
both extremes and either side of the decision boundary, `readableOn` converging
for a pathological input such as pure yellow on white, idempotence when the
colour already passes, and malformed hex falling back to the default rather
than emitting `NaN` into a style attribute.

A further test asserts the inline script's derivation and `themeVars` agree, so
the pre-paint colours cannot drift from the ones React later applies.

## Out of scope

Theming surfaces or text, per-theme income and expense colours, syncing the
choice between devices, and per-category colour overrides in the doughnut.
