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

export function loadActionBinding(key: string): { code: string; label: string } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const b = raw as Record<string, unknown>;
    if (typeof b.code !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(b.code) || /^(Mouse|Escape$|Tab$)/.test(b.code)) return null;
    if (typeof b.label !== "string" || b.label.length > 80) return null;
    return { code: b.code, label: b.label };
  } catch { return null; }
}
