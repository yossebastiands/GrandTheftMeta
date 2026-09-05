//! carcols.meta editor — a "list-style" meta.
//!
//! carcols.meta is not one flat record type per file (unlike handling/weapons/
//! vehicles). It is a tree of lists: `<Kits>` → one `<Item>` per mod kit, and a
//! kit holds `<visibleMods>`, `<linkMods>`, `<slotNames>`, `<statMods>`,
//! `<liveryNames>`; stock cars instead hold `<Paint>` / `<defaultPaint>`
//! `<ColorTable>` colour entries, `<liveries>`, etc.
//!
//! Scanner rule (generic): every `<Item>` that is a direct child of an element
//! whose children are all `<Item>`s (a "list") becomes ONE row. The row's
//! `handling_name` is a structural path (`Kits/0/visibleMods/2`) that uniquely
//! identifies the entry inside the file; `vehicle_type` is a friendly "Kind"
//! (Visible Mod / Stat Mod / Colour …) and `vehicle_class` is the kit/section
//! context. Params = the entry's direct scalar leaves (`value=` attrs + text).
//!
//! Writer: paths are resolved against the RAW text with comment-aware scanning
//! (carcols files comment out whole `<Item>` blocks, which must not shift the
//! item indexes), then scalar fields inside the resolved entry are patched
//! surgically — never parse & re-serialise.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::scan::{child_text, parse_xml, ScanResult, VehicleRow, XmlNode};
use super::textnav::{elem_locs, item_open_span, navigate, parse_path, PathStep};
use super::update::{attr_value, replace_attr_value, replace_text, UpdateResult, VehicleChange};

/// Does this file look like a car-colours meta? (`carcols.meta`, `carcols*.meta`)
fn is_carcols_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "carcols.meta"
        || (lower.starts_with("carcols") && lower.ends_with(".meta"))
}

pub(crate) fn find_carcols_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if is_carcols_meta(&entry.file_name().to_string_lossy()) {
            out.push(entry.into_path());
        }
    }
    out
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Friendly row "Kind" from the list container element name.
pub(crate) fn kind_label(name: &str) -> String {
    match name {
        "Kits" => "Kit".to_string(),
        "visibleMods" => "Visible Mod".to_string(),
        "linkMods" => "Linked Mod".to_string(),
        "slotNames" => "Slot Name".to_string(),
        "statMods" => "Stat Mod".to_string(),
        "liveryNames" => "Livery".to_string(),
        "liveries" => "Livery".to_string(),
        "ColorTable" => "Colour".to_string(),
        "Paint" => "Paint".to_string(),
        "defaultPaint" => "Paint".to_string(),
        "primary" => "Primary".to_string(),
        "secondary" => "Secondary".to_string(),
        "tertiary" => "Tertiary".to_string(),
        "pearl" => "Pearl".to_string(),
        // carvariations containers
        "variationData" => "Variation".to_string(),
        "colors" => "Colour".to_string(),
        "kits" => "Kit".to_string(),
        "Probabilities" => "Plate Probability".to_string(),
        // vehiclelayouts containers
        "VehicleLayoutInfos" => "Layout".to_string(),
        "VehicleEntryPointInfos" => "Entry Point".to_string(),
        "VehicleExtraPointsInfos" => "Extra Points".to_string(),
        "VehicleEntryPointAnimInfos" => "Entry Point Anim".to_string(),
        "VehicleSeatAnimInfos" => "Seat Anim".to_string(),
        "Seats" => "Seat".to_string(),
        "EntryPoints" => "Layout Entry Point".to_string(),
        "AccessableSeats" => "Accessible Seat".to_string(),
        "ExtraVehiclePoints" => "Extra Vehicle Point".to_string(),
        _ => prettify_camel(name),
    }
}

fn prettify_camel(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && ch.is_uppercase() && !b[i - 1].is_ascii_uppercase() {
            out.push(' ');
        }
        out.push(ch);
    }
    if out.is_empty() {
        s.to_string()
    } else {
        out
    }
}

/// Best label for a kit `<Item>`: kitName, else its `id` value, else "kit".
fn kit_label(item: &XmlNode) -> String {
    let name = child_text(item, "kitName");
    if !name.is_empty() {
        return name;
    }
    for child in &item.children {
        if child.name == "id" {
            if let Some(v) = child.attr("value") {
                let v = v.trim();
                if !v.is_empty() {
                    return format!("#{v}");
                }
            }
        }
    }
    "kit".to_string()
}

// ---------------------------------------------------------------------------
// DOM walking → one row per list entry
// ---------------------------------------------------------------------------

fn item_children<'a>(node: &'a XmlNode) -> Vec<&'a XmlNode> {
    node.children.iter().filter(|c| c.name == "Item").collect()
}

/// Non-Item element children, with their 0-based occurrence among same-named
/// siblings (used to disambiguate paths, e.g. several `<ColorTable>`).
fn element_children_occ<'a>(node: &'a XmlNode) -> Vec<(&'a str, usize, &'a XmlNode)> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    let mut out = Vec::new();
    for c in &node.children {
        if c.name == "Item" {
            continue;
        }
        let n = c.name.as_str();
        let e = counts.entry(n).or_insert(0);
        let occ = *e;
        *e += 1;
        out.push((n, occ, c));
    }
    out
}

fn push_elem(path: &mut Vec<String>, name: &str, occ: usize) {
    if occ == 0 {
        path.push(name.to_string());
    } else {
        path.push(format!("{name}#{occ}"));
    }
}

/// Emit one list-entry row (direct scalars of `item` only).
fn emit_row(
    item: &XmlNode,
    path: &[String],
    kind: &str,
    group: &str,
    rel: &str,
    abs: &str,
    cols: &mut BTreeSet<String>,
    out: &mut Vec<VehicleRow>,
) {
    let mut params: BTreeMap<String, String> = BTreeMap::new();
    for child in &item.children {
        if !child.children.is_empty() {
            continue;
        }
        if let Some(v) = child.attr("value") {
            params.insert(child.name.clone(), v.trim().to_string());
            continue;
        }
        if let Some(v) = child.attr("ref") {
            let v = v.trim().to_string();
            if !v.is_empty() {
                params.insert(format!("{}.ref", child.name), v);
            }
            continue;
        }
        let text = child.text.split_whitespace().collect::<Vec<_>>().join(" ");
        if !text.is_empty() {
            params.insert(child.name.clone(), text);
        }
    }
    if params.is_empty() && item.children.is_empty() {
        // Leaf entry (no child elements): expose the item's own value / ref attr,
        // or its own text (e.g. `<kits><Item>951_modkit</Item></kits>`).
        if let Some(v) = item.attr("value") {
            let v = v.trim().to_string();
            if !v.is_empty() {
                params.insert("Item.value".to_string(), v);
            }
        } else if let Some(v) = item.attr("ref") {
            let v = v.trim().to_string();
            if !v.is_empty() {
                params.insert("Item.ref".to_string(), v);
            }
        } else {
            let text = item.text.split_whitespace().collect::<Vec<_>>().join(" ");
            if !text.is_empty() {
                params.insert("Item.text".to_string(), text);
            }
        }
    }
    if params.is_empty() {
        return;
    }
    for k in params.keys() {
        cols.insert(k.clone());
    }
    out.push(VehicleRow {
        folder_name: rel.to_string(),
        meta_path: abs.to_string(),
        handling_name: path.join("/"),
        vehicle_type: kind.to_string(),
        vehicle_class: group.to_string(),
        params: params.into_iter().collect(),
    });
}

/// Recurse into an `<Item>`'s element children (nested lists under a kit/part).
fn walk_item(
    item: &XmlNode,
    path: &mut Vec<String>,
    section: &str,
    identity: &[&str],
    group_of: &dyn Fn(&XmlNode) -> String,
    rel: &str,
    abs: &str,
    cols: &mut BTreeSet<String>,
    out: &mut Vec<VehicleRow>,
) {
    for (name, occ, child) in element_children_occ(item) {
        push_elem(path, name, occ);
        walk_elem(child, path, section, identity, group_of, rel, abs, cols, out);
        path.pop();
    }
}

/// Visit an element. When it is a "pure list" (all children are `<Item>`), every
/// child Item becomes a row; otherwise we just descend.
fn walk_elem(
    node: &XmlNode,
    path: &mut Vec<String>,
    section: &str,
    identity: &[&str],
    group_of: &dyn Fn(&XmlNode) -> String,
    rel: &str,
    abs: &str,
    cols: &mut BTreeSet<String>,
    out: &mut Vec<VehicleRow>,
) {
    let items = item_children(node);
    let elems = element_children_occ(node);
    let is_pure_list = !items.is_empty() && elems.is_empty();

    if is_pure_list {
        for (idx, item) in items.iter().enumerate() {
            path.push(idx.to_string());
            // Group context: members of an identity container (e.g. <Kits> for
            // carcols, <variationData> for carvariations, the typed top-level
            // sections for vehiclelayouts) get their own label; every other list
            // inherits the group passed down.
            let group = if identity.contains(&node.name.as_str()) {
                group_of(item)
            } else {
                section.to_string()
            };
            emit_row(item, path, &kind_label(&node.name), &group, rel, abs, cols, out);
            walk_item(item, path, &group, identity, group_of, rel, abs, cols, out);
            path.pop();
        }
        return;
    }

    for (name, occ, child) in elems {
        push_elem(path, name, occ);
        walk_elem(child, path, section, identity, group_of, rel, abs, cols, out);
        path.pop();
    }
    // Mixed elements with stray direct Item children: descend into them too.
    for (idx, item) in items.iter().enumerate() {
        path.push(idx.to_string());
        walk_item(item, path, section, identity, group_of, rel, abs, cols, out);
        path.pop();
    }
}

/// Generic list-file parser shared by carcols.meta + carvariations.meta: every
/// `<Item>` that is a direct child of a pure-list element becomes a row. The
/// `identity` container's members get their group label from `group_of`.
pub(crate) fn collect_list_rows(
    roots: &[XmlNode],
    rel: &str,
    abs: &str,
    cols: &mut BTreeSet<String>,
    identity: &[&str],
    group_of: &dyn Fn(&XmlNode) -> String,
) -> Vec<VehicleRow> {
    let mut out = Vec::new();
    // A doc usually has one root; its direct element children are "sections"
    // whose names prefix the entry paths (e.g. Kits, variationData).
    let mut roots_owned: Vec<&XmlNode> = roots.iter().collect();
    if roots_owned.len() == 1 {
        let r = roots_owned[0];
        let kids = element_children_occ(r);
        if !kids.is_empty() {
            let mut path = Vec::new();
            for (name, occ, child) in kids {
                push_elem(&mut path, name, occ);
                walk_elem(
                    child,
                    &mut path,
                    name,
                    identity,
                    group_of,
                    rel,
                    abs,
                    cols,
                    &mut out,
                );
                path.pop();
            }
            return out;
        }
    }
    for r in roots_owned.drain(..) {
        let mut path = Vec::new();
        walk_elem(r, &mut path, "", identity, group_of, rel, abs, cols, &mut out);
    }
    out
}

/// Scan a folder (any layout) for every editable carcols list entry.
#[tauri::command]
pub fn scan_carcols(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut cols: BTreeSet<String> = BTreeSet::new();

    for path in find_carcols_metas(&root) {
        let rel = path
            .strip_prefix(&root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) => {
                skipped.push(format!("{rel}: {e}"));
                continue;
            }
        };
        let roots = match parse_xml(&text) {
            Ok(r) => r,
            Err(e) => {
                skipped.push(format!("{rel}: {e}"));
                continue;
            }
        };
        let abs = path.to_string_lossy().into_owned();
        let rows = collect_list_rows(&roots, &rel, &abs, &mut cols, &["Kits"], &kit_label);
        if rows.is_empty() {
            skipped.push(format!("{rel}: no editable entries found"));
            continue;
        }
        vehicles.extend(rows);
    }

    Ok(ScanResult {
        vehicles,
        columns: cols.into_iter().collect(),
        skipped,
    })
}

// ---------------------------------------------------------------------------
// Write-back — comment-aware path navigation + surgical scalar patching
// ---------------------------------------------------------------------------

/// Apply `params` to the entry identified by `path` inside `work` (in place).
/// Returns (applied, unchanged, missing).
pub(crate) fn patch_path(
    work: &mut String,
    path: &[PathStep],
    params: &HashMap<String, String>,
) -> (usize, usize, Vec<String>) {
    let mut applied = 0usize;
    let mut unchanged = 0usize;
    let mut missing: Vec<String> = Vec::new();

    for (name, new_val) in params {
        let Some((lo, hi)) = navigate(work, path) else {
            missing.push(format!("{name}: entry not found"));
            continue;
        };
        // Leaf-item params patch the entry itself (value/ref attr or text).
        if let Some(kind) = name.strip_prefix("Item.") {
            match kind {
                "text" => {
                    let old = work[lo..hi].split_whitespace().collect::<Vec<_>>().join(" ");
                    let new = new_val.trim();
                    if old == new {
                        unchanged += 1;
                    } else {
                        *work = replace_text(work, lo, hi, &escape_xml(new));
                        applied += 1;
                    }
                }
                attr @ ("value" | "ref") => {
                    let Some((os, oe)) = item_open_span(work, lo) else {
                        missing.push(format!("{name}: entry open tag not found"));
                        continue;
                    };
                    match attr_value(&work[os..oe], attr) {
                        Some(old) => {
                            if old.trim() == new_val.trim() {
                                unchanged += 1;
                            } else {
                                *work = replace_attr_value(work, os, oe, attr, new_val.trim());
                                applied += 1;
                            }
                        }
                        None => missing.push(format!("{name}: no {attr} to edit")),
                    }
                }
                _ => missing.push(format!("{name}: unknown leaf param")),
            }
            continue;
        }

        // Child element to patch; `ref`-style params carry a `.ref` suffix.
        let (elem, attr) = match name.strip_suffix(".ref") {
            Some(e) => (e.to_string(), "ref".to_string()),
            None => (name.clone(), "value".to_string()),
        };
        let locs = elem_locs(work, lo, hi, &elem);
        let Some((os, oe, close)) = locs.first().cloned() else {
            missing.push(format!("{name} not found"));
            continue;
        };
        if let Some((cs, _ce)) = close {
            // Never rewrite a container block.
            if work[oe..cs].contains('<') {
                missing.push(format!("{name} is a container (not editable)"));
                continue;
            }
            let old = work[oe..cs].split_whitespace().collect::<Vec<_>>().join(" ");
            let new = new_val.trim();
            if old == new {
                unchanged += 1;
                continue;
            }
            let open_tag = &work[os..oe];
            let out_val = if open_tag.contains("content=") {
                new.split_whitespace().collect::<Vec<_>>().join(" ")
            } else {
                escape_xml(new)
            };
            *work = replace_text(work, oe, cs, &out_val);
            applied += 1;
        } else {
            match attr_value(&work[os..oe], &attr) {
                Some(old) => {
                    if old.trim() == new_val.trim() {
                        unchanged += 1;
                    } else {
                        *work = replace_attr_value(work, os, oe, &attr, new_val.trim());
                        applied += 1;
                    }
                }
                None => missing.push(format!("{name} has no {attr} to edit")),
            }
        }
    }
    (applied, unchanged, missing)
}

/// Shared writer for list-style metas (carcols/carvariations/…): group edits by
/// file, resolve each entry by its structural path and patch its scalar leaves.
pub(crate) fn update_list_files_generic(
    root: &Path,
    changes: Vec<VehicleChange>,
) -> Result<UpdateResult, String> {
    // Group: file -> path -> params.
    let mut by_file: HashMap<String, HashMap<String, HashMap<String, String>>> = HashMap::new();
    for ch in changes {
        by_file
            .entry(ch.folder_name)
            .or_default()
            .entry(ch.handling_name)
            .or_default()
            .extend(ch.changed_params);
    }

    let mut result = UpdateResult::default();
    for (rel, entries) in by_file {
        if rel.contains("..") || rel.starts_with('/') || Path::new(&rel).is_absolute() {
            result.errors.push(format!("{rel}: unsafe relative path"));
            continue;
        }
        let file = root.join(&rel);
        if !file.is_file() {
            result.errors.push(format!("{rel}: file not found under the chosen root"));
            continue;
        }
        let text = match fs::read_to_string(&file) {
            Ok(t) => t,
            Err(e) => {
                result.errors.push(format!("{rel}: cannot read: {e}"));
                continue;
            }
        };
        let mut work = text;
        let mut file_applied = 0usize;
        for (path_str, params) in entries {
            let path = match parse_path(&path_str) {
                Ok(p) => p,
                Err(e) => {
                    result.errors.push(format!("{rel} :: {path_str}: bad path ({e})"));
                    continue;
                }
            };
            let (ap, un, miss) = patch_path(&mut work, &path, &params);
            file_applied += ap;
            result.params_applied += ap;
            result.params_unchanged += un;
            for m in miss {
                result.errors.push(format!("{rel} :: {path_str} :: {m}"));
            }
        }
        if file_applied > 0 {
            if let Err(e) = fs::write(&file, &work) {
                result.errors.push(format!("{rel}: cannot write: {e}"));
                continue;
            }
            result.files_changed += 1;
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn update_carcols_files(
    folder_path: String,
    changes: Vec<VehicleChange>,
) -> Result<UpdateResult, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }
    update_list_files_generic(root, changes)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirrors a real MBO carcols.meta: one kit whose visibleMods list contains
    /// one REAL item followed by COMMENTED-OUT items (must be ignored), plus
    /// statMods / slotNames / liveryNames.
    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfoVarGlobal>
  <Kits>
    <Item>
      <kitName>951_t90m_modkit</kitName>
      <id value="951" />
      <kitType>MKT_SPECIAL</kitType>
      <visibleMods>
        <Item>
          <modelName>t90m_barrels</modelName>
          <modShopLabel>WT_T90MBARREL</modShopLabel>
          <linkedModels />
          <turnOffBones />
          <type>VMT_SPOILER</type>
          <bone>mod_c</bone>
          <collisionBone>mod_col_1</collisionBone>
          <audioApply value="1.000000" />
          <weight value="500" />
          <turnOffExtra value="false" />
        </Item>
        <!--Item>
          <modelName>t72b3_971</modelName>
          <type>VMT_SPOILER</type>
          <weight value="10" />
        </Item-->
        <Item>
          <modelName>t90m_barrels_2</modelName>
          <type>VMT_SPOILER</type>
          <bone>mod_c</bone>
          <audioApply value="1.000000" />
          <weight value="250" />
        </Item>
      </visibleMods>
      <linkMods />
      <statMods>
        <Item>
          <identifier />
          <modifier value="25" />
          <audioApply value="1.000000" />
          <weight value="20" />
          <type>VMT_ENGINE</type>
        </Item>
        <Item>
          <identifier />
          <modifier value="100" />
          <audioApply value="1.000000" />
          <weight value="40" />
          <type>VMT_ARMOUR</type>
        </Item>
      </statMods>
      <slotNames>
        <Item>
          <slot>VMT_SPOILER</slot>
          <name>WT_T90CHASSIS</name>
        </Item>
      </slotNames>
      <liveryNames />
    </Item>
  </Kits>
  <Lights />
</CVehicleModelInfoVarGlobal>"#;

    fn scan_sample() -> (Vec<VehicleRow>, Vec<String>) {
        let roots = parse_xml(SAMPLE).unwrap();
        let mut cols = BTreeSet::new();
        let rows = collect_list_rows(&roots, "veh/t90m/carcols.meta", "abs", &mut cols, &["Kits"], &kit_label);
        (rows, cols.into_iter().collect())
    }

    #[test]
    fn parses_list_entries_and_ignores_comments() {
        let (rows, cols) = scan_sample();
        // Kinds present: Kit(1) + Visible Mod(2 real, commented ones ignored) +
        // Stat Mod(2) + Slot Name(1).
        let kinds: Vec<&str> = rows.iter().map(|r| r.vehicle_type.as_str()).collect();
        assert_eq!(
            kinds,
            vec![
                "Kit", "Visible Mod", "Visible Mod", "Stat Mod", "Stat Mod", "Slot Name"
            ]
        );
        assert_eq!(rows.len(), 6);
        // Kit context on all rows.
        assert!(rows.iter().all(|r| r.vehicle_class == "951_t90m_modkit"));
        // Paths are unique + indexable (commented item did NOT shift indexes).
        let paths: Vec<&str> = rows.iter().map(|r| r.handling_name.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "Kits/0",
                "Kits/0/visibleMods/0",
                "Kits/0/visibleMods/1",
                "Kits/0/statMods/0",
                "Kits/0/statMods/1",
                "Kits/0/slotNames/0"
            ]
        );
        // Visible Mod #0 params.
        let vm0 = &rows[1];
        assert_eq!(vm0.params.get("modelName").map(|s| s.as_str()), Some("t90m_barrels"));
        assert_eq!(vm0.params.get("weight").map(|s| s.as_str()), Some("500"));
        // Visible Mod #1 (second REAL item).
        let vm1 = &rows[2];
        assert_eq!(vm1.params.get("modelName").map(|s| s.as_str()), Some("t90m_barrels_2"));
        assert_eq!(vm1.params.get("weight").map(|s| s.as_str()), Some("250"));
        // Stat mods.
        assert_eq!(rows[3].params.get("modifier").map(|s| s.as_str()), Some("25"));
        assert_eq!(rows[4].params.get("type").map(|s| s.as_str()), Some("VMT_ARMOUR"));
        // Slot name.
        assert_eq!(rows[5].params.get("slot").map(|s| s.as_str()), Some("VMT_SPOILER"));
        // Structural/container fields never leak as params.
        assert!(!rows[0].params.contains_key("visibleMods"));
        assert!(cols.contains(&"weight".to_string()));
        assert!(cols.contains(&"modelName".to_string()));
    }

    #[test]
    fn writer_patches_real_entries_ignoring_commented_items() {
        // Edit visibleMods item #0 weight + modelName, item #1 weight, and a statMod.
        let mut by: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut p0 = HashMap::new();
        p0.insert("weight".to_string(), "600".to_string());
        p0.insert("modelName".to_string(), "t90m_barrels_v2".to_string());
        by.insert("Kits/0/visibleMods/0".to_string(), p0);
        let mut p1 = HashMap::new();
        p1.insert("weight".to_string(), "999".to_string());
        by.insert("Kits/0/visibleMods/1".to_string(), p1);
        let mut ps = HashMap::new();
        ps.insert("modifier".to_string(), "50".to_string());
        by.insert("Kits/0/statMods/0".to_string(), ps);

        let mut work = SAMPLE.to_string();
        let mut applied = 0;
        let mut unchanged = 0;
        let mut missing = Vec::new();
        for (path_str, params) in &by {
            let (a, u, m) = patch_path(&mut work, &parse_path(path_str).unwrap(), params);
            applied += a;
            unchanged += u;
            missing.extend(m);
        }
        assert_eq!(applied, 4);
        assert_eq!(unchanged, 0);
        assert!(missing.is_empty(), "{missing:?}");
        assert!(work.contains(r#"<weight value="600" />"#), "{work}");
        assert!(work.contains("<modelName>t90m_barrels_v2</modelName>"), "{work}");
        assert!(work.contains(r#"<weight value="999" />"#), "{work}");
        assert!(work.contains(r#"<modifier value="50" />"#), "{work}");
        // The commented-out item is untouched and still commented.
        assert!(work.contains("t72b3_971"), "{work}");
        assert!(work.contains("<!--"), "{work}");
        // The real first item's modelName WAS changed (to ..._v2), so the old one
        // must be gone; the commented copy of it stays (that's the t72b3_971 one).
        assert!(!work.contains("<modelName>t90m_barrels</modelName>"), "{work}");
        assert!(!work.contains(r#"<weight value="500" />"#));
    }

    #[test]
    fn writer_counts_unchanged_and_missing() {
        let mut params = HashMap::new();
        params.insert("weight".to_string(), "500".to_string()); // unchanged
        params.insert("noSuchField".to_string(), "1".to_string());
        let mut work = SAMPLE.to_string();
        let (applied, unchanged, missing) =
            patch_path(&mut work, &parse_path("Kits/0/visibleMods/0").unwrap(), &params);
        assert_eq!(applied, 0);
        assert_eq!(unchanged, 1);
        assert_eq!(missing.len(), 1);
        assert!(work == SAMPLE);
    }

    /// End-to-end against a real vehicle folder (set GT_TEST_CARCOLS to the
    /// folder that directly contains the carcols.meta files).
    #[test]
    #[ignore = "requires a real folder: set GT_TEST_CARCOLS"]
    fn scans_real_carcols_folder() {
        let dir = std::env::var("GT_TEST_CARCOLS").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_CARCOLS to run)");
            return;
        }
        let res = scan_carcols(dir).expect("scan should succeed");
        assert!(!res.vehicles.is_empty(), "expected entries, got none");
        assert!(!res.columns.is_empty());
        eprintln!(
            "entries={} columns={} skipped={}",
            res.vehicles.len(),
            res.columns.len(),
            res.skipped.len()
        );
        let mut kinds: std::collections::BTreeMap<&str, usize> = Default::default();
        for v in &res.vehicles {
            *kinds.entry(v.vehicle_type.as_str()).or_insert(0) += 1;
        }
        eprintln!("KINDS: {kinds:?}");
        for v in res.vehicles.iter().take(3) {
            eprintln!(
                "  {} | {} | {} | {}",
                v.folder_name, v.vehicle_type, v.vehicle_class, v.handling_name
            );
        }
        eprintln!("COLUMNS:\n{}", res.columns.join("\n"));
    }
}
