import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpenText, Car, FolderOpen, Gauge, Hammer, LayoutGrid, Loader2 } from "lucide-react";
import FilterBar from "./ui/FilterBar";
import Navbar, { type AppSection } from "./ui/Navbar";
import SubNavbar, { type SubNavItem } from "./ui/SubNavbar";
import Sidebar, { type EditorMode } from "./ui/Sidebar";
import StatusBar from "./ui/StatusBar";
import Toast, { type ToastData } from "./ui/Toast";
import Toolbar from "./ui/Toolbar";
import GlossaryView from "./features/handling/GlossaryView";
import CreatorToolsView from "./features/creator/CreatorToolsView";
import AssetGlossaryView from "./features/creator/AssetGlossaryView";
import HomeView from "./features/home/HomeView";
import DashboardView from "./features/dashboard/DashboardView";
import SingleHandlingEditor from "./features/handling/SingleHandlingEditor";
import VehicleTable from "./features/handling/VehicleTable";
import {
  demoCarcols,
  demoCarvariations,
  demoScan,
  demoVehiclelayouts,
  demoVehicleweapons,
  demoVehicles,
  demoWeaponanimations,
  demoWeaponarchetypes,
  demoWeapons,
  demoPedpersonality,
} from "./features/handling/demoData";
import { paramHintWeapon } from "./features/handling/weaponHints";
import { glossaryHint } from "./features/handling/glossaries/registry";
import {
  scanCarcols,
  scanCarvariations,
  scanFolder,
  scanPedpersonality,
  scanVehiclelayouts,
  scanVehicleweapons,
  scanVehicles,
  scanWeaponanimations,
  scanWeaponarchetypes,
  scanWeapons,
  updateCarcolsFiles,
  updateCarvariationsFiles,
  updateFiles,
  updatePedpersonalityFiles,
  updateVehiclelayoutsFiles,
  updateVehicleweaponsFiles,
  updateVehicleFiles,
  updateWeaponanimationsFiles,
  updateWeaponarchetypesFiles,
  updateWeaponFiles,
} from "./shared/api";
import { useMetaDomain, type Notify } from "./shared/useMetaDomain";
import { version as APP_VERSION } from "../package.json";

/** Which live meta panel the Home editors are showing. */
type PanelId =
  | "handling"
  | "vehicles"
  | "carcols"
  | "carvariations"
  | "vehiclelayouts"
  | "vehicleweapons"
  | "veh_weaponarchetypes"
  | "weaponanimations"
  | "weaponarchetypes"
  | "pedpersonality"
  | "weapons";

/** Weapon table labels (folder column shows the relative .meta file path). */
const WEAPON_LABELS = {
  folder: "File",
  type: "Slot",
  klass: "Group",
  name: "Name",
};

/** Vehicle-model table labels (rel file path / friendly type / friendly class / modelName). */
const VEHICLE_LABELS = {
  folder: "File",
  type: "Type",
  klass: "Class",
  name: "Name",
};

/** carcols table labels (file / Kind / kit-group / structural entry path). */
const CARCOLS_LABELS = {
  folder: "File",
  type: "Kind",
  klass: "Group",
  name: "Item",
};

/** vehicleweapons table labels (file / Kind / group / weapon Name). */
const VEHICLEWEAPONS_LABELS = {
  folder: "File",
  type: "Kind",
  klass: "Group",
  name: "Name",
};

/** weaponanimations table labels (file / personality Set / Weapon / entry path). */
const WEAPONANIMATIONS_LABELS = {
  folder: "File",
  type: "Set",
  klass: "Weapon",
  name: "Entry",
};

/** weaponarchetypes table labels (file / Model / (blank) / entry path). */
const WEAPONARCHETYPES_LABELS = {
  folder: "File",
  type: "Model",
  klass: "",
  name: "Entry",
};

/** pedpersonality table labels (file / Kind / scenario-personality Set / entry path). */
const PEDPERSONALITY_LABELS = {
  folder: "File",
  type: "Kind",
  klass: "Set",
  name: "Entry",
};

/** metas without guides yet — suppress the handling fallback. */
const noHint = () => undefined;

/** Per-panel configuration (copy, labels, hints) so adding a meta is additive. */
interface DomainCfg {
  /** Plural noun for the status bar / filter copy. */
  noun: string;
  /** Short noun for the “Scanning …” line. */
  nounShort: string;
  labels?: { folder: string; type: string; klass: string; name: string };
  hintFor?: (col: string, kind?: string) => string | undefined;
  metaFile: string;
  coreLabel: string;
  note?: string;
  pickText: string;
}

const PANELS: Record<PanelId, DomainCfg> = {
  handling: {
    noun: "vehicles",
    nounShort: "vehicle",
    metaFile: "handling.meta",
    coreLabel: "Vehicle",
    pickText: "Select the folder that contains your FiveM vehicle resources.",
  },
  vehicles: {
    noun: "vehicles",
    nounShort: "vehicle model",
    labels: VEHICLE_LABELS,
    hintFor: noHint,
    metaFile: "vehicles.meta",
    coreLabel: "Vehicle",
    note: "One vehicle model (modelName) in one vehicles.meta — edits update only that model.",
    pickText:
      "Select a folder that contains your vehicle resources (vehicles.meta / vehicles_*.meta, any layout).",
  },
  carcols: {
    noun: "entries",
    nounShort: "car-colour",
    labels: CARCOLS_LABELS,
    hintFor: noHint,
    metaFile: "carcols.meta",
    coreLabel: "Part",
    note: "One mod part / colour / list entry in one carcols.meta — edits update only that entry.",
    pickText:
      "Select a folder that contains your vehicle resources (carcols.meta / carcols*.meta, any layout).",
  },
  carvariations: {
    noun: "entries",
    nounShort: "car-variation",
    labels: CARCOLS_LABELS,
    hintFor: noHint,
    metaFile: "carvariations.meta",
    coreLabel: "Entry",
    note: "One variation entry (model, colour, kit, plate…) in one carvariations.meta — edits update only that entry.",
    pickText:
      "Select a folder that contains your vehicle resources (carvariations.meta / carvariations*.meta, any layout).",
  },
  vehiclelayouts: {
    noun: "entries",
    nounShort: "vehicle-layout",
    labels: CARCOLS_LABELS,
    hintFor: noHint,
    metaFile: "vehiclelayouts.meta",
    coreLabel: "Entry",
    note: "One layout entry (seat, entry point, extra point…) in one vehiclelayouts.meta — edits update only that entry.",
    pickText:
      "Select a folder that contains your vehicle resources (vehiclelayouts.meta / vehiclelayouts*.meta, any layout).",
  },
  vehicleweapons: {
    noun: "entries",
    nounShort: "vehicle-weapon",
    labels: VEHICLEWEAPONS_LABELS,
    hintFor: noHint,
    metaFile: "vehicleweapons.meta",
    coreLabel: "Entry",
    note: "One mounted weapon / ammo / weapon-data entry in one vehicleweapons*.meta — edits update only that entry.",
    pickText:
      "Select a folder that contains your vehicle resources (vehicleweapons*.meta, any layout).",
  },
  veh_weaponarchetypes: {
    noun: "entries",
    nounShort: "weapon-archetype",
    labels: WEAPONARCHETYPES_LABELS,
    hintFor: noHint,
    metaFile: "weaponarchetypes.meta",
    coreLabel: "Entry",
    note: "One vehicle-mounted weapon model archetype in one weaponarchetypes.meta — edits update only that entry.",
    pickText:
      "Select a folder that contains your vehicle resources (weaponarchetypes.meta, any layout).",
  },
  weaponanimations: {
    noun: "entries",
    nounShort: "weapon-anim",
    labels: WEAPONANIMATIONS_LABELS,
    hintFor: noHint,
    metaFile: "weaponanimations.meta",
    coreLabel: "Entry",
    note: "One weapon × personality animation set in one weaponanimations.meta — edits update only that entry.",
    pickText:
      "Select a folder that contains your weapon resources (weaponanimations.meta / weaponanimations*.meta, any layout).",
  },
  weaponarchetypes: {
    noun: "entries",
    nounShort: "weapon-archetype",
    labels: WEAPONARCHETYPES_LABELS,
    hintFor: noHint,
    metaFile: "weaponarchetypes.meta",
    coreLabel: "Entry",
    note: "One weapon model archetype in one weaponarchetypes.meta — edits update only that entry.",
    pickText:
      "Select a folder that contains your weapon resources (weaponarchetypes.meta, any layout).",
  },
  pedpersonality: {
    noun: "entries",
    nounShort: "ped-personality",
    labels: PEDPERSONALITY_LABELS,
    hintFor: noHint,
    metaFile: "pedpersonality.meta",
    coreLabel: "Binding",
    note: "One weapon→clip binding (unholster clip or movement clip set) in one pedpersonality.meta — edits update only that binding.",
    pickText:
      "Select a folder that contains your weapon resources (pedpersonality.meta / pedpersonality*.meta, any layout).",
  },
  weapons: {
    noun: "weapons",
    nounShort: "weapon",
    labels: WEAPON_LABELS,
    hintFor: paramHintWeapon,
    metaFile: "weapons.meta",
    coreLabel: "Weapon",
    note: "One weapon (CWeaponInfo) in one weapons.meta — edits update only this weapon.",
    pickText:
      "Select a folder that contains your weapon resources (weapons.meta / weapons_*.meta, any layout).",
  },
};

// Wire each editor's in-table "?" hints to its per-meta glossary. Metas that had
// a specialised hint function (handling/weapons) keep it; the rest were muted
// with noHint and now get their glossary as the hint source.
for (const id of Object.keys(PANELS)) {
  const cfg = PANELS[id as PanelId];
  if (cfg.hintFor === noHint) {
    cfg.hintFor = (col: string) => glossaryHint(id, col);
  }
}

/** Views inside the Meta Workshop (and the Asset Workshop) secondary navbar. */
export type MetaView = "workspace" | "glossary" | "dashboard";
export type AssetView = "workspace" | "glossary";

// Home keeps every pane mounted (CSS-hidden) so switching is instant, but that
// means an App re-render (editing a cell, typing a filter…) would otherwise
// re-render the hidden Glossary + Dashboard too. Memoizing them — with stable
// props below — keeps the hidden views idle while you work in an editor.
const GlossaryPane = memo(GlossaryView);
const DashboardPane = memo(DashboardView);
// Asset tools keep their own state (imported resource, viewport) — mounting them
// permanently would hold a large parsed mesh in memory, so that pane is mounted
// only while it is open (see the `section === "asset"` branch).

export default function App() {
  // Dev deep links into an asset tool (`?uvfile=` / `?uvdemo` / `?wtdemo`) open the
  // Asset Workshop instead of dropping the user on Home.
  const [section, setSection] = useState<AppSection>(() => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.has("uvfile") || p.has("uvdemo") || p.has("wtdemo") || p.has("wggen")) return "asset";
    }
    return "home";
  });
  const [metaView, setMetaView] = useState<MetaView>("workspace");
  const [assetView, setAssetView] = useState<AssetView>("workspace");
  const [panel, setPanel] = useState<PanelId>("handling");
  const [editor, setEditor] = useState<EditorMode>("bulk");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  // Keep the search box instant-feeling; the expensive row filtering runs on a
  // deferred copy so typing never blocks on huge row sets (e.g. 27k layouts).
  const deferredSearch = useDeferredValue(search);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((t: ToastData) => {
    setToast(t);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  const notify = useCallback<Notify>(
    (kind, title, message) => showToast({ kind, title, message }),
    [showToast]
  );

  const resetFilters = useCallback(() => {
    setSearch("");
    setTypeFilter("ALL");
    setClassFilter("ALL");
  }, []);

  // One independent editor domain per meta panel.
  const veh = useMetaDomain({
    scan: scanFolder,
    write: updateFiles,
    notify,
    onScanStart: resetFilters,
  });
  const wpn = useMetaDomain({
    scan: scanWeapons,
    write: updateWeaponFiles,
    notify,
    onScanStart: resetFilters,
  });
  const vmeta = useMetaDomain({
    scan: scanVehicles,
    write: updateVehicleFiles,
    notify,
    onScanStart: resetFilters,
  });
  const car = useMetaDomain({
    scan: scanCarcols,
    write: updateCarcolsFiles,
    notify,
    onScanStart: resetFilters,
  });
  const carv = useMetaDomain({
    scan: scanCarvariations,
    write: updateCarvariationsFiles,
    notify,
    onScanStart: resetFilters,
  });
  const lay = useMetaDomain({
    scan: scanVehiclelayouts,
    write: updateVehiclelayoutsFiles,
    notify,
    onScanStart: resetFilters,
  });
  const vw = useMetaDomain({
    scan: scanVehicleweapons,
    write: updateVehicleweaponsFiles,
    notify,
    onScanStart: resetFilters,
  });
  const wan = useMetaDomain({
    scan: scanWeaponanimations,
    write: updateWeaponanimationsFiles,
    notify,
    onScanStart: resetFilters,
  });
  const arch = useMetaDomain({
    scan: scanWeaponarchetypes,
    write: updateWeaponarchetypesFiles,
    notify,
    onScanStart: resetFilters,
  });
  const varch = useMetaDomain({
    scan: scanWeaponarchetypes,
    write: updateWeaponarchetypesFiles,
    notify,
    onScanStart: resetFilters,
  });
  const pp = useMetaDomain({
    scan: scanPedpersonality,
    write: updatePedpersonalityFiles,
    notify,
    onScanStart: resetFilters,
  });

  const domains = {
    handling: veh,
    weapons: wpn,
    vehicles: vmeta,
    carcols: car,
    carvariations: carv,
    vehiclelayouts: lay,
    vehicleweapons: vw,
    veh_weaponarchetypes: varch,
    weaponanimations: wan,
    weaponarchetypes: arch,
    pedpersonality: pp,
  };
  const d = domains[panel];
  const cfg = PANELS[panel];

  // Dev-only demos (Tauri backend absent in a plain browser).
  const isDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("demo");
  useEffect(() => {
    if (!isDemo) return;
    const raw = new URLSearchParams(window.location.search).get("demo") ?? "";
    const count = /^\d+$/.test(raw)
      ? Math.min(Math.max(parseInt(raw, 10), 1), 2000)
      : 8;
    veh.load(demoScan(count), "[demo]");
    setPanel("handling");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  // ?dw — dev-only weapons demo.
  const isWeaponDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("dw");
  useEffect(() => {
    if (!isWeaponDemo) return;
    wpn.load(demoWeapons(), "[demo-weapons]");
    setPanel("weapons");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeaponDemo]);

  // ?dv — dev-only vehicles.meta demo.
  const isVehicleDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("dv");
  useEffect(() => {
    if (!isVehicleDemo) return;
    vmeta.load(demoVehicles(), "[demo-vehicles]");
    setPanel("vehicles");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVehicleDemo]);

  // ?dc — dev-only carcols.meta demo.
  const isCarcolsDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("dc");
  useEffect(() => {
    if (!isCarcolsDemo) return;
    car.load(demoCarcols(), "[demo-carcols]");
    setPanel("carcols");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCarcolsDemo]);

  // ?cv — dev-only carvariations.meta demo.
  const isCarvariationsDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("cv");
  useEffect(() => {
    if (!isCarvariationsDemo) return;
    carv.load(demoCarvariations(), "[demo-carvariations]");
    setPanel("carvariations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCarvariationsDemo]);

  // ?vl — dev-only vehiclelayouts.meta demo.
  const isVehiclelayoutsDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("vl");
  useEffect(() => {
    if (!isVehiclelayoutsDemo) return;
    lay.load(demoVehiclelayouts(), "[demo-vehiclelayouts]");
    setPanel("vehiclelayouts");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVehiclelayoutsDemo]);

  // ?vw — dev-only vehicleweapons.meta demo.
  const isVehicleweaponsDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("vw");
  useEffect(() => {
    if (!isVehicleweaponsDemo) return;
    vw.load(demoVehicleweapons(), "[demo-vehicleweapons]");
    setPanel("vehicleweapons");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVehicleweaponsDemo]);

  // ?wa — dev-only weaponanimations.meta demo.
  const isWeaponanimationsDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("wa");
  useEffect(() => {
    if (!isWeaponanimationsDemo) return;
    wan.load(demoWeaponanimations(), "[demo-weaponanimations]");
    setPanel("weaponanimations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeaponanimationsDemo]);

  // ?wp — dev-only weaponarchetypes.meta demo (Weapons category panel).
  const isWeaponarchetypesDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("wp");
  useEffect(() => {
    if (!isWeaponarchetypesDemo) return;
    arch.load(demoWeaponarchetypes(), "[demo-weaponarchetypes]");
    setPanel("weaponarchetypes");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeaponarchetypesDemo]);

  // ?pp — dev-only pedpersonality.meta demo (Weapons category panel).
  const isPedpersonalityDemo =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("pp");
  useEffect(() => {
    if (!isPedpersonalityDemo) return;
    pp.load(demoPedpersonality(), "[demo-pedpersonality]");
    setPanel("pedpersonality");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPedpersonalityDemo]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return (d.result?.vehicles ?? []).filter((v) => {
      if (typeFilter !== "ALL" && v.vehicle_type !== typeFilter) return false;
      if (classFilter !== "ALL" && v.vehicle_class !== classFilter) return false;
      if (!q) return true;
      return `${v.folder_name} ${v.handling_name} ${v.vehicle_type} ${v.vehicle_class}`
        .toLowerCase()
        .includes(q);
    });
  }, [d.result, deferredSearch, typeFilter, classFilter]);

  const onSelect = useCallback((panelId: string, mode: EditorMode) => {
    if (Object.prototype.hasOwnProperty.call(PANELS, panelId)) {
      setPanel(panelId as PanelId);
      setEditor(mode);
    }
  }, []);

  // Stable callbacks so the memoized Dashboard never re-renders on App changes
  // it doesn't care about (it only needs the scanned handling data + folder).
  const onDashboardPickFolder = useCallback(() => {
    setSection("meta");
    setMetaView("workspace");
    setPanel("handling");
    void veh.chooseFolder();
  }, [veh.chooseFolder]);
  const onDashboardHome = useCallback(() => {
    setSection("meta");
    setMetaView("workspace");
    setPanel("handling");
  }, []);

  let content: JSX.Element;
  if (d.scanning) {
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-sm">Scanning {cfg.nounShort} meta…</p>
      </div>
    );
  } else if (d.hasData && editor === "single") {
    content = (
      <SingleHandlingEditor
        key={`${panel}|${d.folder ?? ""}|${d.scanId}|single`}
        vehicles={d.result?.vehicles ?? []}
        columns={d.result?.columns ?? []}
        edits={d.edits}
        onCommitEdit={d.commitEdit}
        metaLabel={cfg.metaFile}
        coreLabel={cfg.coreLabel}
        hintFor={cfg.hintFor}
        note={cfg.note}
      />
    );
  } else if (d.hasData && filtered.length > 0) {
    content = (
      <VehicleTable
        key={`${panel}|${d.folder ?? ""}|${d.scanId}`}
        vehicles={filtered}
        columns={d.result?.columns ?? []}
        edits={d.edits}
        onCommitEdit={d.commitEdit}
        labels={cfg.labels}
        hintFor={cfg.hintFor}
      />
    );
  } else {
    const noMatches =
      d.hasData &&
      editor === "bulk" &&
      (deferredSearch.trim() !== "" || typeFilter !== "ALL" || classFilter !== "ALL");
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        {noMatches ? (
          <>
            <Car className="h-10 w-10 text-gray-700" />
            <p className="text-sm text-gray-400">
              No {cfg.noun} match the current filters.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setTypeFilter("ALL");
                setClassFilter("ALL");
              }}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500"
            >
              Clear filters
            </button>
          </>
        ) : !d.folder ? (
          <>
            <FolderOpen className="h-12 w-12 text-gray-700" />
            <p className="text-sm text-gray-300">{cfg.pickText}</p>
            <button
              onClick={() => void d.chooseFolder()}
              className="mt-1 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            >
              <FolderOpen className="h-4 w-4" /> Select Folder…
            </button>
          </>
        ) : d.error ? (
          <>
            <AlertTriangle className="h-10 w-10 text-red-500/70" />
            <p className="max-w-lg text-sm text-gray-300">{d.error}</p>
          </>
        ) : (
          <>
            <FolderOpen className="h-10 w-10 text-gray-700" />
            <p className="text-sm text-gray-400">No data loaded.</p>
          </>
        )}
      </div>
    );
  }

  const metaSub: SubNavItem[] = [
    {
      id: "workspace",
      label: "Workspace",
      icon: <LayoutGrid className="h-3.5 w-3.5" />,
      title: "Import a pack folder and edit its meta files",
    },
    {
      id: "glossary",
      label: "Glossary",
      icon: <BookOpenText className="h-3.5 w-3.5" />,
      title: "Every meta parameter, explained",
    },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <Gauge className="h-3.5 w-3.5" />,
      disabled: !veh.hasData,
      title: veh.hasData
        ? "Performance dashboard for the scanned handling data"
        : "Scan a vehicle folder in the Workspace first",
    },
  ];
  const assetSub: SubNavItem[] = [
    {
      id: "workspace",
      label: "Workspace",
      icon: <Hammer className="h-3.5 w-3.5" />,
      title: "Open an asset tool (UV Map Generator)",
    },
    {
      id: "glossary",
      label: "Glossary",
      icon: <BookOpenText className="h-3.5 w-3.5" />,
      title: "Shader / material reference — still empty",
    },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-gray-200">
      <Navbar version={APP_VERSION} active={section} onNavigate={setSection} />

      {section !== "home" && (
        <SubNavbar
          section={section}
          title={section === "meta" ? "Meta Workshop" : "Asset Workshop"}
          items={section === "meta" ? metaSub : assetSub}
          active={section === "meta" ? metaView : assetView}
          onNavigate={(id) => {
            if (section === "meta") setMetaView(id as MetaView);
            else setAssetView(id as AssetView);
          }}
          right={
            section === "meta" && d.folder ? (
              <span className="max-w-[28rem] truncate" title={d.folder}>
                {d.folder}
              </span>
            ) : null
          }
        />
      )}

      {/* Both workshops stay mounted once visited; the inactive panes are only
          hidden via CSS, so switching is instant (no grid rebuild). */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {section === "home" && (
          <div className="absolute inset-0 flex flex-col">
            <HomeView version={APP_VERSION} onOpen={setSection} />
          </div>
        )}

        <div
          className={
            section === "meta" && metaView === "workspace"
              ? "absolute inset-0 flex flex-col"
              : "hidden"
          }
        >
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <Sidebar activePanel={panel} activeMode={editor} onSelect={onSelect} />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Toolbar
                folder={d.folder}
                scanning={d.scanning}
                updating={d.updating}
                canUpdate={d.canUpdate}
                onPickFolder={() => void d.chooseFolder()}
                onRescan={() => {
                  if (d.folder) void d.runScan(d.folder);
                }}
                onUpdate={() => void d.update()}
              />

              {editor === "bulk" && (
                <FilterBar
                  search={search}
                  onSearch={setSearch}
                  types={d.types}
                  typeFilter={typeFilter}
                  onTypeFilter={setTypeFilter}
                  classes={d.classes}
                  classFilter={classFilter}
                  onClassFilter={setClassFilter}
                  disabled={!d.hasData}
                />
              )}

              {d.error && d.hasData && (
                <div className="flex items-center gap-2 border-b border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{d.error}</span>
                </div>
              )}

              {content}

              <StatusBar
                noun={cfg.noun}
                vehicleCount={d.result?.vehicles.length ?? 0}
                paramCount={d.result?.columns.length ?? 0}
                modifiedRows={d.modifiedRows}
                modifiedCells={d.modifiedCells}
                skippedCount={d.result?.skipped.length ?? 0}
                skipped={d.result?.skipped ?? []}
              />
            </main>
          </div>
        </div>

        <div
          className={
            section === "meta" && metaView === "glossary"
              ? "absolute inset-0 flex flex-col"
              : "hidden"
          }
        >
          <GlossaryPane />
        </div>

        <div
          className={
            section === "meta" && metaView === "dashboard"
              ? "absolute inset-0 flex flex-col"
              : "hidden"
          }
        >
          <DashboardPane
            result={veh.result}
            folder={veh.folder}
            onPickFolder={onDashboardPickFolder}
            onHome={onDashboardHome}
          />
        </div>

        {section === "asset" && assetView === "workspace" && (
          <div className="absolute inset-0 flex flex-col">
            <CreatorToolsView />
          </div>
        )}

        {section === "asset" && assetView === "glossary" && (
          <div className="absolute inset-0 flex flex-col">
            <AssetGlossaryView />
          </div>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  );
}
