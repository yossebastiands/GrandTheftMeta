//! Comment-aware raw-text navigation for list-based meta files
//! (carcols/carvariations/vehiclelayouts…).
//!
//! Those files love to comment out `<Item>` blocks (and even whole groups), so a
//! naive "Nth `<Item>`" scan would mis-count once a comment contains `<Item>`.
//! These helpers scan a comment-masked copy (comment bodies → spaces, SAME byte
//! length), so every returned offset stays valid on the original text, and tags
//! inside comments simply vanish from the scan.
//!
//! A "path" is a slash-joined list of steps locating ONE list entry:
//!   - an element name (`name` or `name#k` when several same-named siblings
//!     exist, k = 0-based occurrence) → descend into that element's interior;
//!   - a bare integer `n` → the n-th top-level `<Item>` in the current region
//!     (0-based, counting real items only) → its interior.
//!
//! Example: `Kits/0/visibleMods/2` = Kits element → 0th kit Item → visibleMods
//! element inside it → 2nd visibleMod part.

use super::update::{find_matching_close, locate_elements};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathStep {
    /// `<name ...>` element (occurrence among same-named element siblings).
    Elem(String, usize),
    /// n-th top-level `<Item>` inside the current region.
    Item(usize),
}

/// Parse `Kits/0/visibleMods#1/2` into steps.
pub fn parse_path(s: &str) -> Result<Vec<PathStep>, String> {
    let _ = path_string as fn(&[PathStep]) -> String; // keep helper available for tests/drivers
    let mut steps = Vec::new();
    for raw in s.split('/') {
        let tok = raw.trim();
        if tok.is_empty() {
            continue;
        }
        if let Ok(n) = tok.parse::<usize>() {
            steps.push(PathStep::Item(n));
        } else if let Some((name, occ)) = tok.split_once('#') {
            let occ = occ
                .parse::<usize>()
                .map_err(|_| format!("bad path segment '{tok}'"))?;
            steps.push(PathStep::Elem(name.to_string(), occ));
        } else {
            steps.push(PathStep::Elem(tok.to_string(), 0));
        }
    }
    Ok(steps)
}

/// Serialise steps back to a path string (round-trips with `parse_path`).
pub fn path_string(steps: &[PathStep]) -> String {
    steps
        .iter()
        .map(|s| match s {
            PathStep::Elem(n, 0) => n.clone(),
            PathStep::Elem(n, occ) => format!("{n}#{occ}"),
            PathStep::Item(i) => i.to_string(),
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Byte spans of every `<!-- … -->` comment in `text`.
fn comment_spans(text: &str) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut search = 0usize;
    while let Some(a) = text[search..].find("<!--") {
        let start = search + a;
        let body = start + 4;
        match text[body..].find("-->") {
            Some(r) => {
                let end = body + r + 3;
                out.push((start, end));
                search = end;
            }
            None => {
                out.push((start, text.len()));
                break;
            }
        }
    }
    out
}

/// A copy of `text` with every comment body replaced by spaces (byte length kept,
/// so offsets match the original). Tags inside comments can no longer be found.
fn masked(text: &str) -> String {
    if !text.contains("<!--") {
        return text.to_string();
    }
    let spans = comment_spans(text);
    if spans.is_empty() {
        return text.to_string();
    }
    let mut bytes = text.as_bytes().to_vec();
    for (s, e) in spans {
        for b in &mut bytes[s..e] {
            *b = b' ';
        }
    }
    String::from_utf8(bytes).unwrap_or_else(|_| text.to_string())
}

/// Element `<name …>` occurrences inside `text[lo..hi]` (skips commented ones).
/// Returns global offsets `(open_start, open_end, close)`.
pub fn elem_locs(
    text: &str,
    lo: usize,
    hi: usize,
    name: &str,
) -> Vec<(usize, usize, Option<(usize, usize)>)> {
    let m = masked(text);
    if lo >= m.len() || hi > m.len() || lo > hi {
        return Vec::new();
    }
    let sub = &m[lo..hi];
    locate_elements(sub, name)
        .into_iter()
        .map(|(a, b, c)| (a + lo, b + lo, c.map(|(x, y)| (x + lo, y + lo))))
        .collect()
}

/// Global spans `[start, end)` of every TOP-LEVEL `<Item>` (not nested inside
/// another Item) within `text[lo..hi]` — commented items are ignored.
pub fn top_item_spans(text: &str, lo: usize, hi: usize) -> Vec<(usize, usize)> {
    let m = masked(text);
    if lo >= m.len() || hi > m.len() || lo > hi {
        return Vec::new();
    }
    let sub = &m[lo..hi];
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < sub.len() {
        let Some(rel) = sub[i..].find("<Item") else {
            break;
        };
        let start = i + rel;
        let Some(gt_rel) = sub[start..].find('>') else {
            break;
        };
        let gt = start + gt_rel;
        if sub[start..=gt].ends_with("/>") {
            i = gt + 1;
            continue;
        }
        match find_matching_close(sub, gt + 1) {
            Some(after) => {
                out.push((lo + start, lo + after));
                i = after;
            }
            None => break,
        }
    }
    out
}

/// Navigate a path to the final entry and return the interior region
/// `[open_end, close_start)` of that Item where its scalar fields live.
pub fn navigate(text: &str, steps: &[PathStep]) -> Option<(usize, usize)> {
    let mut lo = 0usize;
    let mut hi = text.len();
    for step in steps {
        match step {
            PathStep::Elem(name, occ) => {
                let locs = elem_locs(text, lo, hi, name);
                // only elements that have an interior (skip self-closing ones)
                let found = locs.iter().filter(|l| l.2.is_some()).nth(*occ)?;
                let (_, oe, Some((cs, _))) = *found else {
                    return None;
                };
                (lo, hi) = (oe, cs);
            }
            PathStep::Item(idx) => {
                let spans = top_item_spans(text, lo, hi);
                let (s, e) = *spans.get(*idx)?;
                // interior between the Item open tag's '>' and its closing tag
                let gt_rel = text[s..e].find('>')?;
                let gt = s + gt_rel + 1;
                let close_start = e.checked_sub("</Item>".len())?;
                (lo, hi) = (gt, close_start);
            }
        }
        if lo > hi {
            return None;
        }
    }
    Some((lo, hi))
}
