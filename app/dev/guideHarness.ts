/**
 * Dev harness for the orthographic guide (see `guide-harness.html`).
 *
 * Renders the guide once from a dumped UvDocument + PositionDocument, then
 * exposes `window.__guide` with per-panel pixel statistics and a PNG data URL so
 * the render can be checked without the app shell (and without rAF, which
 * browsers pause in a background tab).
 */
import {
  GUIDE_AXES,
  buildGuideSoup,
  drawGuideOverlay,
  guideGrid,
} from "../src/features/creator/uv/guideRender";
import { createGuideRenderer } from "../src/features/creator/uv/guideGl";
import { assignChartIndices, buildMeshGeometry, drawUvScene, mappableMeshes, sheetTiles } from "../src/features/creator/uv/uvRender";
import type { UvMeshGeometry } from "../src/features/creator/uv/uvRender";
import type { PositionDocument, UvDocument } from "../src/shared/models";

const params = new URLSearchParams(location.search);
const docUrl = params.get("doc") ?? "/a7corsair.yft.json";
const posUrl = params.get("pos") ?? "/a7corsair.yft.pos.json";
const log = document.getElementById("log") as HTMLPreElement;
let coverage = 0;

async function main(): Promise<void> {
  const [doc, posDoc] = (await Promise.all([
    fetch(docUrl).then((r) => r.json()),
    fetch(posUrl).then((r) => r.json()),
  ])) as [UvDocument, PositionDocument];

  const geoms = mappableMeshes(doc.meshes).map(buildMeshGeometry);
  assignChartIndices(geoms);
  const positions = new Map(posDoc.meshes.map((m) => [m.id, m]));

  const t0 = performance.now();
  const soup = buildGuideSoup({
    meshes: doc.meshes,
    positions,
    geoms,
    isVisible: () => true,
    chartFilter: { minArea: 0.0005, minSpan: 0, maxOffset: 2 },
  });
  const buildMs = performance.now() - t0;
  if (!soup) {
    log.textContent = "no soup (no positions?)";
    return;
  }

  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const renderer = createGuideRenderer(canvas);
  if (!renderer) {
    log.textContent = "WebGL context failed";
    return;
  }
  renderer.upload(soup);

  const rects = guideGrid({ x: 0, y: 0, width: canvas.width, height: canvas.height });
  const panels = GUIDE_AXES.map((axis, i) => ({ axis: axis.id, label: axis.label, rect: rects[i] }));
  const drawOpts = { background: "dark" as const, highlight: null, labels: true };

  const t1 = performance.now();
  renderer.draw(panels, drawOpts, 1, 0, 0);
  const drawMs = performance.now() - t1;

  const overlay = document.getElementById("labels") as HTMLCanvasElement;
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const octx = overlay.getContext("2d");
  if (octx) drawGuideOverlay(octx, panels, drawOpts);

  // Pixel census per panel: the background is the only colour with r==g==b==0
  // after the clear, so "drawn" means "not the clear colour".
  const gl = canvas.getContext("webgl") as WebGLRenderingContext;
  const w = canvas.width;
  const h = canvas.height;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const panelStats = panels.map((panel) => {
    const r = panel.rect;
    let drawn = 0;
    let total = 0;
    for (let y = Math.floor(r.y) + 1; y < r.y + r.height - 1; y++) {
      for (let x = Math.floor(r.x) + 1; x < r.x + r.width - 1; x++) {
        // WebGL's y axis is bottom-up.
        const o = ((h - 1 - y) * w + x) * 4;
        total++;
        const isClear =
          Math.abs(px[o] - 17) + Math.abs(px[o + 1] - 24) + Math.abs(px[o + 2] - 39) < 30;
        // Ignore the label pixels in the top-left corner of the panel.
        if (!isClear && !(x - r.x < 90 && y - r.y < 26)) drawn++;
      }
    }
    return {
      axis: panel.axis,
      coveredPct: total ? Math.round((drawn / total) * 1000) / 10 : 0,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    };
  });

  // Picking sanity: the centre of each panel must resolve to an island.
  const picks: Record<string, number | null> = {};
  for (const panel of panels) {
    picks[panel.axis] = renderer.pick(
      panels,
      panel.rect.x + panel.rect.width / 2,
      panel.rect.y + panel.rect.height / 2,
      1,
      0,
      0
    );
  }

  // Re-draw for the data URL (pick() switches the shader to the id pass).
  renderer.draw(panels, drawOpts, 1, 0, 0);
  if (octx) drawGuideOverlay(octx, panels, drawOpts);

  // ---- preview simulation: what a detached GL canvas does -----------------
  // Kept as a warning: `drawImage` from a canvas that is NOT in the document,
  // and even `readPixels` on it, can come back blank (Chromium composites GL
  // canvases through a shared image). The app therefore keeps its GL canvas in
  // the document. Reported as `detachedCoveragePct` — expect ~0.
  const previewWrap = document.getElementById("previewWrap") as HTMLDivElement;
  const previewCanvas = document.getElementById("preview") as HTMLCanvasElement;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(previewWrap.clientWidth * dpr);
  const ph = Math.round(previewWrap.clientHeight * dpr);
  previewCanvas.width = pw;
  previewCanvas.height = ph;
  const detached = document.createElement("canvas");
  detached.width = pw;
  detached.height = ph;
  const offRenderer = createGuideRenderer(detached);
  let detachedPct = 0;
  if (offRenderer) {
    offRenderer.upload(soup);
    const previewRects = guideGrid({ x: 0, y: 0, width: pw, height: ph });
    const previewPanels = GUIDE_AXES.map((axis, i) => ({
      axis: axis.id,
      label: axis.label,
      rect: previewRects[i],
    }));
    offRenderer.draw(previewPanels, drawOpts, 1, 0, 0);
    const pctx = previewCanvas.getContext("2d")!;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, pw, ph);
    const snap = offRenderer.snapshot();
    pctx.putImageData(new ImageData(snap.pixels, snap.width, snap.height), 0, 0);
    drawGuideOverlay(pctx, previewPanels, drawOpts);
    const img = pctx.getImageData(0, 0, pw, ph).data;
    let painted = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 0) painted++;
    detachedPct = Math.round((painted / (pw * ph)) * 1000) / 10;
  }

  const summary = {
    triangles: soup.triangleCount,
    meshes: soup.meshCount,
    buildMs: Math.round(buildMs),
    drawMs: Math.round(drawMs * 100) / 100,
    panelStats,
    picks,
    previewSize: [pw, ph],
    dpr,
    detachedCoveragePct: detachedPct,
    coverage,
    template: renderTemplate(geoms, []),
    png: canvas.toDataURL("image/png"),
  };
  (window as unknown as { __guide: unknown }).__guide = summary;
  log.textContent = JSON.stringify({ ...summary, png: `${summary.png.length} chars` }, null, 2);
}

/**
 * Render the livery template the way the tool does — white islands over the
 * asset's texture tiles with the cage on top — and report what actually landed
 * on the canvas (white area, cage pixels, tile grid).
 */
function renderTemplate(geoms: UvMeshGeometry[], _unused: number[]) {
  const target = document.getElementById("template") as HTMLCanvasElement | null;
  if (!target) return null;
  const tiles = sheetTiles(geoms);
  const tile = 1024;
  const w = tile * Math.max(1, Math.round(tiles.u));
  const h = tile * Math.max(1, Math.round(tiles.v));
  target.width = w;
  target.height = h;
  target.style.width = "420px";
  const ctx = target.getContext("2d");
  if (!ctx) return null;
  drawUvScene(ctx, geoms, {
    width: w,
    height: h,
    isVisible: () => true,
    colorOf: () => "#ffffff",
    chartFilter: { minArea: 0.0005, minSpan: 0, maxOffset: 2 },
    colourMode: "single",
    tiles,
    style: "islands",
    background: "transparent",
    lineWidth: 3,
    flipU: false,
    flipV: false,
    grid: false,
    bounds: "sheet",
    padding: 0.02,
    template: true,
    cage: { mode: "seam", colour: "#111827", width: 3 },
  });
  const img = ctx.getImageData(0, 0, w, h).data;
  let white = 0;
  let cage = 0;
  for (let i = 0; i < img.length; i += 4) {
    const [r, g, b, a] = [img[i], img[i + 1], img[i + 2], img[i + 3]];
    if (a === 0) continue;
    if (r > 200 && g > 200 && b > 200) white += 1;
    else if (r < 128 && g < 128) cage += 1;
  }
  const total = w * h;
  return {
    size: [w, h],
    tiles: [tiles.u, tiles.v],
    whitePct: Math.round((white / total) * 10000) / 100,
    cagePct: Math.round((cage / total) * 10000) / 100,
  };
}

void main();
