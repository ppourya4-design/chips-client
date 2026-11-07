/* Settings -> Appearance: `.chipstheme` theme files.
 *
 * Two things live here and nothing else:
 *   1. the theme list — the four built-in Liquid Glass accents plus every
 *      imported theme file (built-ins can't be removed, imported ones can);
 *   2. import (strict, token-only validation) and export of the current look.
 *
 * The format itself is defined once in `themeFile.ts`; this file is only the
 * UI. A rejected import never touches the app: the validator returns errors,
 * they are rendered in English, and no state setter is called.
 */

import { useRef, useState } from "react";
import { UiIcon } from "./UiIcon";
import {
  BUILTIN_THEMES,
  MAX_IMPORTED_THEMES,
  THEME_AUTHOR_KEY,
  THEME_NAME_MAX,
  importThemeFile,
  loadThemeAuthor,
  resolveThemeTokens,
  saveThemeAuthor,
  serializeThemeFile,
  themeFileName,
  themeFileSelection,
  type ThemeFile,
} from "./themeFile";
import { accentHex, type AccentId } from "./theme";

/** Same pattern as the rest of the app: an object URL and a synthetic click. */
function saveTextFile(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type ThemeFilePanelProps = {
  themes: ThemeFile[];
  /** "accent:<id>" or "file:<id>". */
  activeId: string;
  accent: AccentId;
  /** The imported theme that is active right now, if any. */
  activeTheme: ThemeFile | null;
  onSelect: (id: string) => void;
  onImport: (theme: ThemeFile) => void;
  onRemove: (id: string) => void;
  /** Injected in tests; the app uses the real download. */
  save?: (text: string, filename: string) => void;
};

export function ThemeFilePanel({
  themes,
  activeId,
  accent,
  activeTheme,
  onSelect,
  onImport,
  onRemove,
  save = saveTextFile,
}: ThemeFilePanelProps) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const activeBuiltin = BUILTIN_THEMES.find((theme) => theme.id === activeId) ?? null;

  const [exportName, setExportName] = useState(
    activeTheme?.name ?? activeBuiltin?.name ?? "My Chips theme",
  );
  const [exportAuthor, setExportAuthor] = useState(() => loadThemeAuthor());
  const [exportDescription, setExportDescription] = useState(
    activeTheme?.description ?? "Exported from Chips.",
  );

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus("");
    let text: string;
    try {
      text = await file.text();
    } catch {
      setErrors([`"${file.name}" could not be read.`]);
      return;
    }
    const result = importThemeFile(text, themes);
    if (!result.ok) {
      // Nothing was applied, saved or replaced — the panel only reports why.
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    onImport(result.theme);
    setStatus(`"${result.theme.name}" was imported and is now applied.`);
  };

  const openExport = () => {
    setErrors([]);
    setStatus("");
    setExportName(activeTheme?.name ?? activeBuiltin?.name ?? "My Chips theme");
    setExportAuthor(loadThemeAuthor() || exportAuthor);
    setExportDescription(activeTheme?.description || `Exported from Chips — ${accentHex(accent)} accent.`);
    setExportOpen(true);
  };

  const handleExport = () => {
    const name = exportName.trim() || "My Chips theme";
    const author = exportAuthor.trim() || "Anonymous";
    const text = serializeThemeFile({
      name,
      author,
      description: exportDescription.trim(),
      // The current look: built-in base → the active theme's tokens → the live
      // accent, so the file always describes everything on screen.
      tokens: resolveThemeTokens(activeTheme, accent),
    });
    const filename = themeFileName(name);
    save(text, filename);
    saveThemeAuthor(author === "Anonymous" ? "" : author);
    setExportOpen(false);
    setStatus(`${filename} was saved.`);
  };

  return (
    <>
      <h4>Theme files</h4>
      <p className="ts-options-hint">
        A <code>.chipstheme</code> is a JSON file with colours, glass and font values only —
        no CSS, no scripts, no links. Imported themes appear here next to the built-in
        Liquid Glass accents and can be removed again.
      </p>

      <div className="chips-theme-list" role="radiogroup" aria-label="Themes">
        {BUILTIN_THEMES.map((theme) => (
          <div className="chips-theme-row" key={theme.id}>
            <button
              type="button"
              role="radio"
              aria-checked={activeId === theme.id}
              className={`chips-theme-pick${activeId === theme.id ? " chips-theme-pick-active" : ""}`}
              onClick={() => onSelect(theme.id)}
            >
              <span className="chips-theme-swatch" style={{ background: accentHex(theme.accent) }} aria-hidden="true" />
              <span className="chips-theme-name">{theme.name}</span>
              <span className="chips-theme-tag">Built-in</span>
            </button>
          </div>
        ))}
        {themes.map((theme) => {
          const id = themeFileSelection(theme.id);
          return (
            <div className="chips-theme-row" key={theme.id}>
              <button
                type="button"
                role="radio"
                aria-checked={activeId === id}
                className={`chips-theme-pick${activeId === id ? " chips-theme-pick-active" : ""}`}
                onClick={() => onSelect(id)}
              >
                <span
                  className="chips-theme-swatch"
                  style={{ background: String(theme.tokens["color.accent"] ?? accentHex(accent)) }}
                  aria-hidden="true"
                />
                <span className="chips-theme-name">{theme.name}</span>
                <span className="chips-theme-tag">by {theme.author}</span>
              </button>
              <button
                type="button"
                className="chips-theme-remove"
                aria-label={`Remove ${theme.name}`}
                title={`Remove ${theme.name}`}
                onClick={() => {
                  if (!window.confirm(`Remove the theme "${theme.name}"? The built-in themes stay.`)) return;
                  onRemove(theme.id);
                  setStatus(`"${theme.name}" was removed.`);
                }}
              >
                <UiIcon name="trash" />
              </button>
            </div>
          );
        })}
      </div>

      {themes.length === 0 && (
        <p className="ts-options-hint">
          No imported themes yet. The starter file in <code>docs/theme-kit/starter.chipstheme</code>{" "}
          is a good place to begin.
        </p>
      )}
      {themes.length >= MAX_IMPORTED_THEMES && (
        <p className="ts-options-hint">
          {MAX_IMPORTED_THEMES} imported themes is the maximum. Remove one to make room.
        </p>
      )}

      <div className="ts-design-custom-actions">
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import .chipstheme
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".chipstheme,application/json"
          style={{ display: "none" }}
          onChange={handleFile}
          aria-label="Import a .chipstheme file"
        />
        <button type="button" onClick={openExport}>
          Export current look
        </button>
      </div>

      {errors.length > 0 && (
        <div className="chips-theme-errors" role="alert">
          <strong>This file was not imported.</strong> Nothing changed.
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {status && !errors.length && (
        <p className="ts-options-hint" role="status">
          {status}
        </p>
      )}

      {exportOpen && (
        <fieldset className="ts-options-fieldset">
          <legend>Export the current look</legend>
          <label className="ts-dialog-field">
            Theme name
            <input
              value={exportName}
              maxLength={THEME_NAME_MAX}
              onChange={(event) => setExportName(event.target.value)}
              autoFocus
            />
          </label>
          <label className="ts-dialog-field">
            Author
            <input
              value={exportAuthor}
              maxLength={THEME_NAME_MAX}
              placeholder="Your name"
              onChange={(event) => setExportAuthor(event.target.value)}
            />
          </label>
          <label className="ts-dialog-field">
            Description (optional)
            <input
              value={exportDescription}
              maxLength={160}
              onChange={(event) => setExportDescription(event.target.value)}
            />
          </label>
          <p className="ts-options-hint">
            The file contains every token of the look on screen right now
            {activeTheme ? ` (${activeTheme.name})` : ` (${activeBuiltin?.name ?? "Liquid Glass"})`}.
          </p>
          <div className="ts-dialog-buttons">
            <div className="ts-dialog-buttons-right">
              <button type="button" onClick={() => setExportOpen(false)}>
                Cancel
              </button>
              <button type="button" onClick={handleExport}>
                Save {themeFileName(exportName)}
              </button>
            </div>
          </div>
        </fieldset>
      )}

      <p className="ts-options-hint">
        How to make your own theme, which token does what and how to share one:{" "}
        <code>docs/theme-kit/</code> (tutorial, token reference and an AI prompt). The author
        name is remembered in this browser ({THEME_AUTHOR_KEY}).
      </p>
    </>
  );
}
