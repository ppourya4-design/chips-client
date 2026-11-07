/** Only defaults for the existing broadcaster, never starts capture or changes protocol. */
export const BROADCAST_KEY = "chips:broadcast-defaults";
export const BROADCAST_DEFAULTS = { source: "display" as "display" | "camera", audio: true, accessibility: 1, height: 720, fps: 30, videoBitrateKbps: 2500, audioBitrateKbps: 128, viewerLimit: 0, contentHint: "motion" as "motion" | "detail" };
export function loadBroadcastPreferences(): typeof BROADCAST_DEFAULTS {
  const next = { ...BROADCAST_DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(BROADCAST_KEY) ?? "{}");
    if (!raw || typeof raw !== "object") return next;
    if (raw.source === "display" || raw.source === "camera") next.source = raw.source;
    if (raw.contentHint === "motion" || raw.contentHint === "detail") next.contentHint = raw.contentHint;
    if (typeof raw.audio === "boolean") next.audio = raw.audio;
    if ([1,2,3].includes(raw.accessibility)) next.accessibility = raw.accessibility;
    for (const key of ["height","fps","videoBitrateKbps","audioBitrateKbps","viewerLimit"] as const) {
      if (Number.isFinite(raw[key]) && raw[key] >= 0 && raw[key] <= 100000) next[key] = raw[key];
    }
  } catch { /* invalid saves use defaults */ }
  return next;
}
