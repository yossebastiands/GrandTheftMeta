//! pedpersonality.meta editor.
//!
//! Structure: `<CPedModelInfo__PersonalityDataList>` holds two typed lists:
//!   - `<MovementModeUnholsterData>` — one `<Item>` per unholster scenario
//!     (UNHOLSTER_1H, UNHOLSTER_2H, …). Each scenario holds a `<Name>` and one
//!     `<UnholsterClips>` list whose `<Item>`s bind a `<Weapons>` list + a
//!     single `<Clip>` (the movement clip used while holstering that weapon).
//!   - `<MovementModes>` — one `<Item>` per movement personality
//!     (DEFAULT_ACTION, MP_FEMALE_ACTION, MICHAEL_ACTION, FRANKLIN_ACTION,
//!     TREVOR_ACTION). Each personality nests `<MovementModes>` → wrapper
//!     `<Item>`s → a weapon-group `<Item>` (Weapons + `<ClipSets>`), and each
//!     `<ClipSets><Item>` holds the clip-set scalar leaves (MovementClipSetId,
//!     WeaponClipSetId, WeaponClipFilterId, IK/blend flags, UnholsterClipSetId,
//!     UnholsterClipData, …).
//!
//! Rows are the actual clip bindings: one per `<UnholsterClips><Item>` (Kind
//! "Unholster", params = the `<Clip>` leaf) and one per `<ClipSets><Item>`
//! (Kind "ClipSet", params = that entry's clip-set scalar leaves). The weapon /
//! scenario names repeat across a file, so a row's identity is its structural
//! path (`MovementModeUnholsterData/0/UnholsterClips/0`,
//! `MovementModes/0/MovementModes/0/0/ClipSets/0`). The Set column carries the
//! surrounding scenario/personality `<Name>`. Writing reuses the shared
//! comment-aware writer (`carcols::update_list_files_generic`).

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::carcols::update_list_files_generic;
use super::scan::{parse_xml, ScanResult, VehicleRow, XmlNode};
use super::update::{UpdateResult, VehicleChange};

/// Does this file look like a ped-personality meta?
fn is_pedpersonality_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "pedpersonality.meta"
        || (lower.starts_with("pedpersonality") && lower.ends_with(".meta"))
}

pub(crate) fn find_pedpersonality_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if is_pedpersonality_meta(&entry.file_name().to_string_lossy()) {
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

/// Text of the first child element named `name` (whitespace-normalised).
fn child_text<'a>(node: &'a XmlNode, name: &str) -> String {
    node.children
        .iter()
        .find(|c| c.name == name)
        .map(|c| c.text.split_whitespace().collect::<Vec<_>>().join(" "))
        .unwrap_or_default()
}

/// Scalar leaves of a binding item (value=/ref=/text children, no containers).
fn leaf_params(node: &XmlNode) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for child in &node.children {
        if !child.children.is_empty() {
            continue;
        }
        if let Some(v) = child.attr("value") {
            out.insert(child.name.clone(), v.trim().to_string());
            continue;
        }
        if let Some(v) = child.attr("ref") {
            let v = v.trim().to_string();
            if !v.is_empty() {
                out.insert(format!("{}.ref", child.name), v);
            }
            continue;
        }
        let text = child.text.split_whitespace().collect::<Vec<_>>().join(" ");
        if !text.is_empty() {
            out.insert(child.name.clone(), text);
        }
    }
    out
}

/// Scan a folder for every unholster / clip-set binding across all
/// pedpersonality.meta files.
#[tauri::command]
pub fn scan_pedpersonality(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut cols: BTreeSet<String> = BTreeSet::new();

    for path in find_pedpersonality_metas(&root) {
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
        let mut file_rows = 0usize;

        // Section A: unholster clips, one binding row per <UnholsterClips><Item>.
        if let Some(section) = roots
            .iter()
            .find_map(|r| find_element(r, "MovementModeUnholsterData"))
        {
            for (i, scenario) in item_children(section).iter().enumerate() {
                let set_name = child_text(scenario, "Name");
                let Some(clips) = child_element(scenario, "UnholsterClips") else {
                    continue;
                };
                for (j, binding) in item_children(clips).iter().enumerate() {
                    let params = leaf_params(binding);
                    if params.is_empty() {
                        continue;
                    }
                    for k in params.keys() {
                        cols.insert(k.clone());
                    }
                    vehicles.push(VehicleRow {
                        folder_name: rel.clone(),
                        meta_path: abs.clone(),
                        handling_name: format!("MovementModeUnholsterData/{i}/UnholsterClips/{j}"),
                        vehicle_type: "Unholster".to_string(),
                        vehicle_class: set_name.clone(),
                        params: params.into_iter().collect(),
                    });
                    file_rows += 1;
                }
            }
        }

        // Section B: movement clip sets, one binding row per <ClipSets><Item>.
        if let Some(section) =
            roots.iter().find_map(|r| find_element(r, "MovementModes"))
        {
            for (i, personality) in item_children(section).iter().enumerate() {
                let set_name = child_text(personality, "Name");
                let Some(inner) = child_element(personality, "MovementModes") else {
                    continue;
                };
                for (j, wrapper) in item_children(inner).iter().enumerate() {
                    // Direct <Item> children of a wrapper are weapon groups.
                    for (k, group) in item_children(wrapper).iter().enumerate() {
                        let Some(cs) = child_element(group, "ClipSets") else {
                            continue;
                        };
                        for (l, clip) in item_children(cs).iter().enumerate() {
                            let params = leaf_params(clip);
                            if params.is_empty() {
                                continue;
                            }
                            for col in params.keys() {
                                cols.insert(col.clone());
                            }
                            vehicles.push(VehicleRow {
                                folder_name: rel.clone(),
                                meta_path: abs.clone(),
                                handling_name: format!(
                                    "MovementModes/{i}/MovementModes/{j}/{k}/ClipSets/{l}"
                                ),
                                vehicle_type: "ClipSet".to_string(),
                                vehicle_class: set_name.clone(),
                                params: params.into_iter().collect(),
                            });
                            file_rows += 1;
                        }
                    }
                }
            }
        }

        if file_rows == 0 {
            skipped.push(format!("{rel}: no editable clip bindings found"));
        }
    }

    Ok(ScanResult {
        vehicles,
        columns: cols.into_iter().collect(),
        skipped,
    })
}

/// Write edited ped-personality bindings back (shared comment-aware writer).
#[tauri::command]
pub fn update_pedpersonality_files(
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
<CPedModelInfo__PersonalityDataList>
  <MovementModeUnholsterData>
    <!-- a commented-out scenario block must not shift the item indexes -->
    <!-- <Item><Name>UNHOLSTER_UNARMED</Name><UnholsterClips><Item><Weapons><Item>WEAPON_PISTOL</Item></Weapons><Clip>unarmed_holster_1h</Clip></Item></UnholsterClips></Item> -->
    <Item>
      <Name>UNHOLSTER_1H</Name>
      <UnholsterClips>
        <Item>
          <Weapons>
            <Item>WEAPON_PISTOL</Item>
          </Weapons>
          <Clip>1h_holster_1h</Clip>
        </Item>
      </UnholsterClips>
    </Item>
  </MovementModeUnholsterData>
  <MovementModes>
    <Item>
      <Name>DEFAULT_ACTION</Name>
      <MovementModes>
        <Item>
          <Item>
            <Weapons>
              <Item>WEAPON_PISTOL</Item>
            </Weapons>
            <ClipSets>
              <Item>
                <MovementClipSetId>MOVE_ACTION@P_M_ZERO@ARMED@CORE</MovementClipSetId>
                <WeaponClipSetId>MOVE_ACTION@P_M_ZERO@ARMED@1H@UPPER</WeaponClipSetId>
                <WeaponClipFilterId>UpperbodyAndIk_filter</WeaponClipFilterId>
                <UpperBodyShadowExpressionEnabled value="true" />
                <UseLeftHandIk value="true" />
                <IdleTransitionBlendOutTime value="0.50000000" />
                <IdleTransitions>
                  <Item>MOVE_ACTION@GENERIC@TRANS@1H</Item>
                </IdleTransitions>
                <UnholsterClipSetId>MOVE_ACTION@P_M_ZERO@HOLSTER</UnholsterClipSetId>
                <UnholsterClipData>UNHOLSTER_1H</UnholsterClipData>
              </Item>
            </ClipSets>
          </Item>
        </Item>
      </MovementModes>
      <LastBattleEventHighEnergyStartTime value="0.00000000" />
      <LastBattleEventHighEnergyEndTime value="5.00000000" />
    </Item>
  </MovementModes>
</CPedModelInfo__PersonalityDataList>"#;

    fn scan_sample() -> (Vec<VehicleRow>, Vec<String>) {
        let roots = parse_xml(SAMPLE).unwrap();
        let mut cols = BTreeSet::new();
        let mut rows = Vec::new();

        let section = roots.iter().find_map(|r| find_element(r, "MovementModeUnholsterData")).unwrap();
        for (i, scenario) in item_children(section).iter().enumerate() {
            let set_name = child_text(scenario, "Name");
            let clips = child_element(scenario, "UnholsterClips").unwrap();
            for (j, binding) in item_children(clips).iter().enumerate() {
                let params = leaf_params(binding);
                for k in params.keys() {
                    cols.insert(k.clone());
                }
                rows.push(VehicleRow {
                    folder_name: "weapons/WEAPON_PISTOL/pedpersonality.meta".to_string(),
                    meta_path: "abs".to_string(),
                    handling_name: format!("MovementModeUnholsterData/{i}/UnholsterClips/{j}"),
                    vehicle_type: "Unholster".to_string(),
                    vehicle_class: set_name.clone(),
                    params: params.into_iter().collect(),
                });
            }
        }

        let section = roots.iter().find_map(|r| find_element(r, "MovementModes")).unwrap();
        for (i, personality) in item_children(section).iter().enumerate() {
            let set_name = child_text(personality, "Name");
            let inner = child_element(personality, "MovementModes").unwrap();
            for (j, wrapper) in item_children(inner).iter().enumerate() {
                for (k, group) in item_children(wrapper).iter().enumerate() {
                    let cs = child_element(group, "ClipSets").unwrap();
                    for (l, clip) in item_children(cs).iter().enumerate() {
                        let params = leaf_params(clip);
                        for col in params.keys() {
                            cols.insert(col.clone());
                        }
                        rows.push(VehicleRow {
                            folder_name: "weapons/WEAPON_PISTOL/pedpersonality.meta".to_string(),
                            meta_path: "abs".to_string(),
                            handling_name: format!(
                                "MovementModes/{i}/MovementModes/{j}/{k}/ClipSets/{l}"
                            ),
                            vehicle_type: "ClipSet".to_string(),
                            vehicle_class: set_name.clone(),
                            params: params.into_iter().collect(),
                        });
                    }
                }
            }
        }
        (rows, cols.into_iter().collect())
    }

    #[test]
    fn parses_unholster_and_clipset_bindings() {
        let (rows, cols) = scan_sample();
        // Commented-out UNHOLSTER_UNARMED block is ignored; real rows = 2.
        assert_eq!(rows.len(), 2, "{rows:?}");

        let unholster = &rows[0];
        assert_eq!(unholster.vehicle_type, "Unholster");
        assert_eq!(unholster.vehicle_class, "UNHOLSTER_1H");
        assert_eq!(unholster.handling_name, "MovementModeUnholsterData/0/UnholsterClips/0");
        assert_eq!(unholster.params.get("Clip").map(|s| s.as_str()), Some("1h_holster_1h"));
        assert!(!unholster.params.contains_key("Weapons")); // container skipped
        assert!(!unholster.params.contains_key("MovementClipSetId"));

        let clipset = &rows[1];
        assert_eq!(clipset.vehicle_type, "ClipSet");
        assert_eq!(clipset.vehicle_class, "DEFAULT_ACTION");
        assert_eq!(clipset.handling_name, "MovementModes/0/MovementModes/0/0/ClipSets/0");
        assert_eq!(clipset.params.get("MovementClipSetId").map(|s| s.as_str()),
            Some("MOVE_ACTION@P_M_ZERO@ARMED@CORE"));
        assert_eq!(clipset.params.get("WeaponClipSetId").map(|s| s.as_str()),
            Some("MOVE_ACTION@P_M_ZERO@ARMED@1H@UPPER"));
        assert_eq!(clipset.params.get("UpperBodyShadowExpressionEnabled").map(|s| s.as_str()), Some("true"));
        assert_eq!(clipset.params.get("UseLeftHandIk").map(|s| s.as_str()), Some("true"));
        assert_eq!(clipset.params.get("IdleTransitionBlendOutTime").map(|s| s.as_str()), Some("0.50000000"));
        assert_eq!(clipset.params.get("UnholsterClipData").map(|s| s.as_str()), Some("UNHOLSTER_1H"));
        assert!(!clipset.params.contains_key("IdleTransitions")); // container skipped
        assert!(!clipset.params.contains_key("Weapons"));

        assert!(cols.contains(&"Clip".to_string()));
        assert!(cols.contains(&"MovementClipSetId".to_string()));
        assert!(cols.contains(&"UnholsterClipData".to_string()));
    }

    #[test]
    fn writer_patches_unholster_and_clipset_fields() {
        let mut by: HashMap<String, HashMap<String, String>> = HashMap::new();
        by.insert(
            "MovementModeUnholsterData/0/UnholsterClips/0".to_string(),
            HashMap::from([("Clip".to_string(), "unarmed_holster_1h".to_string())]),
        );
        by.insert(
            "MovementModes/0/MovementModes/0/0/ClipSets/0".to_string(),
            HashMap::from([
                ("MovementClipSetId".to_string(), "MOVE_ACTION@P_M_ZERO@ARMED@CORE@V2".to_string()),
                ("WeaponClipSetId".to_string(), "MOVE_ACTION@P_M_ZERO@ARMED@1H@UPPER@V2".to_string()),
                ("IdleTransitionBlendOutTime".to_string(), "1.00000000".to_string()),
                ("UpperBodyShadowExpressionEnabled".to_string(), "false".to_string()),
                ("UnholsterClipData".to_string(), "UNHOLSTER_2H".to_string()),
            ]),
        );

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
        assert_eq!(applied, 6, "missing: {missing:?}");
        assert!(missing.is_empty(), "{missing:?}");
        assert!(work.contains("<Clip>unarmed_holster_1h</Clip>"), "{work}");
        assert!(work.contains("<MovementClipSetId>MOVE_ACTION@P_M_ZERO@ARMED@CORE@V2</MovementClipSetId>"), "{work}");
        assert!(work.contains(r#"<IdleTransitionBlendOutTime value="1.00000000" />"#), "{work}");
        assert!(work.contains(r#"<UpperBodyShadowExpressionEnabled value="false" />"#), "{work}");
        assert!(work.contains("<UnholsterClipData>UNHOLSTER_2H</UnholsterClipData>"), "{work}");
        // The commented-out unholster block is untouched; weapon lists untouched.
        assert!(work.contains("a commented-out scenario block"), "{work}");
        assert!(work.contains("<Item>WEAPON_PISTOL</Item>"), "{work}");
        assert!(work.contains("MOVE_ACTION@GENERIC@TRANS@1H"), "{work}");
    }

    /// End-to-end against a real folder (set GT_TEST_PEDPERS to a folder that
    /// contains pedpersonality.meta files, e.g. a per-weapon metas dir).
    #[test]
    #[ignore = "requires a real folder: set GT_TEST_PEDPERS"]
    fn scans_real_pedpersonality_folder() {
        let dir = std::env::var("GT_TEST_PEDPERS").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_PEDPERS to run)");
            return;
        }
        let res = scan_pedpersonality(dir).expect("scan should succeed");
        assert!(!res.vehicles.is_empty(), "expected entries, got none");
        assert!(!res.columns.is_empty());
        eprintln!(
            "entries={} columns={} skipped={}",
            res.vehicles.len(),
            res.columns.len(),
            res.skipped.len()
        );
        let mut kinds: std::collections::BTreeMap<&str, usize> = Default::default();
        let mut sets: std::collections::BTreeMap<&str, usize> = Default::default();
        for v in &res.vehicles {
            *kinds.entry(v.vehicle_type.as_str()).or_insert(0) += 1;
            *sets.entry(v.vehicle_class.as_str()).or_insert(0) += 1;
        }
        eprintln!("KINDS: {kinds:?}");
        eprintln!("SETS: {sets:?}");
        for v in res.vehicles.iter().take(6) {
            eprintln!(
                "  {} | {} | {} | {} | {:?}",
                v.folder_name, v.vehicle_type, v.vehicle_class, v.handling_name, v.params
            );
        }
        eprintln!("COLUMNS:\n{}", res.columns.join("\n"));
    }
}
