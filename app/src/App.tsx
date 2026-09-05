import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Car, FolderOpen, Loader2 } from "lucide-react";
import FilterBar from "./ui/FilterBar";
import Navbar from "./ui/Navbar";
import Sidebar, { type EditorMode } from "./ui/Sidebar";
import StatusBar from "./ui/StatusBar";
import Toast, { type ToastData } from "./ui/Toast";
import Toolbar from "./ui/Toolbar";
import GlossaryView from "./features/handling/GlossaryView";
import SingleHandlingEditor from "./features/handling/SingleHandlingEditor";
import VehicleTable from "./features/handling/VehicleTable";
import { demoScan, demoWeapons } from "./features/handling/demoData";
import {
  scanFolder,
  scanWeapons,
  updateFiles,
  updateWeaponFiles,
} from "./shared/api";
import { useMetaDomain, type Notify } from "./shared/useMetaDomain";
import { version as APP_VERSION } from "../package.json";

/** Which live meta panel the Home editors are showing. */
type PanelId = "handling" | "weapons";

/** Weapon table labels (folder column shows the relative .meta file path). */
const WEAPON_LABELS = {
  folder: "File",
  type: "Slot",
  klass: "Group",
  name: "Name",
};

export default function App() {
  const [view, setView] = useState<"home" | "glossary">("home");
  const [panel, setPanel] = useState<PanelId>("handling");
  const [editor, setEditor] = useState<EditorMode>("bulk");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
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

  // Two independent editor domains: vehicles/handling.meta and weapons.meta.
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

  const d = panel === "weapons" ? wpn : veh;
  const isWeapon = panel === "weapons";

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (d.result?.vehicles ?? []).filter((v) => {
      if (typeFilter !== "ALL" && v.vehicle_type !== typeFilter) return false;
      if (classFilter !== "ALL" && v.vehicle_class !== classFilter) return false;
      if (!q) return true;
      return `${v.folder_name} ${v.handling_name} ${v.vehicle_type} ${v.vehicle_class}`
        .toLowerCase()
        .includes(q);
    });
  }, [d.result, search, typeFilter, classFilter]);

  const onSelect = useCallback((panelId: string, mode: EditorMode) => {
    if (panelId === "handling" || panelId === "weapons") {
      setPanel(panelId);
      setEditor(mode);
    }
  }, []);

  let content: JSX.Element;
  if (d.scanning) {
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-sm">Scanning {isWeapon ? "weapon" : "vehicle"} meta…</p>
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
        metaLabel={isWeapon ? "weapons.meta" : "handling.meta"}
        coreLabel={isWeapon ? "Weapon" : "Vehicle"}
        note={
          isWeapon
            ? "One weapon (CWeaponInfo) in one weapons.meta — edits update only this weapon."
            : undefined
        }
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
        labels={isWeapon ? WEAPON_LABELS : undefined}
      />
    );
  } else {
    const noMatches =
      d.hasData &&
      editor === "bulk" &&
      (search.trim() !== "" || typeFilter !== "ALL" || classFilter !== "ALL");
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        {noMatches ? (
          <>
            <Car className="h-10 w-10 text-gray-700" />
            <p className="text-sm text-gray-400">
              No {isWeapon ? "weapons" : "vehicles"} match the current filters.
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
            <p className="text-sm text-gray-300">
              {isWeapon
                ? "Select a folder that contains your weapon resources (weapons.meta / weapons_*.meta, any layout)."
                : "Select the folder that contains your FiveM vehicle resources."}
            </p>
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-gray-200">
      <Navbar version={APP_VERSION} active={view} onNavigate={setView} />

      {/* Both panes stay mounted; the inactive one is only hidden via CSS, so
          switching between Home and Glossary is instant (the grid is never
          torn down and re-built). */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className={view === "home" ? "absolute inset-0 flex flex-col" : "hidden"}>
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
                noun={isWeapon ? "weapons" : "vehicles"}
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

        <div className={view === "glossary" ? "absolute inset-0 flex flex-col" : "hidden"}>
          <GlossaryView />
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
