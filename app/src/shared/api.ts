import { invoke } from "@tauri-apps/api/core";
import type { ScanResult, UpdateResult, VehicleChange } from "./models";

/** Open the native OS folder picker. Returns null when the user cancels. */
export function pickFolder(): Promise<string | null> {
  return invoke<string | null>("pick_folder");
}

/** Scan a folder containing vehicle resources and return every handling entry. */
export function scanFolder(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_folder", { folderPath });
}

/** Write edits surgically back into the handling.meta files. */
export function updateFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_files", { folderPath, changes });
}
