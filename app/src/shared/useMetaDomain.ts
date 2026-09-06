import { useCallback, useMemo, useState } from "react";
import { pickFolder } from "./api";
import type {
  ScanResult,
  UpdateResult,
  VehicleChange,
  VehicleRow,
} from "./models";
import { rowKey } from "./models";

export interface Notify {
  (kind: "success" | "error", title: string, message: string): void;
}

interface Options {
  scan: (folder: string) => Promise<ScanResult>;
  write: (folder: string, changes: VehicleChange[]) => Promise<UpdateResult>;
  notify: Notify;
  /** Called right before a scan starts (used to reset search/filters). */
  onScanStart: () => void;
}

/**
 * One meta editor "domain" (e.g. vehicles / handling.meta, weapons / weapons.meta).
 * Holds its own folder, scan result, pending edits and lifecycle, so each meta
 * editor keeps its data & edits independent of the others.
 */
export function useMetaDomain({ scan, write, notify, onScanStart }: Options) {
  const [folder, setFolder] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [scanId, setScanId] = useState(0);

  /** Load a full result without the backend (used by the dev demos). */
  const load = useCallback((res: ScanResult, folderLabel: string) => {
    setFolder(folderLabel);
    setResult(res);
    setEdits({});
    setError(null);
    setScanning(false);
    setScanId((n) => n + 1);
  }, []);

  const runScan = useCallback(
    async (p: string) => {
      setScanning(true);
      setError(null);
      onScanStart();
      setEdits({});
      try {
        const r = await scan(p);
        setResult(r);
        setScanId((n) => n + 1);
        if (r.vehicles.length === 0) {
          setError(
            r.skipped.length
              ? `No entries could be loaded. Skipped: ${r.skipped.join(", ")}`
              : `No matching .meta files were found under that folder.`
          );
        }
      } catch (e) {
        setResult(null);
        setError(String(e));
      } finally {
        setScanning(false);
      }
    },
    [scan, onScanStart]
  );

  const chooseFolder = useCallback(async () => {
    try {
      const p = await pickFolder();
      if (p) {
        // Remember the chosen root so edits can be written back (canUpdate needs
        // a real folder — the demo load() path sets this itself).
        setFolder(p);
        await runScan(p);
      }
    } catch (e) {
      notify("error", "Could not open the folder picker", String(e));
    }
  }, [runScan, notify]);

  const commitEdit = useCallback((row: VehicleRow, col: string, value: string) => {
    const key = rowKey(row);
    const original = (row.params[col] ?? "").trim();
    const v = value.trim();
    setEdits((prev) => {
      const next: Record<string, Record<string, string>> = { ...prev };
      const cur: Record<string, string> = { ...(next[key] ?? {}) };
      // Empty cells are never written.
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
    for (const v of result?.vehicles ?? []) {
      m.set(rowKey(v), v);
    }
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

  const modifiedRows = useMemo(() => Object.keys(edits).length, [edits]);
  const modifiedCells = useMemo(
    () => Object.values(edits).reduce((n, rec) => n + Object.keys(rec).length, 0),
    [edits]
  );

  const update = useCallback(async () => {
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
      const res = await write(folder, changes);
      if (res.errors.length > 0) {
        notify(
          "error",
          `Updated ${res.files_changed} file${res.files_changed === 1 ? "" : "s"} · ${res.params_applied} params applied`,
          res.errors.slice(0, 10).join("\n")
        );
      } else {
        notify(
          "success",
          `Updated ${res.files_changed} file${res.files_changed === 1 ? "" : "s"}`,
          `${res.params_applied} parameters changed · ${res.params_unchanged} already equal`
        );
      }
      // Reload from disk so the editors reflect the new file contents.
      await runScan(folder);
    } catch (e) {
      notify("error", "Update failed", String(e));
    } finally {
      setUpdating(false);
    }
  }, [folder, result, modifiedCells, edits, vehicleByKey, write, runScan, notify]);

  const hasData = (result?.vehicles.length ?? 0) > 0;
  const canUpdate =
    !!folder && !!result && modifiedCells > 0 && !scanning && !updating;

  return {
    folder,
    result,
    scanning,
    updating,
    error,
    edits,
    scanId,
    load,
    runScan,
    chooseFolder,
    commitEdit,
    update,
    vehicleByKey,
    types,
    classes,
    hasData,
    canUpdate,
    modifiedRows,
    modifiedCells,
  };
}
