//! Surgical write-back of edited values into handling.meta files (mirrors the
//! `handling_meta_excel.py` import patcher).
//!
//! Files are patched in place with regex-based text replacement — never parsed &
//! re-serialised — so whitespace, comments and untouched parameters are preserved.
//! Each `<Item type="CHandlingData">` block is matched by EXACT handlingName, then
//! replacements are applied only within that block.

use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::commands::scan::find_handling_meta;

// ---------------------------------------------------------------------------
// Command I/O
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug)]
pub struct VehicleChange {
    pub folder_name: String,
    pub handling_name: String,
    /// Only the params that actually changed, keyed by column name.
    pub changed_params: HashMap<String, String>,
}

#[derive(Serialize, Debug, Default)]
pub struct UpdateResult {
    pub files_changed: usize,
    pub params_applied: usize,
    pub params_unchanged: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub fn update_files(
    folder_path: String,
    changes: Vec<VehicleChange>,
) -> Result<UpdateResult, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {folder_path}"));
    }

    // Group: folder -> handlingName -> {column: value} so each file is patched once.
    let mut by_folder: HashMap<String, HashMap<String, HashMap<String, String>>> = HashMap::new();
    for ch in changes {
        by_folder
            .entry(ch.folder_name)
            .or_default()
            .entry(ch.handling_name)
            .or_default()
            .extend(ch.changed_params);
    }

    let mut result = UpdateResult::default();
    for (folder, entries) in by_folder {
        let veh_dir = root.join(&folder);
        if !veh_dir.is_dir() {
            result
                .errors
                .push(format!("{folder}: vehicle folder not found under the chosen root"));
            continue;
        }
        let meta = match find_handling_meta(&veh_dir) {
            Ok(m) => m,
            Err(e) => {
                result.errors.push(format!("{folder}: {e}"));
                continue;
            }
        };
        let text = match std::fs::read_to_string(&meta) {
            Ok(t) => t,
            Err(e) => {
                result.errors.push(format!("{folder}: cannot read file: {e}"));
                continue;
            }
        };

        let (new_text, applied, same, missing) = patch_handling_file(&text, &entries);
        result.params_applied += applied;
        result.params_unchanged += same;
        for m in missing {
            result.errors.push(format!("{folder} :: {m}"));
        }

        if applied > 0 {
            if let Err(e) = std::fs::write(&meta, new_text) {
                result.errors.push(format!("{folder}: cannot write file: {e}"));
                continue;
            }
            result.files_changed += 1;
        }
    }

    Ok(result)
}

// ---------------------------------------------------------------------------
// Column name parsing
// ---------------------------------------------------------------------------

/// Split a column name into (sub_type, occurrence, elem, axis).
/// `CVehicleWeaponHandlingData_2.fTurretSpeed` -> ("CVehicleWeaponHandlingData", 2, "fTurretSpeed", None)
/// `vecCentreOfMassOffset.z`                    -> (None, 1, "vecCentreOfMassOffset", Some("z"))
fn split_column(col: &str) -> (Option<String>, usize, String, Option<String>) {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"^(C[A-Za-z]+HandlingData)(?:_(\d+))?\.(.+)$").expect("bad sub-type regex")
    });

    let (itype, occ, rest) = if let Some(c) = re.captures(col) {
        let it = c.get(1).map(|m| m.as_str().to_string());
        let oc = c
            .get(2)
            .and_then(|m| m.as_str().parse::<usize>().ok())
            .unwrap_or(1);
        let rest = c.get(3).map(|m| m.as_str()).unwrap_or(col);
        (it, oc, rest)
    } else {
        (None, 1, col)
    };

    if rest.ends_with(".x") || rest.ends_with(".y") || rest.ends_with(".z") {
        let (elem, axis) = rest.rsplit_once('.').unwrap();
        (itype, occ, elem.to_string(), Some(axis.to_string()))
    } else {
        (itype, occ, rest.to_string(), None)
    }
}

// ---------------------------------------------------------------------------
// Value comparison / formatting
// ---------------------------------------------------------------------------

/// Tokens separated by commas or whitespace (matches the Python reference).
fn tokens(s: &str) -> Vec<&str> {
    s.split(|c: char| c == ',' || c.is_whitespace())
        .filter(|t| !t.is_empty())
        .collect()
}

/// True when the current XML value and the edited value hold the same value
/// (numeric-aware, so "15000.000000" == "15000" and "0 0 0" == "0, 0, 0").
fn values_equal(current: &str, wanted: &str) -> bool {
    let cur = tokens(current);
    let want = tokens(wanted);
    if cur.len() != want.len() {
        return false;
    }
    for (a, b) in cur.iter().zip(want.iter()) {
        match (a.parse::<f64>(), b.parse::<f64>()) {
            (Ok(x), Ok(y)) => {
                if x != y {
                    return false;
                }
            }
            _ => {
                if a != b {
                    return false;
                }
            }
        }
    }
    true
}

/// Format an edited string for writing into the meta (trimmed, as typed).
fn format_value(v: &str) -> String {
    v.trim().to_string()
}

// ---------------------------------------------------------------------------
// Region helpers operating on raw text
// ---------------------------------------------------------------------------

/// `text[i..]` is inside an opened `<Item ...>`. Return the index just after its
/// matching `</Item>`, handling nested and self-closing `<Item />` tags.
pub(crate) fn find_matching_close(text: &str, start: usize) -> Option<usize> {
    let open_re = Regex::new(r"<Item\b").unwrap();
    let close_re = Regex::new(r"</Item>").unwrap();
    let mut depth: i64 = 1;
    let mut i = start;
    while depth > 0 {
        let om = open_re.find_at(text, i);
        let cm = close_re.find_at(text, i);
        match (om, cm) {
            (Some(o), Some(c)) if o.start() < c.start() => {
                let gt_rel = text[o.end()..].find('>')?;
                let gt = o.end() + gt_rel;
                if text[o.start()..=gt].ends_with("/>") {
                    i = gt + 1;
                    continue;
                }
                depth += 1;
                i = o.end();
            }
            (Some(o), None) => {
                let gt_rel = text[o.end()..].find('>')?;
                let gt = o.end() + gt_rel;
                if text[o.start()..=gt].ends_with("/>") {
                    i = gt + 1;
                    continue;
                }
                depth += 1;
                i = o.end();
            }
            (_, Some(c)) => {
                depth -= 1;
                i = c.end();
            }
            (None, None) => return None,
        }
    }
    Some(i)
}

/// Offsets of every `<Item type="ITYPE">...</Item>` span in `text`, in order.
pub(crate) fn find_item_spans(text: &str, itype: &str) -> Vec<(usize, usize)> {
    let pat = Regex::new(&format!(r#"<Item\s+type="{}""#, regex::escape(itype))).unwrap();
    let mut spans = Vec::new();
    for m in pat.find_iter(text) {
        if let Some(end) = find_matching_close(text, m.end()) {
            spans.push((m.start(), end));
        }
    }
    spans
}

/// List of (open_start, open_end, close_span_or_none) for every `<tag>` in region.
pub(crate) fn locate_elements(region: &str, tag: &str) -> Vec<(usize, usize, Option<(usize, usize)>)> {
    let open_pat = Regex::new(&format!(r"<{}\b[^>]*>", regex::escape(tag))).unwrap();
    let close_pat = Regex::new(&format!(r"</{}\s*>", regex::escape(tag))).unwrap();
    let mut out = Vec::new();
    for m in open_pat.find_iter(region) {
        let (open_s, open_e) = (m.start(), m.end());
        let close = if region[open_s..open_e].ends_with("/>") {
            None
        } else {
            close_pat
                .find_at(region, open_e)
                .map(|c| (c.start(), c.end()))
        };
        out.push((open_s, open_e, close));
    }
    out
}

pub(crate) fn attr_value(tag: &str, attr: &str) -> Option<String> {
    let re = Regex::new(&format!(r#"\b{}\s*=\s*"([^"]*)""#, regex::escape(attr))).unwrap();
    re.captures(tag)
        .map(|c| c.get(1).map(|m| m.as_str().to_string()).unwrap_or_default())
}

pub(crate) fn replace_attr_value(region: &str, open_s: usize, open_e: usize, attr: &str, new_val: &str) -> String {
    let tag = &region[open_s..open_e];
    let re = Regex::new(&format!(r#"(\b{}\s*=\s*")[^"]*(")"#, regex::escape(attr))).unwrap();
    match re.captures(tag) {
        Some(c) => {
            let full = c.get(0).unwrap();
            let lead = c.get(1).unwrap().as_str();
            let mut new_tag = String::new();
            new_tag.push_str(&tag[..full.start()]);
            new_tag.push_str(lead);
            new_tag.push_str(new_val);
            new_tag.push('"');
            new_tag.push_str(&tag[full.end()..]);
            let mut out = String::with_capacity(region.len());
            out.push_str(&region[..open_s]);
            out.push_str(&new_tag);
            out.push_str(&region[open_e..]);
            out
        }
        None => region.to_string(),
    }
}

pub(crate) fn replace_text(region: &str, open_e: usize, close_s: usize, new_text: &str) -> String {
    let mut out = String::with_capacity(region.len() + new_text.len());
    out.push_str(&region[..open_e]);
    out.push_str(new_text);
    out.push_str(&region[close_s..]);
    out
}

/// Rebuild a nested `<Item>` list element (uWeaponHash, WeaponVehicleModType, ...)
/// from a comma-separated cell value. Keeps the detected item indentation, the
/// original closing-tag indentation, and preserves the original slot count by
/// padding missing values with empty `<Item />` placeholders (weapon slots are
/// positional, so empty slots must not be dropped).
fn rebuild_item_list(region: &str, open_e: usize, close: (usize, usize), value: &str) -> String {
    let inner = &region[open_e..close.0];
    let indent_re = Regex::new(r"\n(\s*)<Item>").unwrap();
    let indent = indent_re
        .captures(inner)
        .map(|c| c.get(1).map(|m| m.as_str().to_string()).unwrap_or_else(|| "  ".into()))
        .unwrap_or_else(|| "  ".to_string());
    let trail_re = Regex::new(r"(\s*)$").unwrap();
    let close_indent = trail_re
        .captures(inner)
        .map(|c| c.get(1).map(|m| m.as_str().to_string()).unwrap_or_default())
        .unwrap_or_default();
    let total = Regex::new(r"<Item\b").unwrap().find_iter(inner).count();
    let mut values: Vec<&str> = value
        .split(',')
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .collect();
    while values.len() < total {
        values.push("");
    }
    let mut items = String::new();
    for v in values {
        if v.is_empty() {
            items.push_str(&format!("\n{indent}<Item />"));
        } else {
            items.push_str(&format!("\n{indent}<Item>{v}</Item>"));
        }
    }
    let mut out = String::with_capacity(region.len() + items.len());
    out.push_str(&region[..open_e]);
    out.push_str(&items);
    out.push_str(&close_indent);
    out.push_str(&region[close.0..]);
    out
}

// ---------------------------------------------------------------------------
// Element patching
// ---------------------------------------------------------------------------

#[derive(PartialEq)]
enum Status {
    Ok,
    Same,
    Missing,
}

/// Patch one element inside a region. Returns (new_region, status).
fn patch_element_in_region(
    region: &str,
    elem: &str,
    axis: Option<&str>,
    value: &str,
) -> (String, Status) {
    let locs = locate_elements(region, elem);
    if locs.is_empty() {
        return (region.to_string(), Status::Missing);
    }
    let (open_s, open_e, close) = locs[0];
    let tag = &region[open_s..open_e];
    let inner = match close {
        Some((cs, _)) => &region[open_e..cs],
        None => "",
    };

    // Nested `<Item>` lists (uWeaponHash, WeaponVehicleModType, ...): compare the
    // joined item texts and rebuild the items only when they differ.
    if close.is_some() && inner.contains("<Item") {
        let item_text_re = Regex::new(r"<Item>([^<]*)</Item>").unwrap();
        let current: Vec<String> = item_text_re
            .captures_iter(inner)
            .map(|c| c.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default())
            .filter(|s| !s.is_empty())
            .collect();
        let current = current.join(" ");
        if values_equal(&current, value) {
            return (region.to_string(), Status::Same);
        }
        return (
            rebuild_item_list(region, open_e, close.unwrap(), value),
            Status::Ok,
        );
    }

    // Self-closing element `<x value=".." />` (scalar or vector).
    if tag.ends_with("/>") {
        let attr = axis.unwrap_or("value");
        if let Some(cur) = attr_value(tag, attr) {
            if values_equal(&cur, value) {
                return (region.to_string(), Status::Same);
            }
        }
        return (
            replace_attr_value(region, open_s, open_e, attr, &format_value(value)),
            Status::Ok,
        );
    }

    // Non-self-closing element carrying an axis attribute (rare vector form).
    if let Some(a) = axis {
        if let Some(cur) = attr_value(tag, a) {
            if values_equal(&cur, value) {
                return (region.to_string(), Status::Same);
            }
        }
        return (
            replace_attr_value(region, open_s, open_e, a, &format_value(value)),
            Status::Ok,
        );
    }

    // Text content element (`<strHandlingFlags>C201081</strHandlingFlags>`,
    // `<WeaponSeats content="int_array">0 0</WeaponSeats>`, ...).
    if let Some((cs, _)) = close {
        if values_equal(inner, value) {
            return (region.to_string(), Status::Same);
        }
        let text = if tag.contains("content=") {
            value
                .split(',')
                .map(|t| t.trim())
                .filter(|t| !t.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        } else {
            value.trim().to_string()
        };
        return (replace_text(region, open_e, cs, &text), Status::Ok);
    }

    (region.to_string(), Status::Missing)
}

/// Patch one `<Item type="CHandlingData">...</Item>` block with column updates.
/// Top-level params may appear before OR after `<SubHandlingData>` (some metas put
/// e.g. fWeaponDamageScaledToVehHealthMult at the very end of the item), so the
/// sub-handling span is removed from the block instead of cutting at its start.
fn patch_entry_block(
    block: &str,
    updates: &HashMap<String, String>,
) -> (String, Vec<String>, usize, Vec<String>) {
    let mut applied: Vec<String> = Vec::new();
    let mut missing: Vec<String> = Vec::new();
    let mut same: usize = 0;

    // Separate the sub-handling region out of the block.
    let (mut top_owned, mut sub_owned) = match block.find("<SubHandlingData>") {
        Some(sub_start) => {
            let sub_end = match block[sub_start..].find("</SubHandlingData>") {
                Some(rel) => sub_start + rel + "</SubHandlingData>".len(),
                None => block.len(),
            };
            (
                format!("{}{}", &block[..sub_start], &block[sub_end..]),
                block[sub_start..sub_end].to_string(),
            )
        }
        None => (block.to_string(), String::new()),
    };

    // Top-level params (no sub-type prefix).
    for (col, value) in updates {
        let (itype, _occ, elem, axis) = split_column(col);
        if itype.is_some() {
            continue;
        }
        let (nt, st) = patch_element_in_region(&top_owned, &elem, axis.as_deref(), value);
        top_owned = nt;
        match st {
            Status::Ok => applied.push(col.clone()),
            Status::Missing => missing.push(col.clone()),
            Status::Same => same += 1,
        }
    }

    // Sub-handling params, resolved per item-type occurrence.
    for (col, value) in updates {
        let (itype, occ, elem, axis) = split_column(col);
        let itype = match itype {
            Some(t) => t,
            None => continue,
        };
        let spans = find_item_spans(&sub_owned, &itype);
        if spans.len() < occ {
            missing.push(col.clone());
            continue;
        }
        let (s, e) = spans[occ - 1];
        let (nt, st) = patch_element_in_region(&sub_owned[s..e], &elem, axis.as_deref(), value);
        match st {
            Status::Ok => {
                let mut new_sub = String::with_capacity(sub_owned.len() + nt.len());
                new_sub.push_str(&sub_owned[..s]);
                new_sub.push_str(&nt);
                new_sub.push_str(&sub_owned[e..]);
                sub_owned = new_sub;
                applied.push(col.clone());
            }
            Status::Missing => missing.push(col.clone()),
            Status::Same => same += 1,
        }
    }

    let mut out = top_owned;
    out.push_str(&sub_owned);
    (out, applied, same, missing)
}

fn extract_handling_name(block: &str) -> String {
    let re = Regex::new(r"<handlingName>([^<]*)</handlingName>").unwrap();
    re.captures(block)
        .map(|c| c.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default())
        .unwrap_or_default()
}

/// Apply `{handlingName: {column: value}}` to raw handling.meta text.
/// Returns (new_text, applied, unchanged, missing_params).
///
/// Every `<Item type="CHandlingData">` span is found independently (using a
/// nesting-aware close matcher), so multi-entry metas (e.g. a 5-hull naval fleet)
/// are patched entry-by-entry rather than collapsed into one block.
fn patch_handling_file(
    text: &str,
    updates_by_name: &HashMap<String, HashMap<String, String>>,
) -> (String, usize, usize, Vec<String>) {
    let spans = find_item_spans(text, "CHandlingData");
    let mut entries: Vec<(String, usize, usize)> = Vec::new();
    for (start, after_close) in spans {
        if after_close < "</Item>".len() {
            continue;
        }
        let block_end = after_close - "</Item>".len();
        let block = &text[start..block_end];
        entries.push((extract_handling_name(block), start, block_end));
    }

    let mut result = text.to_string();
    let mut applied = 0usize;
    let mut same = 0usize;
    let mut missing: Vec<String> = Vec::new();

    // Process from the end so earlier offsets stay valid after splicing.
    for (name, start, end) in entries.into_iter().rev() {
        let updates = match updates_by_name.get(&name) {
            Some(u) => u,
            None => continue,
        };
        let block_text = result[start..end].to_string();
        let (new_block, appl, same_l, miss) = patch_entry_block(&block_text, updates);
        applied += appl.len();
        same += same_l;
        missing.extend(miss);
        if !appl.is_empty() {
            result.replace_range(start..end, &new_block);
        }
    }

    (result, applied, same, missing)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<CHandlingDataMgr>
  <HandlingData>
    <Item type="CHandlingData">
      <handlingName>f22a</handlingName>
      <fMass value="8000" />
      <fInitialDragCoeff value="2.000000" />
      <vecCentreOfMassOffset x="0.000000" y="0.100000" z="-0.200000" />
      <strHandlingFlags>C201081</strHandlingFlags>
      <SubHandlingData>
        <Item type="CFlyingHandlingData">
          <fThrust value="2.450000" />
        </Item>
        <Item type="CVehicleWeaponHandlingData">
          <uWeaponHash>
            <Item>VEHICLE_WEAPON_GUN</Item>
            <Item />
            <Item>VEHICLE_WEAPON_MISSILE</Item>
          </uWeaponHash>
          <WeaponSeats content="int_array">
            0
            0
            0
          </WeaponSeats>
        </Item>
        <Item type="NULL" />
      </SubHandlingData>
      <fWeaponDamageScaledToVehHealthMult value="0.340000" />
    </Item>
    <Item type="CHandlingData">
      <handlingName>arleigh</handlingName>
      <fMass value="40000.000000" />
    </Item>
  </HandlingData>
</CHandlingDataMgr>"#;

    fn patch(name: &str, updates: HashMap<String, String>) -> (String, usize, usize, Vec<String>) {
        let mut by_name = HashMap::new();
        by_name.insert(name.to_string(), updates);
        patch_handling_file(SAMPLE, &by_name)
    }

    #[test]
    fn scalar_and_vector_axis_are_patched() {
        let updates = map(&[
            ("fMass", "1500"),
            ("vecCentreOfMassOffset.x", "0.050000"),
            ("strHandlingFlags", "C201083"),
        ]);
        let (out, applied, same, missing) = patch("f22a", updates);
        assert_eq!(applied, 3);
        assert_eq!(same, 0);
        assert!(missing.is_empty());
        assert!(out.contains(r#"<fMass value="1500" />"#));
        assert!(
            out.contains(r#"<vecCentreOfMassOffset x="0.050000" y="0.100000" z="-0.200000" />"#)
        );
        assert!(out.contains(r#"<strHandlingFlags>C201083</strHandlingFlags>"#));
    }

    #[test]
    fn numeric_equivalent_value_counts_as_unchanged() {
        // "8000.0" is numerically equal to the file's "8000" -> not written.
        let updates = map(&[("fMass", "8000.0")]);
        let (out, applied, same, _missing) = patch("f22a", updates);
        assert_eq!(applied, 0);
        assert_eq!(same, 1);
        assert!(out.contains(r#"<fMass value="8000" />"#));
    }

    #[test]
    fn second_multi_entry_block_is_patched_independently() {
        let updates = map(&[("fMass", "999")]);
        let (out, applied, _same, missing) = patch("arleigh", updates);
        assert_eq!(applied, 1);
        assert!(missing.is_empty());
        assert!(out.contains(r#"<handlingName>arleigh</handlingName>"#));
        assert!(out.contains(r#"<fMass value="999" />"#));
        // the first entry is untouched
        assert!(out.contains(r#"<fMass value="8000" />"#));
    }

    #[test]
    fn subhandling_param_is_patched_inside_its_item_type() {
        let updates = map(&[("CFlyingHandlingData.fThrust", "3.000000")]);
        let (out, applied, _same, missing) = patch("f22a", updates);
        assert_eq!(applied, 1);
        assert!(missing.is_empty());
        assert!(out.contains("<fThrust value=\"3.000000\" />"));
    }

    #[test]
    fn nested_item_list_keeps_slot_count() {
        // Edit drops one of the three slots' names; the empty placeholder remains.
        let updates = map(&[(
            "CVehicleWeaponHandlingData.uWeaponHash",
            "VEHICLE_WEAPON_GUN, VEHICLE_WEAPON_ROCKET",
        )]);
        let (out, applied, _same, missing) = patch("f22a", updates);
        assert_eq!(applied, 1);
        assert!(missing.is_empty());
        // 3 slot entries preserved (2 named + 1 empty placeholder)
        assert_eq!(out.matches("<Item>VEHICLE_WEAPON_GUN</Item>").count(), 1);
        assert_eq!(out.matches("<Item>VEHICLE_WEAPON_ROCKET</Item>").count(), 1);
        assert_eq!(out.matches("<Item />").count(), 1);
    }

    #[test]
    fn content_array_is_rewritten() {
        let updates = map(&[("CVehicleWeaponHandlingData.WeaponSeats", "9, 9, 9")]);
        let (out, applied, _same, missing) = patch("f22a", updates);
        assert_eq!(applied, 1);
        assert!(missing.is_empty());
        assert!(
            out.contains(r#"<WeaponSeats content="int_array">9 9 9</WeaponSeats>"#),
            "expected single-line rewritten array"
        );
    }

    #[test]
    fn missing_param_is_reported_not_applied() {
        let updates = map(&[("fNonexistentThing", "1")]);
        let (out, applied, same, missing) = patch("f22a", updates);
        assert_eq!(applied, 0);
        assert_eq!(same, 0);
        assert_eq!(missing, vec!["fNonexistentThing".to_string()]);
        assert_eq!(out, SAMPLE);
    }

    #[test]
    fn unknown_handling_name_is_ignored() {
        let updates = map(&[("fMass", "1")]);
        let (out, applied, same, missing) = patch("no_such_vehicle", updates);
        assert_eq!(applied, 0);
        assert_eq!(same, 0);
        assert!(missing.is_empty());
        assert_eq!(out, SAMPLE);
    }

    #[test]
    #[ignore = "requires a vehicle pack: set GT_TEST_VEHICLES to a folder containing vehicle resources"]
    fn update_pack_copies_end_to_end() {
        use crate::commands::scan::scan_folder;

        let Ok(src) = std::env::var("GT_TEST_VEHICLES") else {
            eprintln!("skipping: set GT_TEST_VEHICLES to the vehicle pack folder");
            return;
        };
        let src_root = Path::new(&src);
        if !src_root.is_dir() {
            eprintln!("skipping: GT_TEST_VEHICLES folder not found");
            return;
        }
        let base = std::env::temp_dir().join(format!("gtm_e2e_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let dest_root = base.join("pack");

        // Single-entry aircraft with flying + weapon sub-handling
        for f in ["Aircraft_F22A", "Naval_usnavyfleet", "IFV_rosomak"] {
            let dir = dest_root.join(f);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::copy(
                src_root.join(f).join("handling.meta"),
                dir.join("handling.meta"),
            )
            .unwrap();
        }
        // Manifest-referenced nested meta (a164)
        let a = dest_root.join("Aircraft_a164");
        std::fs::create_dir_all(a.join("common")).unwrap();
        std::fs::copy(
            src_root.join("Aircraft_a164").join("common").join("handling.meta"),
            a.join("common").join("handling.meta"),
        )
        .unwrap();
        std::fs::copy(
            src_root.join("Aircraft_a164").join("fxmanifest.lua"),
            a.join("fxmanifest.lua"),
        )
        .unwrap();

        let root_str = dest_root.to_string_lossy().into_owned();
        let scan = scan_folder(root_str.clone()).expect("scan should succeed");
        assert!(
            scan.skipped.is_empty(),
            "unexpected skips: {:?}",
            scan.skipped
        );

        let find = |folder: &str, name: &str| {
            scan.vehicles
                .iter()
                .find(|v| v.folder_name == folder && v.handling_name == name)
                .unwrap_or_else(|| panic!("missing {folder} :: {name}"))
        };
        let naval_rows: Vec<_> = scan
            .vehicles
            .iter()
            .filter(|v| v.folder_name == "Naval_usnavyfleet")
            .collect();
        assert_eq!(naval_rows.len(), 5, "naval fleet should have 5 entries");

        // 1) patch several value forms in the F22A
        let _f22a = find("Aircraft_F22A", "f22a");
        let mut f22a_changes = HashMap::new();
        f22a_changes.insert("fMass".to_string(), "8500".to_string());
        f22a_changes.insert(
            "CFlyingHandlingData.fThrust".to_string(),
            "2.6".to_string(),
        );
        f22a_changes.insert("strHandlingFlags".to_string(), "000102".to_string());
        f22a_changes.insert(
            "vecCentreOfMassOffset.z".to_string(),
            "-0.300000".to_string(),
        );
        // 2) patch one entry of the 5-entry naval fleet
        let first_naval = naval_rows[0];
        let mut naval_changes = HashMap::new();
        naval_changes.insert("fMass".to_string(), "50000".to_string());
        // 3) patch the manifest-referenced nested meta (single a164 entry)
        let a164 = scan
            .vehicles
            .iter()
            .find(|v| v.folder_name == "Aircraft_a164")
            .expect("a164 row");
        let a164_name = a164.handling_name.clone();
        let mut a164_changes = HashMap::new();
        a164_changes.insert("fMass".to_string(), "1234".to_string());

        let changes = vec![
            VehicleChange {
                folder_name: "Aircraft_F22A".into(),
                handling_name: "f22a".into(),
                changed_params: f22a_changes,
            },
            VehicleChange {
                folder_name: "Naval_usnavyfleet".into(),
                handling_name: first_naval.handling_name.clone(),
                changed_params: naval_changes,
            },
            VehicleChange {
                folder_name: "Aircraft_a164".into(),
                handling_name: a164_name,
                changed_params: a164_changes,
            },
        ];

        let res = update_files(root_str.clone(), changes).expect("update should succeed");
        assert_eq!(res.files_changed, 3, "errors: {:?}", res.errors);
        assert!(res.params_applied >= 6, "applied {}", res.params_applied);
        assert!(res.errors.is_empty(), "errors: {:?}", res.errors);

        // F22A file checks: new values present, untouched values preserved.
        let f22_text = std::fs::read_to_string(dest_root.join("Aircraft_F22A/handling.meta")).unwrap();
        assert!(f22_text.contains(r#"<fMass value="8500" />"#));
        assert!(f22_text.contains(r#"<fThrust value="2.6" />"#));
        assert!(f22_text.contains(r#"<strHandlingFlags>000102</strHandlingFlags>"#));
        assert!(f22_text.contains(r#"vecCentreOfMassOffset x="0.000000" y="0.000000" z="-0.300000""#));
        // untouched: original yaw stabilise + weapon weapon hash remain
        assert!(f22_text.contains(r#"<fYawStabilise value="0.002" />"#));
        assert!(f22_text.contains("VEHICLE_WEAPON_F22_4AAM_ROCKET"));

        // Naval: exactly one entry's mass changed; still 5 entries.
        let naval_text = std::fs::read_to_string(dest_root.join("Naval_usnavyfleet/handling.meta")).unwrap();
        assert_eq!(
            naval_text.matches(r#"<fMass value="50000.000000" />"#).count() +
                naval_text.matches(r#"<fMass value="50000" />"#).count(),
            1
        );
        assert_eq!(
            naval_text.matches("<handlingName>").count(),
            5,
            "must keep all 5 naval entries"
        );

        // Nested a164 meta (resolved via fxmanifest) patched.
        let a164_text =
            std::fs::read_to_string(dest_root.join("Aircraft_a164/common/handling.meta")).unwrap();
        assert!(a164_text.contains(r#"<fMass value="1234" />"#));

        let _ = std::fs::remove_dir_all(&base);
    }
}

