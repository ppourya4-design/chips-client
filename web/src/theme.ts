/* Chips accent colour themes.
 *
 * The Liquid Glass design keeps one black base (#05050a) and swaps only the
 * accent ramp. Every accent is described as a single hex value; the derived
 * variables (--primary / --primary-rgb / --accent-contrast, ...) are computed
 * here and written onto the app root as CSS custom properties, so the
 * stylesheet never has to repeat a colour per theme.
 *
 * Kept free of React so both the toolbar switcher and the Options -> Design
 * panel can import it without a cycle.
 */

export type AccentId = "cyan" | "purple" | "red" | "blue";

export type AccentTheme = {
  id: AccentId;
  /** Display name (English; the UI language is English everywhere). */
  name: string;
  /** Base accent hex. */
  hex: string;
};

/** Default is cyan #74e5ff; the others mirror the owner's site accents. */
export const ACCENT_THEMES: AccentTheme[] = [
  { id: "cyan", name: "Cyan", hex: "#74e5ff" },
  { id: "purple", name: "Purple", hex: "#a74cfd" },
  { id: "red", name: "Red", hex: "#fd1d1d" },
  { id: "blue", name: "Blue", hex: "#1a56db" },
];

export const ACCENT_KEY = "chips:accent";

export const DEFAULT_ACCENT: AccentId = "cyan";

export function isAccentId(value: unknown): value is AccentId {
  return ACCENT_THEMES.some((a) => a.id === value);
}

export function loadAccent(): AccentId {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    if (isAccentId(raw)) return raw;
  } catch {
    /* private mode / storage disabled: fall through to the default */
  }
  return DEFAULT_ACCENT;
}

export function saveAccent(id: AccentId) {
  try {
    localStorage.setItem(ACCENT_KEY, id);
  } catch {
    /* not persisting is fine, the session keeps the choice */
  }
}

export function accentHex(id: AccentId): string {
  return (ACCENT_THEMES.find((a) => a.id === id) ?? ACCENT_THEMES[0]).hex;
}

/** "#a74cfd" -> "167, 76, 253" — the --primary-rgb form rgba() needs. */
export function hexToRgbTriplet(hex: string): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num)) return "116, 229, 255";
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

/** Relative luminance, for the rare case where text sits on the raw accent:
 *  a light accent (cyan) needs dark text, a dark one (blue) needs light text. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgbTriplet(hex)
    .split(",")
    .map((v) => Number(v.trim()) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The custom properties that describe one accent. Applied to the app root, so
 * `--primary` etc. cascade to every glass surface. `--accent` is the older
 * upstream variable name and is kept in sync so the pre-glass keycaps, focus
 * rings and menu highlights follow the switch too.
 */
export function accentVariables(id: AccentId): Record<string, string> {
  const hex = accentHex(id);
  const rgb = hexToRgbTriplet(hex);
  const light = luminance(hex) > 0.45;
  return {
    "--primary": hex,
    "--primary-rgb": rgb,
    "--accent": hex,
    "--accent-rgb": rgb,
    // Text/icon colour that sits directly on --primary.
    "--accent-contrast": light ? "#04121a" : "#f4f8ff",
    // A dimmed accent for secondary marks (idle rings, list bullets).
    "--primary-dim": `rgba(${rgb}, 0.62)`,
  };
}
