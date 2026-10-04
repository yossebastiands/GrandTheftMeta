# Changelog

All notable changes to GrandTheftMeta. Version numbers live in `app/package.json`,
`app/src-tauri/tauri.conf.json` and `app/src-tauri/Cargo.toml` (keep them in sync).

## [0.2.0] — 2026-10-04

The **Asset Workshop** arrives: a second workshop beside the meta editors, with a third tool that
takes you from a folder of streamed models to a **drop-in FiveM weapon resource** — or a whole pack
of weapons in one resource.

### Added — the Asset Workshop section

- A second top-level section (`Asset Workshop`) with its own rail and a contextual secondary navbar,
  so asset tools no longer live inside the meta editors.
- Home screen rewritten around the two workshops.

### Added — UV Map Generator (Asset Workshop)

- Import a `.ydr` / `.yft` and get a **paint-ready livery template** plus the model to check it
  against — parsed directly from the resource, no CodeWalker/OpenIV export step and no Blender
  round-trip. Read-only: nothing is written back.
- Template view (white islands over the asset's own texture tiles, optional cage), Model view (front
  / side / top / rear, depth-buffered, islands in their template colours, click a part to target its
  material) and a Split view with both.
- UV targeting by material (all / paint-livery-sign-decal / one material) and by UV channel, tile
  detection by mass (multi-tile assets such as aircraft lay out over `V 1–2`), exports at
  1024 / 2048 / 4096 px per tile plus a colour reference and the model guide.
- Gen8 / legacy versions (`0xA2` / `0xA5`) supported; GTA V Enhanced (gen9) drawables are detected
  and reported instead of being mis-parsed.

### Added — Weapon Templates (Asset Workshop, read-only)

- Catalogue of every base weapon in a folder of metas: identity (`Slot`, `Group`, wheel slot,
  audio, ammo, fire type, damage type, clip size, range, `HumanNameHash`, wheel order), all tuning
  parameters, animation-personality coverage, pedpersonality bindings and `weaponarchetypes` models.
- Flags templates whose own animation/personality files still name a *sibling* weapon id (a defect
  that would travel with a clone), and suggests the components a template's id implies.

### Added — Weapon Generator

- Clones a base weapon into a new add-on weapon: the template's entry is lifted out **as text** and
  patched in place (comment-aware, never re-serialised), so hand-tuned formatting survives.
- Narrow rename surface on purpose: in `weapons.meta` only `Name`, `Slot`, `SlotNavigateOrder/Entry`
  and `HumanNameHash` change (a weapon id also appears inside `<ReticuleStyleHash>` and
  `WEAPON_EFFECT_GROUP_*`); in `weaponanimations.meta` / `pedpersonality.meta` the ids are
  retargeted wholesale, which those files can take.
- `weaponarchetypes.meta` is generated from the streamed drawables (one `CWeaponModelInfo` per
  non-LOD `.ydr`, `lodDist` 500 for the weapon model and 300 for the rest).
- **Attachment slots**: components are grouped by the bone they attach to — one `<AttachPoints>`
  item per bone with every alternative nested, in the order you queued them (that order is the
  weapon-wheel cycle order), one `default` per slot. The template's own slot list is replaced
  instead of stacked on top of.
- Asset classification (`main` / `lod` / `mag1` / `mag2` / `flashlight` / `suppressor` / `scope` /
  `grip` / `rail` / `attachment` / `texture`) with the biggest `main` drawable proposed as the model.
- Everything is previewed first: a dry-run plan lists every file (create / update / append / copy)
  with byte counts, every value it will write, and every weapon id it retargets. **Write** refuses
  while a conflict is reported.

### Added — Pack mode

- N weapons → **one** resource: one `fxmanifest.lua` (`metas/**` globs + an ownership marker), one
  `cl_weaponNames.lua` (`AddTextEntry` per weapon, never duplicated), one `metas/<slug>/` folder and
  one `stream/<slug>/` copy per weapon.
- Duplicate detection is owner-aware: a duplicate id, resource folder, slot order or component name
  only conflicts when a **different** weapon claims it, so re-writing and growing a pack are both
  idempotent.
- Slot orders: explicit orders are reserved first, everything else is allocated from `max + 1` of
  the orders already in the resource; a weapon that is already in the resource keeps its order, so
  re-saving a pack never walks it up the weapon wheel.

### Added — presets

- The queued weapons (stats, components, slots) plus the output folder can be saved to and loaded
  from a JSON preset (`app`/`version` tagged, pretty-printed). A foreign file or a newer preset is
  refused with an explanation.

### Added — docs

- [`docs/weapon-pack-generator.md`](./docs/weapon-pack-generator.md): card-by-card walkthrough,
  output layout, the rules the generator follows, a conflict-vs-warning table, and how to run the
  real-pack verification tests.

### Changed

- Shared text engine: added creation primitives (`clone_item`, `insert_element`, `clear_children`,
  `retarget_identifiers`) so tools can add entries, not just patch existing values.
- `scan::scalar_leaves` is now the single definition of "editable scalar leaf" (used by the weapons
  editor and the template catalogue).
- Home screen and README describe the two workshops and the three Asset Workshop tools.

## [0.1.3] — 2026-09-06

- Performance Dashboard: bars / radar / compare / rankings / distributions, type + class filters and
  a compact vehicle selector.
- EXPERIMENTAL badge plus a Formula page documenting the exact math per metric.
- Editor performance pass (memoised panes, deferred bulk filtering, cached glossary hints,
  memoised single-editor form).

## [0.1.2] — 2026-09-06

- All 11 meta editors live, each with its own glossary and in-editor hints.

## [0.1.1] — 2026-09-05

- Glossary and navigation views, handling hints, grid performance/UX polish, GPL-3.0 licence + docs.

## [0.1.0] — 2026-09-05

- First open-source release: content-driven scanning of vehicle and weapon `.meta` files, bulk +
  single editors, glossary, surgical comment-aware write-back.
