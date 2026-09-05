/**
 * Data shapes returned by the Tauri commands (mirror of the Rust structs).
 */

export interface VehicleRow {
  /** Vehicle resource folder name, e.g. "Aircraft_berkut". */
  folder_name: string;
  /** Absolute path to the handling.meta file this row came from. */
  meta_path: string;
  /** Value of the <handlingName> element. */
  handling_name: string;
  /** Native vehicle type label from vehicles.meta <type>, e.g. "Plane". */
  vehicle_type: string;
  /** Native vehicle class label from vehicles.meta <vehicleClass>, e.g. "Military". */
  vehicle_class: string;
  /** All param values keyed by column name (strings only). */
  params: Record<string, string>;
}

export interface ScanResult {
  vehicles: VehicleRow[];
  /** Ordered list of all param column names. */
  columns: string[];
  /** Folders that were skipped (no meta / parse error), with a reason. */
  skipped: string[];
}

export interface VehicleChange {
  folder_name: string;
  handling_name: string;
  /** Only the params that changed, keyed by column name. */
  changed_params: Record<string, string>;
}

export interface UpdateResult {
  files_changed: number;
  params_applied: number;
  params_unchanged: number;
  errors: string[];
}

/** Stable identity of a row inside the vehicle pack. */
export function rowKey(row: Pick<VehicleRow, "folder_name" | "handling_name">): string {
  return `${row.folder_name}\u0000${row.handling_name}`;
}
