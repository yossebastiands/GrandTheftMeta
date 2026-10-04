// UV Map Generator — Creator Tools.
//
// Import a GTA V drawable/fragment (.ydr / .yft), read its vertex buffers and
// draw every geometry's texture coordinates into UV space, then export the
// layout as PNG. The resource file is only ever read, never written.
//
// Performance contract: mesh geometry is converted to cached UV-space paths once
// per imported resource (`useMemo` on the document). Every interaction —
// toggling a material, zooming, panning, changing colours — only re-issues the
// canvas transform and re-strokes those cached paths, coalesced into one frame.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  EyeOff,
  FileWarning,
  FolderOpen,
  Loader2,
  Maximize2,
  Minus,
  Palette,
  Plus,
  Ruler,
  Wand2,
  X,
} from "lucide-react";
import { loadUvDocument, loadVertexPositions, pickResourceFile } from "../../../shared/api";
import type { PositionDocument, PositionMesh } from "../../../shared/models";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { UvDocument, UvMesh } from "../../../shared/models";
import {
  DEFAULT_CHART_FILTER,
  MESH_PALETTE,
  assignChartIndices,
  buildMeshGeometry,
  chartVisible,
  computeView,
  drawUvScene,
  mappableMeshes,
  pixelToUv,
  renderUvPng,
  sheetTiles,
  type ChartFilter,
  type UvBackground,
  type UvBounds,
  type UvChart,
  type UvDrawOptions,
  type UvMeshGeometry,
  type UvView,
} from "./uvRender";
import {
  GUIDE_AXES,
  buildGuideSoup,
  drawGuideOverlay,
  encodePng,
  guideGrid,
  guidePanelAt,
  screenToWorld,
  type GuidePanel,
  type GuideSoup,
} from "./guideRender";
import { createGuideRenderer, type GuideGl } from "./guideGl";

const MB = 1 / (1024 * 1024);

/** True inside a Tauri window (v2 marks the global internals object). */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** One line from anything thrown — including Tauri's non-Error rejects. */
function readableError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    const json = JSON.stringify(e);
    return json === undefined ? String(e) : json;
  } catch {
    return String(e);
  }
}

const BROWSER_NOTICE =
  "Reading a resource needs the desktop app — a browser preview cannot open files. " +
  "Start it with `npm run tauri dev` (or dev.bat) and import the .ydr / .yft there. " +
  "To exercise the renderer here instead, open this page with ?uvdemo.";

const LOD_ORDER = ["high", "medium", "low", "verylow"];

function lodRank(lod: string): number {
  const i = LOD_ORDER.indexOf(lod);
  return i === -1 ? LOD_ORDER.length : i;
}

/** Display label for a material: resolved shader name, else its hash. */
function materialLabel(mesh: UvMesh): string {
  if (mesh.shader_name) return mesh.shader_name;
  if (mesh.shader_hash) return `#${mesh.shader_hash.toString(16).toUpperCase().padStart(8, "0")}`;
  return `shader ${mesh.shader}`;
}

/* -------------------------------------------------------------------------
 * Small UI atoms
 * ---------------------------------------------------------------------- */

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="border-b border-gray-800/80 px-3 py-2.5">
      <header className="mb-2 flex items-center gap-2">
        <h3 className="text-2xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
        {right && <div className="ml-auto flex items-center gap-1">{right}</div>}
      </header>
      {children}
    </section>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-gray-700">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2 py-1 text-2xs transition ${
            value === o.value
              ? "bg-accent/20 font-semibold text-accent"
              : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-gray-300">
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
          checked ? "border-accent bg-accent text-white" : "border-gray-600"
        }`}
      >
        {checked && <Check className="h-2.5 w-2.5" />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1 truncate" title={hint ?? label}>
        {label}
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block py-0.5 text-xs text-gray-300">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-gray-500">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1 w-full accent-orange-500"
      />
    </label>
  );
}

/* ------------------------------------------------------------------------- */

/** What the workbench shows. */
export type StudioView = "template" | "model" | "split";
/** UV targeting: which materials the template is built from. */
export type TargetPreset = "all" | "livery" | "selected";

export default function UvMapGenerator() {
  const [doc, setDoc] = useState<UvDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourcePath, setSourcePath] = useState("");
  /** A plain-browser preview cannot call the Rust backend; say so up front. */
  const [browserPreview] = useState(() => !inTauri());

  // Layer / view settings. `hiddenShaders` is the main interaction: one click
  // toggles every geometry that shares a material.
  const [hiddenShaders, setHiddenShaders] = useState<Set<number>>(new Set());
  const [highlight, setHighlight] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [highLodOnly, setHighLodOnly] = useState(true);
  const [background, setBackground] = useState<UvBackground>("transparent");
  const [flipU, setFlipU] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [grid, setGrid] = useState(true);
  const [bounds, setBounds] = useState<UvBounds>("sheet");
  const [padding, setPadding] = useState(0.02);
  const [filterSmall, setFilterSmall] = useState(true);
  const [dropOutliers, setDropOutliers] = useState(true);
  /** Pixels per texture tile — the template canvas is this x the tile grid. */
  const [tileSize, setTileSize] = useState(2048);
  const [exporting, setExporting] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  /* --- template workflow ------------------------------------------------- */
  /** What the canvas shows: the template, the model, or both side by side. */
  const [studio, setStudio] = useState<StudioView>("template");
  /** UV targeting: which materials go into the template. */
  const [target, setTarget] = useState<TargetPreset>("all");
  /** Only used by `target: "selected"` (and by clicking a material's marker). */
  const [targetShader, setTargetShader] = useState<number | null>(null);
  /** Models sometimes ship two UV channels; the template can be built from one. */
  const [uvChannel, setUvChannel] = useState<"all" | 0 | 1>("all");
  /** Cage overlay: the mesh the template's paint area belongs to. */
  const [cage, setCage] = useState(true);
  const [cageMode, setCageMode] = useState<"seam" | "wire">("seam");
  const [cageWidth, setCageWidth] = useState(1.5);

  const [view, setView] = useState<UvView | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cursorUv, setCursorUv] = useState<[number, number] | null>(null);
  /** Pointer position in the guide, in metres along the panel's two axes. */
  const [cursorWorld, setCursorWorld] = useState<[number, number] | null>(null);

  /* --- orthographic guide ------------------------------------------------ */
  const [positions, setPositions] = useState<Map<number, PositionMesh> | null>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideZoom, setGuideZoom] = useState(1);
  const [guidePan, setGuidePan] = useState({ x: 0, y: 0 });
  const [guideShade, setGuideShade] = useState(true);
  /** Palette index of the island picked in the guide. */
  const [pickedIsland, setPickedIsland] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Split view gives each surface its own half; each canvas sizes to its own. */
  const modelWrapRef = useRef<HTMLDivElement | null>(null);
  const templateWrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number; moved?: boolean } | null>(
    null
  );
  /* Guide view: the WebGL model is rendered off-screen and blitted onto the one
     visible 2D canvas, so preview and export share a code path. */
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GuideGl | null>(null);
  const uploadedRef = useRef<GuideSoup | null>(null);
  const glFailedRef = useRef(false);

  const meshes = doc?.meshes ?? [];

  /* --- cached UV-space geometry (built once per imported resource) -------- */
  const geoms: UvMeshGeometry[] = useMemo(() => {
    const built = mappableMeshes(meshes).map(buildMeshGeometry);
    // Stamp the palette slot once: the sheet and the guide must colour the same
    // island the same way, and the colour must not depend on what is toggled.
    assignChartIndices(built);
    return built;
  }, [meshes]);
  const geometryByMesh = useMemo(() => {
    const map = new Map<number, UvMeshGeometry>();
    for (const g of geoms) map.set(g.meshId, g);
    return map;
  }, [geoms]);

  /** Material groups: shader index -> its meshes, ordered by LOD then id. */
  const materials = useMemo(() => {
    const byShader = new Map<number, UvMesh[]>();
    for (const mesh of meshes) {
      const list = byShader.get(mesh.shader);
      if (list) list.push(mesh);
      else byShader.set(mesh.shader, [mesh]);
    }
    return [...byShader.entries()]
      .map(([shader, list]) => {
        list.sort((a, b) => lodRank(a.lod) - lodRank(b.lod) || a.id - b.id);
        const head = list[0];
        const label = materialLabel(head);
        return {
          shader,
          label,
          meshes: list,
          isMappable: list.some((m) => geometryByMesh.has(m.id)),
          shaderHash: head.shader_hash,
          /**
           * Heuristic: shader names are all a .yft exposes about its materials
           * (texture file names live in the .ytd), so livery candidates can only
           * be guessed from names like `vehicle_paint3`, `*_sign_*`, `*_livery_*`.
           */
          livery: /paint|livery|sign|decal|logo|badge|wrap|skin/i.test(label),
        };
      })
      .sort((a, b) => a.shader - b.shader);
  }, [meshes, geometryByMesh]);

  const colorOf = useCallback((id: number) => {
    const mesh = doc?.meshes[id];
    const key = mesh ? mesh.shader : id;
    return MESH_PALETTE[key % MESH_PALETTE.length];
  }, [doc]);

  const chartFilter: ChartFilter = useMemo(
    () => ({
      minArea: filterSmall ? DEFAULT_CHART_FILTER.minArea : 0,
      minSpan: 0,
      maxOffset: dropOutliers ? DEFAULT_CHART_FILTER.maxOffset : 0,
    }),
    [filterSmall, dropOutliers]
  );

  /** Shaders whose name looks like a paint / livery / sign / decal layer. */
  const liveryShaders = useMemo(
    () => new Set(materials.filter((m) => m.livery).map((m) => m.shader)),
    [materials]
  );

  /**
   * Visible = material is on, passes the LOD filter, has UV data, AND is inside
   * the current UV target. Targeting is what turns a dump of every UV into a
   * usable livery template: "all", the paint/livery materials, or one material.
   */
  const isVisible = useCallback(
    (id: number) => {
      const mesh = doc?.meshes[id];
      if (!mesh) return false;
      if (hiddenShaders.has(mesh.shader)) return false;
      if (!geometryByMesh.has(id)) return false;
      if (highLodOnly && lodRank(mesh.lod) !== 0) return false;
      if (uvChannel !== "all" && mesh.uv_set !== uvChannel) return false;
      if (target === "livery" && !liveryShaders.has(mesh.shader)) return false;
      if (target === "selected" && mesh.shader !== targetShader) return false;
      return true;
    },
    [
      doc,
      hiddenShaders,
      highLodOnly,
      geometryByMesh,
      uvChannel,
      target,
      targetShader,
      liveryShaders,
    ]
  );

  /** Texture tiles the asset uses — most are 1x1, many aircraft are 1x2. */
  const tiles = useMemo(
    () => sheetTiles(geoms, chartFilter, isVisible),
    [geoms, chartFilter, isVisible]
  );

  /* --- guide geometry: one triangle soup for all four panels ------------- */
  const soup = useMemo<GuideSoup | null>(() => {
    if (!positions || !doc) return null;
    return buildGuideSoup({
      meshes: doc.meshes,
      positions,
      geoms,
      isVisible,
      chartFilter,
    });
  }, [positions, doc, geoms, isVisible, chartFilter]);

  /**
   * Panels are pure layout: the projection always maps the model's own extents
   * to the panel rect, and zoom/pan scale the GL viewport around its centre.
   */
  const guidePanels = useMemo<GuidePanel[] | null>(() => {
    if (studio === "template" || !size.w || !size.h) return null;
    const dpr = window.devicePixelRatio || 1;
    // In split view the model only owns its half of the viewport.
    const modelW = studio === "split" ? size.w / 2 : size.w;
    const rects = guideGrid({ x: 0, y: 0, width: modelW * dpr, height: size.h * dpr });
    return GUIDE_AXES.map((axis, i) => ({
      axis: axis.id,
      label: axis.label,
      rect: rects[i],
    }));
  }, [studio, size]);

  /** Chart lookup by palette index — shared by both views. */
  const chartByIndex = useMemo(() => {
    const map = new Map<number, { chart: UvChart; mesh: UvMesh }>();
    for (const geom of geoms) {
      const mesh = doc?.meshes[geom.meshId];
      if (!mesh) continue;
      for (const chart of geom.charts) map.set(chart.index, { chart, mesh });
    }
    return map;
  }, [geoms, doc]);

  const pickedInfo = pickedIsland === null ? null : chartByIndex.get(pickedIsland) ?? null;
  const pickedChart = pickedInfo?.chart ?? null;
  const pickedMesh = pickedInfo?.mesh ?? null;

  /** Load vertex positions (second, on-demand pass over the resource). */
  const loadPositions = useCallback(async (path: string) => {
    setGuideBusy(true);
    setError(null);
    try {
      const pos = await loadVertexPositions(path);
      const map = new Map<number, PositionMesh>();
      for (const m of pos.meshes) map.set(m.id, m);
      setPositions(map);
      if (!pos.meshes.some((m) => m.positions.length)) {
        setError("This resource has no decodable vertex positions.");
      }
    } catch (e) {
      setError(readableError(e));
    } finally {
      setGuideBusy(false);
    }
  }, []);

  /* Auto-fetch positions the first time the guide is opened. */
  const devPosFile = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("uvposfile")
    : null;
  const positionsLoaded = positions !== null;
  useEffect(() => {
    if (studio === "template" || positionsLoaded || guideBusy) return;
    if (devPosFile) {
      // DEV: a dumped positions document lets a plain browser render the guide.
      setGuideBusy(true);
      void fetch(devPosFile)
        .then((r) => r.json() as Promise<PositionDocument>)
        .then((d) => {
          const map = new Map<number, PositionMesh>();
          for (const m of d.meshes) map.set(m.id, m);
          setPositions(map);
        })
        .catch((e) => setError(readableError(e)))
        .finally(() => setGuideBusy(false));
      return;
    }
    if (!inTauri()) {
      setError(
        "The 3D guide needs the desktop app — vertex positions are decoded by the Rust parser."
      );
      return;
    }
    if (sourcePath) void loadPositions(sourcePath);
  }, [studio, positionsLoaded, guideBusy, devPosFile, sourcePath, loadPositions]);

  /** The cage colour has to contrast with what is underneath it. */
  const cageColour = useMemo(() => {
    if (background === "light") return "#0f172a";
    // A template is white-on-transparent, so its cage must be dark.
    return "#111827";
  }, [background]);

  /**
   * The livery template: every targeted island filled solid white over the
   * asset's texture tiles, with the cage on top. This is the file to paint on.
   */
  const templateOptions = useCallback(
    (width: number, height: number, forExport: boolean): UvDrawOptions => {
      const dpr = forExport ? 1 : window.devicePixelRatio || 1;
      return {
        width,
        height,
        isVisible,
        colorOf,
        chartFilter,
        colourMode: "single",
        tiles,
        style: "islands",
        background,
        lineWidth: cageWidth * dpr,
        flipU,
        flipV,
        grid,
        bounds,
        padding,
        template: true,
        cage: cage ? { mode: cageMode, colour: cageColour, width: cageWidth * dpr } : null,
        highlightChart: pickedIsland,
      };
    },
    [
      isVisible,
      colorOf,
      chartFilter,
      tiles,
      background,
      cageWidth,
      flipU,
      flipV,
      grid,
      bounds,
      padding,
      cage,
      cageMode,
      cageColour,
      pickedIsland,
    ]
  );

  /** Coloured reference sheet: which island is which part. */
  const sheetOptions = useCallback(
    (width: number, height: number, forExport: boolean): UvDrawOptions => {
      const dpr = forExport ? 1 : window.devicePixelRatio || 1;
      return {
        width,
        height,
        isVisible,
        colorOf,
        chartFilter,
        colourMode: "island",
        tiles,
        style: "islands",
        background: background === "transparent" ? "dark" : background,
        lineWidth: 1.5 * dpr,
        flipU,
        flipV,
        grid,
        bounds,
        padding,
        highlight,
        highlightChart: pickedIsland,
      };
    },
    [
      isVisible,
      colorOf,
      chartFilter,
      tiles,
      background,
      flipU,
      flipV,
      grid,
      bounds,
      padding,
      highlight,
      pickedIsland,
    ]
  );

  /* --- canvas sizing ---------------------------------------------------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* --- auto-fit whenever the framing inputs change ----------------------- */
  useEffect(() => {
    setView(null);
  }, [doc, flipU, flipV, bounds, chartFilter, highLodOnly, hiddenShaders]);

  /* --- preview draw, coalesced into one animation frame ------------------ */
  const previewView = useMemo(() => {
    const wrap = templateWrapRef.current ?? wrapRef.current;
    const w = wrap?.clientWidth ?? size.w;
    const h = wrap?.clientHeight ?? size.h;
    if (!w || !h) return null;
    const dpr = window.devicePixelRatio || 1;
    return view ?? computeView(geoms, templateOptions(w * dpr, h * dpr, false));
  }, [size, templateOptions, view, geoms]);

  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    if (!size.w || !size.h) return;
    if (studio === "template" && !previewView) return;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const dpr = window.devicePixelRatio || 1;

      if (studio !== "template") {
        const glCanvas = glCanvasRef.current;
        const overlay = overlayRef.current;
        const wrap = modelWrapRef.current;
        if (!glCanvas || !wrap) return;
        const w = Math.round(wrap.clientWidth * dpr);
        const h = Math.round(wrap.clientHeight * dpr);
        if (w < 2 || h < 2) return;
        if (overlay && (overlay.width !== w || overlay.height !== h)) {
          overlay.width = w;
          overlay.height = h;
        }
        if (glCanvas.width !== w || glCanvas.height !== h) {
          // Sizing a canvas reallocates and clears its WebGL drawing buffer, so
          // only do it when the size actually changed — resizing every frame
          // drops the frame that was just drawn.
          glCanvas.width = w;
          glCanvas.height = h;
          uploadedRef.current = null;
        }
        const drawOpts = { background, highlight: pickedIsland, shade: guideShade, labels: true };
        if (!rendererRef.current) {
          rendererRef.current = createGuideRenderer(glCanvas);
          if (!rendererRef.current && !glFailedRef.current) {
            glFailedRef.current = true;
            setError("This WebView could not create a WebGL context for the 3D guide.");
          }
        }
        const renderer = rendererRef.current;
        if (renderer && soup) {
          // The vertex buffers only change with the selection.
          if (uploadedRef.current !== soup) {
            renderer.upload(soup);
            uploadedRef.current = soup;
          }
          renderer.draw(guidePanels ?? [], drawOpts, guideZoom, guidePan.x, guidePan.y);
        }
        const octx = overlay?.getContext("2d");
        if (octx) drawGuideOverlay(octx, guidePanels ?? [], drawOpts);
        if (import.meta.env.DEV) {
          // Verification hook: browser checks read this to confirm the preview
          // really rendered the model (and with what state).
          (window as unknown as { __uvGuide?: unknown }).__uvGuide = {
            studio,
            panels: guidePanels?.length ?? 0,
            zoom: guideZoom,
            pan: [guidePan.x, guidePan.y],
            glSize: [glCanvas.width, glCanvas.height],
            hasRenderer: !!rendererRef.current,
            triangles: soup?.triangleCount ?? 0,
          };
        }
      }

      if (studio === "model") return;
      const canvas = canvasRef.current;
      const wrap = templateWrapRef.current;
      if (!canvas || !wrap) return;
      const w = Math.round(wrap.clientWidth * dpr);
      const h = Math.round(wrap.clientHeight * dpr);
      if (w < 2 || h < 2) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawUvScene(ctx, geoms, templateOptions(w, h, false), view ?? computeView(geoms, templateOptions(w, h, false)));
      if (import.meta.env.DEV) {
        (window as unknown as { __uvTemplate?: unknown }).__uvTemplate = {
          studio,
          size: [w, h],
          tiles: [tiles.u, tiles.v],
          target,
          cage,
        };
      }
    });
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [
    size,
    previewView,
    templateOptions,
    geoms,
    studio,
    guidePanels,
    guideZoom,
    guidePan,
    pickedIsland,
    background,
    guideShade,
    soup,
    tiles,
    target,
    cage,
    view,
  ]);

  /* --- wheel zoom (non-passive so the page never scrolls) ---------------- */
  useEffect(() => {
    // On the container, not the canvas: the canvas is swapped/hidden per view.
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      // In split view the wheel drives the model, which is the half you inspect.
      if (studio !== "template") {
        setGuideZoom((z) => Math.min(Math.max(z * factor, 0.2), 20));
        return;
      }
      if (!previewView) return;
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;
      const scale = Math.min(Math.max(previewView.scale * factor, 8), 400_000);
      const k = scale / previewView.scale;
      setView({
        scale,
        x: mx - k * (mx - previewView.x),
        y: my - k * (my - previewView.y),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [previewView, studio]);

  /* Release the GL program/buffers when the tool is closed.
     The canvas refs are deliberately left alone — React owns them, and React 18
     StrictMode runs this cleanup immediately after mount, so nulling the refs
     here would leave the guide permanently blank. */
  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      uploadedRef.current = null;
    };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      if (studio !== "template") {
        setGuideZoom((z) => Math.min(Math.max(z * factor, 0.2), 20));
        return;
      }
      if (!previewView || !size.w) return;
      const dpr = window.devicePixelRatio || 1;
      const cx = (size.w * dpr) / 2;
      const cy = (size.h * dpr) / 2;
      const scale = Math.min(Math.max(previewView.scale * factor, 8), 400_000);
      const k = scale / previewView.scale;
      setView({
        scale,
        x: cx - k * (cx - previewView.x),
        y: cy - k * (cy - previewView.y),
      });
    },
    [previewView, size, studio]
  );

  const fitAll = useCallback(() => {
    if (studio !== "template") {
      setGuideZoom(1);
      setGuidePan({ x: 0, y: 0 });
      return;
    }
    setView(null);
  }, [studio]);

  /**
   * Island under the pointer in the model view. Clicking one also makes its
   * material the UV target, which is how "paint just this part" starts.
   */
  const guideHit = useCallback(
    (clientX: number, clientY: number): number | null => {
      const canvas = glCanvasRef.current ?? canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer || !guidePanels) return null;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const px = (clientX - rect.left) * dpr;
      const py = (clientY - rect.top) * dpr;
      return renderer.pick(guidePanels, px, py, guideZoom, guidePan.x, guidePan.y);
    },
    [guidePanels, guideZoom, guidePan]
  );

  /** The island's material becomes the target ("paint this part"). */
  const targetFromIsland = useCallback(
    (island: number | null) => {
      if (island === null) return;
      const shader = chartByIndex.get(island)?.mesh.shader;
      if (shader === undefined) return;
      setTargetShader(shader);
      setTarget("selected");
      setHighlight(chartByIndex.get(island)?.mesh.id ?? null);
    },
    [chartByIndex]
  );

  /* --- load ------------------------------------------------------------- */
  const load = useCallback(async (path: string) => {
    if (!inTauri()) {
      setError(BROWSER_NOTICE);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const d = await loadUvDocument(path);
      setDoc(d);
      setSourcePath(path);
      setHiddenShaders(new Set());
      setHighlight(null);
      setExpanded(new Set());
      if (!d.meshes.some((m) => m.uvs.length)) {
        setError("No texture coordinates were found in this resource — nothing to map.");
      }
    } catch (e) {
      setDoc(null);
      setSourcePath(path);
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const importFile = useCallback(async () => {
    if (!inTauri()) {
      setError(BROWSER_NOTICE);
      return;
    }
    try {
      const path = await pickResourceFile();
      if (path) await load(path);
    } catch (e) {
      setError(readableError(e));
    }
  }, [load]);

  // DEV ONLY: `?uvdemo` loads a synthetic document so the renderer, material
  // list and export flow can be exercised in a plain browser.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    // `?uvfile=/name.json` loads a document dumped from the Rust parser
    // (`GT_DUMP_JSON=<app/public> cargo test --ignored uv_real_resources_parse`),
    // which is how the renderer is checked against real assets without Tauri.
    const file = params.get("uvfile");
    if (file) {
      void fetch(file)
        .then((r) => r.json() as Promise<UvDocument>)
        .then((d) => {
          setDoc(d);
          setSourcePath(d.path);
        })
        .catch((e) => setError(readableError(e)));
      return;
    }
    if (!params.has("uvdemo")) return;
    void import("./demoUv").then(({ demoUvDocument }) => {
      const demo = demoUvDocument();
      setDoc(demo);
      setSourcePath(demo.path);
    });
  }, []);

  /* --- export ----------------------------------------------------------- */
  const saveBytes = useCallback(async (bytes: Uint8Array, name: string) => {
    if (inTauri()) {
      try {
        // Static imports (top of file) on purpose: dynamically importing a Tauri
        // plugin makes the export depend on Vite's dep cache — a stale page then
        // fails with "Failed to fetch dynamically imported module".
        const target = await save({
          defaultPath: name,
          filters: [{ name: "PNG image", extensions: ["png"] }],
        });
        if (!target) return false;
        await writeFile(target, bytes);
        return true;
      } catch (e) {
        throw new Error(`could not write the PNG: ${readableError(e)}`);
      }
    }
    // Plain-browser fallback (dev shell) so the tool stays usable without Tauri.
    const blob = new Blob([bytes as unknown as BlobPart], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }, []);

  const baseName = doc ? doc.file_name.replace(/\.[^.]+$/, "") : "uv";

  /**
   * The deliverable: one pixel block per texture tile, white islands, cage on
   * top. This is the file that goes into Photoshop / paint.net / Krita.
   */
  const exportTemplate = useCallback(async () => {
    if (!geoms.length) return;
    setExporting("template");
    setStatus(null);
    try {
      const w = tileSize * Math.max(1, Math.round(tiles.u));
      const h = tileSize * Math.max(1, Math.round(tiles.v));
      const bytes = await renderUvPng(geoms, {
        ...templateOptions(w, h, true),
        // A file to paint on has no highlight state baked in.
        highlightChart: null,
        grid: false,
      });
      const ok = await saveBytes(bytes, `${baseName}_template_${w}x${h}.png`);
      if (ok) {
        setStatus(
          `Exported a ${w}×${h} template (${tiles.u}×${tiles.v} tile(s)) — white is the paintable area, the cage marks the mesh.`
        );
      }
    } catch (e) {
      setError(readableError(e));
    } finally {
      setExporting(null);
    }
  }, [geoms, tileSize, tiles, templateOptions, saveBytes, baseName]);

  /** Coloured reference: which island is which part of the model. */
  const exportSheet = useCallback(async () => {
    if (!geoms.length) return;
    setExporting("sheet");
    setStatus(null);
    try {
      const bytes = await renderUvPng(geoms, {
        ...sheetOptions(tileSize, tileSize, true),
        highlight: null,
        highlightChart: null,
      });
      const ok = await saveBytes(bytes, `${baseName}_uv_reference_${tileSize}.png`);
      if (ok) setStatus(`Exported a colour reference at ${tileSize}×${tileSize}.`);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setExporting(null);
    }
  }, [geoms, tileSize, sheetOptions, saveBytes, baseName]);

  /* --- export the orthographic livery guide ----------------------------- */
  const exportGuide = useCallback(async () => {
    const glCanvas = glCanvasRef.current;
    const renderer = rendererRef.current;
    if (!soup || !glCanvas || !renderer) {
      setError("Open the 3D guide once (so the renderer is live), then export.");
      return;
    }
    setExporting("guide");
    setStatus(null);
    const prevW = glCanvas.width;
    const prevH = glCanvas.height;
    try {
      // Render into the *on-screen* GL canvas at the export resolution: a canvas
      // in the document is the only one that reliably yields pixels, and the
      // preview size is restored (and redrawn) right after.
      glCanvas.width = tileSize;
      glCanvas.height = tileSize;
      uploadedRef.current = null;
      const rects = guideGrid({ x: 0, y: 0, width: tileSize, height: tileSize });
      const panels: GuidePanel[] = GUIDE_AXES.map((axis, i) => ({
        axis: axis.id,
        label: axis.label,
        rect: rects[i],
      }));
      const drawOpts = { background, highlight: null, shade: guideShade, labels: true };
      renderer.upload(soup);
      renderer.draw(panels, drawOpts, 1, 0, 0);

      // A WebGL canvas cannot host a 2D context, so the model, then the label
      // overlay, are composited into a plain 2D canvas for the file.
      const flat = document.createElement("canvas");
      flat.width = tileSize;
      flat.height = tileSize;
      const fctx = flat.getContext("2d");
      if (!fctx) {
        setError("Could not compose the guide export.");
        return;
      }
      fctx.drawImage(glCanvas, 0, 0);
      const overlay = document.createElement("canvas");
      overlay.width = tileSize;
      overlay.height = tileSize;
      const octx = overlay.getContext("2d");
      if (octx) {
        drawGuideOverlay(octx, panels, drawOpts);
        fctx.drawImage(overlay, 0, 0);
      }
      const bytes = await encodePng(flat);
      const ok = await saveBytes(bytes, `${baseName}_livery_guide_${tileSize}.png`);
      if (ok) setStatus(`Exported the livery guide at ${tileSize}×${tileSize}.`);
    } catch (e) {
      setError(readableError(e));
    } finally {
      // Restore the preview size; the next frame re-uploads and redraws.
      glCanvas.width = prevW;
      glCanvas.height = prevH;
      uploadedRef.current = null;
      setExporting(null);
    }
  }, [soup, tileSize, background, guideShade, saveBytes, baseName]);

  /* --- material list ---------------------------------------------------- */
  const listedMaterials = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (!needle) return true;
      return (
        m.label.toLowerCase().includes(needle) ||
        String(m.shader).includes(needle) ||
        m.meshes.some((mesh) => mesh.lod.includes(needle))
      );
    });
  }, [materials, search]);

  /** Select a material as the UV target (used by the markers and the guide). */
  const targetMaterial = useCallback((shader: number) => {
    setTargetShader(shader);
    setTarget("selected");
  }, []);

  const toggleShader = (shader: number) =>
    setHiddenShaders((prev) => {
      const next = new Set(prev);
      if (next.has(shader)) next.delete(shader);
      else next.add(shader);
      return next;
    });

  const hideAllExcept = (shader: number) =>
    setHiddenShaders(new Set(materials.filter((m) => m.shader !== shader).map((m) => m.shader)));

  const toggleExpanded = (shader: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(shader)) next.delete(shader);
      else next.add(shader);
      return next;
    });

  const shownMeshes = geoms.filter((g) => isVisible(g.meshId)).length;
  const shownTriangles = geoms
    .filter((g) => isVisible(g.meshId))
    .reduce((sum, g) => sum + g.triangleCount, 0);
  const shownCharts = geoms
    .filter((g) => isVisible(g.meshId))
    .reduce(
      (sum, g) => sum + g.charts.filter((c) => chartVisible(c, chartFilter)).length,
      0
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-800 bg-gray-900/40 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-100">UV Map Generator</h2>
          <p className="truncate text-2xs text-gray-500">
            Read a drawable's vertices — UV sheet as PNG, plus an orthographic livery guide.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {doc && (
            <span className="flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800/70 px-2 py-0.5 text-2xs text-gray-300">
              <Ruler className="h-3 w-3 text-accent" />
              {doc.file_name}
              <span className="text-gray-500">· v0x{doc.version.toString(16).toUpperCase()}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => void importFile()}
            disabled={busy}
            title={
              browserPreview
                ? "Needs the desktop app — run npm run tauri dev (dev.bat)"
                : "Pick a .ydr / .yft drawable or fragment"
            }
            className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            {doc ? "Import another…" : "Import .ydr / .yft"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Source + materials */}
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-gray-800 bg-gray-900/50">
          {!doc && !error && (
            <div className="flex flex-col gap-2 p-4 text-xs leading-relaxed text-gray-400">
              <p>
                Pick a <span className="text-gray-200">.ydr</span> (drawable) or{" "}
                <span className="text-gray-200">.yft</span> (fragment) from a FiveM stream
                folder or an SP mod.
              </p>
              <p>
                Each material is listed separately — turn one on to isolate a livery or paint
                chart. Nothing is written back to the file.
              </p>
              <p className="text-gray-500">
                Gen8 / legacy assets are supported (version 0xA2 / 0xA5). GTA V Enhanced (gen9)
                drawables are detected, not mis-parsed.
              </p>
              {browserPreview && (
                <p className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2 text-amber-300/90">
                  Browser preview: importing a file needs the desktop app. Use{" "}
                  <span className="text-amber-200">npm run tauri dev</span> (or{" "}
                  <span className="text-amber-200">dev.bat</span>) to import real resources —{" "}
                  <span className="text-amber-200">?uvdemo</span> exercises the renderer with a
                  built-in test pattern.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="m-3 flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          {doc && (
            <>
              <Section title="Workbench">
                <Segmented
                  value={studio}
                  onChange={setStudio}
                  options={[
                    {
                      value: "template",
                      label: "Template",
                      title:
                        "The livery template: white islands over the asset's texture tiles, cage on top — paint on this",
                    },
                    {
                      value: "model",
                      label: "Model",
                      title:
                        "The model projected front / side / top / rear, islands in their template colours",
                    },
                    {
                      value: "split",
                      label: "Split",
                      title: "Template and model side by side, so you can see which part you are painting",
                    },
                  ]}
                />
              </Section>

              <Section title="UV target">
                <Segmented
                  value={target}
                  onChange={setTarget}
                  options={[
                    { value: "all", label: "All", title: "Every material in the asset" },
                    {
                      value: "livery",
                      label: "Paint",
                      title: "Only paint / livery / sign / decal materials",
                    },
                    {
                      value: "selected",
                      label: "One",
                      title: "Only the material picked below (or clicked in the model)",
                    },
                  ]}
                />
                <div className="mt-2">
                  <Segmented
                    value={uvChannel}
                    onChange={setUvChannel}
                    options={[
                      { value: "all", label: "UV 0+1", title: "Use both texture-coordinate channels" },
                      { value: 0, label: "UV 0", title: "Only meshes on TexCoord0" },
                      { value: 1, label: "UV 1", title: "Only meshes on TexCoord1" },
                    ]}
                  />
                </div>
                <p className="mt-2 text-2xs leading-relaxed text-gray-500">
                  {target === "selected"
                    ? targetShader === null
                      ? "Pick a material below — the template will contain only that part."
                      : `Targeting ${
                          materials.find((m) => m.shader === targetShader)?.label ??
                          `#${targetShader}`
                        } — the template will contain only that part.`
                    : target === "livery"
                      ? "Only materials whose shader name looks like a paint / livery / sign / decal layer."
                      : "Every material. Isolate a part when you only want to paint one thing."}
                </p>
              </Section>

              <Section title="Resource">
                <p title={sourcePath} className="mb-1.5 truncate text-2xs text-gray-500">
                  {sourcePath}
                </p>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-2xs">
                  <dt className="text-gray-500">Type</dt>
                  <dd className="text-gray-300">
                    .{doc.kind}
                    {doc.gen9 ? " (gen9)" : ""}
                  </dd>
                  <dt className="text-gray-500">Materials</dt>
                  <dd className="text-gray-300">{materials.length}</dd>
                  <dt className="text-gray-500">Meshes</dt>
                  <dd className="text-gray-300">
                    {meshes.length}
                    {geoms.length !== meshes.length && (
                      <span className="text-gray-500"> ({geoms.length} with UVs)</span>
                    )}
                  </dd>
                  <dt className="text-gray-500">Sheet</dt>
                  <dd className="text-gray-300">
                    {tiles.u} × {tiles.v} tile{tiles.u * tiles.v === 1 ? "" : "s"}
                  </dd>
                  <dt className="text-gray-500">Triangles</dt>
                  <dd className="text-gray-300">{doc.total_triangles.toLocaleString()}</dd>
                  <dt className="text-gray-500">Sys / gfx</dt>
                  <dd className="text-gray-300">
                    {(doc.system_size * MB).toFixed(2)} / {(doc.graphics_size * MB).toFixed(2)} MB
                  </dd>
                </dl>
              </Section>

              {doc.warnings.length > 0 && (
                <Section title={`Notes (${doc.warnings.length})`}>
                  <ul className="flex flex-col gap-1 text-2xs text-amber-300/90">
                    {doc.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <FileWarning className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="min-w-0 break-words">{w}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section
                title={`Materials (${listedMaterials.length})`}
                right={
                  <>
                    <button
                      type="button"
                      title="Show only materials whose shader name suggests a livery, paint, sign or decal"
                      onClick={() =>
                        setHiddenShaders(
                          new Set(materials.filter((m) => !m.livery).map((m) => m.shader))
                        )
                      }
                      className="rounded px-1 py-0.5 text-2xs text-accent hover:bg-gray-800"
                    >
                      Livery
                    </button>
                    <button
                      type="button"
                      title="Show every material"
                      onClick={() => setHiddenShaders(new Set())}
                      className="rounded px-1 py-0.5 text-2xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      title="Hide every material"
                      onClick={() => setHiddenShaders(new Set(materials.map((m) => m.shader)))}
                      className="rounded px-1 py-0.5 text-2xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                    >
                      None
                    </button>
                  </>
                }
              >
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter materials…"
                  className="mb-2 w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                />
                <div className="flex flex-col gap-0.5">
                  {listedMaterials.map((material) => {
                    const on = !hiddenShaders.has(material.shader);
                    const colour = colorOf(material.meshes[0].id);
                    const isOpen = expanded.has(material.shader);
                    const highlighted = material.meshes.some((m) => m.id === highlight);
                    return (
                      <div key={material.shader}>
                        <div
                          className={`group flex items-center gap-1.5 rounded px-1 py-0.5 ${
                            highlighted
                              ? "bg-accent/15 ring-1 ring-inset ring-accent/40"
                              : "hover:bg-gray-800/60"
                          }`}
                        >
                          <button
                            type="button"
                            title={on ? "Hide this material" : "Show this material"}
                            onClick={() => toggleShader(material.shader)}
                            className={`shrink-0 ${on ? "text-gray-300" : "text-gray-600"}`}
                          >
                            {on ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{
                              backgroundColor: material.isMappable ? colour : "#64748b",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => toggleExpanded(material.shader)}
                            title={`${material.meshes.length} mesh(es) · shader index ${material.shader}`}
                            className="flex min-w-0 flex-1 items-center gap-1 text-left"
                          >
                            <span className="min-w-0 flex-1 truncate text-2xs text-gray-300">
                              {material.label}
                            </span>
                            {material.livery && (
                              <span
                                title="Shader name suggests a livery / paint / sign layer"
                                className="shrink-0 rounded bg-accent/20 px-1 text-2xs text-accent"
                              >
                                livery
                              </span>
                            )}
                            <span className="shrink-0 text-2xs tabular-nums text-gray-500">
                              {material.meshes.length}×
                            </span>
                          </button>
                          <button
                            type="button"
                            title="Show only this material, and target it for the template"
                            onClick={() => {
                              hideAllExcept(material.shader);
                              targetMaterial(material.shader);
                            }}
                            className="shrink-0 text-gray-500 opacity-0 transition group-hover:opacity-100 hover:text-accent"
                          >
                            <Wand2 className="h-3 w-3" />
                          </button>
                        </div>
                        {isOpen && (
                          <ul className="mb-1 ml-6 border-l border-gray-800 pl-2">
                            {material.meshes.map((mesh) => {
                              const geom = geometryByMesh.get(mesh.id);
                              const focusable = geom !== undefined;
                              return (
                                <li key={mesh.id}>
                                  <button
                                    type="button"
                                    disabled={!focusable}
                                    onClick={() =>
                                      setHighlight((h) => (h === mesh.id ? null : mesh.id))
                                    }
                                    title={
                                      geom
                                        ? `${geom.charts.length} UV island(s), ${geom.triangleCount} triangles`
                                        : "no UV data"
                                    }
                                    className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-2xs hover:bg-gray-800/60 ${
                                      highlight === mesh.id ? "text-accent" : "text-gray-400"
                                    } ${focusable ? "" : "cursor-not-allowed opacity-50"}`}
                                  >
                                    <span className="truncate">#{mesh.id + 1}</span>
                                    <span className="text-gray-500">{mesh.lod}</span>
                                    <span className="ml-auto tabular-nums text-gray-500">
                                      {geom ? `${geom.charts.length}ch` : "—"}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {listedMaterials.length === 0 && (
                    <p className="py-2 text-2xs text-gray-500">No materials match that filter.</p>
                  )}
                </div>
              </Section>
            </>
          )}
        </aside>

        {/* Viewport */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div
            ref={wrapRef}
            className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-gray-950 active:cursor-grabbing"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              if (studio !== "template") {
                dragRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  vx: guidePan.x,
                  vy: guidePan.y,
                  moved: false,
                };
                return;
              }
              if (!previewView) return;
              dragRef.current = {
                x: e.clientX,
                y: e.clientY,
                vx: previewView.x,
                vy: previewView.y,
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              const dpr = window.devicePixelRatio || 1;
              const bounds = e.currentTarget.getBoundingClientRect();
              if (studio !== "template") {
                const d = dragRef.current;
                if (d) {
                  if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
                  if (d.moved) {
                    setGuidePan({
                      x: d.vx + (e.clientX - d.x) * dpr,
                      y: d.vy + (e.clientY - d.y) * dpr,
                    });
                  }
                }
                if (guidePanels && soup) {
                  const px = (e.clientX - bounds.left) * dpr;
                  const py = (e.clientY - bounds.top) * dpr;
                  const i = guidePanelAt(guidePanels, px, py);
                  if (i < 0) setCursorWorld(null);
                  else {
                    setCursorWorld(
                      screenToWorld(
                        guidePanels[i],
                        soup.bounds[guidePanels[i].axis],
                        px,
                        py,
                        guideZoom,
                        guidePan.x,
                        guidePan.y
                      )
                    );
                  }
                }
                return;
              }
              if (dragRef.current && previewView) {
                const d = dragRef.current;
                setView({
                  scale: previewView.scale,
                  x: d.vx + (e.clientX - d.x) * dpr,
                  y: d.vy + (e.clientY - d.y) * dpr,
                });
              }
              if (previewView) {
                setCursorUv(
                  pixelToUv(
                    (e.clientX - bounds.left) * dpr,
                    (e.clientY - bounds.top) * dpr,
                    previewView,
                    { flipU, flipV }
                  )
                );
              }
            }}
            onPointerUp={(e) => {
              const d = dragRef.current;
              dragRef.current = null;
              e.currentTarget.releasePointerCapture(e.pointerId);
              if (studio === "model" && d && !d.moved) {
                // Clicking a part identifies the island AND makes its material the
                // UV target, which is how "paint just this" starts.
                const island = guideHit(e.clientX, e.clientY);
                setPickedIsland(island);
                targetFromIsland(island);
              }
            }}
            onPointerLeave={() => {
              setCursorUv(null);
              setCursorWorld(null);
            }}
            onDoubleClick={() => fitAll()}
          >
            {/* Two surfaces, each in its own wrapper so split view can give them
                half each. The model is a depth-buffered WebGL canvas plus a 2D
                label overlay; the template is plain 2D. Both stay in the document
                because a canvas that is not attached renders unreliably, and a
                canvas can only ever host one context type. */}
            <div className="absolute inset-0 flex">
              <div
                ref={modelWrapRef}
                className={`relative min-h-0 min-w-0 flex-1 ${
                  studio === "template" ? "hidden" : ""
                }`}
              >
                <canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
                <canvas
                  ref={overlayRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              </div>
              <div
                ref={templateWrapRef}
                className={`relative min-h-0 min-w-0 flex-1 ${
                  studio === "model" ? "hidden" : ""
                }`}
              >
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
              </div>
            </div>

            {/* Floating toolbar */}
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900/85 p-1 backdrop-blur">
              <IconBtn title="Zoom in" onClick={() => zoomBy(1.25)}>
                <Plus className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn title="Zoom out" onClick={() => zoomBy(0.8)}>
                <Minus className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn title="Fit the layout (double-click the canvas)" onClick={() => fitAll()}>
                <Maximize2 className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title="Flip V (many DCC tools use the opposite V axis)"
                active={flipV}
                onClick={() => setFlipV((v) => !v)}
              >
                <span className="px-0.5 text-2xs font-semibold">V</span>
              </IconBtn>
              <IconBtn title="Flip U" active={flipU} onClick={() => setFlipU((v) => !v)}>
                <span className="px-0.5 text-2xs font-semibold">U</span>
              </IconBtn>
              <IconBtn title="Show grid" active={grid} onClick={() => setGrid((v) => !v)}>
                <span className="px-0.5 text-2xs font-semibold">#</span>
              </IconBtn>
            </div>
            {doc && !geoms.length && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-500/80" />
                <p className="max-w-sm text-sm text-gray-400">
                  This resource has no mappable texture coordinates.
                </p>
              </div>
            )}

            {doc && (
              <div className="absolute bottom-2 left-2 rounded border border-gray-700/70 bg-gray-900/85 px-2 py-1 text-2xs tabular-nums text-gray-400 backdrop-blur">
                {studio !== "template"
                  ? cursorWorld
                    ? `${cursorWorld[0].toFixed(2)}, ${cursorWorld[1].toFixed(2)} m`
                    : "click a part to target it · drag to pan · wheel to zoom"
                  : cursorUv
                    ? `U ${cursorUv[0].toFixed(4)}  V ${cursorUv[1].toFixed(4)}`
                    : "drag to pan · wheel to zoom · double-click to fit"}
                {studio !== "template" && guidePanels && (
                  <span className="ml-3 text-gray-500">
                    {guidePanels.length} panels ·{" "}
                    {pickedIsland === null ? "no island picked" : `island #${pickedIsland}`}
                  </span>
                )}
                {studio !== "model" && previewView && (
                  <span className="ml-3 text-gray-500">
                    {shownMeshes} meshes · {shownCharts} islands ·{" "}
                    {shownTriangles.toLocaleString()} tris ·{" "}
                    {previewView.scale < 1
                      ? previewView.scale.toFixed(3)
                      : Math.round(previewView.scale)}
                    ×
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Template + export */}
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-gray-800 bg-gray-900/50">
          {studio !== "model" && (
            <Section title="Template">
              <p className="mb-2 text-2xs leading-relaxed text-gray-500">
                White islands on transparency at {tileSize}px per texture tile
                {tiles.u * tiles.v > 1 ? ` (${tiles.u}×${tiles.v} tiles)` : ""} — the sheet you
                paint a livery onto.
              </p>
              <CheckRow
                checked={cage}
                onChange={setCage}
                label="Cage"
                hint="Draw the mesh over the paint area: island borders, or every triangle"
              />
              {cage && (
                <div className="mt-2">
                  <Segmented
                    value={cageMode}
                    onChange={setCageMode}
                    options={[
                      { value: "seam", label: "Islands", title: "Island borders only (UV seams)" },
                      { value: "wire", label: "Wire", title: "Every triangle edge" },
                    ]}
                  />
                </div>
              )}
              <div className="mt-2">
                <Segmented
                  value={background}
                  onChange={setBackground}
                  options={[
                    { value: "transparent", label: "No bg", title: "Transparent — the template format" },
                    { value: "dark", label: "Dark", title: "Dark preview background" },
                    { value: "light", label: "Light", title: "Light preview background" },
                  ]}
                />
              </div>
            </Section>
          )}

          {studio === "template" && (
            <>
              <Section title="Layout">
                <Slider
                  label="Padding"
                  min={0}
                  max={0.25}
                  step={0.01}
                  value={padding}
                  onChange={setPadding}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                {cage && (
                  <Slider
                    label="Cage width"
                    min={0.5}
                    max={6}
                    step={0.5}
                    value={cageWidth}
                    onChange={setCageWidth}
                    format={(v) => `${v}px`}
                  />
                )}
                <div className="mt-2 flex flex-col gap-1">
                  <CheckRow
                    checked={highLodOnly}
                    onChange={setHighLodOnly}
                    label="High LOD only"
                    hint="Hide the medium / low / very-low LOD copies"
                  />
                  <CheckRow
                    checked={filterSmall}
                    onChange={setFilterSmall}
                    label="Hide tiny islands"
                    hint="Drops islands under 0.05% of the sheet (rivets, badges)"
                  />
                  <CheckRow
                    checked={dropOutliers}
                    onChange={setDropOutliers}
                    label="Drop far outliers"
                    hint="Drops islands more than 2 tiles off the sheet — world-mapped detail UVs that cannot be painted"
                  />
                  <CheckRow
                    checked={grid}
                    onChange={setGrid}
                    label="Show tile grid"
                    hint="Preview only — the export never bakes the grid"
                  />
                  <CheckRow
                    checked={flipV}
                    onChange={setFlipV}
                    label="Flip V"
                    hint="Many painting tools use the opposite V axis"
                  />
                  <CheckRow
                    checked={flipU}
                    onChange={setFlipU}
                    label="Flip U"
                    hint="Mirror the layout horizontally"
                  />
                </div>
                <div className="mt-2">
                  <Segmented
                    value={bounds}
                    onChange={setBounds}
                    options={[
                      {
                        value: "sheet",
                        label: "Sheet",
                        title: "Frame the texture tile(s) the asset uses",
                      },
                      { value: "fit", label: "Fit all", title: "Frame every visible island" },
                    ]}
                  />
                </div>
              </Section>
            </>
          )}

          {studio !== "template" && (
            <Section title="Livery guide">
              {guideBusy && (
                <p className="mb-2 flex items-center gap-2 text-2xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Decoding vertex positions…
                </p>
              )}
              <p className="mb-2 text-2xs leading-relaxed text-gray-500">
                The model seen along each axis, depth-tested so nearer panels hide the ones
                behind them, every UV island in its sheet colour. Click a panel to highlight
                that island — the same colour marks it on the UV sheet.
              </p>
              <p className="mb-2 rounded border border-gray-700/70 bg-gray-900/60 px-2 py-1 text-2xs text-gray-500">
                WebGL renderer · {soup ? `${soup.triangleCount.toLocaleString()} tris` : "no positions"}
                {soup ? ` · ${soup.meshCount} meshes` : ""}
              </p>
              <CheckRow
                checked={guideShade}
                onChange={setGuideShade}
                label="Depth shading"
                hint="Fade islands by distance so the form reads in 3D"
              />
              <div className="mt-2 rounded-md border border-gray-700/70 bg-gray-900/60 p-2 text-2xs">
                {pickedIsland === null ? (
                  <span className="text-gray-500">
                    No island picked — click a panel on the canvas.
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: MESH_PALETTE[pickedIsland % MESH_PALETTE.length],
                      }}
                    />
                    <span className="min-w-0 text-gray-300">
                      Island <span className="tabular-nums">#{pickedIsland}</span>
                      {pickedMesh && (
                        <span className="text-gray-500">
                          {" "}· {pickedMesh.lod} LOD · mesh #{pickedMesh.id + 1}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPickedIsland(null)}
                      className="ml-auto shrink-0 text-gray-500 hover:text-gray-200"
                      title="Clear the highlight"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {pickedChart && (
                  <p className="mt-1 tabular-nums text-gray-500">
                    U {pickedChart.bounds[0].toFixed(3)}–{pickedChart.bounds[2].toFixed(3)} · V{" "}
                    {pickedChart.bounds[1].toFixed(3)}–{pickedChart.bounds[3].toFixed(3)} ·{" "}
                    {pickedChart.triangleCount.toLocaleString()} tris
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={!guidePanels || exporting !== null}
                onClick={() => void exportGuide()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting === "guide" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export guide (PNG)
              </button>
              {status && (
                <p className="mt-2 rounded border border-green-900/60 bg-green-950/40 px-2 py-1 text-2xs text-green-300">
                  {status}
                </p>
              )}
            </Section>
          )}

          <Section title="Export">
            <Segmented
              value={tileSize}
              onChange={setTileSize}
              options={[
                { value: 1024, label: "1024" },
                { value: 2048, label: "2048" },
                { value: 4096, label: "4096" },
              ]}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-300">
              <span className="text-gray-500">Tile</span>
              <input
                type="number"
                min={128}
                max={8192}
                step={128}
                value={tileSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) {
                    setTileSize(Math.min(Math.max(Math.round(v), 128), 8192));
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs tabular-nums text-gray-200 focus:border-accent focus:outline-none"
              />
              <span className="text-gray-500">px</span>
            </label>
            <p className="mt-1 text-2xs text-gray-500">
              Template output: {tileSize * Math.max(1, Math.round(tiles.u))}×
              {tileSize * Math.max(1, Math.round(tiles.v))} px
            </p>

            <button
              type="button"
              disabled={!geoms.length || exporting !== null}
              onClick={() => void exportTemplate()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === "template" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Palette className="h-4 w-4" />
              )}
              Export template (PNG)
            </button>
            <button
              type="button"
              disabled={!geoms.length || exporting !== null}
              onClick={() => void exportSheet()}
              title="The same layout with one colour per island — a key for which island is which part"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === "sheet" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export colour reference (PNG)
            </button>
            <p className="mt-2 text-2xs leading-relaxed text-gray-500">
              {shownMeshes} meshes · {shownCharts} islands ·{" "}
              {background === "transparent" ? "alpha" : background} background
              {target !== "all" ? " · target filtered" : ""}
            </p>
            {status && (
              <p className="mt-2 rounded border border-green-900/60 bg-green-950/40 px-2 py-1 text-2xs text-green-300">
                {status}
              </p>
            )}
          </Section>

          <Section title="How to read it">
            <ul className="flex flex-col gap-1.5 text-2xs leading-relaxed text-gray-400">
              <li>
                The template is <span className="text-gray-200">white islands on transparency</span>{" "}
                at one pixel block per texture tile, so painting it lines up with the .ytd. Paint
                inside the white.
              </li>
              <li>
                The <span className="text-gray-200">cage</span> is the mesh over that paint area:
                island borders (UV seams) or every triangle edge.
              </li>
              <li>
                UVs beyond the 0–1 square are tiled or world-mapped — the tile grid shows how many
                tiles the asset uses.
              </li>
              <li>
                Use <span className="text-gray-200">Split</span> to see the template next to the
                model; clicking a part in the model sets it as the UV target.
              </li>
              <li>
                UVs are shown in the game's stored orientation. Toggle{" "}
                <span className="text-gray-200">V</span> if your painting tool shows them mirrored.
              </li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-6 w-6 items-center justify-center rounded ${
        active ? "bg-accent/25 text-accent" : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
      }`}
    >
      {children}
    </button>
  );
}
