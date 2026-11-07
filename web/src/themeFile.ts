/* Chips `.chipstheme` theme files — the schema, the validator and the codec.
 *
 * A `.chipstheme` file is ONE JSON manifest. It carries a name, an author, a
 * format version and design-token values, and nothing else: no CSS, no
 * JavaScript, no URLs, no fonts to download, no images. Every token below is a
 * custom property the Liquid Glass stylesheet already reads, so a theme can
 * recolour the app but cannot change its behaviour.
 *
 * The single source of truth is THEME_TOKENS. Validation, export, the
 * starter template and docs/theme-kit/token-reference.md are all derived from
 * it, and `web/tests/theme-file.test.ts` fails if the shipped documents drift
 * away from this array.
 *
 * Kept free of React (and of any DOM API beyond localStorage) so the settings
 * UI and the Node test runner can share it.
 */

import { accentHex, hexToRgbTriplet, type AccentId } from "./theme";

export const THEME_FILE_FORMAT = "chipstheme";
export const THEME_FILE_VERSION = 1;
/** A theme file is a few hundred bytes; anything this big is not one. */
export const THEME_FILE_MAX_BYTES = 65_536;
/** Sanity cap so a broken importer cannot fill localStorage. */
export const MAX_IMPORTED_THEMES = 32;
export const THEME_NAME_MAX = 48;
export const THEME_AUTHOR_MAX = 48;
export const THEME_DESCRIPTION_MAX = 160;

export const THEME_FILES_KEY = "chips:themes";
export const ACTIVE_THEME_KEY = "chips:active-theme";
export const THEME_AUTHOR_KEY = "chips:theme-author";

export type ThemeTokenType = "color" | "hex" | "px" | "percent" | "font";

export type ThemeTokenDef = {
  /** Dotted name used inside the `tokens` object of a theme file. */
  key: string;
  /** Custom properties this token writes. */
  cssVars: string[];
  type: ThemeTokenType;
  group: "Colours" | "Glass" | "Type";
  /** Value used when a theme omits the token. Matches liquid-glass.css. */
  defaultValue: string | number;
  min?: number;
  max?: number;
  allowed?: readonly string[];
  /** One-line English description, reused by the docs. */
  summary: string;
};

/** The bundled fonts a theme may name. No font is ever downloaded. */
export const FONT_CHOICES = [
  "plus-jakarta-sans",
  "manrope",
  "vazirmatn",
  "vt323",
] as const;

export type FontChoice = (typeof FONT_CHOICES)[number];

export const FONT_STACKS: Record<FontChoice, string> = {
  "plus-jakarta-sans":
    '"Plus Jakarta Sans", "Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  manrope:
    '"Manrope", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  vazirmatn:
    '"Vazirmatn", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  vt323: 'VT323, "Plus Jakarta Sans", ui-monospace, monospace',
};

/**
 * Every token a .chipstheme may set, in the order the starter file and the
 * exported files list them. Colours first (page → surfaces → light → text →
 * controls), then the glass measurements, then type.
 */
export const THEME_TOKENS: ThemeTokenDef[] = [
  // --- Colours: the page and the glass tints -------------------------------
  { key: "color.page", cssVars: ["--bg"], type: "color", group: "Colours", defaultValue: "#05050a", summary: "The page behind every panel." },
  { key: "color.pageDeep", cssVars: ["--bg-deep"], type: "color", group: "Colours", defaultValue: "#030308", summary: "The darker end of the page gradient." },
  { key: "color.surface", cssVars: ["--surface"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.05)", summary: "The glass tint of panels, bars and cards." },
  { key: "color.surfaceStrong", cssVars: ["--surface-strong"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.075)", summary: "The slightly denser tint of the floating bars." },
  { key: "color.surfaceHover", cssVars: ["--surface-hover"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.09)", summary: "Hover state for glass controls." },
  { key: "color.surfacePress", cssVars: ["--surface-press"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.055)", summary: "Pressed state for glass controls." },
  { key: "color.surfaceSunken", cssVars: ["--surface-sunken"], type: "color", group: "Colours", defaultValue: "rgba(0, 0, 0, 0.22)", summary: "Recessed wells inside a panel (inputs, tracks)." },
  // --- Colours: the light -------------------------------------------------
  { key: "color.edge", cssVars: ["--edge"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.55)", summary: "The crisp 1px specular line on a panel's top edge." },
  { key: "color.edgeSoft", cssVars: ["--edge-soft"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.12)", summary: "The quieter line around the rest of the contour." },
  { key: "color.depth", cssVars: ["--depth"], type: "color", group: "Colours", defaultValue: "rgba(0, 0, 0, 0.38)", summary: "The soft inner shadow that gives glass its thickness." },
  // --- Colours: the accent ------------------------------------------------
  { key: "color.accent", cssVars: ["--primary", "--accent"], type: "hex", group: "Colours", defaultValue: "#74e5ff", summary: "The accent light. Chips derives its translucent variants from this hex." },
  { key: "color.accentContrast", cssVars: ["--accent-contrast"], type: "color", group: "Colours", defaultValue: "#04121a", summary: "Text and icon colour drawn directly on the accent." },
  // --- Colours: text ------------------------------------------------------
  { key: "color.text", cssVars: ["--text"], type: "color", group: "Colours", defaultValue: "#eef1f7", summary: "Primary text." },
  { key: "color.textMuted", cssVars: ["--text-muted"], type: "color", group: "Colours", defaultValue: "#9aa3b2", summary: "Secondary text: labels, menu items, log lines." },
  { key: "color.textFaint", cssVars: ["--text-faint"], type: "color", group: "Colours", defaultValue: "#6b7382", summary: "Tertiary text and hints." },
  { key: "color.clientText", cssVars: ["--client-text"], type: "color", group: "Colours", defaultValue: "#dfe4ee", summary: "Nicknames in the channel tree." },
  { key: "color.success", cssVars: ["--success"], type: "color", group: "Colours", defaultValue: "#4ade80", summary: "Success marks and connected states." },
  { key: "color.danger", cssVars: ["--danger"], type: "color", group: "Colours", defaultValue: "#ff7a7a", summary: "Errors, log errors and destructive marks." },
  // --- Colours: controls --------------------------------------------------
  { key: "color.border", cssVars: ["--border"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.1)", summary: "Stronger outlines (dividers, selected rows)." },
  { key: "color.borderSoft", cssVars: ["--border-soft"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.06)", summary: "Hairline outlines on glass surfaces." },
  { key: "color.input", cssVars: ["--input-bg"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.045)", summary: "Text-field background." },
  { key: "color.button", cssVars: ["--button-bg-1"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.06)", summary: "Button fill, top stop." },
  { key: "color.buttonAlt", cssVars: ["--button-bg-2"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.03)", summary: "Button fill, bottom stop." },
  { key: "color.buttonHover", cssVars: ["--button-bg-hover-1"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.1)", summary: "Button hover, top stop." },
  { key: "color.buttonHoverAlt", cssVars: ["--button-bg-hover-2"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.06)", summary: "Button hover, bottom stop." },
  { key: "color.rowHover", cssVars: ["--row-hover"], type: "color", group: "Colours", defaultValue: "rgba(255, 255, 255, 0.07)", summary: "Hovered list rows in the tree and menus." },
  { key: "color.logBackground", cssVars: ["--log-bg"], type: "color", group: "Colours", defaultValue: "transparent", summary: "The log strip behind the connection log." },
  { key: "color.badge", cssVars: ["--alpha-badge"], type: "color", group: "Colours", defaultValue: "#f2b96a", summary: "The alpha/build badge colour." },
  { key: "color.toolbar", cssVars: ["--bg-toolbar-1"], type: "color", group: "Colours", defaultValue: "transparent", summary: "Legacy upstream toolbar fill; transparent lets the glass show through." },
  { key: "color.toolbarAlt", cssVars: ["--bg-toolbar-2"], type: "color", group: "Colours", defaultValue: "transparent", summary: "Legacy upstream toolbar fill, second stop." },
  // --- Glass measurements -------------------------------------------------
  { key: "glass.blur", cssVars: ["--glass-blur"], type: "px", group: "Glass", defaultValue: 20, min: 0, max: 60, summary: "Backdrop blur radius of every glass surface. 10 with glass.saturate 120 is the Subtle look; 0 is Off." },
  { key: "glass.saturate", cssVars: ["--glass-saturate"], type: "percent", group: "Glass", defaultValue: 160, min: 100, max: 250, summary: "Backdrop saturation of every glass surface (percent)." },
  { key: "glass.radius", cssVars: ["--glass-radius"], type: "px", group: "Glass", defaultValue: 20, min: 0, max: 32, summary: "Corner radius of panels, cards, dialogs and the toolbar." },
  { key: "controls.radius", cssVars: ["--pill-radius"], type: "px", group: "Glass", defaultValue: 999, min: 0, max: 999, summary: "Corner radius of buttons, inputs and pills. 999 is fully rounded." },
  // --- Type ---------------------------------------------------------------
  { key: "font.family", cssVars: ["--font-ui"], type: "font", group: "Type", defaultValue: "plus-jakarta-sans", allowed: FONT_CHOICES, summary: "Interface typeface, chosen from the fonts bundled with Chips." },
  { key: "font.size", cssVars: ["--ui-font-size"], type: "px", group: "Type", defaultValue: 13, min: 11, max: 18, summary: "Base interface text size in px." },
];

export const THEME_TOKEN_BY_KEY: Record<string, ThemeTokenDef> = Object.fromEntries(
  THEME_TOKENS.map((def) => [def.key, def]),
);

/** The defaults, as a plain token → value object (what "no theme" looks like). */
export const DEFAULT_THEME_TOKENS: Record<string, string | number> = Object.fromEntries(
  THEME_TOKENS.map((def) => [def.key, def.defaultValue]),
);

const MANIFEST_KEYS = ["format", "version", "name", "author", "description", "base"] as const;
const BASE_LAYOUT = "glass";

/** A validated theme, as stored locally. `id` is local only and never exported. */
export type ThemeFile = {
  id: string;
  name: string;
  author: string;
  description: string;
  /** Only the tokens the file actually set, normalised. */
  tokens: Record<string, string | number>;
};

/** What a parsed file contains, before the app assigns a local id. */
export type ThemeManifest = Omit<ThemeFile, "id">;

export type ThemeParseResult =
  | { ok: true; manifest: ThemeManifest }
  | { ok: false; errors: string[] };

/* ---------------------------------------------------------------------------
 * Value parsing
 * ------------------------------------------------------------------------- */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGBA =
  /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01](?:\.\d{1,3})?|\.\d{1,3})\s*\)$/i;

/** "#ABC" -> "#aabbcc"; a valid colour -> its canonical text; else null. */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.toLowerCase() === "transparent") return "transparent";
  const hex = HEX.exec(raw);
  if (hex) {
    const body = hex[1].toLowerCase();
    return `#${body.length === 3 ? body.split("").map((c) => c + c).join("") : body}`;
  }
  const rgba = RGBA.exec(raw);
  if (!rgba) return null;
  const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map(Number);
  if (r > 255 || g > 255 || b > 255) return null;
  const alpha = Number(rgba[4]);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  // String(0.075) === "0.075"; String(1) === "1".
  return `rgba(${r}, ${g}, ${b}, ${String(Number(alpha.toFixed(3)))})`;
}

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = HEX.exec(value.trim());
  if (!match) return null;
  const body = match[1].toLowerCase();
  return `#${body.length === 3 ? body.split("").map((c) => c + c).join("") : body}`;
}

function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function rangeText(def: ThemeTokenDef): string {
  if (def.min !== undefined && def.max !== undefined) return `a number between ${def.min} and ${def.max}`;
  if (def.allowed) return `one of ${def.allowed.map((v) => JSON.stringify(v)).join(", ")}`;
  return "a valid value";
}

/** Parse one token value against its definition. Returns the normalised value
 *  or an English explanation of what is wrong. */
function parseTokenValue(def: ThemeTokenDef, value: unknown): { value: string | number } | { error: string } {
  switch (def.type) {
    case "color": {
      const color = normalizeColor(value);
      if (!color)
        return {
          error: `${def.key} must be a colour like "#05050a", "transparent" or "rgba(255, 255, 255, 0.05)" (got ${describeValue(value)})`,
        };
      return { value: color };
    }
    case "hex": {
      const hex = normalizeHex(value);
      if (!hex)
        return {
          error: `${def.key} must be a hex colour like "#74e5ff" (got ${describeValue(value)}); Chips derives the translucent variants from this hex, so rgba() is not accepted here`,
        };
      return { value: hex };
    }
    case "font": {
      if (typeof value !== "string" || !def.allowed?.includes(value))
        return { error: `${def.key} must be ${rangeText(def)} (got ${describeValue(value)})` };
      return { value };
    }
    case "px":
    case "percent": {
      if (typeof value !== "number" || !Number.isFinite(value))
        return {
          error: `${def.key} must be ${rangeText(def)}, written as a number without quotes (got ${describeValue(value)})`,
        };
      if (def.min !== undefined && value < def.min)
        return { error: `${def.key} must be ${rangeText(def)} (got ${value})` };
      if (def.max !== undefined && value > def.max)
        return { error: `${def.key} must be ${rangeText(def)} (got ${value})` };
      // One decimal is plenty for a px/percent design token.
      return { value: Math.round(value * 10) / 10 };
    }
  }
}

/** Token value -> the CSS text written to its custom properties. */
export function tokenCssValue(def: ThemeTokenDef, value: string | number): string {
  switch (def.type) {
    case "px":
      return `${value}px`;
    case "percent":
      return `${value}%`;
    case "font":
      return FONT_STACKS[value as FontChoice] ?? FONT_STACKS["plus-jakarta-sans"];
    default:
      return String(value);
  }
}

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLabel(
  value: unknown,
  field: string,
  max: number,
  required: boolean,
): { value: string } | { error: string } {
  const range = `"${field}" must be text between ${required ? 1 : 0} and ${max} characters`;
  if (value === undefined && !required) return { value: "" };
  if (typeof value !== "string") return { error: `${range} (got ${describeValue(value)})` };
  const text = value.trim();
  if ((required && !text) || text.length > max) return { error: `${range} (got ${describeValue(value)})` };
  // Reject control characters: a label is not a payload.
  if ([...text].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f))
    return { error: `"${field}" must not contain control characters (got ${describeValue(value)})` };
  return { value: text };
}

/**
 * Strict validation of a `.chipstheme` document.
 *
 * Rules (also documented in docs/theme-kit/ai-prompt.md and tutorial.md):
 *  - the whole file must be one JSON object;
 *  - `format` = "chipstheme", `version` = 1, `base` = "glass";
 *  - only the documented top-level fields, so a file that tries to smuggle in
 *    CSS, a script or a URL is refused rather than partly honoured;
 *  - only tokens from THEME_TOKENS - an unknown token is an error, never
 *    silently ignored, so a typo cannot look like it worked;
 *  - every value must match its type and range;
 *  - a token the file leaves out keeps its current/default value.
 *
 * Returns the (possibly empty) list of English errors. It never touches app
 * state; the caller applies the result only when the list is empty.
 */
export function validateThemeFile(text: string): string[] {
  if (typeof text !== "string" || !text.trim()) return ["This file is empty."];
  if (text.length > THEME_FILE_MAX_BYTES)
    return [`This file is larger than ${Math.round(THEME_FILE_MAX_BYTES / 1024)} KB, so it cannot be a theme file.`];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message.replace(/^JSON\.parse: /, "") : String(error);
    return [`This file is not valid JSON: ${detail}`];
  }

  if (!isPlainObject(parsed)) return ["A theme file must be a single JSON object."];

  const errors: string[] = [];

  if (parsed.format !== THEME_FILE_FORMAT)
    errors.push(
      `This is not a Chips theme file: "format" must be "${THEME_FILE_FORMAT}" (got ${describeValue(parsed.format)}).`,
    );

  const version = parsed.version;
  if (typeof version === "number" && version > THEME_FILE_VERSION)
    errors.push(
      `This theme file is version ${version}, but this app reads version ${THEME_FILE_VERSION}. Update Chips to use it.`,
    );
  else if (version !== THEME_FILE_VERSION)
    errors.push(`"version" must be the number ${THEME_FILE_VERSION} (got ${describeValue(version)}).`);

  for (const key of Object.keys(parsed))
    if (!(MANIFEST_KEYS as readonly string[]).includes(key) && key !== "tokens")
      errors.push(
        `Unknown top-level field "${key}". A theme file may only contain ${[...MANIFEST_KEYS, "tokens"].join(", ")} - no CSS, scripts or links.`,
      );

  const base = parsed.base ?? BASE_LAYOUT;
  if (base !== BASE_LAYOUT)
    errors.push(
      `"base" must be "${BASE_LAYOUT}" in version ${THEME_FILE_VERSION} (got ${describeValue(base)}). Theme files style the Liquid Glass design.`,
    );

  for (const [field, max, required] of [
    ["name", THEME_NAME_MAX, true],
    ["author", THEME_AUTHOR_MAX, true],
    ["description", THEME_DESCRIPTION_MAX, false],
  ] as const) {
    const result = parseLabel(parsed[field], field, max, required);
    if ("error" in result) errors.push(result.error);
  }

  if (parsed.tokens === undefined) {
    errors.push('The file has no "tokens" object, so it would not change anything.');
  } else if (!isPlainObject(parsed.tokens)) {
    errors.push(`"tokens" must be an object mapping token names to values (got ${describeValue(parsed.tokens)}).`);
  } else {
    let valid = 0;
    for (const [key, value] of Object.entries(parsed.tokens)) {
      const def = THEME_TOKEN_BY_KEY[key];
      if (!def) {
        errors.push(
          `Unknown token "${key}". See docs/theme-kit/token-reference.md for the complete list - a theme may only set documented tokens.`,
        );
        continue;
      }
      const parsedValue = parseTokenValue(def, value);
      if ("error" in parsedValue) errors.push(`${parsedValue.error}.`);
      else valid += 1;
    }
    if (valid === 0)
      errors.push("The file sets no valid tokens, so it would not change anything.");
  }

  return errors;
}

/** Validate and return the normalised manifest, or the errors. */
export function parseThemeFile(text: string): ThemeParseResult {
  const errors = validateThemeFile(text);
  if (errors.length) return { ok: false, errors };

  const manifest = JSON.parse(text) as Record<string, unknown>;
  const tokens: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(manifest.tokens as Record<string, unknown>)) {
    const parsedValue = parseTokenValue(THEME_TOKEN_BY_KEY[key], value);
    if ("value" in parsedValue) tokens[key] = parsedValue.value;
  }
  return {
    ok: true,
    manifest: {
      name: String(manifest.name).trim(),
      author: String(manifest.author).trim(),
      description: typeof manifest.description === "string" ? manifest.description.trim() : "",
      tokens,
    },
  };
}

/* ---------------------------------------------------------------------------
 * Applying and exporting
 * ------------------------------------------------------------------------- */

/** Contrast colour for text on top of an accent, same rule as theme.ts. */
export function accentContrastFor(hex: string): string {
  const [r, g, b] = hexToRgbTriplet(hex)
    .split(",")
    .map((part) => Number(part.trim()) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#04121a" : "#f4f8ff";
}

/**
 * The CSS custom properties a theme sets right now. Only tokens the file
 * actually carries are emitted, so a partial theme layers over whatever is
 * already there instead of resetting the rest of the palette.
 */
export function themeVariables(theme: ThemeFile): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const def of THEME_TOKENS) {
    const value = theme.tokens[def.key];
    if (value === undefined) continue;
    for (const cssVar of def.cssVars) vars[cssVar] = tokenCssValue(def, value);
  }
  // The accent drives several derived variables that are not tokens of their
  // own; they are computed here so an imported theme never inherits the
  // previous accent's translucent variants.
  const accent = theme.tokens["color.accent"];
  if (typeof accent === "string") {
    const rgb = hexToRgbTriplet(accent);
    vars["--primary"] = accent;
    vars["--primary-rgb"] = rgb;
    vars["--accent"] = accent;
    vars["--accent-rgb"] = rgb;
    vars["--primary-dim"] = `rgba(${rgb}, 0.62)`;
    if (theme.tokens["color.accentContrast"] === undefined)
      vars["--accent-contrast"] = accentContrastFor(accent);
  }
  return vars;
}

/**
 * The complete token set behind a look: defaults, then the theme's own tokens,
 * with the live accent filled in when the theme does not name one. This is what
 * Export writes, so an exported file is always complete and re-importable.
 */
export function resolveThemeTokens(theme: ThemeFile | null, liveAccent: AccentId): Record<string, string | number> {
  const resolved: Record<string, string | number> = { ...DEFAULT_THEME_TOKENS };
  if (!theme || theme.tokens["color.accent"] === undefined) resolved["color.accent"] = accentHex(liveAccent);
  if (theme) Object.assign(resolved, theme.tokens);
  if (theme && theme.tokens["color.accentContrast"] === undefined)
    resolved["color.accentContrast"] = accentContrastFor(String(resolved["color.accent"]));
  return resolved;
}

/** Serialise a complete token set as a `.chipstheme` document (2-space JSON,
 *  schema order). */
export function serializeThemeFile(meta: {
  name: string;
  author: string;
  description?: string;
  tokens: Record<string, string | number>;
}): string {
  const tokens: Record<string, string | number> = {};
  for (const def of THEME_TOKENS) {
    const value = meta.tokens[def.key];
    tokens[def.key] = value === undefined ? def.defaultValue : value;
  }
  const doc = {
    format: THEME_FILE_FORMAT,
    version: THEME_FILE_VERSION,
    name: meta.name,
    author: meta.author,
    description: meta.description ?? "",
    base: BASE_LAYOUT,
    tokens,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/* ---------------------------------------------------------------------------
 * Built-in themes: only the owner's Liquid Glass base + the four site accents
 * ------------------------------------------------------------------------- */

export const BUILTIN_THEME_PREFIX = "accent:";

export type BuiltinTheme = {
  id: string;
  accent: AccentId;
  name: string;
  description: string;
};

/** The only bundled themes. Third-party/fun themes are distributed later as
 *  standalone .chipstheme files — the format already supports them. */
export const BUILTIN_THEMES: BuiltinTheme[] = [
  { id: `${BUILTIN_THEME_PREFIX}cyan`, accent: "cyan", name: "Liquid Glass · Cyan", description: "The Chips default: near-black glass with cyan light." },
  { id: `${BUILTIN_THEME_PREFIX}purple`, accent: "purple", name: "Liquid Glass · Purple", description: "The same glass with the purple accent." },
  { id: `${BUILTIN_THEME_PREFIX}red`, accent: "red", name: "Liquid Glass · Red", description: "The same glass with the red accent." },
  { id: `${BUILTIN_THEME_PREFIX}blue`, accent: "blue", name: "Liquid Glass · Blue", description: "The same glass with the blue accent." },
];

export function builtinThemeId(accent: AccentId): string {
  return `${BUILTIN_THEME_PREFIX}${accent}`;
}

export function isBuiltinThemeId(id: string): boolean {
  return BUILTIN_THEMES.some((theme) => theme.id === id);
}

export function builtinAccentOf(id: string): AccentId | null {
  return BUILTIN_THEMES.find((theme) => theme.id === id)?.accent ?? null;
}

/** A local id for an imported theme. Local only — never written into a file. */
export function newThemeFileId(now: number = Date.now(), random: () => number = Math.random): string {
  return `${now.toString(36)}-${random().toString(36).slice(2, 8)}`;
}

export type ThemeImportResult =
  | { ok: true; theme: ThemeFile }
  | { ok: false; errors: string[] };

/**
 * Validate a `.chipstheme` document and turn it into a stored theme.
 *
 * Pure: it reads `existing` but never mutates or persists anything, so a
 * rejected file leaves the installed themes, the selection and the applied
 * look exactly as they were. The caller persists only on `ok`.
 */
export function importThemeFile(
  text: string,
  existing: ThemeFile[],
  makeId: () => string = () => newThemeFileId(),
): ThemeImportResult {
  const parsed = parseThemeFile(text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  if (existing.length >= MAX_IMPORTED_THEMES)
    return {
      ok: false,
      errors: [
        `You already keep ${MAX_IMPORTED_THEMES} imported themes. Remove one before importing another.`,
      ],
    };
  return { ok: true, theme: { id: makeId(), ...parsed.manifest } };
}

/** The built-in look as a complete token set — the base of every export. */export function builtinThemeTokens(accent: AccentId): Record<string, string | number> {
  const tokens: Record<string, string | number> = { ...DEFAULT_THEME_TOKENS };
  tokens["color.accent"] = accentHex(accent);
  tokens["color.accentContrast"] = accentContrastFor(accentHex(accent));
  return tokens;
}

export function themeFileIdFrom(id: string): string {
  return id.startsWith("file:") ? id.slice("file:".length) : "";
}

export function themeFileSelection(id: string): string {
  return `file:${id}`;
}

/* ---------------------------------------------------------------------------
 * Local storage (guarded; the app runs with storage blocked)
 * ------------------------------------------------------------------------- */

export function loadThemeFiles(): ThemeFile[] {
  try {
    const raw = localStorage.getItem(THEME_FILES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is ThemeFile => {
        if (!isPlainObject(entry)) return false;
        return (
          typeof entry.id === "string" &&
          typeof entry.name === "string" &&
          typeof entry.author === "string" &&
          typeof entry.description === "string" &&
          isPlainObject(entry.tokens)
        );
      })
      .slice(0, MAX_IMPORTED_THEMES);
  } catch {
    return [];
  }
}

export function saveThemeFiles(list: ThemeFile[]) {
  try {
    localStorage.setItem(THEME_FILES_KEY, JSON.stringify(list.slice(0, MAX_IMPORTED_THEMES)));
  } catch {
    /* not persisting is fine; the session keeps the theme */
  }
}

export function loadActiveThemeId(fallbackAccent: AccentId): string {
  try {
    const raw = localStorage.getItem(ACTIVE_THEME_KEY);
    if (raw && (isBuiltinThemeId(raw) || raw.startsWith("file:"))) return raw;
  } catch {
    /* fall through */
  }
  return builtinThemeId(fallbackAccent);
}

export function saveActiveThemeId(id: string) {
  try {
    localStorage.setItem(ACTIVE_THEME_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadThemeAuthor(): string {
  try {
    return localStorage.getItem(THEME_AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveThemeAuthor(author: string) {
  try {
    if (author) localStorage.setItem(THEME_AUTHOR_KEY, author);
    else localStorage.removeItem(THEME_AUTHOR_KEY);
  } catch {
    /* ignore */
  }
}

/** A file name that is safe on every platform and still readable. */
export function themeFileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 48);
  return `${slug || "chips-theme"}.chipstheme`;
}
