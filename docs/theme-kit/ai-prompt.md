# ساخت تم برای Chips با کمک هوش مصنوعی

این متن را کامل کپی کنید و به هر چت‌بات هوش مصنوعی (ChatGPT، Claude، Gemini، هر
چیز دیگری) بدهید. آخر متن، جای «توضیح حال‌وهوا»، بنویسید چه حسی می‌خواهید؛ مثلاً:

> تم سرد و آرام با آبی یخی و شیشهٔ نرم.

چت‌بات یک فایل JSON برمی‌گرداند. آن را در فایلی با پسوند `.chipstheme` ذخیره کنید
(UTF-8) و در Chips از مسیر Settings → Appearance → Import .chipstheme واردش کنید.
اگر خطا گرفتید، متن خطا را به همان چت‌بات بدهید تا درستش کند.

---

## متن آمادهٔ کپی (از اینجا تا آخر)

You are writing a Chips theme file (extension `.chipstheme`). It must be ONE valid JSON
object and nothing else - no comments, no explanation, no markdown code fence.

Hard rules:
1. The document has exactly these top-level fields: "format", "version", "name",
   "author", "description", "base", "tokens". No other field is allowed.
2. "format" must be the string "chipstheme". "version" must be the number 1.
   "base" must be the string "glass".
3. "name" is 1-48 characters, "author" 1-48 characters, "description" is optional and
   at most 160 characters. No control characters.
4. "tokens" is an object. Every key must be one of the tokens listed below; an unknown
   token is rejected, so do not invent tokens. Every token is optional: leave out the
   ones you do not want to change and they keep their default.
5. Values are design tokens only. There is NO way to express CSS, JavaScript, HTML, a
   URL, an external font or image, a shadow, a glow, an animation, a layout change or
   any behaviour. Do not try; such fields are rejected.
6. px and percent token values are plain JSON numbers: no quotes, no units. All
   numbers must stay inside the stated range.
7. Colours are lowercase hex ("#rrggbb"). "color.accent" must be a hex colour, because
   Chips derives its translucent variants from it.

Token schema (36 tokens):

  "color.page": "#05050a"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#05050a". The page behind every panel.
  "color.pageDeep": "#030308"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#030308". The darker end of the page gradient.
  "color.surface": "rgba(255, 255, 255, 0.05)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.05)". The glass tint of panels, bars and cards.
  "color.surfaceStrong": "rgba(255, 255, 255, 0.075)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.075)". The slightly denser tint of the floating bars.
  "color.surfaceHover": "rgba(255, 255, 255, 0.09)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.09)". Hover state for glass controls.
  "color.surfacePress": "rgba(255, 255, 255, 0.055)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.055)". Pressed state for glass controls.
  "color.surfaceSunken": "rgba(0, 0, 0, 0.22)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(0, 0, 0, 0.22)". Recessed wells inside a panel (inputs, tracks).
  "color.edge": "rgba(255, 255, 255, 0.55)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.55)". The crisp 1px specular line on a panel's top edge.
  "color.edgeSoft": "rgba(255, 255, 255, 0.12)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.12)". The quieter line around the rest of the contour.
  "color.depth": "rgba(0, 0, 0, 0.38)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(0, 0, 0, 0.38)". The soft inner shadow that gives glass its thickness.
  "color.accent": "#74e5ff"   // hex colour: "#rrggbb" only - default "#74e5ff". The accent light. Chips derives its translucent variants from this hex.
  "color.accentContrast": "#04121a"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#04121a". Text and icon colour drawn directly on the accent.
  "color.text": "#eef1f7"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#eef1f7". Primary text.
  "color.textMuted": "#9aa3b2"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#9aa3b2". Secondary text: labels, menu items, log lines.
  "color.textFaint": "#6b7382"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#6b7382". Tertiary text and hints.
  "color.clientText": "#dfe4ee"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#dfe4ee". Nicknames in the channel tree.
  "color.success": "#4ade80"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#4ade80". Success marks and connected states.
  "color.danger": "#ff7a7a"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#ff7a7a". Errors, log errors and destructive marks.
  "color.border": "rgba(255, 255, 255, 0.1)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.1)". Stronger outlines (dividers, selected rows).
  "color.borderSoft": "rgba(255, 255, 255, 0.06)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.06)". Hairline outlines on glass surfaces.
  "color.input": "rgba(255, 255, 255, 0.045)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.045)". Text-field background.
  "color.button": "rgba(255, 255, 255, 0.06)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.06)". Button fill, top stop.
  "color.buttonAlt": "rgba(255, 255, 255, 0.03)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.03)". Button fill, bottom stop.
  "color.buttonHover": "rgba(255, 255, 255, 0.1)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.1)". Button hover, top stop.
  "color.buttonHoverAlt": "rgba(255, 255, 255, 0.06)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.06)". Button hover, bottom stop.
  "color.rowHover": "rgba(255, 255, 255, 0.07)"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "rgba(255, 255, 255, 0.07)". Hovered list rows in the tree and menus.
  "color.logBackground": "transparent"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "transparent". The log strip behind the connection log.
  "color.badge": "#f2b96a"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "#f2b96a". The alpha/build badge colour.
  "color.toolbar": "transparent"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "transparent". Legacy upstream toolbar fill; transparent lets the glass show through.
  "color.toolbarAlt": "transparent"   // colour: "#rrggbb" | "#rgb" | "rgba(r, g, b, a)" (a 0-1) | "transparent" - default "transparent". Legacy upstream toolbar fill, second stop.
  "glass.blur": 20   // number (px), 0..60 - default 20. Backdrop blur radius of every glass surface. 10 with glass.saturate 120 is the Subtle look; 0 is Off.
  "glass.saturate": 160   // number (percent), 100..250 - default 160. Backdrop saturation of every glass surface (percent).
  "glass.radius": 20   // number (px), 0..32 - default 20. Corner radius of panels, cards, dialogs and the toolbar.
  "controls.radius": 999   // number (px), 0..999 - default 999. Corner radius of buttons, inputs and pills. 999 is fully rounded.
  "font.family": "plus-jakarta-sans"   // one of "plus-jakarta-sans" | "manrope" | "vazirmatn" | "vt323" - default "plus-jakarta-sans". Interface typeface, chosen from the fonts bundled with Chips.
  "font.size": 13   // number (px), 11..18 - default 13. Base interface text size in px.

Notes:
- The base look is near-black glass: page #05050a, surfaces rgba(255,255,255,0.05),
  backdrop blur 20px saturate 160%, 20px card radii. Keep the surfaces translucent if
  you want the glass effect to stay visible.
- "color.accent" drives the primary colour, the accent marks, focus rings and selected
  rows. Pick "color.accentContrast" so text on the accent stays readable (dark text on
  a light accent, light text on a dark one) or omit it and Chips computes it.
- Light in this design is a crisp 1px specular edge, never a glow. There is no glow
  token, and none will be added.

Output: one JSON object with all 36 tokens present (use the default value for
the ones you do not change), formatted with 2-space indentation.

Vibe I want (fill this in): [توضیح حال‌وهوا]

---

## چند نمونهٔ آماده (فقط برای الهام)

- **آبی یخی / Ice:** `"color.accent": "#74e5ff"`، `"color.page": "#04060c"`،
  `"glass.blur": 24`، `"glass.saturate": 150`
- **بنفش نیمه‌شب / Midnight:** `"color.accent": "#a74cfd"`، `"color.page": "#08050f"`،
  `"color.surface": "rgba(167, 76, 253, 0.06)"`
- **قرمز خشک / Ember:** `"color.accent": "#fd1d1d"`، `"color.page": "#0b0606"`،
  `"glass.blur": 14`، `"glass.radius": 12`
- **مینیمال کم‌بلور / Soft:** `"glass.blur": 10`، `"glass.saturate": 120`،
  `"color.surface": "rgba(255, 255, 255, 0.035)"`

توکن‌های هر گروه و معنی‌شان در `tutorial.md` و فهرست دقیقشان در
`token-reference.md` آمده است.
