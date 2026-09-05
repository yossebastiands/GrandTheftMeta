//! vehicleweapons.meta editor — vehicle-mounted weapon definitions.
//!
//! These files (named `vehicleweapons_<model>.meta` / `vehicleweapons.meta`) are
//! `CWeaponInfoBlob` documents holding several typed `<Item>` kinds:
//!   - `CAmmoProjectileInfo` — the shell/projectile ("Ammo"): damage, lifetime,
//!     launch speed, fuse/proximity/cluster behaviour, lights, fx…
//!   - `CWeaponInfo` — the mounted weapon ("Vehicle Weapon"): damage type, fire
//!     type, clip, spread/recoil, and the `AmmoInfo ref=` link to an ammo entry.
//!   - `CVehicleWeaponInfo` — recoil/kickback "Weapon Data" tuning.
//!
//! Rows = one typed item; Kind = the item type (Ammo / Vehicle Weapon / Weapon
//! Data), Name = the item's `<Name>`. Params = direct scalar leaves: `value=`
//! attrs, `ref=` attrs (`AmmoInfo.ref`), and text. Structural blocks (Explosion,
//! FrontClearTestParams, …) are preserved untouched. Writes are surgical patches
//! inside the matching `<Item type="…">` block.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::scan::{child_text, collect_items, parse_xml, ScanResult, VehicleRow, XmlNode};
use super::update::{
    attr_value, find_item_spans, locate_elements, replace_attr_value, replace_text, UpdateResult,
    VehicleChange,
};

/// Item types we expose, with their Kind label.
const TYPES: &[(&str, &str)] = &[
    ("CWeaponInfo", "Vehicle Weapon"),
    ("CAmmoProjectileInfo", "Ammo"),
    ("CVehicleWeaponInfo", "Weapon Data"),
];

/// Does this file look like a vehicle-weapons meta?
fn is_vehicleweapons_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "vehicleweapons.meta"
        || (lower.starts_with("vehicleweapons") && lower.ends_with(".meta"))
}

pub(crate) fn find_vehicleweapons_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if is_vehicleweapons_meta(&entry.file_name().to_string_lossy()) {
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

/// Collect one typed item into a row. Returns None when unnamed.
fn parse_typed(item: &XmlNode, kind: &str, rel: &str, abs: &str) -> Option<VehicleRow> {
    let name = child_text(item, "Name");
    if name.is_empty() {
        return None;
    }
    let group = child_text(item, "Group");

    let mut params: BTreeMap<String, String> = BTreeMap::new();
    for child in &item.children {
        // Identity/structural: Name is the row identity; Group is the class col.
        if child.name == "Name" || child.name == "Group" {
            continue;
        }
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
        return None;
    }

    Some(VehicleRow {
        folder_name: rel.to_string(),
        meta_path: abs.to_string(),
        handling_name: name,
        vehicle_type: kind.to_string(),
        vehicle_class: group,
        params: params.into_iter().collect(),
    })
}

/// Scan a folder (any layout) for every editable vehicle weapon entry.
#[tauri::command]
pub fn scan_vehicleweapons(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut cols: BTreeSet<String> = BTreeSet::new();

    for path in find_vehicleweapons_metas(&root) {
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
        let all: Vec<&XmlNode> = collect_items(&roots);
        let mut file_rows = 0usize;
        let abs = path.to_string_lossy().into_owned();
        for t in TYPES {
            let (itype, kind) = *t;
            for item in all.iter().filter(|it| it.attr("type") == Some(itype)) {
                let Some(row) = parse_typed(item, kind, &rel, &abs) else {
                    continue;
                };
                for k in row.params.keys() {
                    cols.insert(k.clone());
                }
                vehicles.push(row);
                file_rows += 1;
            }
        }
        if file_rows == 0 {
            skipped.push(format!("{rel}: no editable weapon entries found"));
        }
    }

    Ok(ScanResult {
        vehicles,
        columns: cols.into_iter().collect(),
        skipped,
    })
}

// ---------------------------------------------------------------------------
// Write-back — surgical patching inside the matching typed <Item> block
// ---------------------------------------------------------------------------

/// Apply `params` to a single typed `<Item>` block string.
/// Returns (new_block, applied, unchanged, missing).
fn patch_block(
    block: &str,
    params: &HashMap<String, String>,
) -> (String, usize, usize, Vec<String>) {
    let mut text = block.to_string();
    let mut applied = 0usize;
    let mut unchanged = 0usize;
    let mut missing: Vec<String> = Vec::new();

    for (name, new_val) in params {
        let (elem, attr) = match name.strip_suffix(".ref") {
            Some(e) => (e.to_string(), "ref".to_string()),
            None => (name.clone(), "value".to_string()),
        };
        let els = locate_elements(&text, &elem);
        let el = els.into_iter().next();
        match el {
            None => missing.push(format!("{name} not found")),
            Some((os, oe, close)) => {
                if let Some((cs, _ce)) = close {
                    // Never rewrite a container block (Explosion, …).
                    if text[oe..cs].contains('<') {
                        missing.push(format!("{name} is a container (not editable)"));
                        continue;
                    }
                    let old = text[oe..cs].split_whitespace().collect::<Vec<_>>().join(" ");
                    let new = new_val.trim();
                    if old == new {
                        unchanged += 1;
                        continue;
                    }
                    let open_tag = &text[os..oe];
                    let out_val = if open_tag.contains("content=") {
                        new.split_whitespace().collect::<Vec<_>>().join(" ")
                    } else {
                        escape_xml(new)
                    };
                    text = replace_text(&text, oe, cs, &out_val);
                    applied += 1;
                } else {
                    match attr_value(&text[os..oe], &attr) {
                        Some(old) => {
                            if old.trim() == new_val.trim() {
                                unchanged += 1;
                            } else {
                                text = replace_attr_value(&text, os, oe, &attr, new_val.trim());
                                applied += 1;
                            }
                        }
                        None => missing.push(format!("{name} has no {attr} to edit")),
                    }
                }
            }
        }
    }
    (text, applied, unchanged, missing)
}

/// Patch every listed entry of one item type inside a file.
/// `entries`: weapon/ammo Name -> params.
fn patch_typed_file(
    text: &str,
    itype: &str,
    entries: &HashMap<String, HashMap<String, String>>,
) -> (String, usize, usize, Vec<String>) {
    let mut cur = text.to_string();
    let mut applied = 0usize;
    let mut unchanged = 0usize;
    let mut missing: Vec<String> = Vec::new();

    let spans = find_item_spans(&cur, itype);
    for (s, e) in spans {
        let name = extract_name(&cur[s..e]);
        let Some(params) = entries.get(&name) else {
            continue;
        };
        let block = cur[s..e].to_string();
        let (nb, ap, un, mi) = patch_block(&block, params);
        applied += ap;
        unchanged += un;
        for m in mi {
            missing.push(format!("{name} :: {m}"));
        }
        let mut next = String::with_capacity(cur.len() + nb.len());
        next.push_str(&cur[..s]);
        next.push_str(&nb);
        next.push_str(&cur[e..]);
        cur = next;
    }
    (cur, applied, unchanged, missing)
}

/// `<Name>X</Name>` inside a typed block, or "".
fn extract_name(block: &str) -> String {
    let mut rest = block;
    while let Some(i) = rest.find("<Name>") {
        let after = &rest[i + "<Name>".len()..];
        if let Some(end) = after.find("</Name>") {
            return after[..end].trim().to_string();
        }
        rest = &after;
    }
    String::new()
}

/// Writes edited vehicle-weapon entries back. `changes[].folder_name` is the
/// relative file path; `changes[].handling_name` is the entry's `<Name>`.
#[tauri::command]
pub fn update_vehicleweapons_files(
    folder_path: String,
    changes: Vec<VehicleChange>,
) -> Result<UpdateResult, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    // Group: file -> Name -> params.
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
        for t in TYPES {
            let (itype, _kind) = *t;
            let (new_work, applied, unchanged, missing) = patch_typed_file(&work, itype, &entries);
            work = new_work;
            file_applied += applied;
            result.params_applied += applied;
            result.params_unchanged += unchanged;
            for m in missing {
                result.errors.push(format!("{rel} :: {m}"));
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<CWeaponInfoBlob>
  <Infos>
    <Item>
      <Infos>
        <Item type="CAmmoProjectileInfo">
          <Name>AMMO_T90M</Name>
          <Model>w_lr_rpg_rocket</Model>
          <AmmoMax value="100" />
          <Damage value="0.000000" />
          <LifeTime value="4.000000" />
          <LaunchSpeed value="400.000000" />
          <Explosion>
            <Default>TANKSHELL</Default>
            <HitPlane>PLANE</HitPlane>
          </Explosion>
          <ProjectileFlags>DestroyOnImpact ProcessImpacts</ProjectileFlags>
        </Item>
        <Item type="CWeaponInfo">
          <Name>VEHICLE_WEAPON_T90M_CANNON</Name>
          <DamageType>EXPLOSIVE</DamageType>
          <FireType>PROJECTILE</FireType>
          <Group />
          <AmmoInfo ref="AMMO_T90M" />
          <ClipSize value="1" />
          <AccuracySpread value="1.000000" />
        </Item>
      </Infos>
    </Item>
  </Infos>
  <VehicleWeaponInfos>
    <Item type="CVehicleWeaponInfo">
      <Name>VEHICLE_DATA_KHANJALI_CANNON</Name>
      <KickbackAmplitude value="0.005000" />
      <KickbackImpulse value="0.800000" />
      <KickbackOverrideTiming value="0.000000" />
    </Item>
  </VehicleWeaponInfos>
</CWeaponInfoBlob>"#;

    fn scan_sample() -> (Vec<VehicleRow>, Vec<String>) {
        let roots = parse_xml(SAMPLE).unwrap();
        let all: Vec<&XmlNode> = collect_items(&roots);
        let mut cols = BTreeSet::new();
        let mut rows = Vec::new();
        for t in TYPES {
            let (itype, kind) = *t;
            for item in all.iter().filter(|it| it.attr("type") == Some(itype)) {
                if let Some(row) = parse_typed(item, kind, "veh/t90m/vehicleweapons_t90m.meta", "abs") {
                    for k in row.params.keys() {
                        cols.insert(k.clone());
                    }
                    rows.push(row);
                }
            }
        }
        (rows, cols.into_iter().collect())
    }

    #[test]
    fn parses_ammo_weapon_and_data_entries() {
        let (rows, _cols) = scan_sample();
        assert_eq!(rows.len(), 3);
        // Scanner emits rows grouped by item type (TYPES order).
        let kinds: Vec<&str> = rows.iter().map(|r| r.vehicle_type.as_str()).collect();
        assert_eq!(kinds, vec!["Vehicle Weapon", "Ammo", "Weapon Data"]);
        // Weapon row: identity Name excluded, ref link captured.
        let weapon = rows.iter().find(|r| r.handling_name == "VEHICLE_WEAPON_T90M_CANNON").unwrap();
        assert!(!weapon.params.contains_key("Name"));
        assert_eq!(weapon.params.get("AmmoInfo.ref").map(|s| s.as_str()), Some("AMMO_T90M"));
        assert_eq!(weapon.params.get("ClipSize").map(|s| s.as_str()), Some("1"));
        assert_eq!(weapon.params.get("DamageType").map(|s| s.as_str()), Some("EXPLOSIVE"));
        // Ammo row.
        let ammo = rows.iter().find(|r| r.handling_name == "AMMO_T90M").unwrap();
        assert_eq!(ammo.params.get("Damage").map(|s| s.as_str()), Some("0.000000"));
        assert_eq!(ammo.params.get("LaunchSpeed").map(|s| s.as_str()), Some("400.000000"));
        assert_eq!(ammo.params.get("ProjectileFlags").map(|s| s.as_str()), Some("DestroyOnImpact ProcessImpacts"));
        // Structural Explosion excluded.
        assert!(!ammo.params.contains_key("Explosion"));
        // Weapon data row.
        let data = rows.iter().find(|r| r.handling_name == "VEHICLE_DATA_KHANJALI_CANNON").unwrap();
        assert_eq!(data.params.get("KickbackImpulse").map(|s| s.as_str()), Some("0.800000"));
    }

    #[test]
    fn writer_patches_ammo_weapon_and_ref() {
        let mut entries: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut ammo = HashMap::new();
        ammo.insert("Damage".to_string(), "5000.0".to_string());
        entries.insert("AMMO_T90M".to_string(), ammo);
        let mut weapon = HashMap::new();
        weapon.insert("AmmoInfo.ref".to_string(), "AMMO_T90M_CANNON_APFSDS".to_string());
        weapon.insert("ClipSize".to_string(), "8".to_string());
        entries.insert("VEHICLE_WEAPON_T90M_CANNON".to_string(), weapon);
        let mut data = HashMap::new();
        data.insert("KickbackImpulse".to_string(), "1.000000".to_string());
        entries.insert("VEHICLE_DATA_KHANJALI_CANNON".to_string(), data);

        let mut work = SAMPLE.to_string();
        let mut applied = 0;
        let mut unchanged = 0;
        let mut missing = Vec::new();
        for t in TYPES {
            let (itype, _kind) = *t;
            let (w, a, u, m) = patch_typed_file(&work, itype, &entries);
            work = w;
            applied += a;
            unchanged += u;
            missing.extend(m);
        }
        assert_eq!(applied, 4, "missing: {missing:?}");
        assert_eq!(unchanged, 0);
        assert!(missing.is_empty(), "{missing:?}");
        assert!(work.contains(r#"<Damage value="5000.0" />"#), "{work}");
        assert!(work.contains(r#"<AmmoInfo ref="AMMO_T90M_CANNON_APFSDS" />"#), "{work}");
        assert!(work.contains(r#"<ClipSize value="8" />"#), "{work}");
        assert!(work.contains(r#"<KickbackImpulse value="1.000000" />"#), "{work}");
        // Structural block + untouched parts preserved.
        assert!(work.contains("<Default>TANKSHELL</Default>"), "{work}");
        assert!(work.contains(r#"<LaunchSpeed value="400.000000" />"#));
    }

    /// End-to-end against a real vehicle folder (set GT_TEST_VEHWEAP to the
    /// folder that directly contains the vehicleweapons_*.meta files).
    #[test]
    #[ignore = "requires a real folder: set GT_TEST_VEHWEAP"]
    fn scans_real_vehicleweapons_folder() {
        let dir = std::env::var("GT_TEST_VEHWEAP").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_VEHWEAP to run)");
            return;
        }
        let res = scan_vehicleweapons(dir).expect("scan should succeed");
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
