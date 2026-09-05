//! vehiclelayouts.meta editor — a "list-style" meta, sharing the generic engine
//! in `carcols.rs`.
//!
//! `<CVehicleMetadataMgr>` holds several top-level typed sections, each a list:
//! `<VehicleLayoutInfos>` (CVehicleLayoutInfo: Name + `<Seats>`/`<EntryPoints>`
//! lists of `ref` entries + LayoutFlags/scalars), `<VehicleEntryPointInfos>`
//! (CVehicleEntryPointInfo with `<AccessableSeats>`), `<VehicleExtraPointsInfos>`
//! (CVehicleExtraPointsInfo with `<ExtraVehiclePoints>`), and the anim sections.
//! Entries are keyed by `ref="…"` attributes rather than child text.
//!
//! Rows = every list entry; Group = the typed entry's `<Name>`; params include
//! `value=`/text leaves AND `ref=` attributes (e.g. `SeatInfo.ref`). Comment-aware
//! writing handles commented-out entries.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::carcols::{collect_list_rows, update_list_files_generic};
use super::scan::{child_text, parse_xml, ScanResult, VehicleRow, XmlNode};
use super::update::{UpdateResult, VehicleChange};

/// The typed top-level sections whose members carry a `<Name>` (used as Group).
const IDENTITY: &[&str] = &[
    "VehicleLayoutInfos",
    "VehicleEntryPointInfos",
    "VehicleExtraPointsInfos",
    "VehicleEntryPointAnimInfos",
    "VehicleSeatAnimInfos",
];

/// Does this file look like a vehicle-layouts meta?
fn is_vehiclelayouts_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "vehiclelayouts.meta"
        || (lower.starts_with("vehiclelayouts") && lower.ends_with(".meta"))
}

pub(crate) fn find_vehiclelayouts_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if is_vehiclelayouts_meta(&entry.file_name().to_string_lossy()) {
            out.push(entry.into_path());
        }
    }
    out
}

/// Group label for a typed entry: its `<Name>` (e.g. `LAYOUT_T90M`).
fn name_of(item: &XmlNode) -> String {
    child_text(item, "Name")
}

/// Scan a folder (any layout) for every editable vehiclelayouts list entry.
#[tauri::command]
pub fn scan_vehiclelayouts(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut cols: BTreeSet<String> = BTreeSet::new();

    for path in find_vehiclelayouts_metas(&root) {
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
        let rows = collect_list_rows(&roots, &rel, &abs, &mut cols, IDENTITY, &name_of);
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

/// Write edited vehiclelayouts entries back (same engine as carcols).
#[tauri::command]
pub fn update_vehiclelayouts_files(
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
<CVehicleMetadataMgr>
  <VehicleLayoutInfos>
    <Item type="CVehicleLayoutInfo">
      <Name>LAYOUT_T90M</Name>
      <Seats>
        <Item>
          <SeatInfo ref="SEAT_TANK_KHANJALI_FRONT_LEFT" />
          <SeatAnimInfo ref="SEAT_ANIM_T90M_DRIVER" />
        </Item>
        <Item>
          <SeatInfo ref="SEAT_TANK_APC_FRONT_RIGHT" />
          <SeatAnimInfo ref="SEAT_ANIM_TANK_APC_FRONT_RIGHT" />
        </Item>
      </Seats>
      <EntryPoints>
        <Item>
          <EntryPointInfo ref="ENTRY_POINT_TANK_KHANJALI_FRONT_LEFT" />
          <EntryPointAnimInfo ref="ENTRY_POINT_ANIM_TANK_KHANJALI_FRONT_LEFT_SIDE" />
        </Item>
      </EntryPoints>
      <LayoutFlags>StreamAnims DisableJackingAndBusting</LayoutFlags>
      <MaxXAcceleration value="25.000000" />
    </Item>
  </VehicleLayoutInfos>
  <VehicleEntryPointInfos>
    <Item type="CVehicleEntryPointInfo">
      <Name>ENTRY_POINT_MP_T90M_WARP_REAR_LEFT</Name>
      <DoorBoneName>door_dside_r</DoorBoneName>
      <WindowId>INVALID</WindowId>
      <VehicleSide>SIDE_LEFT</VehicleSide>
      <AccessableSeats>
        <Item ref="SEAT_STANDARD_NO_SHUFFLE_REAR_LEFT" />
      </AccessableSeats>
    </Item>
  </VehicleEntryPointInfos>
  <VehicleExtraPointsInfos>
    <Item type="CVehicleExtraPointsInfo">
      <Name>EXTRA_VEHICLE_POINTS_INVALID_DRIVER</Name>
      <ExtraVehiclePoints>
        <Item>
          <LocationType>SEAT_RELATIVE</LocationType>
          <PointType>GET_IN</PointType>
          <Position x="1.8" y="0.5" z="-0.075" />
          <Heading value="1.570000" />
        </Item>
        <!-- commented out item must not shift indexes
        <Item>
          <LocationType>SEAT_RELATIVE</LocationType>
          <PointType>GET_IN_2</PointType>
          <Heading value="0.000000" />
        </Item> -->
        <Item>
          <LocationType>SEAT_RELATIVE</LocationType>
          <PointType>GET_OUT</PointType>
          <Heading value="0.000000" />
        </Item>
      </ExtraVehiclePoints>
    </Item>
  </VehicleExtraPointsInfos>
  <VehicleEntryPointAnimInfos>
    <Item type="CVehicleEntryPointAnimInfo">
      <Name>ENTRY_POINT_ANIM_TANK_T90M_FRONT_RIGHT_SIDE</Name>
      <EntryPointInfo ref="ENTRY_POINT_TANK_T90M_FRONT_RIGHT" />
    </Item>
  </VehicleEntryPointAnimInfos>
</CVehicleMetadataMgr>"#;

    fn scan_sample() -> (Vec<VehicleRow>, Vec<String>) {
        let roots = parse_xml(SAMPLE).unwrap();
        let mut cols = BTreeSet::new();
        let rows = collect_list_rows(
            &roots,
            "veh/t90m/vehiclelayouts.meta",
            "abs",
            &mut cols,
            IDENTITY,
            &name_of,
        );
        (rows, cols.into_iter().collect())
    }

    #[test]
    fn parses_layout_entries_and_refs() {
        let (rows, cols) = scan_sample();
        let kinds: Vec<&str> = rows.iter().map(|r| r.vehicle_type.as_str()).collect();
        assert_eq!(
            kinds,
            vec![
                "Layout",              // VehicleLayoutInfos/0
                "Seat",                // .../Seats/0
                "Seat",                // .../Seats/1
                "Layout Entry Point",  // .../EntryPoints/0
                "Entry Point",         // VehicleEntryPointInfos/0
                "Accessible Seat",     // .../AccessableSeats/0
                "Extra Points",        // VehicleExtraPointsInfos/0
                "Extra Vehicle Point", // .../ExtraVehiclePoints/0 (commented one ignored)
                "Extra Vehicle Point", // .../ExtraVehiclePoints/1
                "Entry Point Anim",    // VehicleEntryPointAnimInfos/0
            ]
        );
        assert_eq!(rows.len(), 10);
        // Groups = the typed entry Name.
        assert_eq!(rows[0].vehicle_class, "LAYOUT_T90M");
        assert!(rows[0..4].iter().all(|r| r.vehicle_class == "LAYOUT_T90M"));
        assert!(rows[4..6].iter().all(|r| r.vehicle_class == "ENTRY_POINT_MP_T90M_WARP_REAR_LEFT"));
        assert!(rows[6..9].iter().all(|r| r.vehicle_class == "EXTRA_VEHICLE_POINTS_INVALID_DRIVER"));
        // Layout params (identity Name + text + value).
        let layout = &rows[0];
        assert_eq!(layout.params.get("Name").map(|s| s.as_str()), Some("LAYOUT_T90M"));
        assert!(layout.params.get("LayoutFlags").map(|s| s.as_str()).unwrap().contains("StreamAnims"));
        assert_eq!(layout.params.get("MaxXAcceleration").map(|s| s.as_str()), Some("25.000000"));
        // Seat rows carry ref params.
        assert_eq!(rows[1].params.get("SeatInfo.ref").map(|s| s.as_str()), Some("SEAT_TANK_KHANJALI_FRONT_LEFT"));
        assert_eq!(rows[1].params.get("SeatAnimInfo.ref").map(|s| s.as_str()), Some("SEAT_ANIM_T90M_DRIVER"));
        // AccessableSeats leaf entry uses Item.ref.
        assert_eq!(rows[5].params.get("Item.ref").map(|s| s.as_str()), Some("SEAT_STANDARD_NO_SHUFFLE_REAR_LEFT"));
        // Extra vehicle point text + value.
        let extra = &rows[7];
        assert_eq!(extra.params.get("PointType").map(|s| s.as_str()), Some("GET_IN"));
        assert_eq!(extra.params.get("Heading").map(|s| s.as_str()), Some("1.570000"));
        assert_eq!(rows[8].params.get("PointType").map(|s| s.as_str()), Some("GET_OUT"));
        // Entry point anim ref param.
        assert_eq!(rows[9].params.get("EntryPointInfo.ref").map(|s| s.as_str()), Some("ENTRY_POINT_TANK_T90M_FRONT_RIGHT"));
        assert!(cols.contains(&"SeatInfo.ref".to_string()));
        assert!(cols.contains(&"Item.ref".to_string()));
        assert!(cols.contains(&"LayoutFlags".to_string()));
    }

    #[test]
    fn writer_patches_refs_values_and_text() {
        let mut by: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut l = HashMap::new();
        l.insert("MaxXAcceleration".to_string(), "30".to_string());
        l.insert("LayoutFlags".to_string(), "StreamAnims".to_string());
        by.insert("VehicleLayoutInfos/0".to_string(), l);
        let mut s = HashMap::new();
        s.insert("SeatAnimInfo.ref".to_string(), "SEAT_ANIM_T90M_DRIVER_V2".to_string());
        by.insert("VehicleLayoutInfos/0/Seats/0".to_string(), s);
        let mut a = HashMap::new();
        a.insert("Item.ref".to_string(), "SEAT_STANDARD_FRONT_LEFT".to_string());
        by.insert("VehicleEntryPointInfos/0/AccessableSeats/0".to_string(), a);
        let mut e = HashMap::new();
        e.insert("Heading".to_string(), "2.000000".to_string());
        by.insert("VehicleExtraPointsInfos/0/ExtraVehiclePoints/0".to_string(), e);

        let mut work = SAMPLE.to_string();
        let mut applied = 0;
        let mut missing = Vec::new();
        for (path_str, params) in &by {
            let (a, _u, m) = super::super::carcols::patch_path(
                &mut work,
                &super::super::textnav::parse_path(path_str).unwrap(),
                params,
            );
            applied += a;
            missing.extend(m);
        }
        assert_eq!(applied, 5, "missing: {missing:?}");
        assert!(missing.is_empty(), "{missing:?}");
        assert!(work.contains(r#"<MaxXAcceleration value="30" />"#), "{work}");
        assert!(work.contains("<LayoutFlags>StreamAnims</LayoutFlags>"), "{work}");
        assert!(work.contains(r#"<SeatAnimInfo ref="SEAT_ANIM_T90M_DRIVER_V2" />"#), "{work}");
        assert!(work.contains(r#"<Item ref="SEAT_STANDARD_FRONT_LEFT" />"#), "{work}");
        assert!(work.contains(r#"<Heading value="2.000000" />"#), "{work}");
        // Commented extra point untouched.
        assert!(work.contains("GET_IN_2"), "{work}");
        // The other real extra point keeps its heading.
        assert!(work.contains(r#"<Heading value="0.000000" />"#), "{work}");
    }

    /// End-to-end against a real vehicle folder (set GT_TEST_VEHLAYOUTS to the
    /// folder that directly contains the vehiclelayouts.meta files).
    #[test]
    #[ignore = "requires a real folder: set GT_TEST_VEHLAYOUTS"]
    fn scans_real_vehiclelayouts_folder() {
        let dir = std::env::var("GT_TEST_VEHLAYOUTS").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_VEHLAYOUTS to run)");
            return;
        }
        let res = scan_vehiclelayouts(dir).expect("scan should succeed");
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
        for v in res.vehicles.iter().take(4) {
            eprintln!(
                "  {} | {} | {} | {}",
                v.folder_name, v.vehicle_type, v.vehicle_class, v.handling_name
            );
        }
        eprintln!("COLUMNS:\n{}", res.columns.join("\n"));
    }
}
