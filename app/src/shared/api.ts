import { invoke } from "@tauri-apps/api/core";
import type {
  ScanResult,
  UpdateResult,
  VehicleChange,
  VehicleRow,
} from "./models";

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

/** Raw weapons.meta scan shape from the backend. */
interface WeaponScan {
  weapons: VehicleRow[];
  columns: string[];
  skipped: string[];
}

/**
 * Scan a folder (any layout) for weapons.meta / weapons_*.meta and return every
 * CWeaponInfo as a row. Mapped onto the shared ScanResult shape so the generic
 * Bulk / Single editors can be reused unchanged.
 */
export async function scanWeapons(folderPath: string): Promise<ScanResult> {
  const r = await invoke<WeaponScan>("scan_weapons", { folderPath });
  return { vehicles: r.weapons, columns: r.columns, skipped: r.skipped };
}

/** Write edited weapon params back into the original weapons.meta files. */
export function updateWeaponFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_weapon_files", { folderPath, changes });
}
