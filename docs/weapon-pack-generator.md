# Weapon Tools — templates, single weapon, pack mode

Three tools in **Asset Workshop → Workspace** that take you from "I have a folder of `.ydr`s" to a
drop-in FiveM weapon resource — or a whole pack of weapons sharing one manifest.

| Tool | What it gives you |
| --- | --- |
| **Weapon Templates** | A read-only catalogue of the base weapons you can clone from, derived from *your own* vanilla/pack metas |
| **Weapon Generator** | Clones a base weapon into a new add-on weapon: retargets every weapon reference, generates the archetypes from your streamed models, wires the components and attachment slots, writes the resource |
| **Weapon Generator → Pack mode** | The same thing for N weapons at once, in **one** resource folder |

Nothing is written until you press **Write**, and the writer refuses while any conflict is reported.
Every write goes through the same comment-aware text engine the editors use: the template's bytes are
cloned and patched, never re-serialised, so hand-tuned whitespace, comments and untouched parameters
survive.

---

## 1 · Weapon Templates (catalogue)

Point it at a folder that holds metas — a vanilla `mods/update/update.rpf` dump, a pack's
`metas/`, or a per-weapon folder — and it lists every `<Item type="CWeaponInfo">` it finds:

- **Identity**: id, model, `Slot`, `Group`, weapon-wheel slot, audio item, ammo ref, fire type,
  damage type, clip size, weapon range, `HumanNameHash`, `SlotNavigateOrder` order.
- **Tuning parameters**: every scalar leaf in the entry, so you can see what a template actually
  carries before you clone it.
- **Coverage**: how many animation-personality sets name this weapon id, how many pedpersonality
  bindings it has, which `weaponarchetypes` models it already declares, and its component folders.
- **Warnings**: templates whose own animation/personality files still name a *sibling* weapon id
  (a defect that travels with the clone — the generator retargets it for you, but you should know).

Read-only: this tool never writes. Use it to pick a **per-weapon** folder as your template.

---

## 2 · The generator, card by card

| Card | What you do |
| --- | --- |
| **1 · Base template** | Pick the folder, then the weapon to clone. A shared vanilla `weaponanimations.meta` (one that names many weapons) is reported as a blocker — that file is not a per-weapon template |
| **2 · Assets** | Point at the folder with the streamed `.ydr` / `.ytd` files. Each file is classified (`main`, `lod`, `mag1`, `mag2`, `flashlight`, `suppressor`, `scope`, `grip`, `rail`, `attachment`, `texture`) and the biggest `main` drawable is proposed as the weapon model |
| **3 · Identity & stats** | Weapon id, display name, model, slot order, audio, ammo ref, damage type, fire type, damage, range, clip size, fire-rate modifier, headshot modifier, reload rate |
| **4 · Component catalogue** | Tick the components to attach; filter by name/kind or by **attach bone** ("show me the clip candidates") |
| **5 · Attachment slots** | The options grouped per bone: reorder them (that order is the weapon-wheel cycle order), mark one `default` per slot, detach |
| **6 · Pack queue** | `Add to pack` queues the weapon above; the queue is the pack |
| **7 · Review & write** | Output folder, mode switch, **Preview** / **Preview pack**, **Write**, and the preset row |

### Modes

- **Single** — one weapon (or just the weapon in the form) → its own folder under `metas/`.
- **Pack (N)** — every weapon in the queue → one resource: one `fxmanifest.lua`, one
  `cl_weaponNames.lua`, one folder per weapon. This is how an add-on weapon pack is normally built,
  and it is the part the original toolkit could not do.

### What the review panel tells you

- **Files** it will create / update / append / copy, with byte counts, per weapon and for the
  resource (`shared_files` = manifest + label list).
- **Weapon ids retargeted** — e.g. `weaponanimations.meta: WEAPON_COMBATPISTOL ×6 → WEAPON_GLOCK17`.
- **Value writes** — every field it patches, including
  `AttachPoints → 2 slot(s) on 2 bone(s), 3 option(s)` and, when the template carried its own list,
  `AttachPoints → replaced the template's own 6 slot block(s), 36 option(s)`.
- **Slot orders allocated** — weapons you left blank get the next free order.
- **Conflicts** (blocks the write) and **warnings** (does not).

---

## 3 · What lands on disk

```
<output folder>/
├── fxmanifest.lua                  ← written once for the resource (metas/** globs)
├── cl_weaponNames.lua              ← AddTextEntry(id, label) per weapon, never duplicated
├── metas/
│   ├── glock17/
│   │   ├── weapons.meta            ← the cloned entry, renamed, AttachPoints generated
│   │   ├── weaponarchetypes.meta   ← one CWeaponModelInfo per streamed drawable
│   │   ├── weaponanimations.meta   ← retargeted personality animation sets
│   │   ├── pedpersonality.meta     ← retargeted clip bindings
│   │   └── components/<COMPONENT_…>/weaponcomponents.meta
│   └── m4/…                        ← the next weapon of the pack
└── stream/
    ├── glock17/…                   ← the .ydr / .ytd files, copied
    └── m4/…
```

`metas/**` globs mean a pack grows by adding a folder: run the tool again with the same output
folder and it appends, keeping the manifest and the label list intact.

---

## 4 · The rules the generator follows

These are the behaviours worth knowing before you trust the output:

1. **The rename surface is narrow.** In `weapons.meta` only `Name`, `Slot`,
   `SlotNavigateOrder/Entry` and `HumanNameHash` are rewritten, because a weapon id also appears
   as a `<ReticuleStyleHash>` value and a `WEAPON_EFFECT_GROUP_*` id looks just like it. Whole-file
   retargeting happens **only** in `weaponanimations.meta` / `pedpersonality.meta`, whose only
   weapon-id tokens are ids.
2. **One attachment slot per bone.** `<AttachPoints>` gets one `<Item>` per `WeaponAttachBone`,
   with every option nested in the order you queued them; `<Default value="true" />` marks the one
   equipped at spawn. The template's own list is **replaced**, not appended to.
3. **A definition is not an attachment.** A weapon may attach components that its own
   `weaponcomponents.meta` does not define (other resources can provide them); the generator only
   writes definitions it can read, and it asks for the missing file instead of silently dropping
   an option.
4. **Slot orders are allocated, never guessed twice.** Explicit orders in the pack are reserved
   first, then free orders are handed out from `max + 1` of the orders already in the resource. A
   weapon that is already in the resource **keeps** its order, so re-saving a pack (or growing it)
   does not walk it up the weapon wheel.
5. **Duplicates only conflict when a different owner claims them.** Same weapon id twice in a pack,
   two weapons mapping to the same resource folder, two weapons claiming one slot order, or one
   component name owned by another weapon folder — those block. Re-writing the weapons the resource
   already owns is normal and does not.
6. **Labels are never duplicated.** `AddTextEntry` lines already present in `cl_weaponNames.lua`
   are skipped, so re-writing a pack does not grow the file.
7. **Its own output is recognisable.** `fxmanifest.lua` carries a marker comment; the writer
   refuses to overwrite a manifest or label list it did not write.

### Conflicts vs warnings

| Blocks the write | Only warns |
| --- | --- |
| id not matching `WEAPON_[A-Z0-9_]+`, empty display name | no slot order set (defaulted to 300) |
| animation/personality file missing next to the template; template id not found | no assets folder (empty archetypes, nothing streamed) |
| animation/personality file naming many weapons (shared vanilla file) | no model found (the template's `<Model>` is kept) |
| component listed twice; component source file unreadable | component without a `<WeaponAttachBone>` |
| `metas/<slug>/` already exists without *overwrite* | `<PickupHash>` still pointing at the template's pickup |
| `fxmanifest.lua` / `cl_weaponNames.lua` not written by this app | a slot with two options marked default; a slot with none |
| duplicate id / resource folder / slot order / component owner in a pack | no components chosen → the template's slots are inherited |

---

## 5 · Presets

The whole queue (weapons, stats, components, slots) plus the output folder can be **saved as JSON**
and loaded again — a diffable, commit-able description of a pack. The file is tagged with the app
name and a version; a foreign JSON file or a newer preset is refused with an explanation.

---

## 6 · Not implemented (yet)

- **Texture inspector** and **mesh export** — the Asset Workshop's other planned tools.
- `<PickupHash>` — a new weapon keeps the template's pickup (warned about). Define your own pickup
  if the weapon needs its own ground model.
- Model/viewer preview of a generated weapon — use the **UV Map Generator** on the same `.ydr`.
- Component **effect values** (damage/accuracy modifiers, wheel visibility, HUD values) are passed
  through from the component you cloned; only the name, model and clip size are edited today.

---

## 7 · Advanced: verify against a real pack

The generator's tests can be pointed at real data on disk (they are `#[ignore]` by default):

```powershell
$env:GT_TEST_WPN_TEMPLATES = "<a folder of base-weapon metas>"
$env:GT_TEST_WPN_FIXTURE   = "<pack>\resources\Weapons\metas\glock17"     # a generated weapon
$env:GT_TEST_WPN_ASSETS    = "<pack>\resources\Weapons\stream\glock17"    # optional
$env:GT_TEST_WPN_HANDMADE  = "<pack>\resources\Weapons\metas\m6ic"        # a hand-made weapon
cargo test --lib weapon_export_parity_glock17 -- --ignored --nocapture
cargo test --lib weapon_pack_write_real_folders -- --ignored --nocapture
cargo test --lib hand_made_weapon_slots_are_reproducible -- --ignored --nocapture
```

The first rebuilds a shipped weapon from a spec read back out of it and compares field by field; the
second writes two weapons into one resource, re-writes it, grows it with a third and checks the slot
orders; the third rebuilds a hand-authored weapon's attachment slots from its own component file.

### Dev fixtures

With the dev server running (`npm run dev`), the URL query params load synthetic data so you can look
at every state without a backend: `?wtdemo` (catalogue), `?wggen` (generator), `?wggen=blocked`
(refusal state), `?wggen=pack` / `?wggen=packblocked` (pack queue), `?wggen=slots` (attachment slots).

---

## Licensing note

The template catalogue is derived from **your** metas at runtime. No Rockstar-derived template data
and no third-party generator's data ships with this app.
