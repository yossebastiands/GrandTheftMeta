import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Car, FolderOpen, Loader2 } from "lucide-react";
import FilterBar from "./ui/FilterBar";
import StatusBar from "./ui/StatusBar";
import Toast, { type ToastData } from "./ui/Toast";
import Toolbar from "./ui/Toolbar";
import VehicleTable from "./features/handling/VehicleTable";
import { pickFolder, scanFolder, updateFiles } from "./shared/api";
import {
  rowKey,
  type ScanResult,
  type VehicleChange,
  type VehicleRow,
} from "./shared/models";

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [scanId, setScanId] = useState(0);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((t: ToastData) => {
    setToast(t);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  const runScan = useCallback(async (p: string) => {
    setScanning(true);
    setError(null);
    setSearch("");
    setTypeFilter("ALL");
    setClassFilter("ALL");
    setEdits({});
    try {
      const r = await scanFolder(p);
      setResult(r);
      setScanId((n) => n + 1);
      if (r.vehicles.length === 0) {
        setError(
          r.skipped.length
            ? `No handling data could be loaded. Skipped: ${r.skipped.join(", ")}`
            : "No handling.meta files were found under that folder."
        );
      }
    } catch (e) {
      setResult(null);
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }, []);

  const chooseFolder = useCallback(async () => {
    try {
      const p = await pickFolder();
      if (p) {
        setFolder(p);
        void runScan(p);
      }
    } catch (e) {
      showToast({ kind: "error", title: "Could not open the folder picker", message: String(e) });
    }
  }, [runScan, showToast]);

  const commitEdit = useCallback((row: VehicleRow, col: string, value: string) => {
    const key = rowKey(row);
    const original = (row.params[col] ?? "").trim();
    const v = value.trim();
    setEdits((prev) => {
      const next: Record<string, Record<string, string>> = { ...prev };
      const cur: Record<string, string> = { ...(next[key] ?? {}) };
      // Empty cells are never written (matches the Excel importer behaviour).
      if (v === original || v === "") {
        delete cur[col];
      } else {
        cur[col] = v;
      }
      if (Object.keys(cur).length > 0) next[key] = cur;
      else delete next[key];
      return next;
    });
  }, []);

  const vehicleByKey = useMemo(() => {
    const m = new Map<string, VehicleRow>();
    for (const v of result?.vehicles ?? []) m.set(rowKey(v), v);
    return m;
  }, [result]);

  const types = useMemo(() => {
    const s = new Set<string>();
    for (const v of result?.vehicles ?? []) if (v.vehicle_type) s.add(v.vehicle_type);
    return [...s].sort();
  }, [result]);

  const classes = useMemo(() => {
    const s = new Set<string>();
    for (const v of result?.vehicles ?? []) if (v.vehicle_class) s.add(v.vehicle_class);
    return [...s].sort();
  }, [result]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (result?.vehicles ?? []).filter((v) => {
      if (typeFilter !== "ALL" && v.vehicle_type !== typeFilter) return false;
      if (classFilter !== "ALL" && v.vehicle_class !== classFilter) return false;
      if (!q) return true;
      return `${v.folder_name} ${v.handling_name} ${v.vehicle_type} ${v.vehicle_class}`
        .toLowerCase()
        .includes(q);
    });
  }, [result, search, typeFilter, classFilter]);

  const modifiedRows = useMemo(() => Object.keys(edits).length, [edits]);
  const modifiedCells = useMemo(
    () => Object.values(edits).reduce((n, rec) => n + Object.keys(rec).length, 0),
    [edits]
  );

  const handleUpdate = useCallback(async () => {
    if (!folder || !result || modifiedCells === 0) return;
    const changes: VehicleChange[] = [];
    for (const key of Object.keys(edits)) {
      const row = vehicleByKey.get(key);
      if (!row) continue;
      changes.push({
        folder_name: row.folder_name,
        handling_name: row.handling_name,
        changed_params: edits[key],
      });
    }
    setUpdating(true);
    try {
      const res = await updateFiles(folder, changes);
      if (res.errors.length > 0) {
        showToast({
          kind: "error",
          title: `Updated ${res.files_changed} file${res.files_changed === 1 ? "" : "s"} · ${res.params_applied} params applied`,
          message: res.errors.slice(0, 10).join("\n"),
        });
      } else {
        showToast({
          kind: "success",
          title: `Updated ${res.files_changed} file${res.files_changed === 1 ? "" : "s"}`,
          message: `${res.params_applied} parameters changed · ${res.params_unchanged} already equal`,
        });
      }
      // Reload from disk so the table reflects the new file contents.
      await runScan(folder);
    } catch (e) {
      showToast({ kind: "error", title: "Update failed", message: String(e) });
    } finally {
      setUpdating(false);
    }
  }, [folder, result, modifiedCells, edits, vehicleByKey, runScan, showToast]);

  const hasData = (result?.vehicles.length ?? 0) > 0;
  const canUpdate =
    !!folder && !!result && modifiedCells > 0 && !scanning && !updating;

  let content: JSX.Element;
  if (scanning) {
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-sm">Scanning vehicle folders…</p>
      </div>
    );
  } else if (hasData && filtered.length > 0) {
    content = (
      <VehicleTable
        key={`${folder ?? ""}|${scanId}`}
        vehicles={filtered}
        columns={result?.columns ?? []}
        edits={edits}
        onCommitEdit={commitEdit}
      />
    );
  } else {
    const noMatches =
      hasData &&
      (search.trim() !== "" || typeFilter !== "ALL" || classFilter !== "ALL");
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        {noMatches ? (
          <>
            <Car className="h-10 w-10 text-gray-700" />
            <p className="text-sm text-gray-400">No vehicles match the current filters.</p>
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
        ) : !folder ? (
          <>
            <FolderOpen className="h-12 w-12 text-gray-700" />
            <p className="text-sm text-gray-300">
              Select the folder that contains your FiveM vehicle resources.
            </p>
            <p className="text-xs text-gray-500">
              e.g. <code className="text-gray-400">resources/[mbo-vehicles]</code>
            </p>
            <button
              onClick={() => void chooseFolder()}
              className="mt-1 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            >
              <FolderOpen className="h-4 w-4" /> Select Folder…
            </button>
          </>
        ) : error ? (
          <>
            <AlertTriangle className="h-10 w-10 text-red-500/70" />
            <p className="max-w-lg text-sm text-gray-300">{error}</p>
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
      <Toolbar
        folder={folder}
        scanning={scanning}
        updating={updating}
        canUpdate={canUpdate}
        onPickFolder={() => void chooseFolder()}
        onRescan={() => {
          if (folder) void runScan(folder);
        }}
        onUpdate={() => void handleUpdate()}
      />

      <FilterBar
        search={search}
        onSearch={setSearch}
        types={types}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        classes={classes}
        classFilter={classFilter}
        onClassFilter={setClassFilter}
        disabled={!hasData}
      />

      {error && hasData && (
        <div className="flex items-center gap-2 border-b border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {content}

      <StatusBar
        vehicleCount={result?.vehicles.length ?? 0}
        paramCount={result?.columns.length ?? 0}
        modifiedRows={modifiedRows}
        modifiedCells={modifiedCells}
        skippedCount={result?.skipped.length ?? 0}
        skipped={result?.skipped ?? []}
      />

      <Toast toast={toast} />
    </div>
  );
}
