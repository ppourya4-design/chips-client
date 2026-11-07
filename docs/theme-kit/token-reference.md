# Token reference

Every token a `.chipstheme` file may set, with its type, its allowed values and the
default it falls back to. The tables are generated from the same array the
validator uses (`web/src/themeFile.ts`, `THEME_TOKENS`), and
`web/tests/theme-file.test.ts` fails if this document and the schema drift
apart — so what you read here is exactly what the app enforces.

* `format` must be `"chipstheme"`, `version` must be `1`, `base` must be `"glass"`.
* Every token is optional. A token you leave out keeps the default shown below.
* A token that is not in this list is an **error**, not silently ignored — a typo
  can never look like it worked.
* Values are design tokens only. There is no token for a stylesheet, a script, a
  link, an image, a downloaded font, a shadow or a glow, and a file that tries to
  add one is refused.

## Value types

| Type | Accepted |
| --- | --- |
| colour | `"#rrggbb"`, `"#rgb"`, `"rgba(r, g, b, a)"` with a = 0–1, or `"transparent"` |
| hex colour | hex `"#rrggbb"` only (`"#rgb"` is expanded). `rgba()` is refused here, because Chips derives the translucent variants itself |
| px | a plain JSON number — no quotes, no `px` suffix |
| % | a plain JSON number inside the stated limits — no quotes, no `%` suffix |
| font name | one of the bundled families listed under **Fonts** |

## Colours

| Token | Type | Default | What it does |
| --- | --- | --- | --- |
| `color.page` | colour | `#05050a` | The page behind every panel. |
| `color.pageDeep` | colour | `#030308` | The darker end of the page gradient. |
| `color.surface` | colour | `rgba(255, 255, 255, 0.05)` | The glass tint of panels, bars and cards. |
| `color.surfaceStrong` | colour | `rgba(255, 255, 255, 0.075)` | The slightly denser tint of the floating bars. |
| `color.surfaceHover` | colour | `rgba(255, 255, 255, 0.09)` | Hover state for glass controls. |
| `color.surfacePress` | colour | `rgba(255, 255, 255, 0.055)` | Pressed state for glass controls. |
| `color.surfaceSunken` | colour | `rgba(0, 0, 0, 0.22)` | Recessed wells inside a panel (inputs, tracks). |
| `color.edge` | colour | `rgba(255, 255, 255, 0.55)` | The crisp 1px specular line on a panel's top edge. |
| `color.edgeSoft` | colour | `rgba(255, 255, 255, 0.12)` | The quieter line around the rest of the contour. |
| `color.depth` | colour | `rgba(0, 0, 0, 0.38)` | The soft inner shadow that gives glass its thickness. |
| `color.accent` | hex colour | `#74e5ff` | The accent light. Chips derives its translucent variants from this hex. |
| `color.accentContrast` | colour | `#04121a` | Text and icon colour drawn directly on the accent. |
| `color.text` | colour | `#eef1f7` | Primary text. |
| `color.textMuted` | colour | `#9aa3b2` | Secondary text: labels, menu items, log lines. |
| `color.textFaint` | colour | `#6b7382` | Tertiary text and hints. |
| `color.clientText` | colour | `#dfe4ee` | Nicknames in the channel tree. |
| `color.success` | colour | `#4ade80` | Success marks and connected states. |
| `color.danger` | colour | `#ff7a7a` | Errors, log errors and destructive marks. |
| `color.border` | colour | `rgba(255, 255, 255, 0.1)` | Stronger outlines (dividers, selected rows). |
| `color.borderSoft` | colour | `rgba(255, 255, 255, 0.06)` | Hairline outlines on glass surfaces. |
| `color.input` | colour | `rgba(255, 255, 255, 0.045)` | Text-field background. |
| `color.button` | colour | `rgba(255, 255, 255, 0.06)` | Button fill, top stop. |
| `color.buttonAlt` | colour | `rgba(255, 255, 255, 0.03)` | Button fill, bottom stop. |
| `color.buttonHover` | colour | `rgba(255, 255, 255, 0.1)` | Button hover, top stop. |
| `color.buttonHoverAlt` | colour | `rgba(255, 255, 255, 0.06)` | Button hover, bottom stop. |
| `color.rowHover` | colour | `rgba(255, 255, 255, 0.07)` | Hovered list rows in the tree and menus. |
| `color.logBackground` | colour | `transparent` | The log strip behind the connection log. |
| `color.badge` | colour | `#f2b96a` | The alpha/build badge colour. |
| `color.toolbar` | colour | `transparent` | Legacy upstream toolbar fill; transparent lets the glass show through. |
| `color.toolbarAlt` | colour | `transparent` | Legacy upstream toolbar fill, second stop. |

## Glass

| Token | Type | Default | What it does |
| --- | --- | --- | --- |
| `glass.blur` | px 0–60 | `20` | Backdrop blur radius of every glass surface. 10 with glass.saturate 120 is the Subtle look; 0 is Off. |
| `glass.saturate` | % 100–250 | `160` | Backdrop saturation of every glass surface (percent). |
| `glass.radius` | px 0–32 | `20` | Corner radius of panels, cards, dialogs and the toolbar. |
| `controls.radius` | px 0–999 | `999` | Corner radius of buttons, inputs and pills. 999 is fully rounded. |

## Type

| Token | Type | Default | What it does |
| --- | --- | --- | --- |
| `font.family` | font name | `plus-jakarta-sans` | Interface typeface, chosen from the fonts bundled with Chips. |
| `font.size` | px 11–18 | `13` | Base interface text size in px. |

## The accent

`color.accent` is the only colour that also produces derived values. Chips
computes them from the hex, so a theme never has to:

| Derived value | From `color.accent` |
| --- | --- |
| `--primary` / `--accent` | the hex itself |
| `--primary-rgb` / `--accent-rgb` | the `r, g, b` triplet the translucent variants need |
| `--primary-dim` | the accent at 62% alpha |
| `--accent-contrast` | `#04121a` on a light accent, `#f4f8ff` on a dark one — unless the file sets `color.accentContrast` itself |

## Fonts

Only the typefaces bundled inside Chips can be named; no font is ever downloaded.

| `font.family` value | Family |
| --- | --- |
| `plus-jakarta-sans` | Plus Jakarta Sans (default) |
| `manrope` | Manrope |
| `vazirmatn` | Vazirmatn (also the fallback for Persian user content) |
| `vt323` | VT323 (pixel terminal) |

## What a theme file cannot do

No token exists for arbitrary CSS, JavaScript or HTML, for URLs, external fonts
or images, for shadows, glows or blur halos, for animations or keyframes, for
layout or element positions, or for anything that changes app behaviour. A
`.chipstheme` hands the app a set of custom-property values and nothing else: it
cannot make Chips navigate, fetch, play a sound, hide a control or run code.
