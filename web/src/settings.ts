import { loadBinding } from "./hotkeys";
/** Step 6 additions. Existing audio/design/sound keys stay owned by their modules. */
export const HUB_KEYS = {
  autoConnect: "chips:auto-connect",
  glass: "chips:glass-intensity",
  brightness: "chips:brightness",
  mute: "chips:mute-binding",
  deafen: "chips:deafen-binding",
} as const;

export function loadGlassIntensity(): "0" | "0.5" | "1" {
  const raw = localStorage.getItem(HUB_KEYS.glass);
  return raw === "0" || raw === "0.5" ? raw : "1";
}

export function loadActionBinding(key: string) {
  return loadBinding(key, false);
}
