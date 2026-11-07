import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Step 3's animation law, enforced instead of described:
//   * light moves, elements and letters never do;
//   * keyframes may animate background-position, --spark-pos and opacity only;
//   * everything outside the [data-chips-anim] allow-list is frozen;
//   * both freeze paths (OS preference and the in-app switch) cover every
//     animated effect class.
// The files are read as source text, so this runs anywhere Node runs - no
// browser engine, no Windows host.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const effectsSource = readFileSync(join(root, "src/styles/name-effects.css"), "utf8");
// Comments narrate the rules ("no drop-shadows", "text-shadow stays banned"), so
// the assertions below look at the declarations only.
const effects = effectsSource.replace(/\/\*[\s\S]*?\*\//g, "");
const globalCss = readFileSync(join(root, "src/index.css"), "utf8");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");

const ALLOWED = new Set(["background-position", "--spark-pos", "opacity"]);
const EFFECT_CLASSES = ["chips-name", "chips-electric-border", "chips-avatar"];

/** Everything between an opening `{` and its matching `}`. */
function block(css: string, start: number): string {
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start + 1, i);
  }
  throw new Error("unbalanced braces");
}

function keyframes(css: string): { name: string; props: string[] }[] {
  return [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((match) => {
    const body = block(css, match.index! + match[0].length - 1);
    // Only declarations matter here; the from/to/0% steps are selectors and
    // contain no colon, so splitting on ";" yields plain `prop: value` pairs.
    const props = body
      .split(";")
      .map((part) => part.split("{").pop() ?? "")
      .map((decl) => decl.split(":")[0].trim())
      .filter((prop) => /^-?[\w-]+$/.test(prop));
    return { name: match[1], props };
  });
}

function rules(css: string): { selector: string; decls: string }[] {
  return css
    .split("}")
    .map((chunk) => {
      const brace = chunk.indexOf("{");
      if (brace < 0) return null;
      return { selector: chunk.slice(0, brace).trim(), decls: chunk.slice(brace + 1) };
    })
    .filter((rule): rule is { selector: string; decls: string } => rule !== null);
}

test("keyframes only animate light, never elements or letters", () => {
  const found = keyframes(effects);
  assert.ok(found.length > 0, "expected the Step 3 keyframes in name-effects.css");
  for (const frame of found) {
    for (const prop of frame.props) {
      assert.ok(
        ALLOWED.has(prop),
        `@keyframes ${frame.name} animates "${prop}"; only background-position, --spark-pos and opacity may move`
      );
    }
  }
});

test("no glow: the effects stylesheet never paints a text shadow or a blur halo", () => {
  assert.equal(/text-shadow/.test(effects), false);
  assert.equal(/drop-shadow/.test(effects), false);
});

test("the global freeze and its [data-chips-anim] allow-list are still in index.css", () => {
  assert.match(globalCss, /\*:not\(\[data-chips-anim\]\)[\s\S]*animation:\s*none\s*!important/);
});

test("both reduce paths freeze name, card and avatar animations", () => {
  const mediaStart = effects.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(mediaStart >= 0, "missing the OS-preference block");
  const mediaRules = rules(block(effects, effects.indexOf("{", mediaStart)));
  const toggleRules = rules(effects).filter((rule) => rule.selector.includes("chips-reduce-motion"));

  for (const [label, list] of [["prefers-reduced-motion", mediaRules], ["chips-reduce-motion", toggleRules]] as const) {
    for (const cls of EFFECT_CLASSES) {
      const frozen = list.some(
        (rule) => rule.selector.includes(`.${cls}`) && /animation:\s*none\s*!important/.test(rule.decls)
      );
      assert.ok(frozen, `${label} does not stop .${cls} animations`);
    }
  }
});

test("the in-app Reduce-animations switch drives the stylesheet class", () => {
  assert.match(app, /chips-reduce-motion/);
  assert.match(app, /loadReduceMotion/);
  assert.match(app, /saveReduceMotion/);
});
