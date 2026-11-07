/* Chips Liquid Glass — refraction engine.
 *
 * Technique adapted from github.com/samasante/liquid-glass (the SDF
 * displacement-map approach): a rounded-rect signed distance field is rasterized
 * to a canvas, R/G encode an X/Y displacement around the neutral 0.5, and an
 * SVG `feDisplacementMap` driven by that map bends the *backdrop* through
 * `backdrop-filter: url(#…)`. The bend lives in a thin band hugging the rim, so
 * the middle of a panel stays flat and cheap.
 *
 * Deliberate differences from the reference implementation (which targets a
 * React lens that refracts live DOM through `filter: url()` with a chromatic
 * aberration pass):
 *   - Chips refracts the BACKDROP only, which is what `backdrop-filter: url()`
 *     supports in WebView2/Chromium — where the shipped app runs.
 *   - No chromatic RGB split and no specular/glow channel in the map: the spec
 *     forbids glow, and the crisp specular edge is a CSS inset highlight, not a
 *     filter output. The map is a plain R/G displacement field.
 *   - One generated filter per element SHAPE (bucketed to 16px), not per
 *     element, and a hard budget of MAX_REFRACTED surfaces.
 *
 * Fallback: where `backdrop-filter: url()` is unavailable (Firefox, or a
 * WebView2 with the effect disabled) this module does nothing at all —
 * `data-lg-filter` is never set — and the stylesheet's plain
 * blur(20px) saturate(160%) layer stays in charge.
 */

/** Marked surfaces (`data-lg` in the markup): floating bars, panels, cards.
 *  Channel rows, chat lines and menu items are deliberately NOT in here. */
const LG_ATTR = "data-lg";

/** Overlays are created per open dialog/menu, so they are found by class. They
 *  are the most visible place for refraction and are not part of the panel
 *  budget — at most a couple are ever open at once. */
const OVERLAY_SELECTOR = ":is(.ts-dialog, .ts-menu)";

/** Rendering budget for long-lived surfaces: each one is its own backdrop
 *  filter pass. 12 covers the header, the voice bar, the tree, the info panel,
 *  the chat panel, the log and the speaking bar. */
export const MAX_REFRACTED = 12;

/** How far the rim bend reaches inward, as a fraction of min(width, height). */
const BAND_FRACTION = 0.09;
/** Bucketing keeps the generated-filter cache small while staying pixel-close. */
const SHAPE_BUCKET = 16;
/** Displacement map raster size (longest edge, px). */
const MAP_MAX_EDGE = 256;
/** A huge translucent panel costs the most in software rendering; past this the
 *  surface keeps plain blur only. */
const MAX_RASTER_AREA = 520_000;

type LensShape = { width: number; height: number; radius: number };
type BucketedShape = { width: number; height: number; radius: number };

/**
 * `backdrop-filter: url()` support probe.
 *
 * Firefox parses the property but drops the whole declaration when the value is
 * a filter reference, and no feature query can see that difference — so the
 * probe is paired with a Chromium-family user-agent check, which is honest
 * about the deployment target: Tauri always renders in the system WebView2
 * (Chromium), and the browser build is Chromium-first by design.
 */
export function refractionSupported(): boolean {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false;
  const supportsUrl = CSS.supports("backdrop-filter", "url(#chips-lg-probe)");
  const chromium = /\b(Chrome|Chromium|Edg)\//.test(navigator.userAgent);
  return supportsUrl && chromium;
}

const bucket = (value: number, step: number, min = 1) =>
  Math.max(min, Math.round(value / step) * step);

function bucketShape(shape: LensShape): BucketedShape {
  return {
    width: bucket(shape.width, SHAPE_BUCKET),
    height: bucket(shape.height, SHAPE_BUCKET),
    radius: bucket(shape.radius, 4, 0),
  };
}

const shapeKey = (s: BucketedShape) => `${s.width}x${s.height}r${s.radius}`;

/** Signed distance to a rounded rectangle centred on the origin (negative
 *  inside) — the same SDF the reference implementation uses for its lens. */
function roundedRectSdf(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  radius: number,
): number {
  const qx = Math.abs(x) - halfW + radius;
  const qy = Math.abs(y) - halfH + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

const mapCache = new Map<string, string>();

/**
 * Rasterize the displacement map for one shape. R/G = X/Y displacement with
 * 0.5 neutral; full strength at the rim, easing to nothing at the inner edge of
 * the band, so only the contour "wraps" and the panel's middle is untouched.
 */
function buildDisplacementMap(shape: BucketedShape): string {
  const { width, height, radius } = shape;
  const key = shapeKey(shape);
  const cached = mapCache.get(key);
  if (cached) return cached;

  const scale = Math.min(1, MAP_MAX_EDGE / Math.max(width, height));
  const mw = Math.max(8, Math.round(width * scale));
  const mh = Math.max(8, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(mw, mh);
  const data = image.data;

  const halfW = Math.max(1, width / 2 - 1);
  const halfH = Math.max(1, height / 2 - 1);
  const r = Math.max(0, Math.min(radius - 1, Math.min(halfW, halfH)));
  const band = Math.max(6, Math.min(26, Math.min(width, height) * BAND_FRACTION));
  const pixel = 1 / scale;
  const NEUTRAL = 128;

  for (let py = 0; py < mh; py++) {
    const y = (py + 0.5) * pixel - height / 2;
    for (let px = 0; px < mw; px++) {
      const x = (px + 0.5) * pixel - width / 2;
      const i = (py * mw + px) * 4;
      data[i + 2] = 0;
      data[i + 3] = 255;

      const d = roundedRectSdf(x, y, halfW, halfH, r);
      const depth = -d;
      // Outside the shape, or past the rim band: neutral (no bend at all).
      if (depth <= 0 || depth >= band) {
        data[i] = NEUTRAL;
        data[i + 1] = NEUTRAL;
        continue;
      }

      // Outward normal from the SDF gradient (one central difference each way).
      const e = 1.5;
      const gx =
        roundedRectSdf(x + e, y, halfW, halfH, r) - roundedRectSdf(x - e, y, halfW, halfH, r);
      const gy =
        roundedRectSdf(x, y + e, halfW, halfH, r) - roundedRectSdf(x, y - e, halfW, halfH, r);
      const len = Math.hypot(gx, gy) || 1;

      // Smooth, monotone falloff: 1 at the rim, 0 at the band's inner edge.
      const t = depth / band;
      const amp = (1 - t) * (1 - t);

      data[i] = Math.round(NEUTRAL + (gx / len) * amp * 126);
      data[i + 1] = Math.round(NEUTRAL + (gy / len) * amp * 126);
    }
  }

  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  mapCache.set(key, url);
  return url;
}

const SVG_NS = "http://www.w3.org/2000/svg";
let defsHost: SVGSVGElement | null = null;
let filterSeq = 0;
const filterIds = new Map<string, string>();

function ensureDefsHost(): SVGSVGElement {
  if (defsHost?.isConnected) return defsHost;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-chips-glass-defs", "");
  // Zero-size and click-through: this element exists only to own the filters.
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.pointerEvents = "none";
  svg.style.opacity = "0";
  document.body.appendChild(svg);
  defsHost = svg;
  return svg;
}

/** Filter id for a shape, created (and cached) on first use. */
function filterForShape(shape: LensShape): string {
  const bucketed = bucketShape(shape);
  const key = shapeKey(bucketed);
  const cached = filterIds.get(key);
  if (cached) return cached;

  const id = `chips-lg-${++filterSeq}`;
  const host = ensureDefsHost();
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", id);
  // User-space region exactly covering the element box: feImage stretches the
  // map onto it, no percentage maths involved.
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("primitiveUnits", "userSpaceOnUse");
  filter.setAttribute("x", "0");
  filter.setAttribute("y", "0");
  filter.setAttribute("width", String(bucketed.width));
  filter.setAttribute("height", String(bucketed.height));
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const image = document.createElementNS(SVG_NS, "feImage");
  image.setAttribute("href", buildDisplacementMap(bucketed));
  image.setAttribute("x", "0");
  image.setAttribute("y", "0");
  image.setAttribute("width", String(bucketed.width));
  image.setAttribute("height", String(bucketed.height));
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("result", "chips-lg-map");
  filter.appendChild(image);

  const displace = document.createElementNS(SVG_NS, "feDisplacementMap");
  displace.setAttribute("in", "SourceGraphic");
  displace.setAttribute("in2", "chips-lg-map");
  displace.setAttribute("xChannelSelector", "R");
  displace.setAttribute("yChannelSelector", "G");
  // Subtle by design: at most ~2.2% of the short edge, hard-capped. The rim bend
  // should be noticeable when you look for it, never a funhouse mirror.
  const strength = Math.min(20, Math.max(7, Math.min(bucketed.width, bucketed.height) * 0.022));
  displace.setAttribute("scale", strength.toFixed(2));
  filter.appendChild(displace);

  host.appendChild(filter);
  filterIds.set(key, id);
  return id;
}

function shapeOf(el: Element): LensShape {
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius || "0");
    return { width: rect.width, height: rect.height, radius: Number.isFinite(radius) ? radius : 0 };
  }
  // Dialogs and menus are measured right after mount, before layout lands.
  const width = el.clientWidth || 320;
  const height = el.clientHeight || 48;
  const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius || "0");
  return { width, height, radius: Number.isFinite(radius) ? radius : 0 };
}

/** Point one element at the filter for its current shape. Returns true when a
 *  filter was applied. */
function applyRefraction(el: HTMLElement): boolean {
  const shape = shapeOf(el);
  if (shape.width < 24 || shape.height < 16) return false;
  if (shape.width * shape.height > MAX_RASTER_AREA) return false;
  const id = filterForShape(shape);
  if (!id) return false;
  const value = `url(#${id})`;
  if (el.style.getPropertyValue("--lg-filter") !== value) el.style.setProperty("--lg-filter", value);
  el.dataset.lgFilter = "on";
  return true;
}

let resizeObserver: ResizeObserver | null = null;
let observed = new WeakSet<Element>();

/**
 * Re-evaluate which elements refract and point each at the right filter.
 * Panels are budget-capped in document order; overlays are always included.
 * Cheap and idempotent — safe to call after any DOM change.
 */
export function refreshRefraction(root: ParentNode = document): void {
  if (!refractionSupported()) return;

  const panels = [...root.querySelectorAll<HTMLElement>(`[${LG_ATTR}]`)];
  const overlays = [...(root === document ? document : root).querySelectorAll?.<HTMLElement>(OVERLAY_SELECTOR) ?? []];

  const allowed = new Set<Element>();
  for (const el of panels) {
    if (allowed.size >= MAX_REFRACTED) break;
    if (applyRefraction(el)) allowed.add(el);
  }
  for (const el of overlays) {
    if (applyRefraction(el)) allowed.add(el);
  }

  // Surfaces that are hidden/gone must not keep a phantom filter around.
  for (const el of document.querySelectorAll<HTMLElement>("[data-lg-filter]")) {
    if (!allowed.has(el)) {
      el.removeAttribute("data-lg-filter");
      el.style.removeProperty("--lg-filter");
    }
  }

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (el.dataset.lgFilter === "on") applyRefraction(el);
      }
    });
    for (const el of allowed) {
      if (observed.has(el)) continue;
      observed.add(el);
      resizeObserver.observe(el);
    }
  }
}

/**
 * Turn refraction on for the whole app. No-op (and no observers installed) in
 * browsers without `backdrop-filter: url()`. Returns a cleanup function.
 */
export function installLiquidGlass(): () => void {
  if (!refractionSupported()) return () => {};
  document.documentElement.dataset.lgRefract = "on";

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refreshRefraction();
    });
  };

  refreshRefraction();

  // Chat lines, channel rows, talkers and dialogs all change under us; the
  // observer only re-maps shapes, it never rebuilds a filter that already
  // exists in the cache.
  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true });

  const onResize = () => schedule();
  window.addEventListener("resize", onResize);

  return () => {
    mo.disconnect();
    window.removeEventListener("resize", onResize);
    if (frame) cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    resizeObserver = null;
    observed = new WeakSet();
    delete document.documentElement.dataset.lgRefract;
  };
}
