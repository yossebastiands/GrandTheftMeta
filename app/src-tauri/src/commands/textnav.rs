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
use regex::Regex;

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
/// another Item) within `text[lo..hi]` — commented items are ignored. Both block
/// entries `<Item>…</Item>` and self-closing leaf entries `<Item …/>` are
/// returned (in DOM order, so indexes match the scanner).
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
            // Self-closing leaf entry: span is just its open tag.
            out.push((lo + start, lo + gt + 1));
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

/// Spans `[start, end)` of every TOP-LEVEL `<name …>` element inside
/// `text[lo..hi]` (comment bodies masked, so commented tags vanish; offsets are
/// global). "Top-level" means NOT nested inside another element of the same
/// `name`, and each span ends at its TRUE matching close tag — so a section that
/// wraps nested same-named children (e.g. `<MovementModes>` containing another
/// `<MovementModes>`) resolves to its own real open→close pair instead of the
/// next same-name close. Self-closing elements (no interior) are skipped.
pub fn elem_own_spans(text: &str, lo: usize, hi: usize, name: &str) -> Vec<(usize, usize)> {
    let m = masked(text);
    if lo >= m.len() || hi > m.len() || lo > hi {
        return Vec::new();
    }
    let sub = &m[lo..hi];
    let open_re = Regex::new(&format!(r"<{}\b[^>]*>", regex::escape(name))).unwrap();
    let close_re = Regex::new(&format!(r"</{}\s*>", regex::escape(name))).unwrap();

    // Merge open & close tokens into one ordered stream, skipping self-closing
    // opens (they have no interior to descend into).
    let mut out = Vec::new();
    let mut stack: Vec<usize> = Vec::new(); // open-tag start offsets (global-ish)
    let mut opens = open_re.find_iter(sub).peekable();
    let mut closes = close_re.find_iter(sub).peekable();
    loop {
        let next_open = opens.peek().map(|o| o.start());
        let next_close = closes.peek().map(|c| c.start());
        match (next_open, next_close) {
            (Some(o), Some(c)) if o < c => {
                let gt_rel = sub[o..].find('>').unwrap();
                let gt = o + gt_rel;
                let self_close = sub[o..=gt].ends_with("/>");
                let _ = opens.next();
                if !self_close {
                    stack.push(lo + o);
                }
            }
            (Some(o), None) => {
                let gt_rel = sub[o..].find('>').unwrap();
                let gt = o + gt_rel;
                let self_close = sub[o..=gt].ends_with("/>");
                let _ = opens.next();
                if !self_close {
                    stack.push(lo + o);
                }
            }
            (_, Some(_)) => {
                let c = closes.next().unwrap();
                if let Some(os) = stack.pop() {
                    // The popped element is top-level iff nothing else of the
                    // same name was still open beneath it (stack empty now).
                    if stack.is_empty() {
                        out.push((os, lo + c.start()));
                    }
                }
            }
            (None, None) => break,
        }
    }
    out
}

/// Byte span of the `<Item …>` open tag whose `>` ends right at `open_end`
/// (i.e. the start of an Item interior returned by `navigate`).
pub fn item_open_span(text: &str, open_end: usize) -> Option<(usize, usize)> {
    if open_end > text.len() || open_end < "<Item>".len() {
        return None;
    }
    let head = &text[..open_end];
    let rel = head.rfind("<Item")?;
    Some((rel, open_end))
}

/// Navigate a path to the final entry and return the interior region
/// `[open_end, close_start)` of that Item where its scalar fields live.
pub fn navigate(text: &str, steps: &[PathStep]) -> Option<(usize, usize)> {
    let mut lo = 0usize;
    let mut hi = text.len();
    for step in steps {
        match step {
            PathStep::Elem(name, occ) => {
                // Nesting-aware: a section may contain nested same-named
                // elements (e.g. MovementModes in MovementModes). elem_own_spans
                // only returns non-self-closing elements, each ending at its own
                // matching close tag, so the interior is (after-open, close).
                let (s, e) = *elem_own_spans(text, lo, hi, name).get(*occ)?;
                let gt_rel = text[s..e].find('>')?;
                let gt = s + gt_rel + 1;
                (lo, hi) = (gt, e);
            }
            PathStep::Item(idx) => {
                let spans = top_item_spans(text, lo, hi);
                let (s, e) = *spans.get(*idx)?;
                let gt_rel = text[s..e].find('>')?;
                let gt = s + gt_rel + 1;
                if text[s..e].trim_end().ends_with("/>") {
                    // Self-closing leaf entry: no interior; point at the open tag.
                    (lo, hi) = (gt, gt);
                } else {
                    // Interior between the Item open tag's '>' and its closing tag.
                    let close_start = e.checked_sub("</Item>".len())?;
                    (lo, hi) = (gt, close_start);
                }
            }
        }
        if lo > hi {
            return None;
        }
    }
    Some((lo, hi))
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIAG: &str = r#"<CVehicleMetadataMgr>
  <VehicleLayoutInfos>
    <Item type="CVehicleLayoutInfo">
      <Name>L1</Name>
      <Seats>
        <Item>
          <SeatInfo ref="SEAT_TANK_KHANJALI_FRONT_LEFT" />
          <SeatAnimInfo ref="SEAT_ANIM_T90M_DRIVER" />
        </Item>
      </Seats>
    </Item>
  </VehicleLayoutInfos>
  <VehicleEntryPointInfos>
    <Item type="CVehicleEntryPointInfo">
      <Name>E1</Name>
      <AccessableSeats>
        <Item ref="SEAT_STANDARD_NO_SHUFFLE_REAR_LEFT" />
      </AccessableSeats>
    </Item>
  </VehicleEntryPointInfos>
</CVehicleMetadataMgr>"#;

    #[test]
    fn diag_nested_sections_and_leaf_items() {
        let text = DIAG.to_string();
        assert_eq!(elem_own_spans(&text, 0, text.len(), "VehicleLayoutInfos").len(), 1);
        assert_eq!(elem_own_spans(&text, 0, text.len(), "VehicleEntryPointInfos").len(), 1);
        // Nested same-name-free navigation to a self-closing leaf Item still works:
        // its region is empty (leaf has no interior), and item_open_span on the
        // region start exposes the leaf open tag so a ref patch can be applied.
        let path = parse_path("VehicleEntryPointInfos/0/AccessableSeats/0").unwrap();
        let nav = navigate(&text, &path).expect("navigate failed");
        assert_eq!(nav.0, nav.1);
        let (os, oe) = item_open_span(&text, nav.0).expect("open span");
        assert!(text[os..oe].contains(r#"ref="SEAT_STANDARD_NO_SHUFFLE_REAR_LEFT""#));
        // A section whose own last child is a self-closing leaf keeps its interior.
        let p = parse_path("VehicleEntryPointInfos/0").unwrap();
        let (lo, hi) = navigate(&text, &p).expect("entrypoint navigate failed");
        assert!(text[lo..hi].contains("<Name>E1</Name>"));
        assert!(text[lo..hi].contains("AccessableSeats"));
        // Block child Item path resolves too.
        let p2 = parse_path("VehicleLayoutInfos/0/Seats/0").unwrap();
        let nav2 = navigate(&text, &p2).expect("nav2 failed");
        assert!(text[nav2.0..nav2.1].contains("SeatAnimInfo"));
    }
}
