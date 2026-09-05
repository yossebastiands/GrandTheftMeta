//! Vehicle-model meta (vehicles.meta) crawling & write-back.
//!
//! FiveM vehicle addons vary wildly in layout, so this scanner is
//! layout-agnostic like the weapon one: it walks the chosen folder for
//! `vehicles.meta` / `vehicles_*.meta` and treats every `<Item>` that carries a
//! `<modelName>` (the model entries under `<InitDatas>`) as one editable vehicle.
//!
//! Identity columns: `modelName` -> Name; friendly `<type>` / `<vehicleClass>`
//! labels -> Type / Class. Everything else that is a DIRECT scalar leaf of the
//! model item is editable: numeric `value=` attributes and text leaves (raw
//! `type` / `vehicleClass` / `flags` / `audioNameHash` / `layout` / arrays…),
//! excluding `modelName` and structural/container blocks (drivers, extra lists,
//! camera lists, pOverrideRagdollThreshold, …) which are preserved untouched.
//!
//! Writes are surgical text patches (never parse & re-serialise), so formatting
//! and comments survive.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::scan::{
    child_text, collect_items, native_class_label, native_type_label, parse_xml, ScanResult,
    VehicleRow, XmlNode,
};

/// Does this file look like a vehicle-model meta? (`vehicles.meta` or `vehicles_*.meta`)
fn is_vehicle_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "vehicles.meta"
        || (lower.starts_with("vehicles_") && lower.ends_with(".meta"))
}

/// Every file named like a vehicle meta, recursively under `root`.
pub(crate) fn find_vehicle_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if is_vehicle_meta(&name) {
            out.push(entry.into_path());
        }
    }
    out
}

/// Collect a single vehicle model `<Item>` into a row. Returns None when the
/// item has no `<modelName>` (a non-model `<Item>`).
fn parse_model(item: &XmlNode, file_rel: String, abs: String) -> Option<VehicleRow> {
    let model = child_text(item, "modelName");
    if model.is_empty() {
        return None;
    }
    let raw_type = child_text(item, "type");
    let raw_class = child_text(item, "vehicleClass");

    let mut params: BTreeMap<String, String> = BTreeMap::new();
    for child in &item.children {
        // `modelName` is the row identity (shown as the Name column).
        if child.name == "modelName" {
            continue;
        }
        // Structural / container blocks (drivers, extras, cameras, …) are kept
        // untouched and are never edited.
        if !child.children.is_empty() {
            continue;
        }
        // Numeric / boolean scalar attribute.
        if let Some(v) = child.attr("value") {
            params.insert(child.name.clone(), v.trim().to_string());
            continue;
        }
        // Text leaf (raw type/vehicleClass, flags, hashes, arrays…).
        let text = child.text.split_whitespace().collect::<Vec<_>>().join(" ");
        if !text.is_empty() {
            params.insert(child.name.clone(), text);
        }
    }

    Some(VehicleRow {
        // Relative file path (e.g. "[mbo-vehicles]/Tank_t90m/vehicles.meta").
        folder_name: file_rel,
        meta_path: abs,
        handling_name: model,
        vehicle_type: native_type_label(&raw_type),
        vehicle_class: native_class_label(&raw_class),
        params: params.into_iter().collect(),
    })
}

/// Scan a folder (any layout) for every vehicle model across all
/// vehicles.meta / vehicles_*.meta files.
#[tauri::command]
pub fn scan_vehicles(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut colset: BTreeSet<String> = BTreeSet::new();

    for path in find_vehicle_metas(&root) {
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
        let items: Vec<&XmlNode> = collect_items(&roots)
            .into_iter()
            .filter(|it| !child_text(it, "modelName").is_empty())
            .collect();
        if items.is_empty() {
            skipped.push(format!("{rel}: no vehicle model found"));
            continue;
        }
        let abs = path.to_string_lossy().into_owned();
        for item in items {
            let row = match parse_model(item, rel.clone(), abs.clone()) {
                Some(r) => r,
                None => {
                    skipped.push(format!("{rel}: unnamed vehicle model"));
                    continue;
                }
            };
            for k in row.params.keys() {
                colset.insert(k.clone());
            }
            vehicles.push(row);
        }
    }

    Ok(ScanResult {
        vehicles,
        columns: colset.into_iter().collect(),
        skipped,
    })
}

// ---------------------------------------------------------------------------
// Write-back — surgical text patching inside the matching vehicle-model `<Item>`
// ---------------------------------------------------------------------------

use super::update::{
    attr_value, find_matching_close, locate_elements, replace_attr_value, replace_text,
    UpdateResult, VehicleChange,
};

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// `<modelName>t90m</modelName>` inside a model `<Item>` block, or "".
fn extract_model_name(block: &str) -> String {
    let mut rest = block;
    while let Some(i) = rest.find("<modelName>") {
        let after = &rest[i + "<modelName>".len()..];
        if let Some(end) = after.find("</modelName>") {
            return after[..end].trim().to_string();
        }
        rest = &after;
    }
    String::new()
}

/// Spans [start, end) of every TOP-LEVEL `<Item>` block in `text` (an Item not
/// nested inside another Item). Nested `<Item>`s (drivers, extra lists, …) are
/// consumed inside their parent's span.
fn top_level_item_spans(text: &str) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < text.len() {
        let Some(rel) = text[i..].find("<Item") else {
            break;
        };
        let start = i + rel;
        let Some(gt_rel) = text[start..].find('>') else {
            break;
        };
        let gt = start + gt_rel;
        if text[start..=gt].trim_end().ends_with("/>") {
            // Self-closing placeholder `<Item />` → no block.
            i = gt + 1;
            continue;
        }
        match find_matching_close(text, gt + 1) {
            Some(after) => {
                out.push((start, after));
                i = after;
            }
            None => break,
        }
    }
    out
}

/// Apply one model's params to a single vehicle `<Item>` block string.
/// Returns (new_block, applied, unchanged, missing).
fn patch_model_block(
    block: &str,
    params: &HashMap<String, String>,
) -> (String, usize, usize, Vec<String>) {
    let mut text = block.to_string();
    let mut applied = 0usize;
    let mut unchanged = 0usize;
    let mut missing: Vec<String> = Vec::new();

    for (name, new_val) in params {
        let els = locate_elements(&text, name);
        let el = els.into_iter().next();
        match el {
            None => missing.push(format!("{name} not found")),
            Some((os, oe, close)) => {
                if let Some((cs, _ce)) = close {
                    // Never rewrite a container block (it has child elements).
                    if text[oe..cs].contains('<') {
                        missing.push(format!("{name} is a container (not editable)"));
                        continue;
                    }
                    // Text leaf: <type>VEHICLE_TYPE_CAR</type>, <flags>…</flags>,
                    // <lodDistances content="float_array">…</lodDistances>
                    let old = text[oe..cs]
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ");
                    let new = new_val.trim();
                    if old == new {
                        unchanged += 1;
                    } else {
                        let open_tag = &text[os..oe];
                        let out_val = if open_tag.contains("content=") {
                            // Arrays are stored space-separated (cell may use commas).
                            new.split(|c: char| c == ',' || c.is_whitespace())
                                .filter(|t| !t.is_empty())
                                .collect::<Vec<_>>()
                                .join(" ")
                        } else {
                            escape_xml(new)
                        };
                        text = replace_text(&text, oe, cs, &out_val);
                        applied += 1;
                    }
                } else {
                    // Self-closing scalar: <wheelScale value=".." />
                    match attr_value(&text[os..oe], "value") {
                        Some(old) => {
                            if old.trim() == new_val.trim() {
                                unchanged += 1;
                            } else {
                                text = replace_attr_value(&text, os, oe, "value", new_val.trim());
                                applied += 1;
                            }
                        }
                        None => missing.push(format!("{name} has no value to edit")),
                    }
                }
            }
        }
    }
    (text, applied, unchanged, missing)
}

/// Patch every listed model inside one file. `entries`: model name -> params.
fn patch_vehicle_file(
    text: &str,
    entries: &HashMap<String, HashMap<String, String>>,
) -> (String, usize, usize, Vec<String>) {
    let mut cur = text.to_string();
    let mut applied = 0usize;
    let mut unchanged = 0usize;
    let mut missing: Vec<String> = Vec::new();

    for (model, params) in entries {
        let target = top_level_item_spans(&cur)
            .into_iter()
            .find(|(s, e)| extract_model_name(&cur[*s..*e]) == *model);
        match target {
            None => missing.push(format!("{model}: vehicle not found")),
            Some((s, e)) => {
                let block = cur[s..e].to_string();
                let (nb, ap, un, mi) = patch_model_block(&block, params);
                applied += ap;
                unchanged += un;
                for m in mi {
                    missing.push(format!("{model} :: {m}"));
                }
                let mut next = String::with_capacity(cur.len() + nb.len());
                next.push_str(&cur[..s]);
                next.push_str(&nb);
                next.push_str(&cur[e..]);
                cur = next;
            }
        }
    }
    (cur, applied, unchanged, missing)
}

/// Writes edited vehicle-model params back to the original vehicles.meta files.
/// `changes[].folder_name` is the meta file RELATIVE to the chosen root
/// (e.g. `[mbo-vehicles]/Tank_t90m/vehicles.meta`); `changes[].handling_name` is
/// the model name (`modelName`).
#[tauri::command]
pub fn update_vehicle_files(
    folder_path: String,
    changes: Vec<VehicleChange>,
) -> Result<UpdateResult, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    // Group by relative file path -> model name -> params.
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
        let (new_text, applied, unchanged, missing) = patch_vehicle_file(&text, &entries);
        result.params_applied += applied;
        result.params_unchanged += unchanged;
        for m in missing {
            result.errors.push(format!("{rel} :: {m}"));
        }
        if applied > 0 {
            if let Err(e) = fs::write(&file, new_text) {
                result.errors.push(format!("{rel}: cannot write: {e}"));
                continue;
            }
            result.files_changed += 1;
        }
    }

    Ok(result)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfo__InitDataList>
  <residentTxd>vehshare</residentTxd>
  <InitDatas>
    <Item>
      <modelName>t90m</modelName>
      <txdName>t90m</txdName>
      <handlingId>t90m</handlingId>
      <gameName>T90M</gameName>
      <audioNameHash>RHINO</audioNameHash>
      <layout>LAYOUT_T90M</layout>
      <defaultBodyHealth value="1000.000000" />
      <wheelScale value="0.510000" />
      <diffuseTint value="0x00FFFFFF" />
      <lodDistances content="float_array">
        25.000000
        50.000000
        90.000000
      </lodDistances>
      <flags>FLAG_HAS_LIVERY FLAG_IS_TANK FLAG_DONT_SPAWN_IN_CARGEN</flags>
      <type>VEHICLE_TYPE_CAR</type>
      <plateType>VPT_NONE</plateType>
      <vehicleClass>VC_MILITARY</vehicleClass>
      <drivers>
        <Item>
          <driverName>S_M_Y_Marine_03</driverName>
          <npcName />
        </Item>
      </drivers>
      <pOverrideRagdollThreshold type="CVehicleModelInfo__CVehicleOverrideRagdollThreshold">
        <MinComponent value="22" />
      </pOverrideRagdollThreshold>
    </Item>
    <Item>
      <modelName>m3g80</modelName>
      <gameName>M3</gameName>
      <flags>FLAG_HAS_LIVERY</flags>
      <type>VEHICLE_TYPE_CAR</type>
      <vehicleClass>VC_SUPER</vehicleClass>
      <maxNum value="5" />
    </Item>
  </InitDatas>
  <txdRelationships>
    <Item>
      <parent>vehshare_worn</parent>
      <child>t90m</child>
    </Item>
  </txdRelationships>
</CVehicleModelInfo__InitDataList>"#;

    #[test]
    fn parses_vehicle_models() {
        let roots = parse_xml(SAMPLE).unwrap();
        let items: Vec<&XmlNode> = collect_items(&roots)
            .into_iter()
            .filter(|it| !child_text(it, "modelName").is_empty())
            .collect();
        assert_eq!(items.len(), 2);

        let row = parse_model(items[0], "veh/t90m/vehicles.meta".into(), "abs".into()).unwrap();
        assert_eq!(row.handling_name, "t90m");
        assert_eq!(row.vehicle_type, "Car");
        assert_eq!(row.vehicle_class, "Military");
        // Identity modelName is NOT a param; raw type/vehicleClass ARE editable.
        assert!(!row.params.contains_key("modelName"));
        assert_eq!(row.params.get("type").map(|s| s.as_str()), Some("VEHICLE_TYPE_CAR"));
        assert_eq!(row.params.get("vehicleClass").map(|s| s.as_str()), Some("VC_MILITARY"));
        // Scalars + text leaves exposed.
        assert_eq!(row.params.get("defaultBodyHealth").map(|s| s.as_str()), Some("1000.000000"));
        assert_eq!(row.params.get("wheelScale").map(|s| s.as_str()), Some("0.510000"));
        assert_eq!(row.params.get("diffuseTint").map(|s| s.as_str()), Some("0x00FFFFFF"));
        assert_eq!(row.params.get("audioNameHash").map(|s| s.as_str()), Some("RHINO"));
        assert_eq!(row.params.get("gameName").map(|s| s.as_str()), Some("T90M"));
        // Array content collapsed to spaces.
        assert_eq!(row.params.get("lodDistances").map(|s| s.as_str()), Some("25.000000 50.000000 90.000000"));
        // Structural blocks excluded.
        assert!(!row.params.contains_key("drivers"));
        assert!(!row.params.contains_key("pOverrideRagdollThreshold"));
    }

    #[test]
    fn writer_patches_text_and_value_attrs() {
        let mut params = HashMap::new();
        params.insert("type".to_string(), "VEHICLE_TYPE_PLANE".to_string());
        params.insert("defaultBodyHealth".to_string(), "1500".to_string());
        params.insert("flags".to_string(), "FLAG_HAS_LIVERY FLAG_DONT_SPAWN_IN_CARGEN".to_string());
        params.insert("lodDistances".to_string(), "30, 60, 120".to_string());
        let mut entries = HashMap::new();
        entries.insert("t90m".to_string(), params);
        let (out, applied, unchanged, missing) = patch_vehicle_file(SAMPLE, &entries);
        assert_eq!(applied, 4);
        assert_eq!(unchanged, 0);
        assert!(missing.is_empty(), "missing: {missing:?}");
        assert!(out.contains("<type>VEHICLE_TYPE_PLANE</type>"), "{out}");
        assert!(out.contains(r#"<defaultBodyHealth value="1500" />"#), "{out}");
        assert!(out.contains("<flags>FLAG_HAS_LIVERY FLAG_DONT_SPAWN_IN_CARGEN</flags>"), "{out}");
        assert!(out.contains("<lodDistances content=\"float_array\">30 60 120</lodDistances>"), "{out}");
        // The second model is untouched.
        assert!(out.contains("<modelName>m3g80</modelName>"));
    }

    #[test]
    fn writer_unchanged_and_missing_accounted() {
        let mut params = HashMap::new();
        params.insert("defaultBodyHealth".to_string(), "1000.000000".to_string());
        params.insert("doesNotExist".to_string(), "1".to_string());
        let mut entries = HashMap::new();
        entries.insert("t90m".to_string(), params);
        let (out, applied, unchanged, missing) = patch_vehicle_file(SAMPLE, &entries);
        assert_eq!(applied, 0);
        assert_eq!(unchanged, 1);
        assert_eq!(missing.len(), 1);
        assert_eq!(out, SAMPLE); // file is untouched
    }

    #[test]
    fn writer_reports_unknown_model_without_touching_file() {
        let mut params = HashMap::new();
        params.insert("defaultBodyHealth".to_string(), "1".to_string());
        let mut entries = HashMap::new();
        entries.insert("no_such_model".to_string(), params);
        let (out, applied, _unchanged, missing) = patch_vehicle_file(SAMPLE, &entries);
        assert_eq!(applied, 0);
        assert_eq!(missing, vec!["no_such_model: vehicle not found".to_string()]);
        assert_eq!(out, SAMPLE);
    }

    #[test]
    fn writer_never_rewrites_structural_containers() {
        let mut params = HashMap::new();
        params.insert("drivers".to_string(), "x".to_string());
        let mut entries = HashMap::new();
        entries.insert("t90m".to_string(), params);
        let (out, applied, _unchanged, missing) = patch_vehicle_file(SAMPLE, &entries);
        assert_eq!(applied, 0);
        assert!(missing.len() == 1 && missing[0].contains("container"), "{missing:?}");
        assert_eq!(out, SAMPLE);
    }

    /// End-to-end against a real vehicle folder (set GT_TEST_VEHICLE_META to the
    /// folder that directly contains the vehicles.meta files).
    #[test]
    #[ignore = "requires a real folder: set GT_TEST_VEHICLE_META"]
    fn scans_real_vehicles_folder() {
        let dir = std::env::var("GT_TEST_VEHICLE_META").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_VEHICLE_META to run)");
            return;
        }
        let res = scan_vehicles(dir).expect("scan should succeed");
        assert!(!res.vehicles.is_empty(), "expected vehicles, got none");
        assert!(!res.columns.is_empty());
        for v in res.vehicles.iter().take(3) {
            assert!(!v.handling_name.is_empty());
        }
        eprintln!(
            "vehicles={} columns={} skipped={}",
            res.vehicles.len(),
            res.columns.len(),
            res.skipped.len()
        );
        eprintln!("COLUMNS:\n{}", res.columns.join("\n"));
    }
}
