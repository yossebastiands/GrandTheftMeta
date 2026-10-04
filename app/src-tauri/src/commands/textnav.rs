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
/// Shared with the weapon template catalogue, which counts weapon references and
/// must not count the ones a pack has commented out.
pub(crate) fn masked(text: &str) -> String {
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

// ---------------------------------------------------------------------------
// Creation primitives (P0 — weapon-pack generator groundwork)
// ---------------------------------------------------------------------------
//
// Everything above can only *reach* existing nodes; a generator has to *create*
// them. These four primitives are the whole toolkit used by the pack generator
// (and by any future "add an entry" feature):
//
//   node_span            → the complete span of ONE node (block or self-closing)
//   clone_item           → extract a node as a renamable, dedented fragment
//   insert_element        → splice a fragment into a container (expanding `<X/>`)
//   retarget_identifiers  → comment-aware whole-token rename across a document
//
// Contract (same as the rest of this module): comment-aware scans, offsets valid
// on the ORIGINAL text, CRLF preserved, and NEVER a parse/re-serialise cycle —
// the caller always receives a new `String` built by splicing the original.

/// Where to place a new node inside its parent container.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)] // consumed by the weapon-pack generator (P1+) and the tests below
pub enum InsertAt {
    /// Immediately after the parent's open tag.
    First,
    /// Before the parent's closing tag, i.e. after its last child.
    Last,
    /// Before the n-th top-level `<Item>` child (out of range behaves like `Last`).
    Before(usize),
}

/// A resolved node: its open tag, its optional close tag, and whether it is
/// self-closing. `open_end` is the byte just after the open tag's `>` (so the
/// interior starts there); `close_start` is the `<` of `</name>` and `close_end`
/// the byte after it. For a self-closing node `close_start` is `None` and
/// `close_end == open_end`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub struct NodeSpan {
    pub open_start: usize,
    pub open_end: usize,
    pub close_start: Option<usize>,
    pub close_end: usize,
    pub self_closing: bool,
}

#[allow(dead_code)]
impl NodeSpan {
    /// Interior range `[start, end)` — empty (`start == end`) for a self-closing node.
    pub fn interior(&self) -> (usize, usize) {
        (self.open_end, self.close_start.unwrap_or(self.open_end))
    }
    /// Whole-node range `[start, end)`, including both tags.
    pub fn full(&self) -> (usize, usize) {
        (self.open_start, self.close_end)
    }
}

/// Byte offset just after the last non-whitespace byte of `text[lo..hi]`
/// (`lo` when the region is blank).
fn content_end(text: &str, lo: usize, hi: usize) -> usize {
    let mut end = hi.min(text.len());
    while end > lo {
        match text[..end].chars().next_back() {
            Some(c) if c.is_whitespace() => end -= c.len_utf8(),
            _ => break,
        }
    }
    end.max(lo)
}

/// Offset of the first byte on the line containing `pos`.
fn line_start(text: &str, pos: usize) -> usize {
    text[..pos.min(text.len())]
        .rfind('\n')
        .map(|i| i + 1)
        .unwrap_or(0)
}

/// Whitespace prefix of the line containing `pos` (empty when the line has other
/// content before `pos`).
fn line_indent(text: &str, pos: usize) -> String {
    let start = line_start(text, pos);
    let prefix = &text[start..pos.min(text.len())];
    if prefix.chars().all(|c| c == ' ' || c == '\t') {
        prefix.to_string()
    } else {
        String::new()
    }
}

/// The document's line ending (`\r\n` when the file uses CRLF).
fn detect_eol(text: &str) -> &'static str {
    if text.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

/// The indent of the first indented line that starts with `<` (the "one level"
/// unit of this document — a tab when the file is tab-indented).
fn detect_unit(text: &str) -> String {
    for line in text.lines() {
        let ind: String = line.chars().take_while(|c| *c == ' ' || *c == '\t').collect();
        if !ind.is_empty() && line[ind.len()..].starts_with('<') {
            return ind;
        }
    }
    "  ".to_string()
}

/// Element name of an open tag (`<Item` → `Item`).
fn tag_name(tag: &str) -> Option<String> {
    let name: String = tag
        .trim_start_matches('<')
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | ':' | '-' | '.'))
        .collect();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// Indent to use for a new child of `span`: the indent of its first existing
/// child when there is one (perfect fidelity for tabs / 4 / 8-space files),
/// otherwise the parent's own indent plus the document's unit.
fn child_indent(text: &str, span: &NodeSpan, eol: &str) -> String {
    if let Some(close_start) = span.close_start {
        let inner = &text[span.open_end..close_start];
        let segs: Vec<&str> = inner.split(eol).collect();
        // Skip the text on the open tag's line and the segment that is only the
        // closing tag's indent (the interior always ends with it) — otherwise an
        // EMPTY container would report the close tag's indent as its child indent.
        let last = segs.len().saturating_sub(1);
        for seg in segs.iter().skip(1).take(last.saturating_sub(1)) {
            if seg.trim().is_empty() {
                continue;
            }
            let ind: String = seg.chars().take_while(|c| *c == ' ' || *c == '\t').collect();
            if ind.is_empty() || seg[ind.len()..].starts_with("</") {
                break; // child on the open tag's line, or the closing tag line
            }
            return ind;
        }
    }
    format!("{}{}", line_indent(text, span.open_start), detect_unit(text))
}

/// Strip the common leading whitespace of every non-empty line and drop blank
/// leading/trailing lines. Relative indentation inside the fragment is kept.
fn dedent(fragment: &str) -> String {
    let lines: Vec<&str> = fragment.lines().collect();
    let (Some(first), Some(last)) = (
        lines.iter().position(|l| !l.trim().is_empty()),
        lines.iter().rposition(|l| !l.trim().is_empty()),
    ) else {
        return String::new();
    };
    let slice = &lines[first..=last];
    let common = slice
        .iter()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.len() - l.trim_start().len())
        .min()
        .unwrap_or(0);
    slice
        .iter()
        .map(|l| if l.len() > common { &l[common..] } else { l.trim_start() })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Strip `base` from the front of every line that carries it (relative
/// indentation inside the block is kept). Used when lifting a node out of a
/// document: the first line is flush with the node's own position while the inner
/// lines carry the document's absolute indentation, so a common-prefix dedent
/// (which would always see a 0-indent first line) cannot normalise it.
fn dedent_from(block: &str, base: &str) -> String {
    let lines: Vec<&str> = block.lines().collect();
    let (Some(first), Some(last)) = (
        lines.iter().position(|l| !l.trim().is_empty()),
        lines.iter().rposition(|l| !l.trim().is_empty()),
    ) else {
        return String::new();
    };
    lines[first..=last]
        .iter()
        .map(|l| {
            if !base.is_empty() && l.starts_with(base) {
                &l[base.len()..]
            } else {
                *l
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Prefix every line of `body` with `indent`, joining with `eol`.
fn indent_block(body: &str, indent: &str, eol: &str) -> String {
    body.split('\n')
        .map(|l| {
            if l.is_empty() {
                String::new()
            } else {
                format!("{indent}{l}")
            }
        })
        .collect::<Vec<_>>()
        .join(eol)
}

/// The document's root element span (skips the XML declaration and comments).
#[allow(dead_code)]
pub fn root_span(text: &str) -> Option<NodeSpan> {
    let m = masked(text);
    let re = Regex::new(r"<([A-Za-z_][A-Za-z0-9_.:-]*)\b[^>]*>").unwrap();
    let caps = re.captures(&m)?;
    let whole = caps.get(0)?;
    let name = caps.get(1)?.as_str().to_string();
    let open_start = whole.start();
    let open_end = whole.end();
    if whole.as_str().ends_with("/>") {
        return Some(NodeSpan {
            open_start,
            open_end,
            close_start: None,
            close_end: open_end,
            self_closing: true,
        });
    }
    let close_start = m.rfind(&format!("</{name}"))?;
    let close_end = close_start + m[close_start..].find('>')? + 1;
    Some(NodeSpan {
        open_start,
        open_end,
        close_start: Some(close_start),
        close_end,
        self_closing: false,
    })
}

/// Resolve one Elem step inside `region` (comment-aware). Non-self-closing
/// elements come from `elem_own_spans` (nesting-aware); a self-closing
/// occurrence such as `<InitDatas/>` is the fallback.
fn resolve_elem(text: &str, region: (usize, usize), name: &str, occ: usize) -> Option<NodeSpan> {
    let (lo, hi) = region;
    if let Some((open_start, close_start)) = elem_own_spans(text, lo, hi, name).get(occ).copied() {
        let open_end = open_start + text[open_start..close_start].find('>')? + 1;
        let close_end = close_start + text[close_start..hi.max(close_start)].find('>')? + 1;
        return Some(NodeSpan {
            open_start,
            open_end,
            close_start: Some(close_start),
            close_end,
            self_closing: false,
        });
    }
    let m = masked(text);
    let re = Regex::new(&format!(r"<{}\b[^>]*/>", regex::escape(name))).unwrap();
    let hit = re.find_iter(&m[lo..hi]).nth(occ)?;
    let open_start = lo + hit.start();
    let open_end = lo + hit.end();
    Some(NodeSpan {
        open_start,
        open_end,
        close_start: None,
        close_end: open_end,
        self_closing: true,
    })
}

/// Resolve one Item step inside `region` (top-level items only, comment-aware).
fn resolve_item(text: &str, region: (usize, usize), idx: usize) -> Option<NodeSpan> {
    let (lo, hi) = region;
    let (open_start, end) = *top_item_spans(text, lo, hi).get(idx)?;
    if text[open_start..end].trim_end().ends_with("/>") {
        return Some(NodeSpan {
            open_start,
            open_end: end,
            close_start: None,
            close_end: end,
            self_closing: true,
        });
    }
    let close_start = end.checked_sub("</Item>".len())?;
    let open_end = open_start + text[open_start..end].find('>')? + 1;
    Some(NodeSpan {
        open_start,
        open_end,
        close_start: Some(close_start),
        close_end: end,
        self_closing: false,
    })
}

/// Complete span of the node at `steps` (comment-aware). Unlike `navigate` this
/// also resolves self-closing nodes, which is what makes `<InitDatas/>`
/// expandable.
#[allow(dead_code)] // consumed by the weapon-pack generator (P1+) and the tests below
pub fn node_span(text: &str, steps: &[PathStep]) -> Option<NodeSpan> {
    if steps.is_empty() {
        return None;
    }
    let mut region = (0usize, text.len());
    let mut resolved = None;
    for (i, step) in steps.iter().enumerate() {
        let last = i + 1 == steps.len();
        let span = match step {
            PathStep::Elem(name, occ) => resolve_elem(text, region, name, *occ)?,
            PathStep::Item(idx) => resolve_item(text, region, *idx)?,
        };
        if span.self_closing && !last {
            return None; // nothing to descend into
        }
        region = span.interior();
        resolved = Some(span);
    }
    resolved
}

/// Split a byte span out as a standalone fragment: dedented against the indent of the
/// line the span starts on, with `rename` applied. Use this when a node was located by
/// *content* (e.g. the `<Item>` whose `<Name>` matches) rather than by path.
#[allow(dead_code)] // consumed by the weapon pack generator (P2+) and the tests below
pub fn clone_span(text: &str, span: (usize, usize), rename: &[(&str, &str)]) -> String {
    let s = span.0.min(text.len());
    let e = span.1.min(text.len()).max(s);
    let base = line_indent(text, s);
    retarget_identifiers(&dedent_from(&text[s..e], &base), rename)
}

/// Extract the node at `steps` as a standalone, dedented fragment with `rename`
/// applied to its text. Read-only: the document is never modified.
#[allow(dead_code)] // consumed by the weapon-pack generator (P1+) and the tests below
pub fn clone_item(text: &str, steps: &[PathStep], rename: &[(&str, &str)]) -> Option<String> {
    let span = node_span(text, steps)?;
    Some(clone_span(text, span.full(), rename))
}

/// Insert `fragment` as a new child of the element at `parent` (an empty
/// `parent` means the document root).
///
/// * a self-closing parent (`<InitDatas/>`) is expanded to `<InitDatas>…</InitDatas>`;
/// * the fragment is dedented, re-indented with the parent's detected child
///   indent, and joined with the file's own EOL — relative indentation *inside*
///   the fragment is preserved;
/// * `InsertAt::Before(n)` counts real (non-commented) top-level `<Item>` children
///   only, so a commented-out block never shifts the position.
#[allow(dead_code)] // consumed by the weapon-pack generator (P1+) and the tests below
pub fn insert_element(
    text: &str,
    parent: &[PathStep],
    at: InsertAt,
    fragment: &str,
) -> Option<String> {
    let span = if parent.is_empty() {
        root_span(text)?
    } else {
        node_span(text, parent)?
    };
    let eol = detect_eol(text);
    let body = indent_block(&dedent(fragment), &child_indent(text, &span, eol), eol);
    if body.is_empty() {
        return Some(text.to_string());
    }

    if span.self_closing {
        let name = tag_name(&text[span.open_start..span.open_end])?;
        let parent_indent = line_indent(text, span.open_start);
        let mut out = String::with_capacity(text.len() + body.len() + name.len() * 2 + 8);
        out.push_str(&text[..span.open_start]);
        out.push('<');
        out.push_str(&name);
        out.push('>');
        out.push_str(eol);
        out.push_str(&body);
        out.push_str(eol);
        out.push_str(&parent_indent);
        out.push_str("</");
        out.push_str(&name);
        out.push('>');
        out.push_str(&text[span.open_end..]);
        return Some(out);
    }

    let (lo, hi) = span.interior();
    let (insert_at, insert_text) = match at {
        InsertAt::First => (lo, format!("{eol}{body}")),
        InsertAt::Last => (content_end(text, lo, hi), format!("{eol}{body}")),
        InsertAt::Before(n) => match top_item_spans(text, lo, hi).get(n) {
            Some((s, _)) => (line_start(text, *s), format!("{body}{eol}")),
            None => (content_end(text, lo, hi), format!("{eol}{body}")),
        },
    };
    let mut out = String::with_capacity(text.len() + insert_text.len());
    out.push_str(&text[..insert_at]);
    out.push_str(&insert_text);
    out.push_str(&text[insert_at..]);
    Some(out)
}

/// Empty a container's interior while keeping its tags, so generated children never stack on
/// top of what the template already had. Returns `None` when the path does not resolve or the
/// container is already empty (so an untouched file stays byte-identical).
///
/// This is the "replace, do not append" half of `insert_element`: cloning a whole weapon entry
/// carries the template's own `<AttachPoints>` along, and appending a regenerated slot list on
/// top of it would leave the weapon with the same bone twice.
pub fn clear_children(text: &str, steps: &[PathStep]) -> Option<String> {
    let span = node_span(text, steps)?;
    let (lo, hi) = span.interior();
    if content_end(text, lo, hi) <= lo {
        return None;
    }
    // Keep the container's own line break + indent so the emptied block looks like the file's
    // other empty blocks — and so the next `insert_element` still finds its indent anchor
    // (an empty container is only re-indentable when the close tag sits on its own line).
    let tail = match text[lo..hi].rfind('\n') {
        Some(nl) if text[lo + nl + 1..hi].trim().is_empty() => &text[lo + nl..hi],
        _ => "",
    };
    let mut out = String::with_capacity(text.len() - (hi - lo) + tail.len());
    out.push_str(&text[..lo]);
    out.push_str(tail);
    out.push_str(&text[hi..]);
    Some(out)
}

/// Replace whole identifiers, longest needle first, skipping comment bodies.
///
/// Token boundaries matter: with `WEAPON_PISTOL` in the map, `WEAPON_PISTOL50`
/// is left alone. This is the primitive behind the toolkit's "global retarget"
/// (pass the base weapon id and, for families that reference a sibling, that
/// sibling too — e.g. `[("WEAPON_COMBATPISTOL", "WEAPON_GLOCK17"),
/// ("WEAPON_PISTOL", "WEAPON_GLOCK17")]`).
pub fn retarget_identifiers(text: &str, rename: &[(&str, &str)]) -> String {
    if rename.is_empty() {
        return text.to_string();
    }
    let mut pairs: Vec<(&str, &str)> = rename
        .iter()
        .copied()
        .filter(|(a, _)| !a.is_empty())
        .collect();
    pairs.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    pairs.dedup_by(|a, b| a.0 == b.0);

    let is_ident = |b: u8| b.is_ascii_alphanumeric() || b == b'_';
    let comments = comment_spans(text);
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut i = 0usize;
    let mut ci = 0usize;
    while i < bytes.len() {
        while ci < comments.len() && comments[ci].1 <= i {
            ci += 1;
        }
        if let Some(&(cs, ce)) = comments.get(ci) {
            if i >= cs && i < ce {
                out.push_str(&text[i..ce]);
                i = ce;
                continue;
            }
        }
        if is_ident(bytes[i]) && (i == 0 || !is_ident(bytes[i - 1])) {
            if let Some((needle, to)) = pairs.iter().find(|(needle, _)| {
                text[i..].starts_with(needle)
                    && !bytes
                        .get(i + needle.len())
                        .is_some_and(|b| is_ident(*b))
            }) {
                out.push_str(to);
                i += needle.len();
                continue;
            }
        }
        match text[i..].chars().next() {
            Some(c) => {
                out.push(c);
                i += c.len_utf8();
            }
            None => break,
        }
    }
    out
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

    // -----------------------------------------------------------------------
    // Creation primitives (P0)
    // -----------------------------------------------------------------------

    /// Tab-indented, R*-shaped weapons.meta slice.
    const WPN: &str = "<CWeaponInfoBlob>\n\t<Infos>\n\t\t<Item>\n\t\t\t<Infos>\n\t\t\t\t<Item type=\"CWeaponInfo\">\n\t\t\t\t\t<Name>WEAPON_COMBATPISTOL</Name>\n\t\t\t\t\t<Slot>SLOT_COMBATPISTOL</Slot>\n\t\t\t\t\t<AttachPoints>\n\t\t\t\t\t</AttachPoints>\n\t\t\t\t</Item>\n\t\t\t\t<Item type=\"CWeaponInfo\">\n\t\t\t\t\t<Name>WEAPON_PISTOL50</Name>\n\t\t\t\t</Item>\n\t\t\t</Infos>\n\t\t</Item>\n\t</Infos>\n</CWeaponInfoBlob>\n";

    /// A weapon entry, indented *relative to its own first line*.
    const FRAG_NEW: &str = "<Item type=\"CWeaponInfo\">\n\t<Name>WEAPON_NEW</Name>\n\t<ClipSize value=\"9\" />\n</Item>";

    #[test]
    fn retarget_is_whole_token_and_comment_aware() {
        let pairs = [
            ("WEAPON_PISTOL", "WEAPON_GLOCK17"),
            ("WEAPON_COMBATPISTOL", "WEAPON_GLOCK17"),
        ];
        let out = retarget_identifiers(WPN, &pairs);
        assert!(out.contains("<Name>WEAPON_GLOCK17</Name>"), "base id not retargeted");
        assert!(
            out.contains("<Name>WEAPON_PISTOL50</Name>"),
            "WEAPON_PISTOL must not match inside WEAPON_PISTOL50"
        );
        assert!(out.contains("<Slot>SLOT_COMBATPISTOL</Slot>"), "non-matching id must not change");
        // longest-needle-first: no cascading replacement of an already-renamed id
        assert_eq!(out.matches("WEAPON_GLOCK17").count(), 1);

        let commented = "<!-- <Item>WEAPON_COMBATPISTOL</Item> -->\n<Item>WEAPON_COMBATPISTOL</Item>\n";
        let out2 = retarget_identifiers(commented, &[("WEAPON_COMBATPISTOL", "WEAPON_GLOCK17")]);
        assert!(out2.starts_with("<!-- <Item>WEAPON_COMBATPISTOL</Item> -->"), "comments are data, not ids");
        assert!(out2.ends_with("<Item>WEAPON_GLOCK17</Item>\n"));
        assert_eq!(retarget_identifiers(commented, &[]), commented, "empty map is a no-op");
    }

    #[test]
    fn clone_then_insert_is_a_pure_insert_hunk() {
        // Lift a block out, put it back into the same container, and prove the
        // ONLY change is the inserted copy: removing it restores the file
        // byte-for-byte. This is the guard that keeps "surgical patching" true
        // for the generator (no re-serialisation, no re-indentation of neighbours).
        let path = parse_path("Infos/0/Infos/0").unwrap();
        let cloned = clone_item(WPN, &path, &[("WEAPON_COMBATPISTOL", "WEAPON_GLOCK17")]).expect("clone");
        let parent = parse_path("Infos/0/Infos").unwrap();
        let out = insert_element(WPN, &parent, InsertAt::Before(0), &cloned).expect("insert");

        let body = cloned
            .split('\n')
            .map(|l| format!("\t\t\t\t{l}"))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(out.contains(&body), "inserted copy must keep the container's indent");
        let restored = out.replacen(&format!("{body}\n"), "", 1);
        assert_eq!(restored, WPN, "clone+insert must be an insertion, nothing else");

        // the clone is also re-insertable verbatim into a *different* file shape
        let arch = "<CWeaponModelInfo__InitDataList>\n\t<InitDatas/>\n</CWeaponModelInfo__InitDataList>\n";
        let other = insert_element(arch, &parse_path("InitDatas").unwrap(), InsertAt::Last, &cloned).unwrap();
        let body2 = cloned
            .split('\n')
            .map(|l| format!("\t\t{l}"))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(other.contains(&body2), "the same fragment re-indents to the new parent: {other}");
    }

    #[test]
    fn node_span_covers_both_tags_and_reports_self_closing() {
        let span = node_span(WPN, &parse_path("Infos/0/Infos/0").unwrap()).expect("span");
        assert!(!span.self_closing);
        assert!(WPN[span.open_start..span.open_end].starts_with("<Item type=\"CWeaponInfo\">"));
        let close_start = span.close_start.expect("close");
        assert_eq!(&WPN[close_start..span.close_end], "</Item>");
        assert!(WPN[span.interior().0..span.interior().1].contains("WEAPON_COMBATPISTOL"));

        let arch = "<CWeaponModelInfo__InitDataList>\n\t<InitDatas/>\n</CWeaponModelInfo__InitDataList>\n";
        let leaf = node_span(arch, &parse_path("InitDatas").unwrap()).expect("self-closing span");
        assert!(leaf.self_closing && leaf.close_start.is_none());
        assert_eq!(&arch[leaf.full().0..leaf.full().1], "<InitDatas/>");
        assert_eq!(leaf.interior().0, leaf.interior().1, "a self-closing node has no interior");
        // descending *through* a self-closing node is impossible
        assert!(node_span(arch, &parse_path("InitDatas/0").unwrap()).is_none());
    }

    #[test]
    fn clone_item_returns_dedented_renamed_fragment() {
        let frag = clone_item(
            WPN,
            &parse_path("Infos/0/Infos/0").unwrap(),
            &[("WEAPON_COMBATPISTOL", "WEAPON_GLOCK17")],
        )
        .expect("clone");
        assert!(frag.starts_with("<Item type=\"CWeaponInfo\">"), "no leading indent: {frag:?}");
        assert!(frag.trim_end().ends_with("</Item>"));
        assert!(frag.contains("<Name>WEAPON_GLOCK17</Name>"));
        assert!(frag.contains("\n\t<Slot>"), "relative indentation is kept: {frag:?}");

        let raw = clone_item(WPN, &parse_path("Infos/0/Infos/0").unwrap(), &[]).expect("raw clone");
        assert!(raw.contains("WEAPON_COMBATPISTOL"), "no rename => untouched copy");
        assert!(!WPN.contains("WEAPON_GLOCK17"), "clone_item never writes through");
    }

    #[test]
    fn insert_element_keeps_child_indent_and_order() {
        let path = parse_path("Infos/0/Infos").unwrap();
        let out = insert_element(WPN, &path, InsertAt::Before(0), FRAG_NEW).expect("insert");
        assert!(
            out.contains("\n\t\t\t\t<Item type=\"CWeaponInfo\">\n\t\t\t\t\t<Name>WEAPON_NEW</Name>\n"),
            "inserted node must use the 4-tab child indent: {out}"
        );
        assert!(out.find("WEAPON_NEW").unwrap() < out.find("WEAPON_COMBATPISTOL").unwrap());

        // the document is still navigable, and the old first item moved to index 1
        let (lo, hi) = navigate(&out, &parse_path("Infos/0/Infos/0").unwrap()).unwrap();
        assert!(out[lo..hi].contains("WEAPON_NEW"));
        let (lo1, hi1) = navigate(&out, &parse_path("Infos/0/Infos/1").unwrap()).unwrap();
        assert!(out[lo1..hi1].contains("WEAPON_COMBATPISTOL"));
        assert!(
            elem_own_spans(&out, 0, out.len(), "Infos").len() == 1,
            "nesting-aware resolution must be unaffected"
        );

        // First / Last land inside the container, never outside it
        let first = insert_element(WPN, &path, InsertAt::First, "<Item>F</Item>").unwrap();
        assert!(first.contains("<Infos>\n\t\t\t\t<Item>F</Item>\n"));
        let last = insert_element(WPN, &path, InsertAt::Last, "<Item>L</Item>").unwrap();
        assert!(last.contains("<Item>L</Item>\n\t\t\t</Infos>"), "{last}");
        // out-of-range Before behaves like Last (appends, never drops data)
        let beyond = insert_element(WPN, &path, InsertAt::Before(9), "<Item>Z</Item>").unwrap();
        assert!(beyond.contains("<Item>Z</Item>\n\t\t\t</Infos>"));
    }

    #[test]
    fn clear_children_empties_a_container_and_leaves_an_empty_one_alone() {
        let doc = "<R>\n\t<AttachPoints>\n\t\t<Item>\n\t\t\t<AttachBone>WAPClip</AttachBone>\n\t\t</Item>\n\t</AttachPoints>\n\t<Other>\n\t</Other>\n</R>\n";
        let path = parse_path("AttachPoints").unwrap();
        let out = clear_children(doc, &path).expect("a non-empty container is cleared");
        assert!(out.contains("<AttachPoints>\n\t</AttachPoints>"), "kept the file's own style: {out:?}");
        assert!(!out.contains("WAPClip"));
        assert!(out.contains("<Other>"), "nothing else is touched");
        // …and the emptied container accepts generated children again, properly indented
        let refilled = insert_element(&out, &path, InsertAt::Last, "<Item>X</Item>").unwrap();
        assert!(refilled.contains("<AttachPoints>\n\t\t<Item>X</Item>\n\t</AttachPoints>"), "{refilled}");
        // idempotent: an already-empty (or self-closing) container is not touched at all
        assert!(clear_children(&out, &path).is_none());
        assert!(clear_children("<R>\n\t<L/>\n</R>\n", &parse_path("L").unwrap()).is_none());
        assert!(clear_children(doc, &parse_path("Nope").unwrap()).is_none());
    }

    #[test]
    fn clone_span_works_for_content_located_nodes() {
        // A node found by regex/name (not by path) can be lifted out and re-inserted:
        // this is how the generator clones "the <Item> whose <Name> is WEAPON_X".
        let start = WPN.find("<Item type=\"CWeaponInfo\">").unwrap();
        let end = WPN.find("</Item>").unwrap() + "</Item>".len();
        let frag = clone_span(WPN, (start, end), &[("WEAPON_COMBATPISTOL", "WEAPON_GLOCK17")]);
        assert!(frag.starts_with("<Item type=\"CWeaponInfo\">"));
        assert!(frag.contains("<Name>WEAPON_GLOCK17</Name>"));
        assert!(!frag.starts_with('\t'), "still dedented");
        // an empty BLOCK container indents its new child like a self-closing one
        let empty = "<R>\n\t<L>\n\t</L>\n</R>\n";
        let out = insert_element(empty, &parse_path("L").unwrap(), InsertAt::Last, "<Item>X</Item>").unwrap();
        assert!(out.contains("<L>\n\t\t<Item>X</Item>\n\t</L>"), "{out}");
    }

    #[test]
    fn insert_element_expands_a_self_closing_parent() {
        let arch = "<CWeaponModelInfo__InitDataList>\n\t<InitDatas/>\n</CWeaponModelInfo__InitDataList>\n";
        let frag = "<Item>\n\t<modelName>w_x</modelName>\n</Item>";
        let out = insert_element(arch, &parse_path("InitDatas").unwrap(), InsertAt::Last, frag).unwrap();
        assert!(out.contains("<InitDatas>\n"), "open tag written: {out}");
        assert!(out.contains("\n\t</InitDatas>"), "parent indent reused for the close tag: {out}");
        assert!(
            out.contains("\t\t<Item>\n\t\t\t<modelName>w_x</modelName>\n\t\t</Item>"),
            "child indent = parent + one unit: {out}"
        );
        // the expanded container is navigable again (this is what the generator needs)
        let (lo, hi) = navigate(&out, &parse_path("InitDatas/0").unwrap()).unwrap();
        assert!(out[lo..hi].contains("w_x"));
        // and a second insert appends rather than re-expanding
        let twice = insert_element(&out, &parse_path("InitDatas").unwrap(), InsertAt::Last, "<Item>B</Item>").unwrap();
        assert_eq!(twice.matches("<InitDatas>").count(), 1);
        assert!(twice.contains("<Item>B</Item>\n\t</InitDatas>"));
    }

    #[test]
    fn insert_element_counts_real_items_only_and_preserves_crlf() {
        let commented = "<R>\n\t<L>\n\t\t<!-- <Item>A</Item> -->\n\t\t<Item>A</Item>\n\t\t<Item>B</Item>\n\t</L>\n</R>\n";
        let out = insert_element(commented, &parse_path("L").unwrap(), InsertAt::Before(1), "<Item>NEW</Item>").unwrap();
        let order: Vec<&str> = out
            .lines()
            .filter(|l| l.contains("<Item>"))
            .map(|l| l.trim())
            .collect();
        assert_eq!(
            order,
            vec!["<!-- <Item>A</Item> -->", "<Item>A</Item>", "<Item>NEW</Item>", "<Item>B</Item>"],
            "a commented-out item must never be counted as the first child"
        );

        let crlf = WPN.replace('\n', "\r\n");
        let out = insert_element(&crlf, &parse_path("Infos/0/Infos").unwrap(), InsertAt::Last, FRAG_NEW).unwrap();
        assert!(out.contains("\r\n"), "file stays CRLF");
        assert_eq!(
            out.matches('\n').count(),
            out.matches("\r\n").count(),
            "every line (new and old) must end with CRLF"
        );
    }
}
