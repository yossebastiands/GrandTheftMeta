//! Folder crawling + handling.meta parsing (mirrors `handling_meta_excel.py` export).
//!
//! Scanning behaviour:
//! - each immediate subfolder of the chosen root is treated as one vehicle resource;
//! - the `handling.meta` to use is picked by priority:
//!   1. a file at the root of the vehicle folder,
//!   2. the file referenced in `fxmanifest.lua` (`data_file 'HANDLING_FILE' '...'`),
//!   3. the shallowest one found;
//! - every `<Item type="CHandlingData">` under `<HandlingData>` becomes one row
//!   (multi-entry metas, e.g. Naval fleets, produce one row per entry);
//! - vector params split into `.x`/`.y`/`.z`, sub-handling params are prefixed by their
//!   item type, and flag/hash params are always kept as text.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use quick_xml::Reader;
use quick_xml::events::Event;
use serde::Serialize;
use walkdir::WalkDir;

// ---------------------------------------------------------------------------
// Data structures shared with the frontend
// ---------------------------------------------------------------------------

#[derive(Serialize, Debug, Clone)]
pub struct VehicleRow {
    /// Vehicle resource folder name, e.g. "Aircraft_berkut".
    pub folder_name: String,
    /// Absolute path to the handling.meta file this row came from.
    pub meta_path: String,
    /// Value of the `<handlingName>` element (the in-game model name).
    pub handling_name: String,
    /// Friendly native vehicle type from vehicles.meta `<type>`
    /// (e.g. "Plane", "Helicopter", "Boat", "Car"). Empty when unknown.
    pub vehicle_type: String,
    /// Friendly native vehicle class from vehicles.meta `<vehicleClass>`
    /// (e.g. "Military", "Plane", "Super", "Off-Road"). Empty when unknown.
    pub vehicle_class: String,
    /// All param values keyed by column name (strings only, never numbers).
    pub params: HashMap<String, String>,
}

#[derive(Serialize, Debug)]
pub struct ScanResult {
    pub vehicles: Vec<VehicleRow>,
    /// Ordered list of all param column names.
    pub columns: Vec<String>,
    /// Folders that were skipped (no meta / parse error), with a reason.
    pub skipped: Vec<String>,
}

// ---------------------------------------------------------------------------
// Minimal XML DOM (quick-xml event pull → tree)
// ---------------------------------------------------------------------------

#[derive(Default, Debug, Clone)]
pub(crate) struct XmlNode {
    pub(crate) name: String,
    pub(crate) attrs: Vec<(String, String)>,
    pub(crate) text: String,
    pub(crate) children: Vec<XmlNode>,
}

impl XmlNode {
    pub(crate) fn attr(&self, key: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }
}

pub(crate) fn push_child(stack: &mut Vec<XmlNode>, roots: &mut Vec<XmlNode>, node: XmlNode) {
    match stack.last_mut() {
        Some(parent) => parent.children.push(node),
        None => roots.push(node),
    }
}

pub(crate) fn parse_xml(text: &str) -> Result<Vec<XmlNode>, String> {
    let mut reader = Reader::from_str(text);
    reader.config_mut().trim_text(true);
    let mut stack: Vec<XmlNode> = Vec::new();
    let mut roots: Vec<XmlNode> = Vec::new();
    let mut buf: Vec<u8> = Vec::new();
    loop {
        buf.clear();
        match reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("XML parse error at offset {}: {}", reader.buffer_position(), e))?
        {
            Event::Start(e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                let mut attrs = Vec::new();
                for a in e.attributes().flatten() {
                    let key = String::from_utf8_lossy(a.key.as_ref()).into_owned();
                    let val = String::from_utf8_lossy(&a.value).into_owned();
                    attrs.push((key, val));
                }
                stack.push(XmlNode {
                    name,
                    attrs,
                    ..Default::default()
                });
            }
            Event::Empty(e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                let mut attrs = Vec::new();
                for a in e.attributes().flatten() {
                    let key = String::from_utf8_lossy(a.key.as_ref()).into_owned();
                    let val = String::from_utf8_lossy(&a.value).into_owned();
                    attrs.push((key, val));
                }
                push_child(
                    &mut stack,
                    &mut roots,
                    XmlNode {
                        name,
                        attrs,
                        ..Default::default()
                    },
                );
            }
            Event::Text(t) => {
                if let Some(parent) = stack.last_mut() {
                    if let Ok(cow) = t.unescape() {
                        parent.text.push_str(&cow);
                    }
                }
            }
            Event::CData(t) => {
                if let Some(parent) = stack.last_mut() {
                    parent
                        .text
                        .push_str(&String::from_utf8_lossy(t.as_ref()).into_owned());
                }
            }
            Event::End(_) => {
                if let Some(node) = stack.pop() {
                    push_child(&mut stack, &mut roots, node);
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(roots)
}

// ---------------------------------------------------------------------------
// Value extraction rules (mirror the Python reference)
// ---------------------------------------------------------------------------

/// Flag / enum / hash params that must always stay text so hex strings like
/// "C201081" are never corrupted into numbers.
const TEXT_ONLY: &[&str] = &[
    "strModelFlags",
    "strHandlingFlags",
    "strDamageFlags",
    "AIHandling",
    "handlingType",
    "uWeaponHash",
];

fn is_text_only(col: &str) -> bool {
    TEXT_ONLY.contains(&col)
}

fn parse_element(node: &XmlNode, col: &str, row: &mut HashMap<String, String>) {
    if is_text_only(col) {
        row.insert(col.to_string(), node.text.split_whitespace().collect::<Vec<_>>().join(" "));
        return;
    }

    // Vector attribute element -> one column per present axis.
    let axes: Vec<&str> = ["x", "y", "z"]
        .iter()
        .filter(|a| node.attr(a).is_some())
        .map(|a| *a)
        .collect();
    if !axes.is_empty() {
        for a in axes {
            if let Some(v) = node.attr(a) {
                row.insert(format!("{col}.{a}"), v.trim().to_string());
            }
        }
        return;
    }

    // Scalar `value` attribute (fMass, fThrust, ...).
    if let Some(v) = node.attr("value") {
        row.insert(col.to_string(), v.trim().to_string());
        return;
    }

    // Nested `<Item>` list (uWeaponHash, WeaponVehicleModType, ...) -> join texts.
    let items: Vec<&XmlNode> = node.children.iter().filter(|c| c.name == "Item").collect();
    if !items.is_empty() {
        let mut vals: Vec<String> = Vec::new();
        for it in items {
            let t = it.text.split_whitespace().collect::<Vec<_>>().join(" ");
            if !t.is_empty() {
                vals.push(t);
            }
        }
        row.insert(col.to_string(), vals.join(", "));
        return;
    }

    // Plain text content (arrays / misc) -> join tokens with ", ".
    let tokens = node.text.split_whitespace().collect::<Vec<_>>().join(", ");
    if !tokens.is_empty() {
        row.insert(col.to_string(), tokens);
    }
}

fn parse_subhandling_data(container: &XmlNode, row: &mut HashMap<String, String>) {
    let mut seen: HashMap<String, usize> = HashMap::new();
    for item in &container.children {
        if item.name != "Item" {
            continue;
        }
        let itype = match item.attr("type") {
            Some(t) if t != "NULL" => t.to_string(),
            _ => continue,
        };
        let n = seen.entry(itype.clone()).or_insert(0);
        *n += 1;
        let nv = *n;
        let prefix = if nv == 1 {
            itype.clone()
        } else {
            format!("{itype}_{nv}")
        };
        for child in &item.children {
            parse_element(child, &format!("{prefix}.{}", child.name), row);
        }
    }
}

fn parse_chandling(item: &XmlNode) -> HashMap<String, String> {
    let mut row = HashMap::new();
    for child in &item.children {
        if child.name == "SubHandlingData" {
            parse_subhandling_data(child, &mut row);
        } else {
            parse_element(child, &child.name, &mut row);
        }
    }
    row
}

fn parse_handling_doc(roots: &[XmlNode]) -> Vec<HashMap<String, String>> {
    let mut rows: Vec<HashMap<String, String>> = Vec::new();
    // `<HandlingData>` may be the root element or a direct child of it.
    let mut containers: Vec<&XmlNode> = Vec::new();
    for r in roots {
        if r.name == "HandlingData" {
            containers.push(r);
        } else {
            for c in &r.children {
                if c.name == "HandlingData" {
                    containers.push(c);
                }
            }
        }
    }
    for hd in containers {
        for item in &hd.children {
            if item.name == "Item" && item.attr("type") == Some("CHandlingData") {
                rows.push(parse_chandling(item));
            }
        }
    }
    rows
}

// ---------------------------------------------------------------------------
// Native classification from vehicles.meta (VEHICLE_METADATA_FILE)
// ---------------------------------------------------------------------------

/// Collapsed text of a direct child element, or "" when absent.
pub(crate) fn child_text(node: &XmlNode, name: &str) -> String {
    node.children
        .iter()
        .find(|c| c.name == name)
        .map(|c| c.text.split_whitespace().collect::<Vec<_>>().join(" "))
        .unwrap_or_default()
}

/// Every `<Item>` node in the tree (vehicles.meta holds one per model).
pub(crate) fn collect_items(roots: &[XmlNode]) -> Vec<&XmlNode> {
    fn rec<'a>(node: &'a XmlNode, out: &mut Vec<&'a XmlNode>) {
        if node.name == "Item" {
            out.push(node);
        }
        for c in &node.children {
            rec(c, out);
        }
    }
    let mut out = Vec::new();
    for r in roots {
        rec(r, &mut out);
    }
    out
}

/// modelName(lowercased) -> (raw <type>, raw <vehicleClass>) from a vehicles.meta.
fn parse_vehicles_meta(roots: &[XmlNode]) -> HashMap<String, (String, String)> {
    let mut map = HashMap::new();
    for item in collect_items(roots) {
        let model = child_text(item, "modelName");
        if model.is_empty() {
            continue;
        }
        let vtype = child_text(item, "type");
        let vclass = child_text(item, "vehicleClass");
        map.entry(model.to_lowercase()).or_insert((vtype, vclass));
    }
    map
}

/// Locate the vehicles.meta for a folder: prefer the one sitting next to the
/// handling.meta we are using, otherwise the shallowest one in the folder.
fn find_vehicles_meta(veh_dir: &Path, meta_dir: &Path) -> Option<PathBuf> {
    // (same dir as meta, depth, rel path, full path)
    let mut best: Option<(bool, usize, String, PathBuf)> = None;
    for entry in WalkDir::new(veh_dir).follow_links(false) {
        let entry = entry.ok()?;
        if !entry.file_type().is_file() {
            continue;
        }
        if !entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case("vehicles.meta")
        {
            continue;
        }
        let full = entry.path().to_path_buf();
        let same_dir = full.parent() == Some(meta_dir);
        let rel = full
            .strip_prefix(veh_dir)
            .unwrap_or(&full)
            .to_string_lossy()
            .replace('\\', "/");
        let depth = rel.matches('/').count();
        let better = match &best {
            None => true,
            Some((b_same, b_depth, b_rel, _)) => {
                (!same_dir, depth, rel.as_str()) < (!*b_same, *b_depth, b_rel.as_str())
            }
        };
        if better {
            best = Some((same_dir, depth, rel, full));
        }
    }
    best.map(|(_, _, _, p)| p)
}

/// "Off Road" from "OFF_ROAD" / "SUPER" stays "SUPER"-style capitals.
fn prettify_token(tok: &str) -> String {
    tok.split('_')
        .filter(|p| !p.is_empty())
        .map(|w| {
            let mut cs = w.chars();
            match cs.next() {
                Some(f) => f.to_uppercase().collect::<String>() + cs.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Friendly label for a raw `VEHICLE_TYPE_*` value.
pub(crate) fn native_type_label(raw: &str) -> String {
    let up = raw.trim().to_uppercase();
    let tok = up.strip_prefix("VEHICLE_TYPE_").unwrap_or(&up);
    match tok {
        "CAR" => "Car".into(),
        "BIKE" => "Motorcycle".into(),
        "QUADBIKE" => "Quadbike".into(),
        "BOAT" => "Boat".into(),
        "HELI" => "Helicopter".into(),
        "PLANE" => "Plane".into(),
        "SUBMARINE" => "Submarine".into(),
        "TRAIN" => "Train".into(),
        "TRAILER" => "Trailer".into(),
        "AMPHIBIOUS_AUTOMOBILE" | "AMPHIBIOUS_QUADBIKE" => "Amphibious".into(),
        "BLIMP" => "Blimp".into(),
        _ => prettify_token(tok),
    }
}

/// Friendly label for a raw `VC_*` value.
pub(crate) fn native_class_label(raw: &str) -> String {
    let up = raw.trim().to_uppercase();
    let tok = up.strip_prefix("VC_").unwrap_or(&up);
    match tok {
        "PLANE" => "Plane".into(),
        "HELICOPTER" => "Helicopter".into(),
        "BOAT" => "Boat".into(),
        "MILITARY" => "Military".into(),
        "OFF_ROAD" => "Off-Road".into(),
        "UTILITY" => "Utility".into(),
        "COMMERCIAL" => "Commercial".into(),
        "EMERGENCY" => "Emergency".into(),
        "SEDAN" => "Sedan".into(),
        "SUPER" => "Super".into(),
        "SUV" => "SUV".into(),
        "MOTORCYCLE" => "Motorcycle".into(),
        "QUAD" => "Quad".into(),
        "CYCLE" => "Cycle".into(),
        "VAN" => "Van".into(),
        "INDUSTRIAL" => "Industrial".into(),
        "SERVICE" => "Service".into(),
        "FREIGHT" => "Freight".into(),
        "RAIL" => "Rail".into(),
        "TRAILER" => "Trailer".into(),
        "SPORTS" => "Sports".into(),
        "SPORTS_CLASSIC" => "Sports Classic".into(),
        "MUSCLE" => "Muscle".into(),
        "COUPE" => "Coupe".into(),
        "COMPACT" => "Compact".into(),
        _ => prettify_token(tok),
    }
}

// ---------------------------------------------------------------------------
// Meta file location (root -> fxmanifest reference -> shallowest)
// ---------------------------------------------------------------------------

pub(crate) fn find_handling_meta(veh_dir: &Path) -> Result<PathBuf, String> {
    // (depth = number of path separators below veh_dir, rel path w/ '/', full path)
    let mut found: Vec<(usize, String, PathBuf)> = Vec::new();
    for entry in WalkDir::new(veh_dir).follow_links(false) {
        let entry = entry.map_err(|e| format!("walk error: {e}"))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if !name.eq_ignore_ascii_case("handling.meta") {
            continue;
        }
        let full = entry.path().to_path_buf();
        let rel = full
            .strip_prefix(veh_dir)
            .unwrap_or(&full)
            .to_string_lossy()
            .replace('\\', "/");
        let depth = rel.matches('/').count();
        found.push((depth, rel, full));
    }
    if found.is_empty() {
        return Err("no handling.meta found".to_string());
    }

    // 1) A meta at the root level of the vehicle folder wins.
    for (d, _, full) in &found {
        if *d == 0 {
            return Ok(full.clone());
        }
    }

    // 2) The one referenced by fxmanifest.lua (data_file 'HANDLING_FILE' '...').
    let manifest = veh_dir.join("fxmanifest.lua");
    if manifest.is_file() {
        if let Ok(text) = std::fs::read_to_string(&manifest) {
            for (_, rel, full) in &found {
                if text.contains(rel.as_str()) {
                    return Ok(full.clone());
                }
            }
        }
    }

    // 3) Shallowest one (deterministic tie-break by path).
    found.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    Ok(found[0].2.clone())
}

// ---------------------------------------------------------------------------
// Tauri command
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn scan_folder(folder_path: String) -> Result<ScanResult, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut dirs: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(root).map_err(|e| format!("Cannot read folder: {e}"))? {
        let entry = entry.map_err(|e| format!("Cannot read folder entry: {e}"))?;
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            dirs.push(entry.path());
        }
    }
    dirs.sort();

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut master_cols: Vec<String> = Vec::new();
    let mut col_set: HashSet<String> = HashSet::new();
    let mut skipped: Vec<String> = Vec::new();

    for veh_dir in dirs {
        let folder_name = veh_dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

        let meta = match find_handling_meta(&veh_dir) {
            Ok(m) => m,
            Err(e) => {
                skipped.push(format!("{folder_name} ({e})"));
                continue;
            }
        };
        let text = match std::fs::read_to_string(&meta) {
            Ok(t) => t,
            Err(e) => {
                skipped.push(format!("{folder_name} (cannot read: {e})"));
                continue;
            }
        };
        let roots = match parse_xml(&text) {
            Ok(r) => r,
            Err(e) => {
                skipped.push(format!("{folder_name} ({e})"));
                continue;
            }
        };
        let rows = parse_handling_doc(&roots);
        if rows.is_empty() {
            skipped.push(format!("{folder_name} (no CHandlingData entries found)"));
            continue;
        }

        // Native classification from the vehicles.meta that sits next to it.
        let native = meta
            .parent()
            .and_then(|d| find_vehicles_meta(&veh_dir, d))
            .and_then(|p| std::fs::read_to_string(&p).ok())
            .and_then(|t| parse_xml(&t).ok())
            .map(|roots| parse_vehicles_meta(&roots))
            .unwrap_or_default();

        for row in rows {
            let handling_name = row.get("handlingName").cloned().unwrap_or_default();
            let (raw_type, raw_class) = native
                .get(&handling_name.to_lowercase())
                .cloned()
                .unwrap_or_default();
            let mut params: HashMap<String, String> = HashMap::new();
            for (k, v) in row {
                if k == "handlingName" {
                    continue;
                }
                params.insert(k.clone(), v);
                if col_set.insert(k.clone()) {
                    master_cols.push(k);
                }
            }
            vehicles.push(VehicleRow {
                folder_name: folder_name.clone(),
                meta_path: meta.to_string_lossy().into_owned(),
                handling_name,
                vehicle_type: native_type_label(&raw_type),
                vehicle_class: native_class_label(&raw_class),
                params,
            });
        }
    }

    Ok(ScanResult {
        vehicles,
        columns: master_cols,
        skipped,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<CHandlingDataMgr>
  <HandlingData>
    <Item type="CHandlingData">
      <handlingName>f22a</handlingName>
      <fMass value="8000" />
      <strModelFlags>0</strModelFlags>
      <SubHandlingData>
        <Item type="CFlyingHandlingData">
          <fThrust value="2.45" />
          <vecTurnRes x="0.075000" y="0.41" />
        </Item>
        <Item type="CVehicleWeaponHandlingData">
          <uWeaponHash>
            <Item>VEHICLE_WEAPON_GUN</Item>
            <Item />
            <Item>VEHICLE_WEAPON_ROCKET</Item>
          </uWeaponHash>
          <WeaponSeats content="int_array">0 0 0</WeaponSeats>
        </Item>
        <Item type="NULL" />
      </SubHandlingData>
    </Item>
  </HandlingData>
</CHandlingDataMgr>"#;

    fn write(path: &Path, content: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }

    #[test]
    fn parses_rows_and_params_like_python() {
        let roots = parse_xml(SAMPLE).expect("valid xml");
        let rows = parse_handling_doc(&roots);
        assert_eq!(rows.len(), 1);
        let r = &rows[0];
        assert_eq!(r.get("handlingName").map(|s| s.as_str()), Some("f22a"));
        assert_eq!(r.get("fMass").map(|s| s.as_str()), Some("8000"));
        assert_eq!(r.get("strModelFlags").map(|s| s.as_str()), Some("0"));
        assert_eq!(
            r.get("CFlyingHandlingData.fThrust").map(|s| s.as_str()),
            Some("2.45")
        );
        // vector split, only present axes become columns
        assert_eq!(
            r.get("CFlyingHandlingData.vecTurnRes.x").map(|s| s.as_str()),
            Some("0.075000")
        );
        assert_eq!(
            r.get("CFlyingHandlingData.vecTurnRes.y").map(|s| s.as_str()),
            Some("0.41")
        );
        assert!(r.get("CFlyingHandlingData.vecTurnRes.z").is_none());
        // nested <Item> list: empty slots dropped, texts joined ", "
        assert_eq!(
            r.get("CVehicleWeaponHandlingData.uWeaponHash")
                .map(|s| s.as_str()),
            Some("VEHICLE_WEAPON_GUN, VEHICLE_WEAPON_ROCKET")
        );
        // text array: tokens joined ", "
        assert_eq!(
            r.get("CVehicleWeaponHandlingData.WeaponSeats")
                .map(|s| s.as_str()),
            Some("0, 0, 0")
        );
        // NULL sub-handling items are ignored
        assert!(r.get("CVehicleWeaponHandlingData.vecTurnRes.x").is_none());
    }

    #[test]
    fn meta_location_priority_root_then_manifest_then_shallowest() {
        let base = std::env::temp_dir().join(format!("gtm_scan_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);

        // (1) root-level meta wins over a deeper one
        let veh_a = base.join("veh_a");
        write(&veh_a.join("handling.meta"), "<HandlingData/>");
        write(&veh_a.join("common").join("handling.meta"), "<HandlingData/>");
        assert_eq!(
            find_handling_meta(&veh_a).unwrap().file_name().unwrap(),
            "handling.meta"
        );
        assert_eq!(
            find_handling_meta(&veh_a)
                .unwrap()
                .parent()
                .unwrap()
                .file_name()
                .unwrap(),
            "veh_a"
        );

        // (2) no root meta, but fxmanifest references the nested one
        let veh_b = base.join("veh_b");
        write(
            &veh_b.join("fxmanifest.lua"),
            "fx_version 'cerulean'\ndata_file 'HANDLING_FILE' 'common/handling.meta'\n",
        );
        write(&veh_b.join("common").join("handling.meta"), "<HandlingData/>");
        assert_eq!(
            find_handling_meta(&veh_b)
                .unwrap()
                .parent()
                .unwrap()
                .file_name()
                .unwrap(),
            "common"
        );

        // (3) otherwise the shallowest is chosen
        let veh_c = base.join("veh_c");
        write(
            &veh_c.join("sub1").join("handling.meta"),
            "<HandlingData/>",
        );
        write(
            &veh_c.join("sub1").join("deep").join("handling.meta"),
            "<HandlingData/>",
        );
        assert_eq!(
            find_handling_meta(&veh_c)
                .unwrap()
                .parent()
                .unwrap()
                .file_name()
                .unwrap(),
            "sub1"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    #[ignore = "requires a vehicle pack: set GT_TEST_VEHICLES to a folder containing vehicle resources"]
    fn scans_pack_end_to_end() {
        let Ok(p) = std::env::var("GT_TEST_VEHICLES") else {
            eprintln!("skipping: set GT_TEST_VEHICLES to the vehicle pack folder");
            return;
        };
        if !Path::new(&p).is_dir() {
            eprintln!("skipping: GT_TEST_VEHICLES folder not found: {p}");
            return;
        }
        let res = scan_folder(p).expect("scan_folder should succeed");
        eprintln!(
            "vehicles={} columns={} skipped={:?}",
            res.vehicles.len(),
            res.columns.len(),
            res.skipped
        );
        assert!(res.vehicles.len() >= 100, "expected ~134 entries");
        assert!(!res.columns.is_empty(), "expected many param columns");
        assert!(
            res.skipped.is_empty(),
            "no vehicle folder should be skipped, got {:?}",
            res.skipped
        );
        for v in &res.vehicles {
            assert!(!v.folder_name.is_empty());
            assert!(!v.handling_name.is_empty(), "{} has empty handlingName", v.folder_name);
        }
        // Native classification present for known models
        let f22 = res
            .vehicles
            .iter()
            .find(|v| v.folder_name == "Aircraft_F22A" && v.handling_name == "f22a")
            .expect("F22A row");
        assert_eq!(f22.vehicle_type, "Plane");
        assert_eq!(f22.vehicle_class, "Plane");
        let tank = res
            .vehicles
            .iter()
            .find(|v| v.folder_name == "Tank_abramsx")
            .expect("tank row");
        assert_eq!(tank.vehicle_type, "Car");
        assert_eq!(tank.vehicle_class, "Military");
    }

    #[test]
    fn classifies_from_vehicles_meta() {
        let vm = r#"<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfo__InitDataList>
  <InitDatas>
    <Item>
      <modelName>f22a</modelName>
      <handlingId>f22a</handlingId>
      <type>VEHICLE_TYPE_PLANE</type>
      <vehicleClass>VC_PLANE</vehicleClass>
    </Item>
    <Item>
      <modelName>abramsx</modelName>
      <type>VEHICLE_TYPE_CAR</type>
      <vehicleClass>VC_MILITARY</vehicleClass>
    </Item>
    <Item>
      <modelName>rosomak</modelName>
      <type>VEHICLE_TYPE_AMPHIBIOUS_AUTOMOBILE</type>
      <vehicleClass>VC_OFF_ROAD</vehicleClass>
    </Item>
  </InitDatas>
</CVehicleModelInfo__InitDataList>"#;
        let roots = parse_xml(vm).unwrap();
        let map = parse_vehicles_meta(&roots);
        assert_eq!(native_type_label(&map["f22a"].0), "Plane");
        assert_eq!(native_class_label(&map["f22a"].1), "Plane");
        assert_eq!(native_type_label(&map["abramsx"].0), "Car");
        assert_eq!(native_class_label(&map["abramsx"].1), "Military");
        assert_eq!(native_type_label(&map["rosomak"].0), "Amphibious");
        assert_eq!(native_class_label(&map["rosomak"].1), "Off-Road");
        // Unknown / empty values: empty stays blank, unknown keeps its (uppercased) token
        assert_eq!(native_type_label(""), "");
        assert_eq!(native_class_label("VC_NOPE_NOT_A_THING"), "NOPE NOT A THING");
    }
}

