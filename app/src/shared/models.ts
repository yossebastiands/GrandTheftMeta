/**
 * Data shapes returned by the Tauri commands (mirror of the Rust structs).
 */

/** One geometry's vertex positions (`xyz` triples) — orthographic guide input. */
export interface PositionMesh {
  /** Matches the `id` of the same mesh in the `UvDocument`. */
  id: number;
  lod: string;
  shader: number;
  vertex_count: number;
  positions: number[];
}

/** Positions-only payload from `load_vertex_positions`. */
export interface PositionDocument {
  path: string;
  file_name: string;
  meshes: PositionMesh[];
  total_vertices: number;
}

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

/* -------------------------------------------------------------------------
 * Creator Tools — RAGE drawable / fragment resources (.ydr / .yft)
 * ---------------------------------------------------------------------- */

/** One drawable geometry (`grcGeometry`) with its UV set and triangles. */
export interface UvMesh {
  id: number;
  /** LOD list the model came from: `high` | `medium` | `low` | `verylow`. */
  lod: string;
  /** Index of the drawable inside a `.yft` (0 = main drawable). */
  drawable: number;
  /** Shader index inside that drawable's shader group. */
  shader: number;
  /** Shader (material) name hash — `joaat` of the shader name. */
  shader_hash: number;
  /** Readable material name, or null when the hash is not in the name table. */
  shader_name: string | null;
  /** TexCoord semantic the UVs came from (0..7). */
  uv_set: number;
  vertex_count: number;
  index_count: number;
  triangle_count: number;
  /** Flat `[u, v, u, v, …]`, one pair per vertex. */
  uvs: number[];
  /** Flat triangle list (3 indices per triangle). */
  indices: number[];
  /** `[min_u, min_v, max_u, max_v]` — empty when there is no UV data. */
  uv_bounds: number[];
  /** Reason this geometry contributed no UVs. */
  warning: string | null;
}

/** Result of parsing one `.ydr` / `.yft` resource. */
export interface UvDocument {
  path: string;
  file_name: string;
  /** `ydr` | `yft` | `ydd`. */
  kind: string;
  /** Packed resource version (0xA2 = 162 fragment, 0xA5 = 165 drawable). */
  version: number;
  /** True for gen9 / "Enhanced" resources (different vertex layout). */
  gen9: boolean;
  system_size: number;
  graphics_size: number;
  drawable_count: number;
  meshes: UvMesh[];
  total_vertices: number;
  total_triangles: number;
  shader_count: number;
  warnings: string[];
}

/* -------------------------------------------------------------------------
 * Creator Tools — weapon template catalogue
 * ---------------------------------------------------------------------- */

/**
 * One base weapon definition (`<Item type="CWeaponInfo">`) plus the companion data
 * that makes it usable: animation sets, pedpersonality bindings, streamed models and
 * components. Derived from the user's own vanilla / pack metas — never shipped.
 */
export interface WeaponTemplate {
  id: string;
  /** Relative path of the weapons.meta it came from. */
  file: string;
  meta_path: string;
  model: string;
  slot: string;
  group: string;
  wheel_slot: string;
  audio: string;
  ammo_ref: string;
  fire_type: string;
  damage_type: string;
  clip_size: string;
  weapon_range: string;
  human_name_hash: string;
  slot_entry: string;
  /** Weapon-wheel order number — a generator has to keep this unique. */
  slot_order: string;
  /** Tuning leaves (identity/display fields excluded). */
  params: Record<string, string>;
  param_count: number;
  /** Animation personality sets that name this weapon id. */
  anim_sets: number;
  /** pedpersonality bindings for this weapon id. */
  ped_refs: number;
  /** Sibling weapon ids named inside this template's own files (a defect to retarget). */
  foreign_ids: string[];
  anim_files: string[];
  ped_files: string[];
  /** `modelName`s declared next to it (empty for a stub — the generator creates them). */
  archetype_models: string[];
  local_components: string[];
  /** `COMPONENT_<weapon token>_…` name-prefix suggestions (heuristic, not a requirement). */
  suggested_components: string[];
  warnings: string[];
}

/** One `CWeaponComponent*Info` entry from a weaponcomponents.meta. */
export interface WeaponComponent {
  name: string;
  file: string;
  /** Absolute path — what the generator clones the component out of. */
  path: string;
  /** `Clip` | `Suppressor` | `Flashlight` | `Scope` | `Attachment`. */
  kind: string;
  item_type: string;
  model: string;
  loc_name: string;
  loc_desc: string;
  attach_bone: string;
  /** Bone on the weapon — the `<AttachBone>` a generated `<AttachPoints>` needs. */
  weapon_attach_bone: string;
  clip_size: string;
  param_count: number;
}

/* -------------------------------------------------------------------------
 * Creator Tools — weapon pack generator
 * ---------------------------------------------------------------------- */

/** One streamed file, classified by what the generator would use it for. */
export interface WeaponAsset {
  file: string;
  path: string;
  /** `drawable` | `texture`. */
  kind: string;
  /** `main` | `lod` | `mag1` | `mag2` | `flashlight` | `suppressor` | `scope` | `grip` |
   * `rail` | `attachment` | `texture`. */
  role: string;
  stem: string;
  /** File name with a `_hi` / `+hi` LOD suffix removed. */
  drawable: string;
  bytes: number;
}

/** One component to attach to the generated weapon. */
export interface WeaponComponentSpec {
  /** Name the component must have in the exported resource. */
  name: string;
  /** Name inside `source_file` (usually the vanilla name) — the clone is renamed. */
  source_name: string;
  source_file: string;
  /** Model override, usually the matching `mag` drawable. */
  model?: string | null;
  clip_size?: string | null;
  default: boolean;
}

/** Everything the generator needs to build one add-on weapon. */
export interface WeaponSpec {
  id: string;
  display_name: string;
  template_meta_path: string;
  template_id: string;
  assets_folder?: string | null;
  model?: string | null;
  audio?: string | null;
  ammo_ref?: string | null;
  damage_type?: string | null;
  fire_type?: string | null;
  damage?: string | null;
  range?: string | null;
  clip_size?: string | null;
  headshot_modifier?: string | null;
  reload_rate?: string | null;
  fire_rate_modifier?: string | null;
  slot_order?: number | null;
  components: WeaponComponentSpec[];
}

/** One file the export would write. */
export interface PlannedFile {
  path: string;
  /** `create` | `update` | `append` | `copy`. */
  action: string;
  kind: string;
  bytes: number;
}

/** Dry-run result — the writer produces exactly this. */
export interface ExportPlan {
  out_root: string;
  folder: string;
  files: PlannedFile[];
  retargeted: string[];
  edits: string[];
  /** Blockers; the writer refuses while any of these is present. */
  conflicts: string[];
  warnings: string[];
  total_bytes: number;
}

/** A pack: N weapons written into ONE resource folder (one manifest, one label list). */
export interface WeaponPackSpec {
  weapons: WeaponSpec[];
}

/** Dry-run result for a whole pack. The writer produces exactly this. */
export interface PackPlan {
  out_root: string;
  /** One plan per weapon (its own files, edits, retargets, conflicts). */
  weapons: ExportPlan[];
  /** Written once for the resource: `fxmanifest.lua`, `cl_weaponNames.lua`. */
  shared_files: PlannedFile[];
  conflicts: string[];
  warnings: string[];
  /** Slot orders handed out to weapons that did not specify one. */
  allocations: string[];
  total_bytes: number;
}

/** Result of a real pack write. */
export interface PackWriteReport {
  out_root: string;
  /** Weapon ids written, in pack order. */
  weapons: string[];
  written: string[];
  copied: string[];
  skipped: string[];
  bytes: number;
  notes: string[];
}

/** The editor state as a file: every queued weapon plus the output folder. */
export interface WeaponPreset {
  app: string;
  version: number;
  out_folder?: string | null;
  weapons: WeaponSpec[];
}

/** Result of analysing one folder of metas (read-only). */
export interface WeaponTemplateCatalog {
  folder_path: string;
  templates: WeaponTemplate[];
  components: WeaponComponent[];
  /** Files that could not be read/parsed or held nothing usable. */
  skipped: string[];
}
