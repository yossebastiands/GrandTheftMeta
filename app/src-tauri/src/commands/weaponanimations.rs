//! weaponanimations.meta editor.
//!
//! Structure: `<CWeaponAnimationsSets>` → `<WeaponAnimationsSets>` → one
//! `<Item key="Default">` per character/personality set → `<WeaponAnimations>`
//! → one `<Item key="WEAPON_PISTOL">` per weapon. Each weapon entry holds ~40
//! clip-set text leaves (mostly empty), a few `value=` modifiers and a
//! `WeaponSwapData ref=`.
//!
//! The SAME weapon key repeats once per personality set in a file, so a row's
//! identity is its structural path (`WeaponAnimationsSets/0/WeaponAnimations/1`).
//! The Kind/Set column = the personality key, the Weapon column = the weapon key,
//! params = the weapon entry's scalar leaves. Writing reuses the comment-aware
//! shared writer (`carcols::update_list_files_generic`).

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::carcols::update_list_files_generic;
use super::scan::{parse_xml, ScanResult, VehicleRow, XmlNode};
use super::update::{UpdateResult, VehicleChange};

/// Does this file look like a weapon-animations meta?
fn is_weaponanimations_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "weaponanimations.meta"
        || (lower.starts_with("weaponanimations") && lower.ends_with(".meta"))
}

pub(crate) fn find_weaponanimations_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if is_weaponanimations_meta(&entry.file_name().to_string_lossy()) {
            out.push(entry.into_path());
        }
    }
    out
}

fn item_children<'a>(node: &'a XmlNode) -> Vec<&'a XmlNode> {
    node.children.iter().filter(|c| c.name == "Item").collect()
}

/// First non-Item child element named `name`.
fn child_element<'a>(node: &'a XmlNode, name: &str) -> Option<&'a XmlNode> {
    node.children
        .iter()
        .find(|c| c.name != "Item" && c.name == name)
}

/// First element named `name` anywhere under `node` (incl. node itself).
fn find_element<'a>(node: &'a XmlNode, name: &str) -> Option<&'a XmlNode> {
    if node.name == name {
        return Some(node);
    }
    for c in &node.children {
        if let Some(found) = find_element(c, name) {
            return Some(found);
        }
    }
    None
}

/// Scan a folder for every weapon × personality entry across all
/// weaponanimations.meta files.
#[tauri::command]
pub fn scan_weaponanimations(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut cols: BTreeSet<String> = BTreeSet::new();

    for path in find_weaponanimations_metas(&root) {
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

        // Locate the WeaponAnimationsSets list under the root.
        let mut sets_list: Option<&XmlNode> = None;
        for r in &roots {
            if let Some(f) = find_element(r, "WeaponAnimationsSets") {
                sets_list = Some(f);
                break;
            }
        }
        let Some(sets_list) = sets_list else {
            skipped.push(format!("{rel}: no WeaponAnimationsSets found"));
            continue;
        };
        let sets = item_children(sets_list);
        if sets.is_empty() {
            skipped.push(format!("{rel}: no personality sets found"));
            continue;
        }
        let mut file_rows = 0usize;
        for (i, set_item) in sets.iter().enumerate() {
            let set_key = set_item
                .attr("key")
                .map(|k| k.trim().to_string())
                .unwrap_or_else(|| i.to_string());
            let Some(wa) = child_element(set_item, "WeaponAnimations") else {
                continue;
            };
            let weapons = item_children(wa);
            for (j, weapon) in weapons.iter().enumerate() {
                let wkey = weapon
                    .attr("key")
                    .map(|k| k.trim().to_string())
                    .unwrap_or_default();
                let mut params: BTreeMap<String, String> = BTreeMap::new();
                for child in &weapon.children {
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
                if params.is_empty() {
                    continue;
                }
                for k in params.keys() {
                    cols.insert(k.clone());
                }
                vehicles.push(VehicleRow {
                    folder_name: rel.clone(),
                    meta_path: abs.clone(),
                    handling_name: format!("WeaponAnimationsSets/{i}/WeaponAnimations/{j}"),
                    vehicle_type: set_key.clone(),
                    vehicle_class: wkey,
                    params: params.into_iter().collect(),
                });
                file_rows += 1;
            }
        }
        if file_rows == 0 {
            skipped.push(format!("{rel}: no editable weapon animations found"));
        }
    }

    Ok(ScanResult {
        vehicles,
        columns: cols.into_iter().collect(),
        skipped,
    })
}

/// Write edited weapon-animation entries back (shared comment-aware writer).
#[tauri::command]
pub fn update_weaponanimations_files(
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
<CWeaponAnimationsSets>
  <WeaponAnimationsSets>
    <Item key="Default">
      <WeaponAnimations>
        <Item key="WEAPON_PISTOL">
          <CoverWeaponClipSetHash>Cover_Wpn_Pistol</CoverWeaponClipSetHash>
          <MotionClipSetHash>weapons@pistol@pistol</MotionClipSetHash>
          <WeaponClipSetHash />
          <SwapWeaponFilterHash>RightArm_NoSpine_filter</SwapWeaponFilterHash>
          <AnimFireRateModifier value="1.000000" />
          <UseFromStrafeUpperBodyAimNetwork value="true" />
          <WeaponSwapData ref="SWAP_DEFAULT" />
        </Item>
        <Item key="WEAPON_SNIPERRIFLE">
          <MotionClipSetHash>weapons@rifle@rifle</MotionClipSetHash>
          <WeaponSwapData ref="SWAP_SNIPER" />
        </Item>
      </WeaponAnimations>
    </Item>
    <Item key="Gang">
      <Fallback>Default</Fallback>
      <WeaponAnimations>
        <Item key="WEAPON_PISTOL">
          <MotionClipSetHash>weapons@pistol_1h@gang</MotionClipSetHash>
          <AnimFireRateModifier value="1.000000" />
        </Item>
      </WeaponAnimations>
    </Item>
  </WeaponAnimationsSets>
</CWeaponAnimationsSets>"#;

    fn scan_sample() -> (Vec<VehicleRow>, Vec<String>) {
        let roots = parse_xml(SAMPLE).unwrap();
        let sets_list = find_element(&roots[0], "WeaponAnimationsSets").unwrap();
        let mut cols = BTreeSet::new();
        let mut rows = Vec::new();
        for (i, set_item) in item_children(sets_list).iter().enumerate() {
            let set_key = set_item.attr("key").unwrap().to_string();
            let wa = child_element(set_item, "WeaponAnimations").unwrap();
            for (j, weapon) in item_children(wa).iter().enumerate() {
                let wkey = weapon.attr("key").unwrap().to_string();
                let mut params = BTreeMap::new();
                for child in &weapon.children {
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
                for k in params.keys() {
                    cols.insert(k.clone());
                }
                rows.push(VehicleRow {
                    folder_name: "wa/WEAPON_PISTOL/weaponanimations.meta".to_string(),
                    meta_path: "abs".to_string(),
                    handling_name: format!("WeaponAnimationsSets/{i}/WeaponAnimations/{j}"),
                    vehicle_type: set_key.clone(),
                    vehicle_class: wkey,
                    params: params.into_iter().collect(),
                });
            }
        }
        (rows, cols.into_iter().collect())
    }

    #[test]
    fn parses_weapon_animation_entries() {
        let (rows, _cols) = scan_sample();
        // Default/WEAPON_PISTOL, Default/WEAPON_SNIPERRIFLE, Gang/WEAPON_PISTOL
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].handling_name, "WeaponAnimationsSets/0/WeaponAnimations/0");
        assert_eq!(rows[0].vehicle_type, "Default");
        assert_eq!(rows[0].vehicle_class, "WEAPON_PISTOL");
        assert_eq!(rows[1].handling_name, "WeaponAnimationsSets/0/WeaponAnimations/1");
        assert_eq!(rows[1].vehicle_class, "WEAPON_SNIPERRIFLE");
        assert_eq!(rows[2].vehicle_type, "Gang");
        assert_eq!(rows[2].vehicle_class, "WEAPON_PISTOL");
        // Params: text clip sets, value modifiers, ref swap data.
        assert_eq!(rows[0].params.get("MotionClipSetHash").map(|s| s.as_str()), Some("weapons@pistol@pistol"));
        assert_eq!(rows[0].params.get("AnimFireRateModifier").map(|s| s.as_str()), Some("1.000000"));
        assert_eq!(rows[0].params.get("WeaponSwapData.ref").map(|s| s.as_str()), Some("SWAP_DEFAULT"));
        assert!(!rows[0].params.contains_key("WeaponClipSetHash")); // empty leaf omitted
        assert_eq!(rows[2].params.get("MotionClipSetHash").map(|s| s.as_str()), Some("weapons@pistol_1h@gang"));
    }

    #[test]
    fn writer_patches_weapon_animation_fields() {
        let mut params = HashMap::new();
        params.insert("MotionClipSetHash".to_string(), "weapons@pistol@pistol_v2".to_string());
        params.insert("AnimFireRateModifier".to_string(), "0.900000".to_string());
        params.insert("WeaponSwapData.ref".to_string(), "SWAP_NONE".to_string());
        let mut by: HashMap<String, HashMap<String, String>> = HashMap::new();
        by.insert("WeaponAnimationsSets/0/WeaponAnimations/0".to_string(), params);

        let mut work = SAMPLE.to_string();
        let mut applied = 0;
        let mut missing = Vec::new();
        for (path_str, p) in &by {
            let (a, _u, m) = super::super::carcols::patch_path(
                &mut work,
                &super::super::textnav::parse_path(path_str).unwrap(),
                p,
            );
            applied += a;
            missing.extend(m);
        }
        assert_eq!(applied, 3, "missing: {missing:?}");
        assert!(missing.is_empty(), "{missing:?}");
        assert!(work.contains("<MotionClipSetHash>weapons@pistol@pistol_v2</MotionClipSetHash>"), "{work}");
        assert!(work.contains(r#"<AnimFireRateModifier value="0.900000" />"#), "{work}");
        assert!(work.contains(r#"<WeaponSwapData ref="SWAP_NONE" />"#), "{work}");
        // Gang set + sniper untouched.
        assert!(work.contains("weapons@pistol_1h@gang"), "{work}");
        assert!(work.contains("weapons@rifle@rifle"), "{work}");
    }

    /// End-to-end against a real folder (set GT_TEST_WANIMS to a folder that
    /// directly contains weaponanimations.meta files).
    #[test]
    #[ignore = "requires a real folder: set GT_TEST_WANIMS"]
    fn scans_real_weaponanimations_folder() {
        let dir = std::env::var("GT_TEST_WANIMS").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_WANIMS to run)");
            return;
        }
        let res = scan_weaponanimations(dir).expect("scan should succeed");
        assert!(!res.vehicles.is_empty(), "expected entries, got none");
        assert!(!res.columns.is_empty());
        eprintln!(
            "entries={} columns={} skipped={}",
            res.vehicles.len(),
            res.columns.len(),
            res.skipped.len()
        );
        let mut sets: std::collections::BTreeMap<&str, usize> = Default::default();
        for v in &res.vehicles {
            *sets.entry(v.vehicle_type.as_str()).or_insert(0) += 1;
        }
        eprintln!("SETS: {sets:?}");
        for v in res.vehicles.iter().take(4) {
            eprintln!(
                "  {} | {} | {} | {}",
                v.folder_name, v.vehicle_type, v.vehicle_class, v.handling_name
            );
        }
        eprintln!("COLUMNS:\n{}", res.columns.join("\n"));
    }
}
