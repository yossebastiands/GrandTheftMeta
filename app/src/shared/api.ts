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

/** Scan a folder (any layout) for vehicles.meta / vehicles_*.meta → one row per model. */
export function scanVehicles(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_vehicles", { folderPath });
}

/** Write edited vehicle-model params back into the original vehicles.meta files. */
export function updateVehicleFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_vehicle_files", { folderPath, changes });
}

/** Scan a folder (any layout) for carcols.meta / carcols*.meta → one row per list entry. */
export function scanCarcols(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_carcols", { folderPath });
}

/** Write edited carcols list-entry params back into the original carcols.meta files. */
export function updateCarcolsFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_carcols_files", { folderPath, changes });
}

/** Scan a folder (any layout) for carvariations.meta → one row per variation entry. */
export function scanCarvariations(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_carvariations", { folderPath });
}

/** Write edited carvariations entries back into the original files. */
export function updateCarvariationsFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_carvariations_files", { folderPath, changes });
}

/** Scan a folder (any layout) for vehiclelayouts.meta → one row per list entry. */
export function scanVehiclelayouts(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_vehiclelayouts", { folderPath });
}

/** Write edited vehiclelayouts entries back into the original files. */
export function updateVehiclelayoutsFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_vehiclelayouts_files", { folderPath, changes });
}

/** Scan a folder for vehicleweapons*.meta → one row per weapon/ammo/data entry. */
export function scanVehicleweapons(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_vehicleweapons", { folderPath });
}

/** Write edited vehicle-weapon entries back into the original files. */
export function updateVehicleweaponsFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_vehicleweapons_files", { folderPath, changes });
}

/** Scan a folder for weaponanimations.meta → one row per personality × weapon. */
export function scanWeaponanimations(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_weaponanimations", { folderPath });
}

/** Write edited weapon-animation entries back into the original files. */
export function updateWeaponanimationsFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_weaponanimations_files", { folderPath, changes });
}

/** Scan a folder for weaponarchetypes.meta → one row per weapon-model archetype. */
export function scanWeaponarchetypes(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_weaponarchetypes", { folderPath });
}

/** Write edited weapon-archetype entries back into the original files. */
export function updateWeaponarchetypesFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_weaponarchetypes_files", { folderPath, changes });
}

/** Scan a folder for pedpersonality.meta → one row per unholster / clip-set binding. */
export function scanPedpersonality(folderPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_pedpersonality", { folderPath });
}

/** Write edited ped-personality clip bindings back into the original files. */
export function updatePedpersonalityFiles(
  folderPath: string,
  changes: VehicleChange[]
): Promise<UpdateResult> {
  return invoke<UpdateResult>("update_pedpersonality_files", { folderPath, changes });
}
