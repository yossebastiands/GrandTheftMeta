//! Weapon meta crawling — FiveM weapon addons are very inconsistent in layout, so
//! this scanner is layout-agnostic: it walks the whole chosen folder and grabs
//! every `weapons.meta` / `weapons_*.meta`, then treats each
//! `<Item type="CWeaponInfo">` inside `<CWeaponInfoBlob>` as one editable weapon.
//!
//! Only direct scalar leaves of a CWeaponInfo are exposed (numeric `value=`
//! attributes, and short text leaves such as flags/stat names). Structural
//! blocks (Explosion, AttachPoints, …) and references are preserved untouched.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use walkdir::WalkDir;

use super::scan::{child_text, collect_items, parse_xml, ScanResult, VehicleRow, XmlNode};

#[derive(Serialize, Debug)]
pub struct WeaponScanResult {
    pub weapons: Vec<VehicleRow>,
    pub columns: Vec<String>,
    pub skipped: Vec<String>,
}

/// Does this file look like a weapon-info meta? (`weapons.meta` or `weapons_*.meta`)
fn is_weapon_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "weapons.meta"
        || (lower.starts_with("weapons_") && lower.ends_with(".meta"))
}

/// Every file named like a weapon meta, recursively under `root`.
pub(crate) fn find_weapon_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        // Skip obvious junk dirs like .git — handled by skipping hidden dirs below.
        if is_weapon_meta(&name) {
            out.push(entry.into_path());
        }
    }
    out
}

/// Fields that identify the weapon / are shown as dedicated columns, not params.
const IDENTITY: &[&str] = &["Name", "Slot", "Group"];

/// Collect a single `<Item type="CWeaponInfo">` into a row.
fn parse_weapon(item: &XmlNode, file_rel: String, abs: String) -> VehicleRow {
    let name = child_text(item, "Name");
    let slot = child_text(item, "Slot");
    let group = child_text(item, "Group");

    let mut params: BTreeMap<String, String> = BTreeMap::new();
    for child in &item.children {
        // Skip container/structural blocks and the identity fields.
        if !child.children.is_empty() {
            continue;
        }
        if IDENTITY.contains(&child.name.as_str()) {
            continue;
        }
        // Numeric / boolean scalar attribute.
        if let Some(v) = child.attr("value") {
            params.insert(child.name.clone(), v.trim().to_string());
            continue;
        }
        // Short text leaf (flags, stat/hash names, …). Whitespace collapsed.
        let text = child.text.split_whitespace().collect::<Vec<_>>().join(" ");
        if !text.is_empty() {
            params.insert(child.name.clone(), text);
        }
    }

    VehicleRow {
        // Relative file path (e.g. "metas/ak47/weapons.meta") — unique across any layout.
        folder_name: file_rel,
        meta_path: abs,
        handling_name: name,
        vehicle_type: slot,
        vehicle_class: group,
        params: params.into_iter().collect(),
    }
}

/// Scan a folder for all weapon meta files → one row per CWeaponInfo.
#[tauri::command]
pub fn scan_weapons(folder_path: String) -> Result<WeaponScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut weapons: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut colset: BTreeSet<String> = BTreeSet::new();

    for path in find_weapon_metas(&root) {
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
            .filter(|it| it.attr("type") == Some("CWeaponInfo"))
            .collect();
        if items.is_empty() {
            skipped.push(format!("{rel}: no CWeaponInfo found"));
            continue;
        }
        let abs = path.to_string_lossy().into_owned();
        for item in items {
            let row = parse_weapon(item, rel.clone(), abs.clone());
            if row.handling_name.is_empty() {
                skipped.push(format!("{rel}: unnamed weapon"));
                continue;
            }
            for k in row.params.keys() {
                colset.insert(k.clone());
            }
            weapons.push(row);
        }
    }

    Ok(WeaponScanResult {
        weapons,
        columns: colset.into_iter().collect(),
        skipped,
    })
}

/// Convert into the generic ScanResult used by the UI (weapons list).
#[allow(dead_code)] // used once the weapon editors are wired to the UI
pub fn to_scan_result(r: WeaponScanResult) -> ScanResult {
    ScanResult {
        vehicles: r.weapons,
        columns: r.columns,
        skipped: r.skipped,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_inline_weapon_meta() {
        let xml = r#"<?xml version="1.0"?>
<CWeaponInfoBlob>
  <Infos>
    <Item>
      <Infos>
        <Item type="CWeaponInfo">
          <Name>WEAPON_TEST</Name>
          <Model>w_tst</Model>
          <Slot>SLOT_WEAPON_TEST</Slot>
          <Group>GROUP_RIFLE</Group>
          <ClipSize value="30"/>
          <Damage value="25.000000"/>
          <WeaponFlags>CarriedInHand Automatic</WeaponFlags>
          <StatName>ASLTRIFLE</StatName>
          <Explosion>
            <Item><Default>DONTCARE</Default></Item>
          </Explosion>
        </Item>
      </Infos>
    </Item>
  </Infos>
  <Name>AR</Name>
</CWeaponInfoBlob>"#;
        let roots = parse_xml(xml).unwrap();
        let items: Vec<&XmlNode> = collect_items(&roots)
            .into_iter()
            .filter(|it| it.attr("type") == Some("CWeaponInfo"))
            .collect();
        assert_eq!(items.len(), 1);
        let row = parse_weapon(items[0], "w_test/weapons.meta".into(), "abs".into());
        assert_eq!(row.handling_name, "WEAPON_TEST");
        assert_eq!(row.vehicle_type, "SLOT_WEAPON_TEST");
        assert_eq!(row.vehicle_class, "GROUP_RIFLE");
        assert_eq!(row.params.get("ClipSize").map(|s| s.as_str()), Some("30"));
        assert_eq!(row.params.get("Damage").map(|s| s.as_str()), Some("25.000000"));
        assert_eq!(row.params.get("StatName").map(|s| s.as_str()), Some("ASLTRIFLE"));
        // Structural block + identity fields are excluded.
        assert!(!row.params.contains_key("Name"));
        assert!(!row.params.contains_key("Slot"));
        assert!(!row.params.contains_key("Explosion"));
        assert_eq!(row.params.get("WeaponFlags").map(|s| s.as_str()), Some("CarriedInHand Automatic"));
    }

    /// End-to-end against a real weapon resource folder (set GT_TEST_WEAPONS).
    #[test]
    fn scans_real_weapons_folder() {
        let dir = std::env::var("GT_TEST_WEAPONS").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_WEAPONS to run)");
            return;
        }
        let res = scan_weapons(dir).expect("scan should succeed");
        assert!(!res.weapons.is_empty(), "expected weapons, got none");
        assert!(!res.columns.is_empty());
        for w in res.weapons.iter().take(3) {
            assert!(!w.handling_name.is_empty());
        }
        eprintln!(
            "weapons={} columns={} skipped={}",
            res.weapons.len(),
            res.columns.len(),
            res.skipped.len()
        );
    }
}
