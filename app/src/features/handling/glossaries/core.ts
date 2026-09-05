// Shared plumbing for per-meta field glossaries.
//
// Every meta glossary is defined the same way as weaponHints.ts:
//   - `all`   = the REAL union of parameter columns the editor's scanner finds
//               in the reference packs (so glossary coverage == editable cells);
//   - `guide` = one `Name:<html>` block per field (parsed on the "Name:" marker);
//   - fields without a hand-written guide fall back to an honest generic entry.
//
// The same description powers BOTH the Glossary view page and the in-table "?"
// hint popovers (hint(col) => html | undefined).

export interface GlossaryEntry {
  name: string;
  moduleLabel: string;
  description: string;
}

export interface MetaGlossary {
  /** Badge label shown next to each entry (e.g. "Vehicle", "Mod part"). */
  moduleLabel: string;
  /** All editable columns for this meta (union seen in real packs). */
  all: string[];
  /** Guide text: `Name:<p>…</p>` blocks. */
  guide: string;
  /** Phrase used in the generic fallback, e.g. "a vehicle-model field". */
  what: string;
}

export interface GlossarySource {
  /** Badge shown on every entry of this meta. */
  moduleLabel: string;
  /** Full ordered list of glossary entries (guide ?? honest fallback). */
  entries(): GlossaryEntry[];
  /** In-table "?" hint for one column. */
  hint(col: string): string | undefined;
}

/** Split guide text into {name: html} using the `Name:` markers. */
export function parseGuide(guide: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /^([A-Za-z0-9.]+):/gm;
  const matches: Array<{ key: string; idx: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(guide)) !== null) {
    matches.push({ key: m[1], idx: m.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : guide.length;
    let seg = guide.slice(start, end).trim();
    const ci = seg.indexOf(":");
    seg = seg.slice(ci + 1).trim();
    if (seg) map.set(matches[i].key, seg);
  }
  return map;
}

/** Honest generic description for fields we don't hand-write. */
export function fallbackHtml(name: string, what: string): string {
  return `<p><b>What is it?</b> <code>${name}</code> — an advanced ${what}.</p>` +
    `<p><b>Advice:</b> keep the value from your pack or a matching vanilla entry — it usually only changes when you are deliberately retargeting this vehicle/weapon.</p>`;
}

/** Build the source (entries + hint) from a definition. */
export function buildGlossary(def: MetaGlossary): GlossarySource {
  const guide = parseGuide(def.guide);
  const fallback = (name: string) => fallbackHtml(name, def.what);
  return {
    moduleLabel: def.moduleLabel,
    entries: () =>
      def.all.map((name) => ({
        name,
        moduleLabel: def.moduleLabel,
        description: guide.get(name) ?? fallback(name),
      })),
    hint: (col) => guide.get(col) ?? fallback(col),
  };
}
