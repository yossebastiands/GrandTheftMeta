//! weaponarchetypes.meta editor.
//!
//! Same shape for both the weapon "archetype" file and the vehicle-mounted
//! variant: `<CWeaponModelInfo__InitDataList>` → `<InitDatas>` → one `<Item>`
//! per weapon MODEL (e.g. `W_LR_SIDEWINDER`) carrying scalar fields
//! (modelName/txdName/ptfxAssetName/lodDist…).
//!
//! Rows = one model item; Name = `modelName`; params = direct scalar leaves.
//! Structural/container blocks are untouched. Files like to comment out Items,
//! so writes are comment-tolerant (navigate via structural paths).

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::carcols::update_list_files_generic;
use super::scan::{parse_xml, ScanResult, VehicleRow, XmlNode};
use super::update::{UpdateResult, VehicleChange};

/// Does this file look like a weapon-archetypes meta?
fn is_weaponarchetypes_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "weaponarchetypes.meta"
        || (lower.starts_with("weaponarchetypes") && lower.ends_with(".meta"))
}

pub(crate) fn find_weaponarchetypes_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if is_weaponarchetypes_meta(&entry.file_name().to_string_lossy()) {
            out.push(entry.into_path());
        }
    }
    out
}

fn item_children<'a>(node: &'a XmlNode) -> Vec<&'a XmlNode> {
    node.children.iter().filter(|c| c.name == "Item").collect()
}

/// First element named `name` anywhere under `node` (incl. node itself).
fn find_element<'a>(node: &'a XmlNode, name: &str) -> Option<&'a XmlNode> {
    if node.name == name {
        return Some(node);
    }
    for c in &node.children {
        if let Some(f) = find_element(c, name) {
            return Some(f);
        }
    }
    None
}

fn child_text(node: &XmlNode, name: &str) -> String {
    node.children
        .iter()
        .find(|c| c.name == name)
        .map(|c| c.text.split_whitespace().collect::<Vec<_>>().join(" "))
        .unwrap_or_default()
}

/// Scan a folder for every weapon-model archetype across all
/// weaponarchetypes.meta files.
#[tauri::command]
pub fn scan_weaponarchetypes(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut cols: BTreeSet<String> = BTreeSet::new();

    for path in find_weaponarchetypes_metas(&root) {
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

        // Locate <InitDatas> and emit each of its Items (with a modelName).
        let mut init_list: Option<&XmlNode> = None;
        for r in &roots {
            if let Some(f) = find_element(r, "InitDatas") {
                init_list = Some(f);
                break;
            }
        }
        let Some(init_list) = init_list else {
            skipped.push(format!("{rel}: no InitDatas found"));
            continue;
        };
        let items: Vec<&XmlNode> = item_children(init_list)
            .into_iter()
            .filter(|it| !child_text(it, "modelName").is_empty())
            .collect();
        if items.is_empty() {
            skipped.push(format!("{rel}: no weapon model archetypes found"));
            continue;
        }
        let mut file_rows = 0usize;
        for (i, item) in items.iter().enumerate() {
            let model = child_text(item, "modelName");
            let mut params: BTreeMap<String, String> = BTreeMap::new();
            for child in &item.children {
                if child.name == "modelName" || !child.children.is_empty() {
                    continue;
                }
                if let Some(v) = child.attr("value") {
                    params.insert(child.name.clone(), v.trim().to_string());
                    continue;
                }
                let t = child.text.split_whitespace().collect::<Vec<_>>().join(" ");
                if !t.is_empty() {
                    params.insert(child.name.clone(), t);
                }
            }
            if params.is_empty() {
                continue;
            }
            for k in params.keys() {
                cols.insert(k.clone());
            }
            vehicles.push(VehicleRow {
                folder_name: rel.clone(),
                meta_path: abs.clone(),
                handling_name: format!("InitDatas/{i}"),
                vehicle_type: model,
                vehicle_class: String::new(),
                params: params.into_iter().collect(),
            });
            file_rows += 1;
        }
        if file_rows == 0 {
            skipped.push(format!("{rel}: no editable archetypes found"));
        }
    }

    Ok(ScanResult {
        vehicles,
        columns: cols.into_iter().collect(),
        skipped,
    })
}

/// Write edited weapon-archetype entries back (shared comment-aware writer).
#[tauri::command]
pub fn update_weaponarchetypes_files(
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
    use std::collections::HashMap;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<CWeaponModelInfo__InitDataList>
  <InitDatas>
    <Item>
      <modelName>W_LR_SIDEWINDER</modelName>
      <txdName>W_LR_SIDEWINDER</txdName>
      <ptfxAssetName>null</ptfxAssetName>
      <lodDist value="200" />
    </Item>
    <!-- commented model must not shift indexes
    <Item>
      <modelName>W_LR_HIDDEN</modelName>
      <lodDist value="1" />
    </Item> -->
    <Item>
      <modelName>W_LR_AGM65</modelName>
      <txdName>W_LR_AGM65</txdName>
      <ptfxAssetName>null</ptfxAssetName>
      <lodDist value="200" />
    </Item>
  </InitDatas>
</CWeaponModelInfo__InitDataList>"#;

    #[test]
    fn parses_weapon_model_archetypes() {
        let roots = parse_xml(SAMPLE).unwrap();
        let init_list = find_element(&roots[0], "InitDatas").unwrap();
        let items: Vec<&XmlNode> = item_children(init_list)
            .into_iter()
            .filter(|it| !child_text(it, "modelName").is_empty())
            .collect();
        // Commented item ignored.
        assert_eq!(items.len(), 2);
        let mut cols = BTreeSet::new();
        let mut rows = Vec::new();
        for (i, item) in items.iter().enumerate() {
            let mut params = BTreeMap::new();
            for child in &item.children {
                if child.name == "modelName" || !child.children.is_empty() {
                    continue;
                }
                if let Some(v) = child.attr("value") {
                    params.insert(child.name.clone(), v.trim().to_string());
                    continue;
                }
                let t = child.text.split_whitespace().collect::<Vec<_>>().join(" ");
                if !t.is_empty() {
                    params.insert(child.name.clone(), t);
                }
            }
            for k in params.keys() {
                cols.insert(k.clone());
            }
            rows.push((
                format!("InitDatas/{i}"),
                child_text(item, "modelName"),
                params,
            ));
        }
        assert_eq!(rows[0].1, "W_LR_SIDEWINDER");
        assert_eq!(rows[1].1, "W_LR_AGM65");
        assert_eq!(rows[0].2.get("txdName").map(|s| s.as_str()), Some("W_LR_SIDEWINDER"));
        assert_eq!(rows[0].2.get("lodDist").map(|s| s.as_str()), Some("200"));
        assert!(!rows[0].2.contains_key("modelName"));
    }

    #[test]
    fn writer_patches_archetype_fields() {
        let mut params = HashMap::new();
        params.insert("txdName".to_string(), "W_LR_SIDEWINDER_HD".to_string());
        params.insert("lodDist".to_string(), "400".to_string());
        let mut by: HashMap<String, HashMap<String, String>> = HashMap::new();
        by.insert("InitDatas/0".to_string(), params);

        let mut work = SAMPLE.to_string();
        let (a, _u, missing) = super::super::carcols::patch_path(
            &mut work,
            &super::super::textnav::parse_path("InitDatas/0").unwrap(),
            by.get("InitDatas/0").unwrap(),
        );
        assert_eq!(a, 2, "missing: {missing:?}");
        assert!(missing.is_empty(), "{missing:?}");
        assert!(work.contains("<txdName>W_LR_SIDEWINDER_HD</txdName>"), "{work}");
        assert!(work.contains(r#"<lodDist value="400" />"#), "{work}");
        // Commented model untouched.
        assert!(work.contains("W_LR_HIDDEN"), "{work}");
        assert!(work.contains("<!--"), "{work}");
    }

    /// End-to-end against a real folder (set GT_TEST_ARCH to a folder that
    /// directly contains weaponarchetypes.meta files).
    #[test]
    #[ignore = "requires a real folder: set GT_TEST_ARCH"]
    fn scans_real_weaponarchetypes_folder() {
        let dir = std::env::var("GT_TEST_ARCH").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_ARCH to run)");
            return;
        }
        let res = scan_weaponarchetypes(dir).expect("scan should succeed");
        assert!(!res.vehicles.is_empty(), "expected entries, got none");
        assert!(!res.columns.is_empty());
        eprintln!(
            "entries={} columns={} skipped={}",
            res.vehicles.len(),
            res.columns.len(),
            res.skipped.len()
        );
        for v in res.vehicles.iter().take(4) {
            eprintln!("  {} | {}", v.folder_name, v.handling_name);
        }
        eprintln!("COLUMNS:\n{}", res.columns.join("\n"));
    }
}
