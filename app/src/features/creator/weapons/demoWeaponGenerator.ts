// Dev fixture for the Weapon Generator — `?wggen` in a plain browser pane.
//
// Synthetic on purpose: a fake catalogue (reused from the templates fixture), a fake
// asset set that exercises every role, and a fake plan so the review panel renders without
// a Tauri backend. Nothing here is a real weapon.
import type {
  ExportPlan,
  PackPlan,
  WeaponAsset,
  WeaponComponentSpec,
  WeaponSpec,
  WeaponTemplateCatalog,
} from "../../../shared/models";
import { demoWeaponTemplates } from "./demoWeaponTemplates";

export function demoGeneratorCatalog(): WeaponTemplateCatalog {
  return demoWeaponTemplates();
}

export function demoGeneratorAssets(): WeaponAsset[] {
  const files: Array<[string, string]> = [
    ["w_demo_alpha.ydr", "main"],
    ["w_demo_alpha_hi.ydr", "lod"],
    ["w_demo_alpha_mag1.ydr", "mag1"],
    ["w_demo_alpha_mag2.ydr", "mag2"],
    ["w_demo_alpha_flsh.ydr", "flashlight"],
    ["w_at_pi_supp.ydr", "suppressor"],
    ["w_at_scope_macro.ydr", "scope"],
    ["w_demo_alpha.ytd", "texture"],
    ["w_demo_alpha+hi.ytd", "texture"],
  ];
  return files.map(([file, role], i) => ({
    file,
    path: `C:/demo/assets/${file}`,
    kind: role === "texture" ? "texture" : "drawable",
    role,
    stem: file.replace(/\.[^.]+$/, ""),
    drawable: file.replace(/\.[^.]+$/, "").replace(/[_+]hi$/, ""),
    bytes: 10_000 - i * 500,
  }));
}

export function demoGeneratorPlan(): ExportPlan {
  const root = "C:/demo/weapons";
  const file = (rel: string, action: string, kind: string, bytes: number) => ({
    path: `${root}/${rel}`,
    action,
    kind,
    bytes,
  });
  return {
    out_root: root,
    folder: "wt_alpha_addon",
    files: [
      file("metas/wt_alpha_addon/weapons.meta", "create", "weapons", 13_204),
      file("metas/wt_alpha_addon/weaponarchetypes.meta", "create", "archetypes", 612),
      file("metas/wt_alpha_addon/weaponanimations.meta", "create", "animations", 23_486),
      file("metas/wt_alpha_addon/pedpersonality.meta", "create", "personality", 15_065),
      file(
        "metas/wt_alpha_addon/components/COMPONENT_WT_ALPHA_ADDON_CLIP_01/weaponcomponents.meta",
        "create",
        "component",
        1_140,
      ),
      file("fxmanifest.lua", "create", "manifest", 604),
      file("cl_weaponNames.lua", "append", "lua", 62),
      file("stream/wt_alpha_addon/w_demo_alpha.ydr", "copy", "stream", 286_403),
      file("stream/wt_alpha_addon/w_demo_alpha_mag1.ydr", "copy", "stream", 14_610),
      file("stream/wt_demo_alpha.ytd", "copy", "stream", 1_430_859),
    ],
    retargeted: [
      "weaponanimations.meta: WEAPON_COMBATPISTOL ×6 → WEAPON_WT_ALPHA_ADDON",
      "pedpersonality.meta: WEAPON_COMBATPISTOL ×1 → WEAPON_WT_ALPHA_ADDON",
      "pedpersonality.meta: WEAPON_PISTOL ×18 → WEAPON_WT_ALPHA_ADDON",
    ],
    edits: [
      "Name → WEAPON_WT_ALPHA_ADDON",
      "Slot → SLOT_WEAPON_WT_ALPHA_ADDON (SlotNavigateOrder entry + order 423)",
      "HumanNameHash → WEAPON_WT_ALPHA_ADDON (label comes from cl_weaponNames.lua)",
      "Model → w_demo_alpha",
      "WeaponRange → 220",
      "ClipSize → 15",
      "AnimFireRateModifier → 1.2 in 6 personality set(s)",
      "AttachPoints → replaced the template's own 1 slot block(s), 1 option(s)",
      "AttachPoints → 2 slot(s) on 2 bone(s), 3 option(s)",
      "component COMPONENT_COMBATPISTOL_CLIP_01 → COMPONENT_WT_ALPHA_ADDON_CLIP_01",
      "component COMPONENT_WT_ALPHA_ADDON_CLIP_01 Model → w_demo_alpha_mag1",
    ],
    conflicts: [],
    warnings: [
      "no slot order set — defaulted to 300; the weapon wheel order may collide with another add-on",
      "component 'COMPONENT_AT_PI_SUPP' has no <WeaponAttachBone> — it cannot be attached to a bone",
    ],
    total_bytes: 1_806_055,
  };
}

/** Same fixture, but with the blockers the writer refuses on. */
export function demoGeneratorBlockedPlan(): ExportPlan {
  return {
    ...demoGeneratorPlan(),
    conflicts: [
      "weaponanimations.meta names 128 weapons — that is a shared vanilla file, not a per-weapon template. Point at a per-weapon folder (e.g. a pack's metas/<weapon>/) or split it first.",
      "C:/demo/weapons/metas/wt_alpha_addon already exists — pick another id or enable overwrite",
    ],
  };
}

/* -------------------------------------------------------------------------
 * Pack mode (`?wggen` shows the queue; `?wggen=packblocked` shows the blockers)
 * ---------------------------------------------------------------------- */

/** The same plan for a second weapon — only the names differ. */
function demoPlanVariant(): ExportPlan {
  const base = demoGeneratorPlan();
  const swap = (s: string) =>
    s.replace(/wt_alpha_addon/g, "wt_bravo_addon").replace(/WT_ALPHA_ADDON/g, "WT_BRAVO_ADDON");
  return {
    ...base,
    folder: "wt_bravo_addon",
    files: base.files.map((f) => ({ ...f, path: swap(f.path) })),
    retargeted: base.retargeted.map(swap),
    edits: base.edits.map(swap),
    total_bytes: base.total_bytes - 240_000,
  };
}

/** Two weapons queued in the pack — the state `Add to pack` builds up. */
export function demoGeneratorPackQueue(): WeaponSpec[] {
  const spec = (id: string, displayName: string, order: number | null, model: string): WeaponSpec => ({
    id,
    display_name: displayName,
    template_meta_path: `C:/demo/templates/weapons/${id}/weapons.meta`,
    template_id: "WEAPON_COMBATPISTOL",
    assets_folder: `C:/demo/assets/${order ?? ""}`,
    model,
    audio: "AUDIO_ITEM_PISTOL",
    ammo_ref: "AMMO_PISTOL",
    damage_type: "BULLET",
    fire_type: "FIRE_TYPE_SINGLE",
    damage: "26",
    range: "220",
    clip_size: "15",
    headshot_modifier: "2.0",
    reload_rate: null,
    fire_rate_modifier: "1.2",
    slot_order: order,
    components: [],
  });
  return [
    spec("WEAPON_WT_ALPHA_ADDON", "Alpha Nine", 423, "w_demo_alpha"),
    spec("WEAPON_WT_BRAVO_ADDON", "Bravo Nine", null, "w_demo_bravo"),
  ];
}

export function demoGeneratorPackPlan(): PackPlan {
  const root = "C:/demo/weapons";  const strip = (p: ExportPlan): ExportPlan => ({
    ...p,
    files: p.files.filter((f) => f.kind !== "manifest" && f.kind !== "lua"),
  });
  const alpha = strip(demoGeneratorPlan());
  const bravo = strip(demoPlanVariant());
  return {
    out_root: root,
    weapons: [alpha, bravo],
    shared_files: [
      { path: `${root}/fxmanifest.lua`, action: "create", kind: "manifest", bytes: 604 },
      { path: `${root}/cl_weaponNames.lua`, action: "create", kind: "lua", bytes: 122 },
    ],
    conflicts: [],
    warnings: [],
    allocations: [
      "WEAPON_WT_BRAVO_ADDON → slot order 424 (allocated after the orders already in use)",
    ],
    total_bytes: alpha.total_bytes + bravo.total_bytes + 726,
  };
}

/** The same pack with the cross-weapon blockers found: duplicates, order and component clash. */
export function demoGeneratorBlockedPackPlan(): PackPlan {
  const plan = demoGeneratorPackPlan();
  return {
    ...plan,
    allocations: [],
    conflicts: [
      "duplicate weapon id WEAPON_WT_ALPHA_ADDON in the pack",
      "WEAPON_WT_ALPHA_ADDON, WEAPON_WT_BRAVO_ADDON both map to the resource folder 'metas/wt_alpha_addon' — one weapon would overwrite the other",
      "WEAPON_WT_BRAVO_ADDON: slot order 423 is already used by WEAPON_WT_ALPHA_ADDON in this resource",
      "COMPONENT_WT_ALPHA_ADDON_CLIP_01 is declared by both WEAPON_WT_ALPHA_ADDON and WEAPON_WT_BRAVO_ADDON — the last one loaded wins",
      "COMPONENT_COMBATPISTOL_CLIP_01 already exists in the resource under metas/glock17/ — renaming it here would break that weapon",
    ],
    warnings: [
      "WEAPON_WT_ALPHA_ADDON, WEAPON_WT_BRAVO_ADDON share the display name 'Alpha Nine' — both would show the same label in the weapon wheel",
      "WEAPON_WT_ALPHA_ADDON, WEAPON_WT_BRAVO_ADDON both point at the model w_demo_alpha — they would look identical",
    ],
  };
}

/**
 * `?wggen=slots`: a weapon with real per-slot option lists — 3 clips on `WAPClip` (one default),
 * 2 scopes on `WAPScop` (none default, which real packs do too) and a lone suppressor. Shaped like
 * the hand-made `m6ic` ceiling, scaled down.
 */
export function demoGeneratorSlots(): WeaponComponentSpec[] {
  const pick = (sourceName: string, target: string, model: string, isDefault: boolean): WeaponComponentSpec => ({
    name: target,
    source_name: sourceName,
    source_file: `C:/demo/templates/components/${sourceName}/weaponcomponents.meta`,
    model,
    clip_size: null,
    default: isDefault,
  });
  return [
    pick("COMPONENT_WT_ALPHA_CLIP_01", "COMPONENT_WT_ALPHA_ADDON_CLIP_01", "w_demo_alpha_mag1", true),
    pick("COMPONENT_WT_ALPHA_CLIP_02", "COMPONENT_WT_ALPHA_ADDON_CLIP_02", "w_demo_alpha_mag2", false),
    pick("COMPONENT_WT_DELTA_CLIP_01", "COMPONENT_WT_ALPHA_ADDON_CLIP_03", "w_demo_delta_mag1", false),
    pick("COMPONENT_AT_SCOPE_MACRO", "COMPONENT_AT_SCOPE_MACRO", "w_at_scope_macro", false),
    pick("COMPONENT_AT_PI_SUPP", "COMPONENT_AT_PI_SUPP", "w_at_pi_supp", false),
  ];
}
