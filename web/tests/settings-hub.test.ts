import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { loadActionBinding, loadGlassIntensity, HUB_KEYS } from "../src/settings";

const stored = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
}, configurable: true });

test("glass intensity survives a fresh read, with safe defaults for legacy/corrupt values", () => {
  for (const value of ["0", "0.5", "1"]) {
    localStorage.setItem(HUB_KEYS.glass, value);
    assert.equal(loadGlassIntensity(), value);
  }
  for (const value of ["", "garbage", "100", "NaN"]) {
    localStorage.setItem(HUB_KEYS.glass, value);
    assert.equal(loadGlassIntensity(), "1");
  }
});

test("mute and deafen bindings survive reload and clear independently", () => {
  stored.clear();
  assert.equal(loadActionBinding(HUB_KEYS.mute), null);
  for (const [key, code] of [[HUB_KEYS.mute, "F8"], [HUB_KEYS.deafen, "Enter"]]) {
    localStorage.setItem(key, JSON.stringify({ code, label: code }));
    assert.deepEqual(loadActionBinding(key), { code, label: code });
  }
  stored.delete(HUB_KEYS.mute);
  assert.equal(loadActionBinding(HUB_KEYS.mute), null);
  assert.equal(loadActionBinding(HUB_KEYS.deafen)?.code, "Enter");
});

test("malformed or unsupported bindings are ignored", () => {
  for (const raw of ["{", "null", "4", '"F8"', '{}', '{"code":2}',
    '{"code":"Mouse2","label":"Mouse 3"}', '{"code":"Escape","label":"Escape"}',
    '{"code":"Tab","label":"Tab"}', '{"code":"F8","label":false}']) {
    localStorage.setItem(HUB_KEYS.mute, raw);
    assert.equal(loadActionBinding(HUB_KEYS.mute), null, raw);
  }
});

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
test("one six-section settings hub, reachable from the self-bar", () => {
  const sections = app.slice(app.indexOf("const OPTIONS_SECTIONS ="), app.indexOf("interface AudioSettings"));
  assert.deepEqual([...sections.matchAll(/id: "([^"]+)"/g)].map(m => m[1]),
    ["connection", "audio", "hotkeys", "sounds", "design", "profile"]);
  assert.match(app, /className="chips-self-bar"[\s\S]*aria-label="Open settings"/);
  const toolbar = app.slice(app.indexOf('<div className="ts-toolbar"'), app.indexOf('{sessionTabs.length > 0 ?'));
  assert.doesNotMatch(toolbar, /AccentSwitcher|setTheme\(|outputDeviceId|setVadThreshold/);
  assert.doesNotMatch(app, /t\("menu\.extras\.options"\)|ts-connect-nova-settings/);
});

test("hub child panels do not sit behind the hub, and Step 7 is only a placeholder", () => {
  assert.match(app, /optionsDialogOpen && !profileEditorOpen && !identitiesOpen && !whisperListsOpen && !favoritesDialogMode && !changeNicknameOpen/);
  assert.match(app, /Theme files — Step 7 \(not implemented\)/);
  assert.doesNotMatch(app, /accept="[^"]*chipstheme/);
  assert.match(app, /chips-profile-editor/);
  assert.match(css, /\.chips-profile-editor[^}]*overflow:auto/);
});

test("device defaults persist too, and glass modes cover the fallback path", () => {
  assert.match(app, /localStorage\.setItem\(INPUT_DEVICE_KEY, inputDeviceId\)/);
  assert.match(app, /localStorage\.setItem\("chips:vad-threshold", String\(vadThreshold\)\)/);
  assert.match(app, /localStorage\.setItem\("chips:output-device", outputDeviceId\)/);
  assert.match(app, /useState\(\(\) => localStorage\.getItem\("chips:output-device"\)/);
  assert.match(css, /data-glass-intensity="0"[^}]*backdrop-filter:none !important/);
  assert.match(css, /data-glass-intensity="0.5"[^}]*blur\(10px\)/);
});


test("deafen uses the existing mute commands and restores the previous input state", () => {
  const handler = app.slice(app.indexOf("const handleToggleDeafen ="), app.indexOf("const handleToggleOutputMuted ="));
  assert.match(handler, /preDeafenInputMutedRef.current = inputMutedRef.current/);
  assert.match(handler, /type: "setInputMuted", muted: input/);
  assert.match(handler, /type: "setOutputMuted", muted: deafening/);
  assert.match(app, /onClick=\{handleToggleDeafen\}[^>]*aria-label="Toggle deafen"/);
});
