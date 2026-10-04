/**
 * Orthographic livery guide — geometry, layout and screen mapping.
 *
 * A UV sheet is the *unwrapped* layout, so it can never look like the vehicle.
 * This module projects the model's triangles along one world axis per panel and
 * tags every triangle with the UV island it belongs to; `guideGl.ts` draws the
 * result with a **depth buffer** (a painter's algorithm cannot do this — charts
 * span both sides of a model, so a far-side triangle would paint over a near
 * one and the whole shape reads as "clumped together").
 *
 * GTA V axes: X = east/west, Y = forward, Z = up. `side` looks from +X, so the
 * nose (+Y) points left.
 */
import type { PositionMesh, UvMesh } from "../../../shared/models";
import {
  MESH_PALETTE,
  chartVisible,
  type ChartFilter,
  type UvMeshGeometry,
} from "./uvRender";

export type GuideAxis = "front" | "side" | "top" | "rear";

export const GUIDE_AXES: { id: GuideAxis; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "side", label: "Side" },
  { id: "top", label: "Top" },
  { id: "rear", label: "Rear" },
];

/**
 * Which world axis feeds the panel's screen axes, and which is depth.
 *
 * `d` is signed so that a LARGER value is CLOSER to the camera.
 */
export const GUIDE_PROJECTION: Record<
  GuideAxis,
  { h: [number, number]; v: [number, number]; d: [number, number] }
> = {
  front: { h: [0, 1], v: [2, 1], d: [1, -1] },
  rear: { h: [0, -1], v: [2, 1], d: [1, 1] },
  side: { h: [1, -1], v: [2, 1], d: [0, 1] },
  top: { h: [0, 1], v: [1, 1], d: [2, 1] },
};

/** Extents of one panel's view, in metres. */
export interface GuideAxisBounds {
  hMin: number;
  hMax: number;
  vMin: number;
  vMax: number;
  dMin: number;
  dMax: number;
}

/** A triangle soup ready for the GPU: 3 vertices per triangle. */
export interface GuideSoup {
  /** `xyz` per vertex (triangle order). */
  positions: Float32Array;
  /** Linear-space RGB per vertex — the colour of the vertex's island. */
  colors: Float32Array;
  /** Island palette index + 1 per vertex (0 = nothing drawn). */
  ids: Float32Array;
  vertexCount: number;
  triangleCount: number;
  /** Meshes that had readable positions. */
  meshCount: number;
  bounds: Record<GuideAxis, GuideAxisBounds>;
}

function emptyBounds(): GuideAxisBounds {
  return {
    hMin: Infinity,
    hMax: -Infinity,
    vMin: Infinity,
    vMax: -Infinity,
    dMin: Infinity,
    dMax: -Infinity,
  };
}

/** `#rrggbb` -> 0..1 floats. */
export function paletteRgb(index: number): [number, number, number] {
  const hex = MESH_PALETTE[index % MESH_PALETTE.length];
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

/**
 * Expand every visible island into GPU triangles.
 *
 * Returns `null` when nothing has positions (e.g. a document parsed before the
 * positions pass), so the caller can show a hint instead of a blank canvas.
 */
export function buildGuideSoup(input: {
  meshes: UvMesh[];
  positions: Map<number, PositionMesh>;
  geoms: UvMeshGeometry[];
  isVisible: (id: number) => boolean;
  chartFilter: ChartFilter;
}): GuideSoup | null {
  const { meshes, positions, geoms, isVisible, chartFilter } = input;
  const triangles: number[] = [];
  const counts: number[] = [];
  let meshCount = 0;
  const bounds: Record<GuideAxis, GuideAxisBounds> = {
    front: emptyBounds(),
    rear: emptyBounds(),
    side: emptyBounds(),
    top: emptyBounds(),
  };

  for (const geom of geoms) {
    if (!isVisible(geom.meshId)) continue;
    const pos = positions.get(geom.meshId);
    const mesh = meshes[geom.meshId];
    if (!pos || !mesh || pos.positions.length < 9 || mesh.indices.length < 3) continue;
    const xyz = pos.positions;
    const idx = mesh.indices;
    const vertexCount = Math.floor(xyz.length / 3);
    meshCount += 1;

    for (const chart of geom.charts) {
      if (!chartVisible(chart, chartFilter)) continue;
      for (const t of chart.triangles) {
        const i0 = idx[t * 3];
        const i1 = idx[t * 3 + 1];
        const i2 = idx[t * 3 + 2];
        if (
          i0 === undefined ||
          i1 === undefined ||
          i2 === undefined ||
          i0 >= vertexCount ||
          i1 >= vertexCount ||
          i2 >= vertexCount
        ) {
          continue;
        }
        for (const i of [i0, i1, i2]) {
          const x = xyz[i * 3];
          const y = xyz[i * 3 + 1];
          const z = xyz[i * 3 + 2];
          triangles.push(x, y, z);
          counts.push(chart.index + 1);
          for (const axis of GUIDE_AXES) {
            const b = bounds[axis.id];
            const p = GUIDE_PROJECTION[axis.id];
            const w = [x, y, z];
            const h = w[p.h[0]] * p.h[1];
            const v = w[p.v[0]] * p.v[1];
            const d = w[p.d[0]] * p.d[1];
            b.hMin = Math.min(b.hMin, h);
            b.hMax = Math.max(b.hMax, h);
            b.vMin = Math.min(b.vMin, v);
            b.vMax = Math.max(b.vMax, v);
            b.dMin = Math.min(b.dMin, d);
            b.dMax = Math.max(b.dMax, d);
          }
        }
      }
    }
  }

  if (!triangles.length) return null;

  const vertexCount = triangles.length / 3;
  const positionsOut = Float32Array.from(triangles);
  const colorsOut = new Float32Array(vertexCount * 3);
  const idsOut = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const id = counts[v];
    const [r, g, b] = paletteRgb(id - 1);
    colorsOut[v * 3] = r;
    colorsOut[v * 3 + 1] = g;
    colorsOut[v * 3 + 2] = b;
    idsOut[v] = id;
  }

  return {
    positions: positionsOut,
    colors: colorsOut,
    ids: idsOut,
    vertexCount,
    triangleCount: vertexCount / 3,
    meshCount,
    bounds,
  };
}

/** Panel rectangle inside the canvas, in device pixels. */
export interface GuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Split a canvas into the 2x2 panel grid (row-major: front, side, top, rear). */
export function guideGrid(rect: GuideRect, gap = 6): GuideRect[] {
  const w = (rect.width - gap) / 2;
  const h = (rect.height - gap) / 2;
  return [
    { x: rect.x, y: rect.y, width: w, height: h },
    { x: rect.x + w + gap, y: rect.y, width: w, height: h },
    { x: rect.x, y: rect.y + h + gap, width: w, height: h },
    { x: rect.x + w + gap, y: rect.y + h + gap, width: w, height: h },
  ];
}

/** One panel: which axis, where it sits, what it is called. */
export interface GuidePanel {
  axis: GuideAxis;
  label: string;
  rect: GuideRect;
}

export interface GuideDrawOptions {
  background: "dark" | "light" | "transparent";
  /** Island palette index to emphasise, or null. */
  highlight: number | null;
  /** Fade islands by depth so the form reads in 3D (GPU renderer only). */
  shade?: boolean;
  /** Draw the axis label in each panel. */
  labels: boolean;
}

/** Where a panel's content lands on screen (device px, top-left origin). */
export interface GuideViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Zoom/pan are applied by scaling the panel's viewport around its centre, so
 * the projection matrix only ever maps model bounds to the panel rectangle.
 */
export function guideViewport(
  panel: GuidePanel,
  zoom: number,
  panX: number,
  panY: number
): GuideViewport {
  const { rect } = panel;
  const width = rect.width * zoom;
  const height = rect.height * zoom;
  return {
    x: rect.x + rect.width / 2 + panX - width / 2,
    y: rect.y + rect.height / 2 + panY - height / 2,
    width,
    height,
  };
}

/** Device pixel -> metres on the panel's two axes. */
export function screenToWorld(
  panel: GuidePanel,
  bounds: GuideAxisBounds,
  px: number,
  py: number,
  zoom: number,
  panX: number,
  panY: number
): [number, number] {
  const vp = guideViewport(panel, zoom, panX, panY);
  const fx = (px - vp.x) / Math.max(vp.width, 1e-6);
  const fy = (py - vp.y) / Math.max(vp.height, 1e-6);
  return [
    bounds.hMin + fx * (bounds.hMax - bounds.hMin),
    bounds.vMax - fy * (bounds.vMax - bounds.vMin),
  ];
}

/** Inverse of `screenToWorld`, for overlay drawing. */
export function worldToScreen(
  panel: GuidePanel,
  bounds: GuideAxisBounds,
  h: number,
  v: number,
  zoom: number,
  panX: number,
  panY: number
): [number, number] {
  const vp = guideViewport(panel, zoom, panX, panY);
  const hSpan = Math.max(bounds.hMax - bounds.hMin, 1e-6);
  const vSpan = Math.max(bounds.vMax - bounds.vMin, 1e-6);
  return [
    vp.x + ((h - bounds.hMin) / hSpan) * vp.width,
    vp.y + ((bounds.vMax - v) / vSpan) * vp.height,
  ];
}

/** Which panel contains a point, or -1. */
export function guidePanelAt(panels: GuidePanel[], px: number, py: number): number {
  for (let i = 0; i < panels.length; i++) {
    const r = panels[i].rect;
    if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) return i;
  }
  return -1;
}

/** PNG bytes of a canvas (2D or WebGL). */
export async function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) throw new Error("could not encode the PNG");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Draw the 2D chrome (panel frames + axis labels) over the WebGL canvas. */
export function drawGuideOverlay(
  ctx: CanvasRenderingContext2D,
  panels: GuidePanel[],
  opts: GuideDrawOptions
): void {
  const dark = opts.background !== "light";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineJoin = "round";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textBaseline = "top";
  for (const panel of panels) {
    const { rect } = panel;
    ctx.strokeStyle = dark ? "rgba(148,163,184,0.28)" : "rgba(71,85,105,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    if (opts.labels) {
      ctx.fillStyle = dark ? "rgba(226,232,240,0.8)" : "rgba(30,41,59,0.75)";
      ctx.fillText(panel.label.toUpperCase(), rect.x + 7, rect.y + 5);
    }
  }
}
