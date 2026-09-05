//! carvariations.meta editor — a "list-style" meta, sharing the generic engine
//! in `carcols.rs`.
//!
//! Structure: `<CVehicleModelInfoVariation>` → `<variationData>` → one `<Item>`
//! per model, and inside it lists such as `<colors>` (colour combos with
//! `<indices>` + per-slot `<liveries>`), `<kits>` (text entries naming the mod
//! kit(s)), and `<plateProbabilities><Probabilities>` (name/value pairs), plus
//! model scalars like `<lightSettings value>` / `<sirenSettings value>`.
//!
//! Rows = every list entry (the model "Variation" entry, each Colour, Kit,
//! Livery, Plate Probability). `handling_name` = structural path; the Kind
//! column comes from the list container; the Group column is the model name
//! (from `variationData` members). Writes are comment-aware surgical patches.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::carcols::{collect_list_rows, update_list_files_generic};
use super::scan::{child_text, parse_xml, ScanResult, VehicleRow, XmlNode};
use super::update::{UpdateResult, VehicleChange};

/// Does this file look like a car-variations meta?
fn is_carvariations_meta(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "carvariations.meta"
        || (lower.starts_with("carvariations") && lower.ends_with(".meta"))
}

pub(crate) fn find_carvariations_metas(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if is_carvariations_meta(&entry.file_name().to_string_lossy()) {
            out.push(entry.into_path());
        }
    }
    out
}

/// Group label for a variation `<Item>`: its modelName (else "model").
fn model_label(item: &XmlNode) -> String {
    let m = child_text(item, "modelName");
    if m.is_empty() {
        "model".to_string()
    } else {
        m
    }
}

/// Scan a folder (any layout) for every editable carvariations list entry.
#[tauri::command]
pub fn scan_carvariations(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    let mut vehicles: Vec<VehicleRow> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut cols: BTreeSet<String> = BTreeSet::new();

    for path in find_carvariations_metas(&root) {
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
        let rows = collect_list_rows(&roots, &rel, &abs, &mut cols, &["variationData"], &model_label);
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

/// Write edited carvariations entries back (same engine as carcols).
#[tauri::command]
pub fn update_carvariations_files(
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
<CVehicleModelInfoVariation>
  <variationData>
    <Item>
      <modelName>t90m</modelName>
      <colors>
        <Item>
          <indices content="char_array">
            132
            92
            8
            156
          </indices>
          <liveries>
            <Item value="true" />
            <Item value="false" />
          </liveries>
        </Item>
      </colors>
      <kits>
        <Item>951_t90m_modkit</Item>
      </kits>
      <windowsWithExposedEdges />
      <plateProbabilities>
        <Probabilities>
          <Item>
            <Name>police guv plate</Name>
            <Value value="100" />
          </Item>
          <Item>
            <Name>normal</Name>
            <Value value="0" />
          </Item>
        </Probabilities>
      </plateProbabilities>
      <lightSettings value="18" />
      <sirenSettings value="0" />
    </Item>
  </variationData>
</CVehicleModelInfoVariation>"#;

    fn scan_sample() -> (Vec<VehicleRow>, Vec<String>) {
        let roots = parse_xml(SAMPLE).unwrap();
        let mut cols = BTreeSet::new();
        let rows =
            collect_list_rows(&roots, "veh/t90m/carvariations.meta", "abs", &mut cols, &["variationData"], &model_label);
        (rows, cols.into_iter().collect())
    }

    #[test]
    fn parses_variation_entries() {
        let (rows, cols) = scan_sample();
        // Variation(1) + Colour(1) + Livery(2) + Kit(1) + Plate Probability(2).
        let kinds: Vec<&str> = rows.iter().map(|r| r.vehicle_type.as_str()).collect();
        assert_eq!(
            kinds,
            vec![
                "Variation",
                "Colour",
                "Livery",
                "Livery",
                "Kit",
                "Plate Probability",
                "Plate Probability"
            ]
        );
        assert!(rows.iter().all(|r| r.vehicle_class == "t90m"));
        let paths: Vec<&str> = rows.iter().map(|r| r.handling_name.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "variationData/0",
                "variationData/0/colors/0",
                "variationData/0/colors/0/liveries/0",
                "variationData/0/colors/0/liveries/1",
                "variationData/0/kits/0",
                "variationData/0/plateProbabilities/Probabilities/0",
                "variationData/0/plateProbabilities/Probabilities/1"
            ]
        );
        // Model scalars.
        let model = &rows[0];
        assert_eq!(model.params.get("modelName").map(|s| s.as_str()), Some("t90m"));
        assert_eq!(model.params.get("lightSettings").map(|s| s.as_str()), Some("18"));
        assert_eq!(model.params.get("sirenSettings").map(|s| s.as_str()), Some("0"));
        assert!(!model.params.contains_key("colors"));
        assert!(!model.params.contains_key("kits"));
        // Colour indices (collapsed text), kit text, plate values.
        assert_eq!(rows[1].params.get("indices").map(|s| s.as_str()), Some("132 92 8 156"));
        assert_eq!(rows[4].params.get("Item.text").map(|s| s.as_str()), Some("951_t90m_modkit"));
        assert_eq!(rows[2].params.get("Item.value").map(|s| s.as_str()), Some("true"));
        assert_eq!(rows[5].params.get("Name").map(|s| s.as_str()), Some("police guv plate"));
        assert_eq!(rows[5].params.get("Value").map(|s| s.as_str()), Some("100"));
        assert!(cols.contains(&"indices".to_string()));
        assert!(cols.contains(&"Item.text".to_string()));
        assert!(cols.contains(&"lightSettings".to_string()));
    }

    #[test]
    fn writer_patches_model_kit_colour_and_plate() {
        // Model lightSettings, kit text, colour indices, plate Value.
        let mut by: HashMap<String, HashMap<String, String>> = HashMap::new();
        let mut m = HashMap::new();
        m.insert("lightSettings".to_string(), "22".to_string());
        by.insert("variationData/0".to_string(), m);
        let mut k = HashMap::new();
        k.insert("Item.text".to_string(), "951_t90m_modkit_v2".to_string());
        by.insert("variationData/0/kits/0".to_string(), k);
        let mut c = HashMap::new();
        c.insert("indices".to_string(), "120 90 8 150".to_string());
        by.insert("variationData/0/colors/0".to_string(), c);
        let mut p = HashMap::new();
        p.insert("Value".to_string(), "50".to_string());
        by.insert("variationData/0/plateProbabilities/Probabilities/0".to_string(), p);

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
        assert_eq!(applied, 4, "missing: {missing:?}");
        assert!(missing.is_empty(), "{missing:?}");
        assert!(work.contains(r#"<lightSettings value="22" />"#), "{work}");
        assert!(work.contains("<Item>951_t90m_modkit_v2</Item>"), "{work}");
        assert!(work.contains("120 90 8 150"), "{work}");
        assert!(work.contains(r#"<Value value="50" />"#), "{work}");
        // untouched parts preserved
        assert!(work.contains(r#"<sirenSettings value="0" />"#));
        assert!(work.contains("<Item value=\"false\" />"));
        assert!(work.contains("<Name>normal</Name>"));
    }

    /// End-to-end against a real vehicle folder (set GT_TEST_CARVAR to the
    /// folder that directly contains the carvariations.meta files).
    #[test]
    #[ignore = "requires a real folder: set GT_TEST_CARVAR"]
    fn scans_real_carvariations_folder() {
        let dir = std::env::var("GT_TEST_CARVAR").unwrap_or_default();
        if dir.is_empty() {
            eprintln!("skipping (set GT_TEST_CARVAR to run)");
            return;
        }
        let res = scan_carvariations(dir).expect("scan should succeed");
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
