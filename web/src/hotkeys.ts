/** Physical-key bindings. Missing modifier fields migrate legacy single-key saves. */
export interface KeyBinding { code: string; label: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }
export const SHORTCUTS_KEY = "chips:action-shortcuts";
export const SHORTCUT_DEFAULTS = {
  connect: { code: "KeyS", label: "Ctrl + S", ctrl: true },
  disconnect: { code: "KeyD", label: "Ctrl + D", ctrl: true },
  preset: { code: "KeyB", label: "Ctrl + B", ctrl: true },
} satisfies Record<string, KeyBinding>;
export type ShortcutAction = keyof typeof SHORTCUT_DEFAULTS;
export type ShortcutBindings = Record<ShortcutAction, KeyBinding | null>;
export function validBinding(raw: unknown, mouse = true): KeyBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.code !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(b.code) || /^(Escape|Tab)$/.test(b.code)) return null;
  if (b.code.startsWith("Mouse") && (!mouse || !/^Mouse[1-4]$/.test(b.code))) return null;
  if (typeof b.label !== "string" || !b.label || b.label.length > 80) return null;
  for (const k of ["ctrl", "alt", "shift", "meta"]) if (b[k] !== undefined && typeof b[k] !== "boolean") return null;
  return { code: b.code, label: b.label, ctrl: !!b.ctrl, alt: !!b.alt, shift: !!b.shift, meta: !!b.meta };
}
export function loadBinding(key: string, mouse = true): KeyBinding | null {
  try { return validBinding(JSON.parse(localStorage.getItem(key) ?? "null"), mouse); } catch { return null; }
}
export function loadShortcuts(): ShortcutBindings {
  try {
    const raw = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) ?? "{}");
    return Object.fromEntries(Object.entries(SHORTCUT_DEFAULTS).map(([id, fallback]) =>
      [id, raw && Object.hasOwn(raw, id) ? validBinding(raw[id], false) : fallback])) as ShortcutBindings;
  } catch { return { ...SHORTCUT_DEFAULTS }; }
}
const modifiers = (b: KeyBinding) => [
  b.code.startsWith("Control") ? false : !!b.ctrl,
  b.code.startsWith("Alt") ? false : !!b.alt,
  b.code.startsWith("Shift") ? false : !!b.shift,
  b.code.startsWith("Meta") ? false : !!b.meta,
];
export function sameBinding(a: KeyBinding | null, b: KeyBinding | null): boolean {
  return !!a && !!b && a.code === b.code && modifiers(a).every((v,i) => v === modifiers(b)[i]);
}
export function matchesBinding(b: KeyBinding | null, e: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): boolean {
  return sameBinding(b, { code: e.code, label: "event", ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
}
export function captureBinding(e: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): KeyBinding {
  const raw = { code: e.code, label: "", ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
  const mods = modifiers(raw);
  const key = e.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/(Left|Right)$/, " $1");
  return { ...raw, label: [...["Ctrl", "Alt", "Shift", "Meta"].filter((_,i) => mods[i]), key].join(" + ") };
}
