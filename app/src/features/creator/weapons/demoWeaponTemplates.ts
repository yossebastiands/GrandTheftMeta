// Dev fixture for the Weapon Templates view — `?wtdemo` in a plain browser pane.
//
// Synthetic on purpose (like `demoUv.ts`): the ids are obviously fake so it can never
// be mistaken for a real pack. It covers every state the UI must render:
//   · a clean template                       (WT_ALPHA)
//   · a contaminated template                (WT_BRAVO → names WT_ALPHA)
//   · zero animation sets + no archetypes     (WT_CHARLIE)
//   · a second file with the same id          (duplicate id warning)
//   · components: clip / suppressor / scope / flashlight + a suggested one that is missing
import type { WeaponComponent, WeaponTemplate, WeaponTemplateCatalog } from "../../../shared/models";

const params = (n: number, id: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    out[`fDemoParam${String(i).padStart(2, "0")}`] = (i * 1.5 + id.length / 10).toFixed(6);
  }
  return out;
};

const template = (t: Partial<WeaponTemplate> & { id: string }): WeaponTemplate => {
  const p = params(24, t.id);
  return {
    file: `metas/${t.id.toLowerCase()}/weapons.meta`,
    meta_path: `C:/demo/weapons/metas/${t.id.toLowerCase()}/weapons.meta`,
    model: "w_demo_model",
    slot: `SLOT_${t.id}`,
    group: "GROUP_PISTOL",
    wheel_slot: "WHEEL_PISTOL",
    audio: "AUDIO_ITEM_PISTOL",
    ammo_ref: "AMMO_PISTOL",
    fire_type: "INSTANT_HIT",
    damage_type: "BULLET",
    clip_size: "12",
    weapon_range: "120.000000",
    human_name_hash: "WT_DEMO",
    slot_entry: "",
    slot_order: "",
    params: p,
    param_count: Object.keys(p).length,
    anim_sets: 6,
    ped_refs: 19,
    foreign_ids: [],
    anim_files: [],
    ped_files: [],
    archetype_models: [],
    local_components: [],
    suggested_components: [],
    warnings: [],
    ...t,
  };
};

const component = (c: Partial<WeaponComponent> & { name: string }): WeaponComponent => ({
  file: `metas/${c.name.toLowerCase()}/weaponcomponents.meta`,
  path: `C:/demo/weapons/metas/${c.name.toLowerCase()}/weaponcomponents.meta`,
  kind: "Attachment",
  item_type: "CWeaponComponentInfo",
  model: "",
  loc_name: "",
  loc_desc: "",
  attach_bone: "AAPDemo",
  weapon_attach_bone: "WAPDemo",
  clip_size: "",
  param_count: 15,
  ...c,
});

const TEMPLATES: WeaponTemplate[] = [
  template({
    id: "WT_ALPHA",
    model: "w_demo_alpha",
    slot_order: "300",
    slot_entry: "SLOT_WT_ALPHA",
    anim_sets: 6,
    ped_refs: 19,
    anim_files: ["metas/wt_alpha/weaponanimations.meta"],
    ped_files: ["metas/wt_alpha/pedpersonality.meta"],
    archetype_models: ["w_demo_alpha", "w_demo_alpha_mag1", "w_demo_alpha_mag2"],
    local_components: ["COMPONENT_WT_ALPHA_CLIP_01", "COMPONENT_WT_ALPHA_CLIP_02"],
    suggested_components: ["COMPONENT_WT_ALPHA_CLIP_01", "COMPONENT_WT_ALPHA_CLIP_02"],
  }),
  template({
    id: "WT_BRAVO",
    model: "w_demo_bravo",
    group: "GROUP_RIFLE",
    wheel_slot: "WHEEL_RIFLE",
    audio: "AUDIO_ITEM_RIFLE",
    ammo_ref: "AMMO_RIFLE",
    clip_size: "30",
    weapon_range: "220.000000",
    slot_order: "512",
    slot_entry: "SLOT_WT_BRAVO",
    anim_sets: 0,
    ped_refs: 1,
    foreign_ids: ["WT_ALPHA"],
    anim_files: ["metas/wt_bravo/weaponanimations.meta"],
    ped_files: ["metas/wt_bravo/pedpersonality.meta"],
    archetype_models: ["w_demo_bravo"],
    suggested_components: ["COMPONENT_WT_BRAVO_CLIP_01", "COMPONENT_WT_BRAVO_SCOPE_01"],
    warnings: [
      "no weaponanimations entry for this id — the weapon would have no movement/aim clip sets",
      "this template's own files reference WT_ALPHA — the generator must retarget those ids",
    ],
  }),
  template({
    id: "WT_CHARLIE",
    model: "w_demo_charlie",
    group: "GROUP_MELEE",
    wheel_slot: "WHEEL_UNARMED_MELEE",
    clip_size: "0",
    weapon_range: "1.600000",
    anim_sets: 0,
    ped_refs: 0,
    suggested_components: ["COMPONENT_WT_CHARLIE_CLIP_01"],
    warnings: [
      "no weaponanimations entry for this id — the weapon would have no movement/aim clip sets",
      "no pedpersonality reference — unholster/movement bindings are missing",
      "no weaponarchetypes models declared — a generator creates them from the streamed drawables",
    ],
  }),
  template({
    id: "WT_ALPHA",
    file: "overrides/wt_alpha/weapons.meta",
    meta_path: "C:/demo/weapons/overrides/wt_alpha/weapons.meta",
    model: "w_demo_alpha_v2",
    anim_sets: 7,
    ped_refs: 21,
    warnings: ["duplicate id — also defined in metas/wt_alpha/weapons.meta"],
  }),
  template({
    id: "WT_DELTA",
    model: "w_demo_delta",
    group: "GROUP_SMG",
    clip_size: "60",
    anim_files: ["metas/wt_delta/weaponanimations.meta"],
    ped_files: ["metas/wt_delta/pedpersonality.meta"],
    archetype_models: ["w_demo_delta", "w_demo_delta_mag1"],
    local_components: [],
    suggested_components: ["COMPONENT_WT_DELTA_CLIP_01"],
  }),
  template({
    id: "WT_ECHO",
    model: "w_demo_echo",
    group: "GROUP_SHOTGUN",
    damage_type: "EXPLOSIVE",
    clip_size: "8",
    anim_sets: 7,
    ped_refs: 13,
    suggested_components: [],
    warnings: ["no matching components found"],
  }),
];

const COMPONENTS: WeaponComponent[] = [
  component({
    name: "COMPONENT_WT_ALPHA_CLIP_01",
    kind: "Clip",
    item_type: "CWeaponComponentClipInfo",
    model: "w_demo_alpha_mag1",
    loc_name: "WCT_CLIP1",
    attach_bone: "AAPClip",
    weapon_attach_bone: "WAPClip",
    clip_size: "12",
    param_count: 18,
  }),
  component({
    name: "COMPONENT_WT_ALPHA_CLIP_02",
    kind: "Clip",
    item_type: "CWeaponComponentClipInfo",
    model: "w_demo_alpha_mag2",
    loc_name: "WCT_CLIP2",
    attach_bone: "AAPClip",
    weapon_attach_bone: "WAPClip",
    clip_size: "24",
    param_count: 18,
  }),
  component({
    name: "COMPONENT_WT_DELTA_CLIP_01",
    kind: "Clip",
    item_type: "CWeaponComponentClipInfo",
    model: "w_demo_delta_mag1",
    attach_bone: "AAPClip",
    weapon_attach_bone: "WAPClip",
    clip_size: "60",
    param_count: 18,
  }),
  component({
    name: "COMPONENT_AT_PI_SUPP",
    kind: "Suppressor",
    item_type: "CWeaponComponentSuppressorInfo",
    model: "w_at_pi_supp",
    loc_name: "WCT_SUPP",
    attach_bone: "AAPSupp",
    weapon_attach_bone: "WAPSupp",
    param_count: 17,
  }),
  component({
    name: "COMPONENT_AT_SCOPE_MACRO",
    kind: "Scope",
    item_type: "CWeaponComponentScopeInfo",
    model: "w_at_scope_macro",
    loc_name: "WCT_SCOPE_MAC",
    attach_bone: "AAPScop",
    weapon_attach_bone: "WAPScop",
    param_count: 20,
  }),
  component({
    name: "COMPONENT_AT_PI_FLSH",
    kind: "Flashlight",
    item_type: "CWeaponComponentFlashLightInfo",
    model: "w_at_pi_flsh",
    loc_name: "WCT_FLASH",
    attach_bone: "AAPFlsh",
    weapon_attach_bone: "WAPFlshLasr",
    param_count: 44,
  }),
];

/** The fixture the `?wtdemo` dev query param loads. */
export function demoWeaponTemplates(): WeaponTemplateCatalog {
  return {
    folder_path: "C:/demo/weapons  (synthetic ?wtdemo fixture — not a real pack)",
    templates: TEMPLATES,
    components: COMPONENTS,
    skipped: [
      "metas/broken/weapons.meta: no CWeaponInfo found",
      "metas/odd/weaponcomponents.meta: XML parse error at line 4",
    ],
  };
}
