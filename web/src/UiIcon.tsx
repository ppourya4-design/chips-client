/** Shared local SVG sprite. Same currentColor stroke style as the existing TS icons.
 * Decorative only: controls supply their own accessible name. No fonts or network. */
export function UiIcon({ name }: { name: string }) {
  return <svg className="chips-ui-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><use href={`${import.meta.env.BASE_URL}icons.svg#ui-${name}`} /></svg>;
}
