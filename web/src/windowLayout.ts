/** Logical CSS pixels. Reserve a readable 360px chat plus pane padding/gutter. */
export const NARROW_BREAKPOINT = 760;
export const TREE_MIN = 240;
export const TREE_MAX = 500;
export const TREE_WIDTH_KEY = 'chips:tree-width';
export function clampTreeWidth(width: number, viewport = Number.POSITIVE_INFINITY) {
  return Math.max(TREE_MIN, Math.min(TREE_MAX, viewport - 400, Number.isFinite(width) ? width : 280));
}
export function loadTreeWidth() {
  try { return clampTreeWidth(Number(localStorage.getItem(TREE_WIDTH_KEY) || 280)); }
  catch { return 280; }
}
export function saveTreeWidth(width: number) {
  try { localStorage.setItem(TREE_WIDTH_KEY, String(clampTreeWidth(width))); } catch { /* Session only when storage is unavailable. */ }
}
export function layoutMode(width: number) { return width < NARROW_BREAKPOINT ? 'narrow' : 'wide'; }
