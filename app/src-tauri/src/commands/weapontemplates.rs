//! Weapon **template catalogue** — P1 of the weapon-pack generator.
//!
//! A "base weapon template" is one vanilla `<Item type="CWeaponInfo">` plus the
//! companion data that makes it usable: the `weaponanimations` clip sets (per
//! personality), the `pedpersonality` bindings, the `weaponarchetypes` model list and
//! its components. vWeaponsToolkit shipped 27 of these as data; GTM **derives** them
//! from the user's own vanilla metas instead, because we must not redistribute
//! R*-derived template XML — see
//! `Dev-Notes/MyApps/vWeaponsToolkit/vWeaponsToolkit-1.0.3-ANALYSIS.md` §10.3.
//!
//! Read-only: nothing here writes. Layout-agnostic like `weapons.rs` — it walks the
//! whole chosen folder, so a per-weapon layout (`metas/<weapon>/`, the shape a pack
//! ends up in) and one flat vanilla folder both work.
//!
//! Reference numbers for the toolkit's own `templates/` folder (used by the `#[ignore]`
//! e2e test): 27 templates, 47 components; e.g. WEAPON_APPISTOL → 6 animation sets and
//! 19 pedpersonality refs, WEAPON_MARKSMANRIFLE → 11 sets.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use serde::Serialize;
use walkdir::WalkDir;

use super::scan::{child_text, collect_items, parse_xml, scalar_leaves, XmlNode};
use super::textnav::masked;
use super::weapons::find_weapon_metas;

/// Identity / display fields surfaced as dedicated columns, so they are not repeated
/// inside `params`.
const IDENTITY: &[&str] = &[
    "Name",
    "Model",
    "Slot",
    "Group",
    "WheelSlot",
    "Audio",
    "FireType",
    "DamageType",
    "ClipSize",
    "WeaponRange",
    "HumanNameHash",
    "StatName",
];

#[derive(Serialize, Debug, Clone, Default)]
pub struct WeaponTemplate {
    /// `<Name>` of the CWeaponInfo, e.g. `WEAPON_COMBATPISTOL`.
    pub id: String,
    /// Relative path of the `weapons.meta` it came from.
    pub file: String,
    /// Absolute path of that file (used for sibling lookup + "open file" later).
    pub meta_path: String,
    pub model: String,
    pub slot: String,
    pub group: String,
    pub wheel_slot: String,
    pub audio: String,
    pub ammo_ref: String,
    pub fire_type: String,
    pub damage_type: String,
    pub clip_size: String,
    pub weapon_range: String,
    pub human_name_hash: String,
    /// `SlotNavigateOrder` entry matching this weapon's `<Slot>` (may be empty).
    pub slot_entry: String,
    /// Order number for that entry — the value a generator must make unique.
    pub slot_order: String,
    /// Remaining tuning leaves (identity fields excluded).
    pub params: BTreeMap<String, String>,
    pub param_count: usize,
    /// Personality sets in `weaponanimations` that mention this weapon **by id**.
    /// These counts are per-id across the whole folder, not "refs in its own file":
    /// a hand-made template that still points at a sibling (see `foreign_ids`) shows
    /// 0/small here, which is the signal that it must be normalised before cloning.
    pub anim_sets: usize,
    /// References to this weapon in `pedpersonality` (unholster / clip-set bindings).
    pub ped_refs: usize,
    /// Sibling weapon ids found inside *this template's own* anim/ped files. The
    /// toolkit's templates leak these (11 of its 27 do — e.g. `WEAPON_PISTOL50`'s
    /// animation file only ever names `WEAPON_PISTOL`); a generator must retarget them
    /// or the weapon ends up sharing another weapon's animation sets.
    pub foreign_ids: Vec<String>,
    /// Which files contributed those counts (diagnostics: real packs split these up).
    pub anim_files: Vec<String>,
    pub ped_files: Vec<String>,
    /// `modelName`s declared next to it (empty for a stub — a generator creates these).
    pub archetype_models: Vec<String>,
    /// Components that physically live in this weapon's own folder.
    pub local_components: Vec<String>,
    /// Components whose name follows `COMPONENT_<weapon token>_…` — a name-prefix
    /// heuristic only (e.g. `WEAPON_PISTOL` → `COMPONENT_PISTOL_CLIP_01/02`, and it must
    /// NOT drag in `COMPONENT_PISTOL50_*`). Not a statement about what the game wants.
    pub suggested_components: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Debug, Clone, Default)]
pub struct WeaponComponent {
    pub name: String,
    /// Relative path of the file it was found in.
    pub file: String,
    /// Absolute path of that file (what the generator clones from).
    pub path: String,
    /// Friendly kind (`Clip`, `Suppressor`, `Flashlight`, `Scope`, `Attachment`).
    pub kind: String,
    pub item_type: String,
    pub model: String,
    pub loc_name: String,
    pub loc_desc: String,
    /// Bone on the component model (`AAPClip`).
    pub attach_bone: String,
    /// Bone on the weapon — this is the `<AttachBone>` used inside `<AttachPoints>`.
    pub weapon_attach_bone: String,
    pub clip_size: String,
    pub param_count: usize,
}

#[derive(Serialize, Debug, Default)]
pub struct WeaponTemplateCatalog {
    pub folder_path: String,
    pub templates: Vec<WeaponTemplate>,
    pub components: Vec<WeaponComponent>,
    /// Files that could not be read/parsed, or held no CWeaponInfo.
    pub skipped: Vec<String>,
}

// ---------------------------------------------------------------------------
// Text-level parsing (pure — unit tested)
// ---------------------------------------------------------------------------

fn child_attr(node: &XmlNode, name: &str, attr: &str) -> String {
    node.children
        .iter()
        .find(|c| c.name == name)
        .and_then(|c| c.attr(attr))
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// `SlotNavigateOrder` → `{entry: order}`. In a real file `<Entry>` mirrors the
/// weapon's `<Slot>`, which is how a weapon gets its order number.
fn slot_order_map(roots: &[XmlNode]) -> BTreeMap<String, String> {
    fn walk(node: &XmlNode, out: &mut BTreeMap<String, String>) {
        if node.name == "Item" {
            let entry = child_text(node, "Entry");
            let order = child_attr(node, "OrderNumber", "value");
            if !entry.is_empty() && !order.is_empty() {
                out.insert(entry, order);
            }
        }
        for c in &node.children {
            walk(c, out);
        }
    }
    let mut out = BTreeMap::new();
    for r in roots {
        walk(r, &mut out);
    }
    out
}

/// Every `<Item type="CWeaponInfo">` in one `weapons.meta` text → template rows.
/// Commented-out entries are invisible (the DOM parser drops comments), and a weapon
/// without a `<Name>` is skipped by the caller.
pub(crate) fn parse_template_items(
    text: &str,
    rel: &str,
    abs: &str,
) -> Result<Vec<WeaponTemplate>, String> {
    let roots = parse_xml(text)?;
    let orders = slot_order_map(&roots);
    let mut out = Vec::new();
    for item in collect_items(&roots) {
        if item.attr("type") != Some("CWeaponInfo") {
            continue;
        }
        let id = child_text(item, "Name");
        if id.is_empty() {
            continue;
        }
        let slot = child_text(item, "Slot");
        let slot_order = orders.get(&slot).cloned().unwrap_or_default();
        let params = scalar_leaves(item, IDENTITY);
        out.push(WeaponTemplate {
            id,
            file: rel.to_string(),
            meta_path: abs.to_string(),
            model: child_text(item, "Model"),
            group: child_text(item, "Group"),
            wheel_slot: child_text(item, "WheelSlot"),
            audio: child_text(item, "Audio"),
            ammo_ref: item
                .children
                .iter()
                .find(|c| c.name == "AmmoInfo")
                .and_then(|c| c.attr("ref"))
                .unwrap_or_default()
                .to_string(),
            fire_type: child_text(item, "FireType"),
            damage_type: child_text(item, "DamageType"),
            clip_size: child_attr(item, "ClipSize", "value"),
            weapon_range: child_attr(item, "WeaponRange", "value"),
            human_name_hash: child_text(item, "HumanNameHash"),
            slot_entry: if slot_order.is_empty() {
                String::new()
            } else {
                slot.clone()
            },
            slot_order,
            slot,
            param_count: params.len(),
            params,
            ..Default::default()
        });
    }
    Ok(out)
}

/// Every `CWeaponComponent*Info` item in one `weaponcomponents.meta` text.
pub(crate) fn parse_component_items(
    text: &str,
    rel: &str,
    abs: &str,
) -> Result<Vec<WeaponComponent>, String> {
    let roots = parse_xml(text)?;
    let mut out = Vec::new();
    for item in collect_items(&roots) {
        let item_type = item.attr("type").unwrap_or_default().to_string();
        if !item_type.starts_with("CWeaponComponent") {
            continue;
        }
        let name = child_text(item, "Name");
        if name.is_empty() {
            continue;
        }
        let params = scalar_leaves(
            item,
            &[
                "Name",
                "Model",
                "LocName",
                "LocDesc",
                "AttachBone",
                "WeaponAttachBone",
                "ClipSize",
            ],
        );
        out.push(WeaponComponent {
            name,
            file: rel.to_string(),
            path: abs.to_string(),
            kind: component_kind(&item_type),
            item_type,
            model: child_text(item, "Model"),
            loc_name: child_text(item, "LocName"),
            loc_desc: child_text(item, "LocDesc"),
            attach_bone: child_text(item, "AttachBone"),
            weapon_attach_bone: child_text(item, "WeaponAttachBone"),
            clip_size: child_attr(item, "ClipSize", "value"),
            param_count: params.len(),
        });
    }
    Ok(out)
}

fn component_kind(item_type: &str) -> String {
    match item_type {
        "CWeaponComponentClipInfo" => "Clip",
        "CWeaponComponentSuppressorInfo" => "Suppressor",
        "CWeaponComponentFlashLightInfo" => "Flashlight",
        "CWeaponComponentScopeInfo" => "Scope",
        "CWeaponComponentInfo" => "Attachment",
        other => other,
    }
    .to_string()
}

fn anim_ref_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"key="(WEAPON_[A-Za-z0-9_]+)""#).expect("anim ref regex"))
}

fn ped_ref_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<Item>(WEAPON_[A-Za-z0-9_]+)</Item>").expect("ped ref regex"))
}

fn count_matches(text: &str, re: &Regex) -> BTreeMap<String, usize> {
    let mut out: BTreeMap<String, usize> = BTreeMap::new();
    for caps in re.captures_iter(text) {
        if let Some(m) = caps.get(1) {
            *out.entry(m.as_str().to_string()).or_insert(0) += 1;
        }
    }
    out
}

/// `key="WEAPON_X"` counts per weapon id, comment bodies ignored.
pub(crate) fn count_anim_refs(text: &str) -> BTreeMap<String, usize> {
    count_matches(&masked(text), anim_ref_re())
}

/// `<Item>WEAPON_X</Item>` counts per weapon id, comment bodies ignored.
pub(crate) fn count_ped_refs(text: &str) -> BTreeMap<String, usize> {
    count_matches(&masked(text), ped_ref_re())
}

/// `COMPONENT_<weapon token>_…` — a *name-prefix* suggestion only. The trailing `_`
/// is what keeps `WEAPON_PISTOL` from matching `COMPONENT_PISTOL50_CLIP_01`.
pub(crate) fn suggested_components(id: &str, names: &[String]) -> Vec<String> {
    let token = id.strip_prefix("WEAPON_").unwrap_or(id);
    let prefix = format!("COMPONENT_{token}_");
    let mut out: Vec<String> = names
        .iter()
        .filter(|n| n.starts_with(&prefix))
        .cloned()
        .collect();
    out.sort();
    out.dedup();
    out
}

// ---------------------------------------------------------------------------
// Filesystem layer
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FileKind {
    Animations,
    PedPersonality,
    Components,
    Archetypes,
}

pub(crate) fn file_kind(name: &str) -> Option<FileKind> {
    let lower = name.to_ascii_lowercase();
    if !lower.ends_with(".meta") {
        return None;
    }
    if lower == "weaponanimations.meta" || lower.starts_with("weaponanimations_") {
        return Some(FileKind::Animations);
    }
    if lower == "pedpersonality.meta" || lower.starts_with("pedpersonality_") {
        return Some(FileKind::PedPersonality);
    }
    if lower.starts_with("weaponcomponents") {
        return Some(FileKind::Components);
    }
    if lower.starts_with("weaponarchetypes") {
        return Some(FileKind::Archetypes);
    }
    None
}

fn rel_of(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn read_text(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Files sitting next to one `weapons.meta`, plus its `components/` subfolder.
#[derive(Default)]
struct Siblings {
    animations: Option<PathBuf>,
    pedpersonality: Option<PathBuf>,
    archetypes: Option<PathBuf>,
    components: Vec<PathBuf>,
    components_dir: Vec<String>,
}

fn siblings_of(meta_path: &Path) -> Siblings {
    let mut out = Siblings::default();
    let Some(dir) = meta_path.parent() else {
        return out;
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if name.eq_ignore_ascii_case("components") {
                if let Ok(subs) = fs::read_dir(&path) {
                    out.components_dir = subs
                        .flatten()
                        .filter(|e| e.path().is_dir())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect();
                }
            }
            continue;
        }
        match file_kind(&name) {
            Some(FileKind::Animations) => {
                out.animations.get_or_insert(path);
            }
            Some(FileKind::PedPersonality) => {
                out.pedpersonality.get_or_insert(path);
            }
            Some(FileKind::Archetypes) => {
                out.archetypes.get_or_insert(path);
            }
            Some(FileKind::Components) => out.components.push(path),
            None => continue,
        };
    }
    out
}

/// `modelName`s declared by a `weaponarchetypes.meta` (`<InitDatas>` → `<Item>`).
fn archetype_models(text: &str) -> Vec<String> {
    let Ok(roots) = parse_xml(text) else {
        return Vec::new();
    };
    fn find<'a>(node: &'a XmlNode, name: &str) -> Option<&'a XmlNode> {
        if node.name == name {
            return Some(node);
        }
        node.children.iter().find_map(|c| find(c, name))
    }
    let mut out: Vec<String> = Vec::new();
    for root in &roots {
        let Some(init) = find(root, "InitDatas") else {
            continue;
        };
        for item in &init.children {
            let mut model = child_text(item, "modelName");
            if model.is_empty() {
                model = child_text(item, "Name");
            }
            if !model.is_empty() {
                out.push(model);
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/// Derive the base-weapon catalogue from a folder of vanilla / pack metas.
#[tauri::command]
pub fn analyze_weapon_templates(folder_path: String) -> Result<WeaponTemplateCatalog, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut skipped: Vec<String> = Vec::new();

    // 1. Every CWeaponInfo in every weapons*.meta becomes a template.
    let mut templates: Vec<WeaponTemplate> = Vec::new();
    for path in find_weapon_metas(&root) {
        let rel = rel_of(&root, &path);
        let abs = path.to_string_lossy().into_owned();
        match read_text(&path) {
            Ok(text) => match parse_template_items(&text, &rel, &abs) {
                Ok(items) if items.is_empty() => skipped.push(format!("{rel}: no CWeaponInfo found")),
                Ok(items) => templates.extend(items),
                Err(e) => skipped.push(format!("{rel}: {e}")),
            },
            Err(e) => skipped.push(format!("{rel}: {e}")),
        }
    }

    // 2. One walk for the global reference index + the component catalogue.
    let mut anim: BTreeMap<String, usize> = BTreeMap::new();
    let mut ped: BTreeMap<String, usize> = BTreeMap::new();
    let mut anim_files: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut ped_files: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut components: Vec<WeaponComponent> = Vec::new();
    let mut component_names: BTreeSet<String> = BTreeSet::new();

    for entry in WalkDir::new(&root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(kind) = file_kind(&name) else {
            continue;
        };
        let rel = rel_of(&root, path);
        let text = match read_text(path) {
            Ok(t) => t,
            Err(e) => {
                skipped.push(format!("{rel}: {e}"));
                continue;
            }
        };
        match kind {
            FileKind::Animations => {
                for (id, n) in count_anim_refs(&text) {
                    *anim.entry(id.clone()).or_insert(0) += n;
                    anim_files.entry(id).or_default().insert(rel.clone());
                }
            }
            FileKind::PedPersonality => {
                for (id, n) in count_ped_refs(&text) {
                    *ped.entry(id.clone()).or_insert(0) += n;
                    ped_files.entry(id).or_default().insert(rel.clone());
                }
            }
            FileKind::Components => match parse_component_items(&text, &rel, &path.to_string_lossy()) {
                Ok(items) => {
                    for c in items {
                        if component_names.insert(c.name.clone()) {
                            components.push(c);
                        }
                    }
                }
                Err(e) => skipped.push(format!("{rel}: {e}")),
            },
            FileKind::Archetypes => {}
        }
    }

    components.sort_by(|a, b| a.name.cmp(&b.name));
    let all_component_names: Vec<String> = component_names.iter().cloned().collect();

    // 3. Enrich each template with refs, siblings and warnings.
    // Owned (not a borrow of `templates`) so the loop below can mutate rows.
    let mut files_by_id: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for t in &templates {
        files_by_id.entry(t.id.clone()).or_default().push(t.file.clone());
    }
    for t in templates.iter_mut() {
        t.anim_sets = anim.get(&t.id).copied().unwrap_or(0);
        t.ped_refs = ped.get(&t.id).copied().unwrap_or(0);
        t.anim_files = anim_files
            .get(&t.id)
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default();
        t.ped_files = ped_files
            .get(&t.id)
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default();

        let sib = siblings_of(Path::new(&t.meta_path));
        t.archetype_models = sib
            .archetypes
            .as_ref()
            .and_then(|p| read_text(p).ok())
            .map(|text| archetype_models(&text))
            .unwrap_or_default();

        // Which sibling ids do *this template's own* files name?
        let mut foreign: BTreeSet<String> = BTreeSet::new();
        for path in [sib.animations.as_ref(), sib.pedpersonality.as_ref()]
            .into_iter()
            .flatten()
        {
            if let Ok(text) = read_text(path) {
                for id in count_anim_refs(&text)
                    .into_keys()
                    .chain(count_ped_refs(&text).into_keys())
                {
                    if id != t.id {
                        foreign.insert(id);
                    }
                }
            }
        }
        t.foreign_ids = foreign.iter().cloned().collect();

        let mut local: BTreeSet<String> = sib.components_dir.iter().cloned().collect();
        for path in &sib.components {
            if let Ok(text) = read_text(path) {
                if let Ok(items) =
                    parse_component_items(&text, &rel_of(&root, path), &path.to_string_lossy())
                {
                    for c in items {
                        local.insert(c.name);
                    }
                }
            }
        }
        t.local_components = local.iter().cloned().collect();
        t.suggested_components = suggested_components(&t.id, &all_component_names);

        let mut warn: Vec<String> = Vec::new();
        if t.anim_sets == 0 {
            warn.push(
                "no weaponanimations entry for this id — the weapon would have no movement/aim clip sets"
                    .to_string(),
            );
        }
        if !t.foreign_ids.is_empty() {
            warn.push(format!(
                "this template's own files reference {} — the generator must retarget those ids",
                t.foreign_ids.join(", ")
            ));
        }
        if t.ped_refs == 0 {
            warn.push("no pedpersonality reference — unholster/movement bindings are missing".to_string());
        }
        if t.archetype_models.is_empty() {
            warn.push(
                "no weaponarchetypes models declared — a generator creates them from the streamed drawables"
                    .to_string(),
            );
        }
        if t.local_components.is_empty() && t.suggested_components.is_empty() {
            warn.push("no matching components found".to_string());
        }
        if let Some(files) = files_by_id.get(&t.id) {
            let others: Vec<&str> = files
                .iter()
                .filter(|f| **f != t.file)
                .map(|f| f.as_str())
                .collect();
            if !others.is_empty() {
                warn.push(format!("duplicate id — also defined in {}", others.join(", ")));
            }
        }
        t.warnings = warn;
    }

    templates.sort_by(|a, b| a.id.cmp(&b.id).then_with(|| a.file.cmp(&b.file)));

    Ok(WeaponTemplateCatalog {
        folder_path,
        templates,
        components,
        skipped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const WPN: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<CWeaponInfoBlob>
  <SlotNavigateOrder>
    <Item>
      <WeaponSlots>
        <Item><OrderNumber value="300" /><Entry>SLOT_A</Entry></Item>
        <Item><OrderNumber value="512" /><Entry>SLOT_B</Entry></Item>
      </WeaponSlots>
    </Item>
  </SlotNavigateOrder>
  <Infos>
    <Item>
      <Infos>
        <Item type="CWeaponInfo">
          <Name>WEAPON_A</Name>
          <Model>W_PI_A</Model>
          <Audio>AUDIO_ITEM_A</Audio>
          <Slot>SLOT_A</Slot>
          <Group>GROUP_PISTOL</Group>
          <WheelSlot>WHEEL_PISTOL</WheelSlot>
          <DamageType>BULLET</DamageType>
          <FireType>INSTANT_HIT</FireType>
          <AmmoInfo ref="AMMO_PISTOL" />
          <ClipSize value="12" />
          <WeaponRange value="120.000000" />
          <HumanNameHash>WT_PIST</HumanNameHash>
          <Damage value="28.000000" />
          <StatName>CMBTPISTOL</StatName>
          <AttachPoints></AttachPoints>
        </Item>
        <!-- <Item type="CWeaponInfo"><Name>WEAPON_COMMENTED</Name></Item> -->
        <Item type="CWeaponInfo">
          <Name>WEAPON_B</Name>
          <Model>W_AR_B</Model>
          <Slot>SLOT_B</Slot>
          <ClipSize value="30" />
        </Item>
      </Infos>
    </Item>
  </Infos>
</CWeaponInfoBlob>"#;

    #[test]
    fn templates_carry_identity_slot_order_and_params() {
        let rows = parse_template_items(WPN, "metas/x/weapons.meta", "C:/x/weapons.meta").unwrap();
        assert_eq!(rows.len(), 2, "the commented-out weapon must be invisible");
        assert_eq!(rows[0].id, "WEAPON_A");
        assert_eq!(rows[0].model, "W_PI_A");
        assert_eq!(rows[0].audio, "AUDIO_ITEM_A");
        assert_eq!(rows[0].ammo_ref, "AMMO_PISTOL");
        assert_eq!(rows[0].clip_size, "12");
        assert_eq!(rows[0].weapon_range, "120.000000");
        assert_eq!(rows[0].human_name_hash, "WT_PIST");
        assert_eq!(rows[0].group, "GROUP_PISTOL");
        assert_eq!(rows[0].wheel_slot, "WHEEL_PISTOL");
        // the order number is matched through <Slot> == <Entry>
        assert_eq!(rows[0].slot_order, "300");
        assert_eq!(rows[1].slot_order, "512");
        // identity leaves are columns, not params; tuning leaves are params
        assert!(rows[0].params.contains_key("Damage"));
        assert!(!rows[0].params.contains_key("Name"));
        assert!(!rows[0].params.contains_key("ClipSize"));
        assert!(!rows[0].params.contains_key("AttachPoints"), "containers are not params");
        assert_eq!(rows[0].param_count, rows[0].params.len());
        // no SlotNavigateOrder entry for a weapon whose slot is not listed
        assert!(rows.iter().all(|r| r.file == "metas/x/weapons.meta"));
    }

    #[test]
    fn ref_counts_are_token_and_comment_aware() {
        let anim = r#"<CWeaponAnimationsSets>
  <Item key="Default"><WeaponAnimations>
    <Item key="WEAPON_A"><!----></Item>
    <Item key="WEAPON_A_SPECIAL"></Item>
    <!-- <Item key="WEAPON_A"></Item> -->
  </WeaponAnimations></Item>
</CWeaponAnimationsSets>"#;
        let counts = count_anim_refs(anim);
        assert_eq!(counts.get("WEAPON_A"), Some(&1), "commented ref must not count");
        assert_eq!(counts.get("WEAPON_A_SPECIAL"), Some(&1), "suffixed ids are their own key");

        let ped = "<R><L><Weapons><Item>WEAPON_A</Item><Item>WEAPON_B</Item></Weapons>\
                   <!-- <Item>WEAPON_A</Item> --></L></R>";
        let counts = count_ped_refs(ped);
        assert_eq!(counts.get("WEAPON_A"), Some(&1));
        assert_eq!(counts.get("WEAPON_B"), Some(&1));
    }

    #[test]
    fn components_expose_kind_bones_and_clip_size() {
        let text = r#"<CWeaponComponentInfoBlob>
  <Infos>
    <Item type="CWeaponComponentClipInfo">
      <Name>COMPONENT_A_CLIP_01</Name>
      <Model>w_pi_a_mag1</Model>
      <LocName>WCT_CLIP1</LocName>
      <AttachBone>AAPClip</AttachBone>
      <WeaponAttachBone>WAPClip</WeaponAttachBone>
      <ClipSize value="15" />
      <ReloadData ref="RELOAD_DEFAULT_WITH_EMPTIES" />
    </Item>
    <Item type="CWeaponComponentFlashLightInfo">
      <Name>COMPONENT_AT_PI_FLSH</Name>
      <Model>w_at_pi_flsh</Model>
      <AttachBone>AAPFlsh</AttachBone>
      <WeaponAttachBone>WAPFlshLasr</WeaponAttachBone>
      <MainLightIntensity value="6.000000" />
    </Item>
    <Item type="CWeaponComponentScopeInfo">
      <Name>COMPONENT_AT_SCOPE_MACRO</Name>
      <AttachBone>AAPScop</AttachBone>
      <WeaponAttachBone>WAPScop</WeaponAttachBone>
    </Item>
  </Infos>
</CWeaponComponentInfoBlob>"#;
        let comps = parse_component_items(text, "components/x/weaponcomponents.meta", "C:/x/weaponcomponents.meta").unwrap();
        assert_eq!(comps.len(), 3);
        assert_eq!(comps[0].kind, "Clip");
        assert_eq!(comps[0].weapon_attach_bone, "WAPClip");
        assert_eq!(comps[0].clip_size, "15");
        assert_eq!(comps[1].kind, "Flashlight");
        assert_eq!(comps[1].weapon_attach_bone, "WAPFlshLasr");
        assert!(comps[1].param_count > 0, "light params are counted");
        assert_eq!(comps[2].kind, "Scope");
        assert!(comps[2].clip_size.is_empty());
        // a component without <Name> would be skipped, identity leaves are not params
        assert!(comps.iter().all(|c| c.name.starts_with("COMPONENT_")));
    }

    #[test]
    fn component_suggestions_use_the_weapon_token() {
        let names: Vec<String> = [
            "COMPONENT_PISTOL_CLIP_01",
            "COMPONENT_PISTOL_CLIP_02",
            "COMPONENT_PISTOL50_CLIP_01",
            "COMPONENT_COMBATPISTOL_CLIP_01",
            "COMPONENT_AT_PI_SUPP",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let pistol = suggested_components("WEAPON_PISTOL", &names);
        assert_eq!(
            pistol,
            vec!["COMPONENT_PISTOL_CLIP_01", "COMPONENT_PISTOL_CLIP_02"],
            "PISTOL must not swallow PISTOL50, and shared AT_* parts are not auto-claimed"
        );
        let pistol50 = suggested_components("WEAPON_PISTOL50", &names);
        assert_eq!(pistol50, vec!["COMPONENT_PISTOL50_CLIP_01"]);
        assert!(suggested_components("WEAPON_UNKNOWN", &names).is_empty());
    }

    #[test]
    fn archetype_models_are_read_from_initdatas() {
        let text = "<CWeaponModelInfo__InitDataList>\n  <InitDatas>\n\
                    <Item><modelName>w_pi_a</modelName><txdName>w_pi_a</txdName></Item>\n\
                    <Item><modelName>w_pi_a_mag1</modelName></Item>\n\
                    <Item><Name>w_pi_a_legacy</Name></Item>\n\
                    </InitDatas>\n</CWeaponModelInfo__InitDataList>";
        assert_eq!(
            archetype_models(text),
            vec!["w_pi_a", "w_pi_a_legacy", "w_pi_a_mag1"]
        );
        assert!(archetype_models("<X><InitDatas/></X>").is_empty());
    }

    #[test]
    fn file_kinds_cover_the_real_names() {
        assert_eq!(file_kind("weaponanimations.meta"), Some(FileKind::Animations));
        assert_eq!(file_kind("pedpersonality.meta"), Some(FileKind::PedPersonality));
        assert_eq!(file_kind("weaponcomponents.meta"), Some(FileKind::Components));
        assert_eq!(file_kind("weaponarchetypes.meta"), Some(FileKind::Archetypes));
        assert_eq!(file_kind("weapons.meta"), None, "weapons.meta is the template source");
        assert_eq!(file_kind("weaponlayouts.meta"), None);
        assert_eq!(file_kind("pedpersonality.meta.bak"), None);
    }

    /// Real-folder parity check (needs the toolkit's `templates/` folder or a vanilla
    /// metas folder on disk):
    ///   $env:GT_TEST_WPN_TEMPLATES = "<...>\vWeaponsToolkit-1.0.3\templates"
    ///   cargo test --lib weapon_templates_real_folder -- --ignored --nocapture
    #[test]
    #[ignore]
    fn weapon_templates_real_folder() {
        let Ok(folder) = std::env::var("GT_TEST_WPN_TEMPLATES") else {
            eprintln!("GT_TEST_WPN_TEMPLATES not set — skipping");
            return;
        };
        let cat = analyze_weapon_templates(folder).expect("catalogue");
        println!(
            "{:<28} {:<26} {:>4} {:>4}  {} {}",
            "id", "model", "anim", "ped", "suggested components", "foreign ids"
        );
        for t in &cat.templates {
            println!(
                "{:<28} {:<26} {:>4} {:>4}  {} {}",
                t.id,
                t.model,
                t.anim_sets,
                t.ped_refs,
                t.suggested_components.join(","),
                if t.foreign_ids.is_empty() {
                    String::new()
                } else {
                    format!("| FOREIGN: {}", t.foreign_ids.join(","))
                }
            );
        }
        println!(
            "\ntemplates={} components={} skipped={}",
            cat.templates.len(),
            cat.components.len(),
            cat.skipped.len()
        );
        for s in &cat.skipped {
            println!("  skipped: {s}");
        }

        // Parity with the toolkit's own data (see ANALYSIS.md Appendix A/B + §5.1b).
        assert_eq!(cat.templates.len(), 27, "27 base weapons");
        assert_eq!(cat.components.len(), 47, "47 components");
        let by_id = |id: &str| cat.templates.iter().find(|t| t.id == id).expect(id);
        assert_eq!(by_id("WEAPON_COMBATPISTOL").model, "W_PI_COMBATPISTOL");
        assert_eq!(by_id("WEAPON_COMBATPISTOL").audio, "AUDIO_ITEM_COMBATPISTOL");
        assert_eq!(by_id("WEAPON_COMBATPISTOL").ammo_ref, "AMMO_PISTOL");
        assert_eq!(by_id("WEAPON_HEAVYSNIPER").weapon_range, "1500.000000");
        // clean templates: self refs == file refs
        assert_eq!(by_id("WEAPON_APPISTOL").anim_sets, 6);
        assert_eq!(by_id("WEAPON_APPISTOL").ped_refs, 1, "18 of its refs name WEAPON_PISTOL");
        assert_eq!(by_id("WEAPON_MARKSMANRIFLE").anim_sets, 11);
        assert_eq!(by_id("WEAPON_MARKSMANRIFLE").ped_refs, 19);
        assert_eq!(by_id("WEAPON_ASSAULTRIFLE").ped_refs, 13);
        // the hand-made template defects the generator must handle
        assert_eq!(by_id("WEAPON_PISTOL50").anim_sets, 0, "its anim file only names WEAPON_PISTOL");
        assert_eq!(by_id("WEAPON_PISTOL50").foreign_ids, vec!["WEAPON_PISTOL"]);
        assert_eq!(by_id("WEAPON_ADVANCEDRIFLE").foreign_ids, vec!["WEAPON_CARBINERIFLE"]);
        assert_eq!(by_id("WEAPON_APPISTOL").foreign_ids, vec!["WEAPON_PISTOL"]);
        assert_eq!(
            cat.templates.iter().filter(|t| !t.foreign_ids.is_empty()).count(),
            11,
            "11 of the toolkit's 27 templates reference a sibling weapon"
        );
        assert_eq!(
            cat.templates.iter().filter(|t| t.anim_sets == 0).count(),
            1,
            "only WEAPON_PISTOL50 has no animation set of its own"
        );
        // every template has *some* animation data, and only BALL has zero ped refs
        assert!(cat.templates.iter().all(|t| t.anim_sets > 0 || t.id == "WEAPON_PISTOL50"));
        assert_eq!(
            cat.templates.iter().filter(|t| t.ped_refs == 0).count(),
            1,
            "only WEAPON_BALL has no pedpersonality bindings"
        );
        // the pistol suggestions are data-driven and must not cross families
        assert_eq!(
            by_id("WEAPON_PISTOL").suggested_components,
            vec!["COMPONENT_PISTOL_CLIP_01", "COMPONENT_PISTOL_CLIP_02"]
        );
        assert_eq!(
            by_id("WEAPON_COMBATPISTOL").suggested_components,
            vec![
                "COMPONENT_COMBATPISTOL_CLIP_01",
                "COMPONENT_COMBATPISTOL_CLIP_02"
            ]
        );
    }
}
