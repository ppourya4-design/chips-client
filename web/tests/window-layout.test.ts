import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { clampTreeWidth, layoutMode, loadTreeWidth, saveTreeWidth, TREE_WIDTH_KEY } from '../src/windowLayout';
const css = readFileSync(new URL('../src/styles/window-layout.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
for (const width of [360, 400, 480, 600, 759, 760, 800, 1024, 1200, 1600]) {
  test(`layout arithmetic at ${width}px (source/unit, not browser geometry)`, () => {
    assert.equal(layoutMode(width), width < 760 ? 'narrow' : 'wide');
    for (const saved of [240, 280, 500]) {
      const tree = clampTreeWidth(saved, width);
      assert.ok(tree >= 240);
      if (width >= 760) assert.ok(width - tree >= 400);
    }
    // Self bar: avatar + four 36px controls + five gaps + horizontal padding.
    assert.ok(32 + 4 * 36 + 5 * 6 + 16 <= width);
  });
}
test('width storage is clamped, survives reload, tolerates corrupt/blocked storage', () => {
  const values = new Map<string,string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{getItem:(k:string)=>values.get(k) ?? null,setItem:(k:string,v:string)=>values.set(k,v)} });
  saveTreeWidth(412); assert.equal(loadTreeWidth(), 412);
  values.set(TREE_WIDTH_KEY, 'garbage'); assert.equal(loadTreeWidth(), 280);
  values.set(TREE_WIDTH_KEY, '-20'); assert.equal(loadTreeWidth(), 240);
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, get(){throw new Error('blocked');} });
  assert.equal(loadTreeWidth(),280); assert.doesNotThrow(()=>saveTreeWidth(300));
  Reflect.deleteProperty(globalThis,'localStorage');
});
test('source contracts: sheets, back, accessible pointer/keyboard splitter and no position animation', () => {
  assert.match(css, /data-chat-sheet="open"/);
  assert.match(css, /height:100dvh/);
  assert.match(css, /overflow-x:hidden/);
  assert.doesNotMatch(css, /@keyframes|transition\s*:/);
  assert.match(app, /Back to channels/);
  assert.match(app, /setPointerCapture/);
  assert.match(app, /aria-orientation="vertical"/);
  assert.match(app, /"ArrowLeft", "ArrowRight", "Home", "End"/);
  assert.match(app, /setChatSheetOpen\(false\)/);
});
