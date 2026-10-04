// UV map rendering: turns extracted drawable UVs into a canvas drawing.
//
// Two things matter here, and both are why this is split from the UI:
//
// 1. **Geometry is built once, in UV space.** Every mesh is decomposed into UV
//    "charts" (islands) and rendered as cached `Path2D`s that only ever get a
//    canvas *transform* applied. Panning, zooming, toggling a material or
//    changing colours therefore never rebuilds a path — which is what made
//    switching shaders feel laggy on 30k-triangle vehicles.
// 2. **Islands can be drawn as outlines.** Stroking every triangle edge makes a
//    smooth island look faceted ("everything is square"); the UV *seam* — the
//    chart boundary — is what a livery guide should show, with the internal
//    triangulation available as an option.
//
// The exact same draw function drives the on-screen preview and the
// full-resolution PNG export, so the preview is what lands in the file.

import type { UvMesh } from "../../../shared/models";

/** Palette used when each material gets its own colour. */
export const MESH_PALETTE = [
  "#38bdf8",
  "#f97316",
  "#34d399",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#2dd4bf",
  "#f87171",
  "#60a5fa",
  "#c084fc",
  "#4ade80",
  "#fb923c",
];

export type UvStyle = "islands" | "wireframe" | "outline";
/** `sheet` = the asset's own texture tile(s); `fit` = every visible island. */
export type UvBounds = "sheet" | "fit";
export type UvBackground = "dark" | "light" | "transparent";

/** One UV island (chart) of one mesh, prebuilt in UV space. */
export interface UvChart {
  /**
   * Stable document-wide palette slot (see `assignChartIndices`). Kept fixed so
   * an island keeps its colour while other materials/LODs are toggled, and so
   * the orthographic guide can colour the same island identically.
   */
  index: number;
  /** Triangle indices (into the mesh index buffer) that make up this island. */
  triangles: number[];
  /** Area in UV units (a 1x1 sheet is 1.0). */
  area: number;
  spanU: number;
  spanV: number;
  /** `[minU, minV, maxU, maxV]` of this island. */
  bounds: [number, number, number, number];
  triangleCount: number;
  /** All triangles, filled. */
  fill: Path2D;
  /** Every triangle edge (the triangulation). */
  wire: Path2D;
  /** Only the chart boundary (the UV seam). */
  outline: Path2D;
}

/** Camera-independent, prebuilt geometry for one mesh. */
export interface UvMeshGeometry {
  meshId: number;
  shader: number;
  charts: UvChart[];
  /** `[minU, minV, maxU, maxV]` over all charts. */
  bounds: [number, number, number, number];
  triangleCount: number;
}

export type UvColourMode = "island" | "material" | "single";

/**
 * Stamp a document-wide palette slot on every chart, in mesh/id order.
 *
 * The colour of an island must not depend on what is currently visible, or
 * toggling one material would recolour the whole sheet and the guide would no
 * longer match it.
 */
export function assignChartIndices(geoms: UvMeshGeometry[]): void {
  let n = 0;
  for (const geom of geoms) {
    for (const chart of geom.charts) {
      chart.index = n;
      n += 1;
    }
  }
}

/**
 * Hide charts a texture artist does not want to see.
 *
 * `minArea`/`minSpan` drop rivets and badges. `maxOffset` drops charts that sit
 * far outside the texture sheet — a vehicle's world-mapped detail UVs can reach
 * ±90, which is real data but cannot be painted and drags triangles across the
 * whole canvas.
 *
 * Note there is deliberately **no "must be inside 0-1" rule**: many GTA V assets
 * tile the texture (V 0..2, mirrored), so that content is legitimate.
 */
export interface ChartFilter {
  minArea: number;
  minSpan: number;
  /** Drop charts whose bbox lies entirely beyond this distance from the sheet. */
  maxOffset: number;
}

/** Default: islands under 0.05% of the sheet, and far outliers, are hidden. */
export const DEFAULT_CHART_FILTER: ChartFilter = {
  minArea: 0.0005,
  minSpan: 0,
  maxOffset: 2,
};

export function chartVisible(chart: UvChart, filter: ChartFilter): boolean {
  if (chart.area < filter.minArea) return false;
  if (filter.minSpan > 0 && chart.spanU < filter.minSpan && chart.spanV < filter.minSpan) {
    return false;
  }
  if (filter.maxOffset > 0) {
    const [minU, minV, maxU, maxV] = chart.bounds;
    const lo = -filter.maxOffset;
    const hi = 1 + filter.maxOffset;
    if (maxU < lo || minU > hi || maxV < lo || minV > hi) return false;
  }
  return true;
}

/**
 * The texture sheet an asset actually uses, in whole 1x1 tiles.
 *
 * Most assets live in a single 0-1 tile, but plenty do not: the A-7 Corsair
 * keeps 154 000 of its 198 000 triangles in the **V 1..2** tile and only 9% on
 * the 0-1 tile, so a guide framed on 0-1 hides three quarters of the aircraft.
 *
 * The tiles are picked by triangle mass — take the smallest block of tiles that
 * covers ~90% of the triangles — because a bounds-based rule lets one world
 * mapped chart (a 5-tile-wide decal) inflate the sheet to 4x7 meaningless tiles.
 */
export function sheetTiles(
  geoms: UvMeshGeometry[],
  filter?: ChartFilter,
  isVisible?: (id: number) => boolean
): { u: number; v: number } {
  // Ignore anything further than CLIP tiles from the origin: those islands are
  // world-mapped detail, not the sheet.
  const CLIP = 6;
  const STRIDE = 16;
  const mass = new Map<number, number>();
  let total = 0;
  for (const geom of geoms) {
    if (isVisible && !isVisible(geom.meshId)) continue;
    for (const chart of geom.charts) {
      if (filter && !chartVisible(chart, filter)) continue;
      const [cMinU, cMinV, cMaxU, cMaxV] = chart.bounds;
      const u0 = Math.max(0, Math.floor(cMinU));
      const v0 = Math.max(0, Math.floor(cMinV));
      const u1 = Math.min(CLIP, Math.floor(cMaxU));
      const v1 = Math.min(CLIP, Math.floor(cMaxV));
      if (u1 < u0 || v1 < v0) continue;
      total += chart.triangleCount;
      // Spread a chart's triangles over the tiles it overlaps.
      const share = chart.triangleCount / ((u1 - u0 + 1) * (v1 - v0 + 1));
      for (let tu = u0; tu <= u1; tu++) {
        for (let tv = v0; tv <= v1; tv++) {
          const key = tu * STRIDE + tv;
          mass.set(key, (mass.get(key) ?? 0) + share);
        }
      }
    }
  }
  const ranked = [...mass.entries()].sort((a, b) => b[1] - a[1]);
  let acc = 0;
  let u = 1;
  let v = 1;
  for (const [key, m] of ranked) {
    acc += m;
    u = Math.max(u, Math.floor(key / STRIDE) + 1);
    v = Math.max(v, (key % STRIDE) + 1);
    if (total > 0 && acc >= total * 0.9) break;
  }
  return { u: Math.min(u, 8), v: Math.min(v, 8) };
}

/** Quantise a UV so coincident points compare equal despite float noise. */
function q(v: number): number {
  return Math.round(v * 100_000);
}

interface EdgeUse {
  count: number;
  a: [number, number];
  b: [number, number];
}

/**
 * Split one mesh into UV charts and prebuild their paths.
 *
 * Two triangles belong to the same chart when they share an edge whose endpoints
 * have *identical* UVs — i.e. the edge is not a UV seam. This needs no position
 * data: inside an island the shared vertices always carry the same UV, and a UV
 * seam splits the mesh by definition.
 */
export function buildMeshGeometry(mesh: UvMesh): UvMeshGeometry {
  const { uvs, indices } = mesh;
  const vertexCount = Math.floor(uvs.length / 2);
  const triangleCount = Math.floor(indices.length / 3);
  const empty: UvMeshGeometry = {
    meshId: mesh.id,
    shader: mesh.shader,
    charts: [],
    bounds: [0, 0, 0, 0],
    triangleCount: 0,
  };
  if (vertexCount === 0 || triangleCount === 0) return empty;

  const tri = (t: number): [number, number, number] => [
    indices[t * 3],
    indices[t * 3 + 1],
    indices[t * 3 + 2],
  ];
  const valid = (t: number): boolean => tri(t).every((i) => i !== undefined && i < vertexCount);

  // Union-find over triangles, joined across non-seam edges.
  const parent = new Int32Array(triangleCount);
  for (let i = 0; i < triangleCount; i++) parent[i] = i;
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const edgeKey = (i0: number, i1: number): string => {
    const k0 = `${q(uvs[i0 * 2])},${q(uvs[i0 * 2 + 1])}`;
    const k1 = `${q(uvs[i1 * 2])},${q(uvs[i1 * 2 + 1])}`;
    return k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`;
  };

  const edgeOwner = new Map<string, number>();
  for (let t = 0; t < triangleCount; t++) {
    if (!valid(t)) continue;
    const [ia, ib, ic] = tri(t);
    for (const [i0, i1] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ] as const) {
      const key = edgeKey(i0, i1);
      const owner = edgeOwner.get(key);
      if (owner === undefined) edgeOwner.set(key, t);
      else union(owner, t);
    }
  }

  // Group triangles per chart and count how often each UV edge is used inside
  // it — used exactly once means it is chart boundary.
  interface Bucket {
    triangles: number[];
    edges: Map<string, EdgeUse>;
  }
  const buckets = new Map<number, Bucket>();
  for (let t = 0; t < triangleCount; t++) {
    if (!valid(t)) continue;
    const root = find(t);
    let bucket = buckets.get(root);
    if (!bucket) {
      bucket = { triangles: [], edges: new Map() };
      buckets.set(root, bucket);
    }
    bucket.triangles.push(t);
    const [ia, ib, ic] = tri(t);
    for (const [i0, i1] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ] as const) {
      const key = edgeKey(i0, i1);
      const use = bucket.edges.get(key);
      if (use) use.count += 1;
      else {
        bucket.edges.set(key, {
          count: 1,
          a: [uvs[i0 * 2], uvs[i0 * 2 + 1]],
          b: [uvs[i1 * 2], uvs[i1 * 2 + 1]],
        });
      }
    }
  }

  const charts: UvChart[] = [];
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  let keptTriangles = 0;

  for (const bucket of buckets.values()) {
    const fill = new Path2D();
    const wire = new Path2D();
    const outline = new Path2D();
    let area = 0;
    let cMinU = Infinity;
    let cMinV = Infinity;
    let cMaxU = -Infinity;
    let cMaxV = -Infinity;

    for (const t of bucket.triangles) {
      const [ia, ib, ic] = tri(t);
      const ax = uvs[ia * 2];
      const ay = uvs[ia * 2 + 1];
      const bx = uvs[ib * 2];
      const by = uvs[ib * 2 + 1];
      const cx = uvs[ic * 2];
      const cy = uvs[ic * 2 + 1];
      area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
      cMinU = Math.min(cMinU, ax, bx, cx);
      cMinV = Math.min(cMinV, ay, by, cy);
      cMaxU = Math.max(cMaxU, ax, bx, cx);
      cMaxV = Math.max(cMaxV, ay, by, cy);
      fill.moveTo(ax, ay);
      fill.lineTo(bx, by);
      fill.lineTo(cx, cy);
      fill.closePath();
      wire.moveTo(ax, ay);
      wire.lineTo(bx, by);
      wire.lineTo(cx, cy);
      wire.closePath();
    }

    for (const use of bucket.edges.values()) {
      if (use.count !== 1) continue;
      outline.moveTo(use.a[0], use.a[1]);
      outline.lineTo(use.b[0], use.b[1]);
    }

    charts.push({
      index: 0,
      triangles: bucket.triangles,
      area,
      spanU: cMaxU - cMinU,
      spanV: cMaxV - cMinV,
      bounds: [cMinU, cMinV, cMaxU, cMaxV],
      triangleCount: bucket.triangles.length,
      fill,
      wire,
      outline,
    });
    minU = Math.min(minU, cMinU);
    minV = Math.min(minV, cMinV);
    maxU = Math.max(maxU, cMaxU);
    maxV = Math.max(maxV, cMaxV);
    keptTriangles += bucket.triangles.length;
  }

  return {
    meshId: mesh.id,
    shader: mesh.shader,
    charts,
    bounds: keptTriangles ? [minU, minV, maxU, maxV] : [0, 0, 0, 0],
    triangleCount: keptTriangles,
  };
}

export interface UvDrawOptions {
  width: number;
  height: number;
  /** Which meshes to draw (mesh id -> visible). */
  isVisible: (id: number) => boolean;
  /** Colour for a mesh / material. */
  colorOf: (id: number) => string;
  /** Chart filter — islands below the threshold are skipped. */
  chartFilter: ChartFilter;
  /** How islands are coloured: one colour per island, per material, or one flat colour. */
  colourMode: UvColourMode;
  /** Texture tiles the asset uses (from `sheetTiles`), for `bounds: "sheet"`. */
  tiles: { u: number; v: number };
  style: UvStyle;
  background: UvBackground;
  /** Stroke width in pixels at the target resolution. */
  lineWidth: number;
  flipU: boolean;
  flipV: boolean;
  /** Draw the tile grid (and highlight the 0-1 tile). */
  grid: boolean;
  bounds: UvBounds;
  /** Margin around the layout, as a fraction of the canvas (0..0.25). */
  padding: number;
  /**
   * Paint-template mode: every visible island is filled solid white with no
   * seams or strokes, so the PNG can be used directly as a livery stencil.
   */
  template?: boolean;
  /**
   * Cage overlay drawn *on top* of the fills: the island boundary (the UV seam)
   * or the full triangulation. Livery templates ship the cage so the artist can
   * see where the mesh edges are while painting.
   */
  cage?: { mode: "seam" | "wire"; colour: string; width: number } | null;
  /** Mesh id to emphasise, if any. */
  highlight?: number | null;
  /** Island (palette index) to emphasise across every material, e.g. picked in the guide. */
  highlightChart?: number | null;
}

export interface UvView {
  scale: number;
  x: number;
  y: number;
}

/** Meshes that actually carry UV data and triangles. */
export function mappableMeshes(meshes: UvMesh[]): UvMesh[] {
  return meshes.filter((m) => m.uvs.length >= 2 && m.indices.length >= 3);
}

/**
 * Display-space bounding box of what will be drawn.
 *
 * `fit` frames the *filtered* charts, so a handful of world-mapped meshes (a
 * vehicle's paint UVs can span ±90) can no longer squash the real layout into a
 * dot in the middle of the canvas.
 */
export function visibleBounds(
  geoms: UvMeshGeometry[],
  opts: Pick<UvDrawOptions, "isVisible" | "flipU" | "flipV" | "bounds" | "chartFilter" | "tiles">
): [number, number, number, number] {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  let any = false;
  for (const geom of geoms) {
    if (!opts.isVisible(geom.meshId)) continue;
    if (!geom.charts.some((c) => chartVisible(c, opts.chartFilter))) continue;
    const b = geom.bounds;
    if (!b[2] && !b[3]) continue;
    minU = Math.min(minU, b[0]);
    minV = Math.min(minV, b[1]);
    maxU = Math.max(maxU, b[2]);
    maxV = Math.max(maxV, b[3]);
    any = true;
  }
  if (opts.bounds === "sheet" || !any || !Number.isFinite(minU)) {
    minU = 0;
    minV = 0;
    maxU = Math.max(1, opts.tiles.u);
    maxV = Math.max(1, opts.tiles.v);
  }
  const x0 = opts.flipU ? 1 - maxU : minU;
  const x1 = opts.flipU ? 1 - minU : maxU;
  const y0 = opts.flipV ? 1 - maxV : minV;
  const y1 = opts.flipV ? 1 - minV : maxV;
  return [x0, y0, x1, y1];
}

/** Fit the bounds into a `width` x `height` canvas. */
export function computeView(geoms: UvMeshGeometry[], opts: UvDrawOptions): UvView {
  const [x0, y0, x1, y1] = visibleBounds(geoms, opts);
  const spanU = Math.max(x1 - x0, 1e-6);
  const spanV = Math.max(y1 - y0, 1e-6);
  const pad = Math.max(0, Math.min(opts.padding, 0.25));
  const scale = Math.min(
    (opts.width * (1 - 2 * pad)) / spanU,
    (opts.height * (1 - 2 * pad)) / spanV
  );
  return {
    scale,
    x: (opts.width - spanU * scale) / 2 - x0 * scale,
    y: (opts.height - spanV * scale) / 2 - y0 * scale,
  };
}

/** UV -> pixel mapping (identical to the canvas transform used to draw). */
export function uvToPixel(
  u: number,
  v: number,
  view: UvView,
  opts: Pick<UvDrawOptions, "flipU" | "flipV">
): [number, number] {
  const uu = opts.flipU ? 1 - u : u;
  const vv = opts.flipV ? 1 - v : v;
  return [uu * view.scale + view.x, vv * view.scale + view.y];
}

/** Pixel -> UV (for the readout under the cursor). */
export function pixelToUv(
  px: number,
  py: number,
  view: UvView,
  opts: Pick<UvDrawOptions, "flipU" | "flipV">
): [number, number] {
  const u = (px - view.x) / view.scale;
  const v = (py - view.y) / view.scale;
  return [opts.flipU ? 1 - u : u, opts.flipV ? 1 - v : v];
}

function backgroundColor(bg: UvBackground): string | null {
  if (bg === "dark") return "#111827";
  if (bg === "light") return "#f8fafc";
  return null;
}

/**
 * Apply the UV -> device-pixel transform.
 *
 * Flips are folded into the matrix (mirroring the UV axis) instead of being
 * baked into the cached paths, so toggling them costs nothing.
 */
function applyView(
  ctx: CanvasRenderingContext2D,
  view: UvView,
  opts: Pick<UvDrawOptions, "flipU" | "flipV">
): void {
  const a = opts.flipU ? -view.scale : view.scale;
  const d = opts.flipV ? -view.scale : view.scale;
  const e = opts.flipU ? view.scale + view.x : view.x;
  const f = opts.flipV ? view.scale + view.y : view.y;
  ctx.setTransform(a, 0, 0, d, e, f);
}

/**
 * Draw the UV layout. `view` lets the caller pass a pan/zoom transform
 * (preview) or omit it to auto-fit the export resolution.
 */
export function drawUvScene(
  ctx: CanvasRenderingContext2D,
  geoms: UvMeshGeometry[],
  opts: UvDrawOptions,
  viewIn?: UvView
): UvView {
  const view = viewIn ?? computeView(geoms, opts);
  const dark = opts.background !== "light";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.clearRect(0, 0, opts.width, opts.height);
  const bg = backgroundColor(opts.background);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, opts.width, opts.height);
  }

  // Tile grid — the reference frame for the texture sheet. The 0-1 tile is drawn
  // brighter, because that is the .ytd; extra tiles mean the texture wraps.
  ctx.lineJoin = "round";
  if (opts.grid) {
    const tilesU = Math.max(1, Math.round(opts.tiles.u));
    const tilesV = Math.max(1, Math.round(opts.tiles.v));
    for (let tu = 0; tu < tilesU; tu++) {
      for (let tv = 0; tv < tilesV; tv++) {
        const [gx0, gy0] = uvToPixel(tu, tv, view, opts);
        const [gx1, gy1] = uvToPixel(tu + 1, tv + 1, view, opts);
        const left = Math.min(gx0, gx1);
        const top = Math.min(gy0, gy1);
        const w = Math.abs(gx1 - gx0);
        const h = Math.abs(gy1 - gy0);
        const base = tu === 0 && tv === 0;
        ctx.strokeStyle = base
          ? dark
            ? "rgba(148,163,184,0.6)"
            : "rgba(71,85,105,0.5)"
          : dark
            ? "rgba(148,163,184,0.22)"
            : "rgba(71,85,105,0.18)";
        ctx.lineWidth = Math.max(1, opts.lineWidth * (base ? 0.75 : 0.5));
        ctx.strokeRect(left, top, w, h);
        if (base) {
          ctx.strokeStyle = dark ? "rgba(148,163,184,0.16)" : "rgba(71,85,105,0.14)";
          ctx.lineWidth = Math.max(1, opts.lineWidth * 0.5);
          ctx.beginPath();
          for (const frac of [0.25, 0.5, 0.75]) {
            const [qx] = uvToPixel(frac, 0, view, opts);
            const [, qy] = uvToPixel(0, frac, view, opts);
            ctx.moveTo(qx, top);
            ctx.lineTo(qx, top + h);
            ctx.moveTo(left, qy);
            ctx.lineTo(left + w, qy);
          }
          ctx.stroke();
        }
      }
    }
  }

  // Geometry pass: prebuilt UV-space paths, one transform, no path rebuilding.
  applyView(ctx, view, opts);
  const template = opts.template === true;
  const fillAlpha = template ? 1 : opts.style === "islands" ? 0.3 : 0;
  const strokeAlpha = template ? 0 : opts.style === "wireframe" ? 0.5 : 0.95;
  // The transform scales strokes, so convert pixels -> UV units.
  const strokeWidth = opts.lineWidth / Math.max(view.scale, 1e-6);
  const flatColour = dark ? "#e2e8f0" : "#0f172a";

  for (const geom of geoms) {
    if (!opts.isVisible(geom.meshId)) continue;
    const geomColour = opts.colorOf(geom.meshId);
    const dimmed = opts.highlight != null && opts.highlight !== geom.meshId;
    const emphasised = opts.highlight === geom.meshId;
    const baseAlpha = dimmed ? 0.28 : 1;

    ctx.lineWidth = strokeWidth * (emphasised ? 1.8 : 1);

    for (const chart of geom.charts) {
      if (!chartVisible(chart, opts.chartFilter)) continue;
      const picked =
        opts.highlightChart != null ? opts.highlightChart === chart.index : null;
      const chartColour = template
        ? "#ffffff"
        : opts.colourMode === "island"
          ? MESH_PALETTE[chart.index % MESH_PALETTE.length]
          : opts.colourMode === "material"
            ? geomColour
            : flatColour;
      ctx.fillStyle = chartColour;
      ctx.strokeStyle = chartColour;
      if (fillAlpha > 0) {
        ctx.globalAlpha = template ? 1 : baseAlpha * fillAlpha * (picked === false ? 0.3 : 1);
        ctx.fill(chart.fill);
      }
      if (strokeAlpha > 0) {
        ctx.globalAlpha = baseAlpha * strokeAlpha * (picked === false ? 0.25 : 1);
        ctx.stroke(opts.style === "wireframe" ? chart.wire : chart.outline);
      }
      if (picked === true && !template) {
        // Ring the picked island so it stands out against the rest of the sheet.
        ctx.globalAlpha = 1;
        ctx.strokeStyle = dark ? "#f8fafc" : "#0f172a";
        ctx.lineWidth = strokeWidth * 2.4;
        ctx.stroke(chart.outline);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Cage pass — after every fill, or a later geometry would paint over the cage.
  if (opts.cage) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = opts.cage.colour;
    ctx.lineWidth = opts.cage.width / Math.max(view.scale, 1e-6);
    for (const geom of geoms) {
      if (!opts.isVisible(geom.meshId)) continue;
      for (const chart of geom.charts) {
        if (!chartVisible(chart, opts.chartFilter)) continue;
        ctx.stroke(opts.cage.mode === "wire" ? chart.wire : chart.outline);
      }
    }
  }

  ctx.restore();
  return view;
}

/** Render the layout to a fresh canvas at the requested resolution. */
export function renderUvCanvas(geoms: UvMeshGeometry[], opts: UvDrawOptions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  drawUvScene(ctx, geoms, opts);
  return canvas;
}

/** Render the layout and encode it as PNG bytes. */
export async function renderUvPng(
  geoms: UvMeshGeometry[],
  opts: UvDrawOptions
): Promise<Uint8Array> {
  const canvas = renderUvCanvas(geoms, opts);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) throw new Error("could not encode the PNG");
  return new Uint8Array(await blob.arrayBuffer());
}
