/* Chips — Step 3 effect definitions (the "house style" catalog).
 *
 * This module is the single source of truth for *what* effects exist and how a
 * chosen effect is handed to the stylesheet. It renders nothing: the look lives
 * in src/styles/name-effects.css, and the element only needs
 *
 *     <span className="chips-name" data-name-style="shimmer" data-text="…">
 *
 * plus the optional colour variables below. That split is deliberate — Step 4's
 * customization panel and profile card only have to pick a definition from
 * NAME_STYLES, keep the chosen colours in a NameStyleConfig and spread
 * namePlateAttributes() onto a span. No effect-specific code is needed there.
 *
 * Kept free of React (like theme.ts) so the panel and the app can both import
 * it; the returned attribute/style objects are plain JSON-ish values.
 *
 * THE MOTION LAW (see CHIPS-NOTES.md §3): motion is light travelling across
 * static elements. Letters never move. The stylesheet may only animate
 * `background-position`, the registered `--spark-pos` angle and the opacity of
 * light layers; nothing in this catalog asks for anything else.
 */

/** The five name styles offered by the catalog. */
export type NameStyleId = "solid" | "shimmer" | "crystal" | "prism" | "talking";

/** Avatar ring kinds (Avatar rings, effect 2 in small format). */
export type AvatarRingId = "speaking" | "gradient" | "electric";

export type NameStyleDef = {
  id: NameStyleId;
  /** English label. The UI language is English everywhere (Step 1 rule). */
  label: string;
  /** One-line English description for the picker / profile card. */
  description: string;
  /**
   * How many colour slots the style exposes as --name-c1 … --name-cN.
   * An empty `colors` array in the config means "use the accent ramp", which is
   * what the app does until Step 4 lets the user pick colours.
   */
  colorSlots: 1 | 2 | 5;
  /** True when the style animates at all (all of them except Solid). */
  animated: boolean;
  /** Loop length of the main light layer, in ms. 0 = static. */
  durationMs: number;
  /** Talking-reactive only: a second gradient set while the owner speaks. */
  voiceColorSlots?: 2;
};

/**
 * The catalog. Order is presentation order for the Step 4 picker.
 *
 * - Solid            flat colour, no light layer, no animation.
 * - Shimmer Gradient the premium style: metal shimmer across static glyphs
 *                    plus a shine sweep (2 colours).
 * - Crystal          flat colour plus a single crisp shine sweep.
 * - Prism            5 colours through the same shimmer, slower (6s).
 * - Talking-reactive the signature style: a second gradient set cross-fades in
 *                    while the user speaks and eases back out.
 */
export const NAME_STYLES: readonly NameStyleDef[] = [
  {
    id: "solid",
    label: "Solid",
    description: "A flat colour. No light layer, no movement.",
    colorSlots: 1,
    animated: false,
    durationMs: 0,
  },
  {
    id: "shimmer",
    label: "Shimmer Gradient",
    description: "Metal shimmer travelling across the letters, with a shine sweep.",
    colorSlots: 2,
    animated: true,
    durationMs: 3000,
  },
  {
    id: "crystal",
    label: "Crystal",
    description: "A flat colour with one crisp shine sweep.",
    colorSlots: 1,
    animated: true,
    durationMs: 6000,
  },
  {
    id: "prism",
    label: "Prism",
    description: "Five colours through the shimmer, slower and wider.",
    colorSlots: 5,
    animated: true,
    durationMs: 6000,
  },
  {
    id: "talking",
    label: "Talking-reactive",
    description: "A second gradient set while you speak; eases back when you stop.",
    colorSlots: 2,
    animated: true,
    durationMs: 3000,
    voiceColorSlots: 2,
  },
];

export const AVATAR_RINGS: readonly { id: AvatarRingId; label: string; description: string }[] = [
  {
    id: "gradient",
    label: "Gradient ring",
    description: "A conic gradient turning slowly around the avatar.",
  },
  {
    id: "speaking",
    label: "Speaking pulse",
    description: "The bright edge of the ring follows voice activity, smoothly.",
  },
  {
    id: "electric",
    label: "Electric ring",
    description: "The electric border in small format: two sparks chasing the rim.",
  },
];

export function isNameStyleId(value: unknown): value is NameStyleId {
  return NAME_STYLES.some((s) => s.id === value);
}

export function nameStyleDef(id: NameStyleId): NameStyleDef {
  return NAME_STYLES.find((s) => s.id === id) ?? NAME_STYLES[1];
}

/** A saved choice: which style, and the colours the user gave it. */
export type NameStyleConfig = {
  style: NameStyleId;
  /** Hex colours for --name-c1 … ; empty/short arrays fall back to the accent. */
  colors: string[];
  /** Talking-reactive only: the gradient shown while speaking. */
  voiceColors?: string[];
};

/** The premium style is the default for the user's own name. */
export const DEFAULT_NAME_STYLE_CONFIG: NameStyleConfig = {
  style: "shimmer",
  colors: [],
};

/** Solid with no colour override: inherits the row's text colour unchanged. */
export const SOLID_NAME_STYLE_CONFIG: NameStyleConfig = {
  style: "solid",
  colors: [],
};

export const NAME_STYLE_KEY = "chips:name-style";

function normalizeColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim())
    .filter((c) => /^#[0-9a-f]{3,8}$/i.test(c))
    .slice(0, 5);
}

export function loadNameStyleConfig(): NameStyleConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(NAME_STYLE_KEY) ?? "{}");
    return {
      style: isNameStyleId(raw?.style) ? raw.style : DEFAULT_NAME_STYLE_CONFIG.style,
      colors: normalizeColors(raw?.colors),
      voiceColors: normalizeColors(raw?.voiceColors),
    };
  } catch {
    return DEFAULT_NAME_STYLE_CONFIG;
  }
}

export function saveNameStyleConfig(config: NameStyleConfig): void {
  try {
    localStorage.setItem(
      NAME_STYLE_KEY,
      JSON.stringify({
        style: config.style,
        colors: normalizeColors(config.colors),
        voiceColors: normalizeColors(config.voiceColors),
      })
    );
  } catch {
    /* private mode: the session keeps the choice, it just doesn't persist */
  }
}

/* ---------------------------------------------------------------------------
   In-app "Reduce animations" toggle (the OS preference is handled in CSS).
   ------------------------------------------------------------------------- */

export const REDUCE_MOTION_KEY = "chips:reduce-motion";

export function systemPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Stored choice wins; without one the system setting is the default. */
export function loadReduceMotion(): boolean {
  try {
    const raw = localStorage.getItem(REDUCE_MOTION_KEY);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch {
    /* storage disabled: fall through to the system preference */
  }
  return systemPrefersReducedMotion();
}

export function saveReduceMotion(reduce: boolean): void {
  try {
    localStorage.setItem(REDUCE_MOTION_KEY, reduce ? "on" : "off");
  } catch {
    /* not persisting is fine */
  }
}

/* ---------------------------------------------------------------------------
   Handing a choice to the stylesheet
   ------------------------------------------------------------------------- */

export type NamePlateAttributes = {
  "data-name-style": NameStyleId;
  /** The stylesheet's shine sweep is `content: attr(data-text)`. */
  "data-text": string;
  "data-speaking": "1" | "0";
  /** Opt-in flag for the global motion policy in index.css. */
  "data-chips-anim"?: "";
  /** --name-c1 … --name-c5 / --name-v1 / --name-v2, only when overridden. */
  style: Record<string, string>;
};

/**
 * Attributes for one name plate.
 *
 *   <span className="chips-name" {...namePlateAttributes(cfg, name, speaking)}>
 *
 * `data-speaking` is the client's existing voice-activity signal (the talkers
 * set the UI already keeps); the stylesheet uses it for the talking-reactive
 * cross-fade and for the avatar-ring / talking-reactive brightness. Only the
 * `talking` style and the rings read it, but it is always present so the
 * attribute never changes shape between styles.
 */
export function namePlateAttributes(
  config: NameStyleConfig,
  text: string,
  speaking = false
): NamePlateAttributes {
  const def = nameStyleDef(config.style);
  const style: Record<string, string> = {};
  config.colors.slice(0, def.colorSlots).forEach((color, i) => {
    style[`--name-c${i + 1}`] = color;
  });
  if (def.voiceColorSlots) {
    (config.voiceColors ?? []).slice(0, def.voiceColorSlots).forEach((color, i) => {
      style[`--name-v${i + 1}`] = color;
    });
  }
  const attrs: NamePlateAttributes = {
    "data-name-style": def.id,
    "data-text": text,
    "data-speaking": speaking ? "1" : "0",
    style,
  };
  // Solid never animates, so it does not need the motion-policy exemption.
  if (def.animated) attrs["data-chips-anim"] = "";
  return attrs;
}

/** Attributes for an avatar ring host (`data-ring` + the same voice signal). */
export function avatarRingAttributes(
  ring: AvatarRingId,
  speaking: boolean
): {
  "data-ring": AvatarRingId;
  "data-speaking": "1" | "0";
  "data-chips-anim": "";
} {
  return {
    "data-ring": ring,
    "data-speaking": speaking ? "1" : "0",
    // Every ring variant may fade/pulse with voice activity, so all of them
    // take the motion-policy exemption; the stylesheet decides per variant.
    "data-chips-anim": "",
  };
}
