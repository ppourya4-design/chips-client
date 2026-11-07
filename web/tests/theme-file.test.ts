import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  BUILTIN_THEMES,
  DEFAULT_THEME_TOKENS,
  FONT_CHOICES,
  THEME_TOKENS,
  THEME_TOKEN_BY_KEY,
  THEME_FILE_VERSION,
  accentContrastFor,
  builtinThemeId,
  builtinThemeTokens,
  importThemeFile,
  isBuiltinThemeId,
  loadActiveThemeId,
  loadThemeFiles,
  newThemeFileId,
  normalizeColor,
  parseThemeFile,
  resolveThemeTokens,
  saveActiveThemeId,
  saveThemeFiles,
  serializeThemeFile,
  themeFileName,
  themeFileSelection,
  themeVariables,
  tokenCssValue,
  validateThemeFile,
  type ThemeFile,
} from "../src/themeFile";

// A blocked/unavailable localStorage is the app's normal fallback, so the test
// provides the same tiny in-memory stand-in the settings tests use.
const stored = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  },
  configurable: true,
});

const doc = (overrides: Record<string, unknown> = {}) => ({
  format: "chipstheme",
  version: THEME_FILE_VERSION,
  name: "Test theme",
  author: "Pourya",
  base: "glass",
  tokens: { "color.accent": "#a74cfd", "glass.blur": 12 },
  ...overrides,
});

const text = (overrides: Record<string, unknown> = {}) => JSON.stringify(doc(overrides));

const starter = readFileSync(
  new URL("../../docs/theme-kit/starter.chipstheme", import.meta.url),
  "utf8",
);

/* ---------------------------------------------------------------------------
 * Valid files import
 * ------------------------------------------------------------------------- */

test("a valid theme file parses, normalises hex colours and keeps only its own tokens", () => {
  const result = parseThemeFile(
    text({ tokens: { "color.accent": "#A74CFD", "glass.blur": 12.04, "font.family": "vt323" } }),
  );
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.manifest.name, "Test theme");
  assert.equal(result.manifest.author, "Pourya");
  assert.equal(result.manifest.description, "");
  assert.deepEqual(result.manifest.tokens, {
    "color.accent": "#a74cfd",
    "glass.blur": 12,
    "font.family": "vt323",
  });
});

test("the shipped starter.chipstheme is valid and sets every token", () => {
  const result = parseThemeFile(starter);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(
    Object.keys(result.manifest.tokens).sort(),
    THEME_TOKENS.map((def) => def.key).sort(),
  );
});

test("a partial theme is allowed and only writes the tokens it carries", () => {
  const result = parseThemeFile(text({ tokens: { "color.page": "#101019" } }));
  assert.ok(result.ok, JSON.stringify(result));
  const vars = themeVariables({ id: "x", ...result.manifest });
  assert.deepEqual(vars, { "--bg": "#101019" });
});

test("colours accept hex, 3-digit hex, rgba() with sane alpha and transparent", () => {
  assert.equal(normalizeColor("#ABC"), "#aabbcc");
  assert.equal(normalizeColor("  #74E5FF "), "#74e5ff");
  assert.equal(normalizeColor("rgba(255, 255, 255, 0.05)"), "rgba(255, 255, 255, 0.05)");
  assert.equal(normalizeColor("rgba(0,0,0,.2)"), "rgba(0, 0, 0, 0.2)");
  assert.equal(normalizeColor("transparent"), "transparent");
  for (const bad of ["#12345", "red", "rgb(1,2,3)", "rgba(300, 0, 0, 1)", "rgba(0, 0, 0, 2)", "url(x)", 5])
    assert.equal(normalizeColor(bad), null, String(bad));
});

test("importThemeFile returns a stored theme without touching the existing list", () => {
  const existing: ThemeFile[] = [
    { id: "old", name: "Old", author: "A", description: "", tokens: { "color.page": "#000000" } },
  ];
  const snapshot = JSON.parse(JSON.stringify(existing));
  const result = importThemeFile(starter, existing, () => "new-id");
  assert.ok(result.ok);
  assert.equal(result.theme.id, "new-id");
  assert.equal(result.theme.name, "My first theme");
  assert.deepEqual(existing, snapshot, "the installed themes must not be mutated");
});

/* ---------------------------------------------------------------------------
 * Malformed input is rejected and changes nothing
 * ------------------------------------------------------------------------- */

test("malformed JSON is rejected with a readable message", () => {
  for (const bad of ["", "   ", "{", '{"format": }', "[1,2,3]", "null", '"text"']) {
    const errors = validateThemeFile(bad);
    assert.ok(errors.length > 0, bad);
    assert.match(errors[0], /empty|not valid JSON|single JSON object/i, bad);
  }
});

test("wrong format, version or base is rejected", () => {
  assert.match(validateThemeFile(text({ format: "webspeak3theme" }))[0] ?? "", /format/);
  assert.match(validateThemeFile(text({ version: 2 }))[0] ?? "", /version 2.*version 1/);
  assert.match(validateThemeFile(text({ version: "1" }))[0] ?? "", /"version" must be the number 1/);
  assert.match(validateThemeFile(text({ base: "standard" }))[0] ?? "", /base/);
  assert.equal(validateThemeFile(text({ version: undefined })).length, 1);
});

test("unknown top-level fields (css, script, url) are rejected, not ignored", () => {
  for (const field of ["css", "script", "url", "fontUrl", "image"]) {
    const errors = validateThemeFile(text({ [field]: ".ts-app{display:none}" }));
    assert.ok(errors.length > 0, field);
    assert.match(errors[0], /Unknown top-level field/);
    assert.match(errors[0], /no CSS, scripts or links/);
  }
});

test("unknown tokens are rejected with a pointer to the token reference", () => {
  const errors = validateThemeFile(text({ tokens: { "color.glow": "#fff" } }));
  assert.ok(errors.some((error) => /Unknown token "color\.glow"/.test(error)), errors.join(" | "));
  assert.ok(errors.some((error) => /token-reference\.md/.test(error)), errors.join(" | "));
});

test("out-of-range and wrongly typed values are rejected per token", () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ "glass.blur": 200 }, /glass\.blur must be a number between 0 and 60/],
    [{ "glass.blur": -1 }, /between 0 and 60/],
    [{ "glass.blur": "20" }, /without quotes/],
    [{ "glass.radius": 99 }, /between 0 and 32/],
    [{ "controls.radius": 1200 }, /between 0 and 999/],
    [{ "font.size": 40 }, /between 11 and 18/],
    [{ "glass.saturate": 999 }, /between 100 and 250/],
    [{ "font.family": "comic-sans" }, /one of "plus-jakarta-sans"/],
    [{ "font.family": "url(https://x/y.woff2)" }, /one of "plus-jakarta-sans"/],
    [{ "color.accent": "rgba(1, 2, 3, 1)" }, /must be a hex colour/],
    [{ "color.accent": "#12345" }, /must be a hex colour/],
    [{ "color.page": "linear-gradient(red, blue)" }, /must be a colour/],
    [{ "color.page": "var(--primary)" }, /must be a colour/],
  ];
  for (const [tokens, pattern] of cases) {
    const errors = validateThemeFile(text({ tokens }));
    assert.ok(errors.some((error) => pattern.test(error)), `${JSON.stringify(tokens)} -> ${errors.join(" | ")}`);
  }
});

test("a name, author or tokens object that is missing or not text is rejected", () => {
  assert.match(validateThemeFile(text({ name: "" }))[0] ?? "", /"name" must be text/);
  assert.match(validateThemeFile(text({ name: 42 }))[0] ?? "", /"name" must be text/);
  assert.match(validateThemeFile(text({ author: "x".repeat(80) }))[0] ?? "", /"author" must be text/);
  assert.match(validateThemeFile(text({ tokens: [] }))[0] ?? "", /"tokens" must be an object/);
  assert.match(validateThemeFile(text({ tokens: {} }))[0] ?? "", /no valid tokens/);
  assert.match(validateThemeFile(text({ name: "a\nb" }))[0] ?? "", /control characters/);
});

test("an oversized file is refused before parsing", () => {
  const huge = `{"format":"chipstheme","padding":"${"a".repeat(70_000)}"}`;
  assert.match(validateThemeFile(huge)[0] ?? "", /larger than 64 KB/);
});

test("a rejected import leaves the existing themes, selection and storage untouched", () => {
  stored.clear();
  const existing: ThemeFile[] = [
    { id: "keep", name: "Keep", author: "A", description: "", tokens: { "color.page": "#000000" } },
  ];
  saveThemeFiles(existing);
  saveActiveThemeId(themeFileSelection("keep"));
  const before = { files: stored.get("chips:themes"), active: stored.get("chips:active-theme") };

  for (const bad of [
    "{",
    text({ format: "wrong" }),
    text({ version: 99 }),
    text({ tokens: { "nope.nope": 1 } }),
    text({ tokens: { "glass.blur": 900 } }),
    text({ css: "body{display:none}" }),
  ]) {
    const result = importThemeFile(bad, loadThemeFiles(), () => "should-not-exist");
    assert.equal(result.ok, false, bad);
    // The caller only persists on ok, so nothing here may have changed.
    assert.deepEqual(loadThemeFiles(), existing);
    assert.equal(loadActiveThemeId("cyan"), themeFileSelection("keep"));
    assert.equal(stored.get("chips:themes"), before.files);
    assert.equal(stored.get("chips:active-theme"), before.active);
  }
});

test("the import cap is enforced without touching the list", () => {
  const full: ThemeFile[] = Array.from({ length: 32 }, (_, index) => ({
    id: `t${index}`,
    name: `T${index}`,
    author: "A",
    description: "",
    tokens: {},
  }));
  const result = importThemeFile(starter, full, () => "overflow");
  assert.equal(result.ok, false);
  assert.match((result as { errors: string[] }).errors[0], /maximum|32/);
});

/* ---------------------------------------------------------------------------
 * Export round-trips
 * ------------------------------------------------------------------------- */

test("export writes a complete, valid, re-importable file", () => {
  const tokens = resolveThemeTokens(null, "purple");
  const exported = serializeThemeFile({ name: "Export test", author: "Pourya", tokens });
  const result = parseThemeFile(exported);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(
    Object.keys(result.manifest.tokens).sort(),
    THEME_TOKENS.map((def) => def.key).sort(),
  );
  assert.equal(result.manifest.tokens["color.accent"], "#a74cfd");
  assert.equal(result.manifest.tokens["glass.blur"], 20);
  // The document is pure JSON with the documented field order.
  assert.match(exported, /^\{\n {2}"format": "chipstheme",\n {2}"version": 1,/);
});

test("exporting an imported theme keeps its own values and the live accent is not overwritten", () => {
  const theme: ThemeFile = {
    id: "x",
    name: "Night",
    author: "A",
    description: "d",
    tokens: { "color.accent": "#fd1d1d", "glass.blur": 6 },
  };
  const tokens = resolveThemeTokens(theme, "cyan");
  assert.equal(tokens["color.accent"], "#fd1d1d");
  assert.equal(tokens["glass.blur"], 6);
  const result = parseThemeFile(serializeThemeFile({ name: "Night", author: "A", tokens }));
  assert.ok(result.ok);
  assert.equal(result.manifest.tokens["color.accent"], "#fd1d1d");
});

test("the exported accent contrast follows the accent's luminance", () => {
  assert.equal(accentContrastFor("#74e5ff"), "#04121a");
  assert.equal(accentContrastFor("#1a56db"), "#f4f8ff");
  const vars = themeVariables({ id: "x", name: "n", author: "a", description: "", tokens: { "color.accent": "#1a56db" } });
  assert.equal(vars["--accent-contrast"], "#f4f8ff");
  assert.equal(vars["--primary-rgb"], "26, 86, 219");
  assert.equal(vars["--primary-dim"], "rgba(26, 86, 219, 0.62)");
});

test("css values are written with the unit the token declares", () => {
  assert.equal(tokenCssValue(THEME_TOKEN_BY_KEY["glass.blur"], 12), "12px");
  assert.equal(tokenCssValue(THEME_TOKEN_BY_KEY["glass.saturate"], 160), "160%");
  assert.equal(tokenCssValue(THEME_TOKEN_BY_KEY["font.size"], 14), "14px");
  assert.match(tokenCssValue(THEME_TOKEN_BY_KEY["font.family"], "manrope"), /^"Manrope"/);
  assert.equal(tokenCssValue(THEME_TOKEN_BY_KEY["color.page"], "#05050a"), "#05050a");
});

test("file names are safe on every platform", () => {
  assert.equal(themeFileName("My first theme"), "my-first-theme.chipstheme");
  assert.equal(themeFileName("../../etc/passwd"), "etcpasswd.chipstheme");
  assert.equal(themeFileName("///"), "chips-theme.chipstheme");
  assert.equal(themeFileName("Liquid Glass · Cyan"), "liquid-glass-cyan.chipstheme");
});

/* ---------------------------------------------------------------------------
 * Built-ins, storage and the no-glow rule
 * ------------------------------------------------------------------------- */

test("built-ins are exactly the four Liquid Glass accents and cannot be removed", () => {
  assert.deepEqual(
    ["cyan", "purple", "red", "blue"].map(builtinThemeId),
    ["accent:cyan", "accent:purple", "accent:red", "accent:blue"],
  );
  assert.ok(isBuiltinThemeId("accent:cyan"));
  assert.ok(!isBuiltinThemeId("file:abc"));
  // There is no token anywhere in the schema that could express a glow: no
  // token name or custom property mentions glow/bloom/shadow/halo.
  for (const def of THEME_TOKENS)
    assert.doesNotMatch(`${def.key} ${def.cssVars.join(" ")}`, /glow|bloom|halo|shadow|neon/i);
  assert.deepEqual(
    Object.keys(builtinThemeTokens("red")).sort(),
    THEME_TOKENS.map((def) => def.key).sort(),
  );
  assert.equal(builtinThemeTokens("red")["color.accent"], "#fd1d1d");
});

test("every token targets a custom property the Liquid Glass sheet actually reads", () => {
  // The glass sheet declares the Liquid Glass palette; --accent (the upstream
  // spelling the stock rules still use) is declared by the other two sheets, so
  // all three are read here.
  const css = ["styles/liquid-glass.css", "App.css", "index.css"]
    .map((file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"))
    .join("\n");
  const declared = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  for (const def of THEME_TOKENS)
    for (const name of def.cssVars) assert.ok(declared.has(name), `${def.key} -> ${name} is not declared`);

  // The reverse direction: no themed custom property may exist that the schema
  // cannot reach, so the token surface and the stylesheet cannot drift apart.
  const derived = new Set(["--primary-rgb", "--accent-rgb", "--primary-dim"]);
  const themed = [...declared].filter(
    (name) => !/^--(lg-filter|spark|name-|ide-)/.test(name) && !derived.has(name),
  );
  const covered = new Set(THEME_TOKENS.flatMap((def) => def.cssVars));
  const uncovered = themed.filter((name) => !covered.has(name)).sort();
  assert.deepEqual(
    uncovered,
    ["--input-text", "--log-error", "--log-text", "--self-text"],
    "these four are var() aliases of themed tokens, so they follow automatically",
  );
  for (const alias of ["--input-text", "--self-text", "--log-text", "--log-error"]) {
    const line = css.split("\n").find((l) => l.includes(`${alias}:`)) ?? "";
    assert.match(line, /var\(--/, alias);
  }
});

test("storage round-trips imported themes and falls back safely when it is messy", () => {
  stored.clear();
  assert.deepEqual(loadThemeFiles(), []);
  assert.equal(loadActiveThemeId("blue"), "accent:blue");

  const themes: ThemeFile[] = [
    { id: "a", name: "A", author: "x", description: "", tokens: { "color.page": "#000000" } },
    { id: "b", name: "B", author: "y", description: "d", tokens: { "color.accent": "#fd1d1d" } },
  ];
  saveThemeFiles(themes);
  assert.deepEqual(loadThemeFiles(), themes);

  stored.set("chips:themes", "{not json");
  assert.deepEqual(loadThemeFiles(), []);
  stored.set("chips:themes", JSON.stringify([{ id: 1 }, themes[0]]));
  assert.deepEqual(loadThemeFiles(), [themes[0]]);
  stored.set("chips:active-theme", "file:a");
  assert.equal(loadActiveThemeId("cyan"), "file:a");
  stored.set("chips:active-theme", "garbage");
  assert.equal(loadActiveThemeId("purple"), "accent:purple");
});

test("ids are local, unique-looking and never exported", () => {
  const id = newThemeFileId(1_700_000_000_000, () => 0.5);
  const second = newThemeFileId(1_700_000_000_001, () => 0.5);
  assert.notEqual(id, second);
  assert.equal(themeFileSelection("abc"), "file:abc");
  const exported = serializeThemeFile({ name: "n", author: "a", tokens: DEFAULT_THEME_TOKENS });
  assert.doesNotMatch(exported, /"id"/);
});

test("the schema has no duplicate keys and every font choice is bundled", () => {
  assert.equal(new Set(THEME_TOKENS.map((def) => def.key)).size, THEME_TOKENS.length);
  for (const choice of FONT_CHOICES)
    assert.equal(THEME_TOKEN_BY_KEY["font.family"].allowed?.includes(choice), true);
  // Every declared font has a bundled woff2 in the app (no font CDN).
  const fontSize = THEME_TOKEN_BY_KEY["font.size"];
  assert.equal(fontSize.type, "px");
});

/* ---------------------------------------------------------------------------
 * Wiring: the panel is the only place theme files are read or applied
 * ------------------------------------------------------------------------- */

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/ThemeFilePanel.tsx", import.meta.url), "utf8");

test("the built-in themes are exactly the app's four accents, hex for hex", async () => {
  const { ACCENT_THEMES } = await import("../src/theme");
  assert.deepEqual(
    BUILTIN_THEMES.map((theme) => [theme.accent, accentHexOf(theme.accent)]),
    ACCENT_THEMES.map((theme) => [theme.id, theme.hex]),
  );
  function accentHexOf(id: (typeof ACCENT_THEMES)[number]["id"]) {
    return ACCENT_THEMES.find((theme) => theme.id === id)?.hex;
  }
});

test("an applied theme is inline custom properties only — no stylesheet, no HTML, no code", () => {
  // App.tsx layers themeVariables() onto the app-root style object.
  assert.match(appSource, /Object\.assign\(vars, themeVariables\(activeThemeFile\)\)/);
  assert.match(appSource, /<ThemeFilePanel[\s\S]*?onImport=\{handleImportTheme\}/);
  // Neither the schema nor the panel can inject CSS or markup.
  // App.tsx already has one legitimate <style> for the legacy free-form CSS
  // design packages; nothing in the theme-file path may add another.
  // (The panel does create an <a> for the download; it never creates a style
  // or script element.)
  assert.doesNotMatch(panelSource, /dangerouslySetInnerHTML|createElement\(["'](style|script)["']\)|<style/);
  assert.doesNotMatch(appSource, /dangerouslySetInnerHTML/);
  const module = readFileSync(new URL("../src/themeFile.ts", import.meta.url), "utf8");
  // The module is pure data → CSS text: no DOM, no keyframes, no shadow.
  const code = module.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /document\.|@keyframes|animation|textShadow/i);
  // The panel is the only importer of a .chipstheme file.
  assert.match(panelSource, /importThemeFile/);
  assert.match(panelSource, /accept="\.chipstheme,application\/json"/);
});

test("selecting a built-in theme writes the existing accent key, so the swatches agree", () => {
  assert.match(appSource, /const builtin = builtinAccentOf\(id\);[\s\S]*?setAccent\(builtin\);[\s\S]*?saveAccent\(builtin\);/);
  assert.match(appSource, /saveActiveThemeId\(id\)/);
  // Removing an imported theme falls back to a built-in, never to nothing.
  assert.match(appSource, /handleSelectTheme\(builtinThemeId\(accent\)\)/);
});

/* ---------------------------------------------------------------------------
 * The theme-making kit is generated from the schema, not written beside it
 * ------------------------------------------------------------------------- */

const kit = (file: string) =>
  readFileSync(new URL(`../../docs/theme-kit/${file}`, import.meta.url), "utf8");

test("token-reference.md lists every token, its default and its range", () => {
  const reference = kit("token-reference.md");
  for (const def of THEME_TOKENS) {
    const row = reference.split("\n").find((line) => line.startsWith(`| \`${def.key}\` |`));
    assert.ok(row, `token-reference.md has no row for ${def.key}`);
    assert.ok(row!.includes(`\`${def.defaultValue}\``), `${def.key} default missing from the reference`);
    if (def.type === "px") assert.match(row!, new RegExp(`px ${def.min}–${def.max}`));
    if (def.type === "percent") assert.match(row!, new RegExp(`% ${def.min}–${def.max}`));
    if (def.type === "font") assert.match(row!, /font name/);
  }
  // No row for a token that does not exist.
  // Every token key contains a dot; the derived-value and font tables do not.
  const rows = [...reference.matchAll(/^\| `([a-z]+\.[\w.]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual(rows, THEME_TOKENS.map((def) => def.key));
});

test("starter.chipstheme carries every token, in schema order, at its default", () => {
  const parsed = JSON.parse(starter) as { tokens: Record<string, unknown> };
  assert.deepEqual(Object.keys(parsed.tokens), THEME_TOKENS.map((def) => def.key));
  assert.deepEqual(parsed.tokens, { ...DEFAULT_THEME_TOKENS });
  // A starter that leaves a token out would teach the wrong schema.
  assert.deepEqual(Object.keys(parsed).sort(), ["author", "base", "description", "format", "name", "tokens", "version"]);
});

test("the AI prompt embeds the same schema, in English, for pasting into a chatbot", () => {
  const prompt = kit("ai-prompt.md");
  for (const def of THEME_TOKENS) assert.ok(prompt.includes(def.key), `ai-prompt.md is missing ${def.key}`);
  for (const choice of FONT_CHOICES) assert.ok(prompt.includes(choice), `ai-prompt.md is missing font ${choice}`);
  assert.match(prompt, /must be the string "chipstheme"/);
  assert.match(prompt, /"version" must be the number 1/);
  assert.match(prompt, /"base" must be the string "glass"/);
  // Persian instructions, English schema: at least a paragraph of Persian text.
  assert.match(prompt, /[\u0600-\u06FF]{6,}/);
});

test("the tutorial names the same files and the same rules", () => {
  const tutorial = kit("tutorial.md");
  assert.match(tutorial, /[\u0600-\u06FF]{6,}/, "tutorial.md must be written in Persian");
  for (const file of ["starter.chipstheme", "token-reference.md", "ai-prompt.md"]) assert.ok(tutorial.includes(file));
  assert.match(tutorial, /Appearance/);
  assert.match(tutorial, /Import \.chipstheme/);
  assert.match(tutorial, /Export current look/);
  assert.match(tutorial, /\.chipstheme/);
  for (const token of ["color.accent", "glass.blur", "font.family"]) assert.ok(tutorial.includes(token));
});
