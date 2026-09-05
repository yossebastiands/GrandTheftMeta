# GrandTheftMeta

<p align="center">
  <img src="assets/GTM.png" width="300" alt="GrandTheftMeta" />
</p>

> **Built by Apollo Flight Program — FiveM Asset Development Studio** ·
> [Join the Discord](https://discord.gg/BrXbYWKvrM)

A **FiveM `.meta` file studio** desktop app built with **Tauri v2 + React + Vite + TypeScript**.

Point it at any folder of vehicle/weapon resources (any layout). It auto-discovers the `.meta`
files (file names vary wildly in the wild, so matching is **content-driven**), scans every
editable entry, shows them in a searchable/sortable table, and writes your edits **surgically
back into the original files** — preserving formatting, comments and untouched parameters.

Two ways to edit every meta kind: a **Bulk Editor** (one row per entry, all parameters in a
virtualised grid) and a **Single Editor** (one entry at a time, grouped by module). A full
**Glossary** view explains every parameter, and the same text powers per-cell "?" hints.

## Editors (v0.1.2 — all live)

| Category | Meta file | What one row is |
| --- | --- | --- |
| Vehicles | handling.meta | one `CHandlingData` (multi-entry fleets → one row per entry) |
| Vehicles | vehicles.meta | one vehicle model (`modelName`) |
| Vehicles | carcols.meta | one mod part / colour / list item |
| Vehicles | carvariations.meta | one variation / colour / livery / plate row |
| Vehicles | vehiclelayouts.meta | one seat / entry point / extra point |
| Vehicles | vehicleweapons.meta | one mounted weapon / ammo / weapon-data entry |
| Vehicles | weaponarchetypes.meta | one vehicle-mounted weapon model archetype |
| Weapons | weapons.meta | one `CWeaponInfo` firearm |
| Weapons | weaponanimations.meta | one personality-set × weapon animation entry |
| Weapons | weaponarchetypes.meta | one firearm weapon model archetype |
| Weapons | pedpersonality.meta | one weapon→clip binding (unholster / clip-set) |

## Features

- 🔍 **Content-driven smart scanning** — file names aren't trusted; XML shape + content decides.
  Works with `handling_polmav.meta`, per-weapon `pedpersonality.meta` folders, merged files, etc.
- ✏️ **Two editors per meta** — **Bulk** (all entries × all params in one grid) and **Single**
  (one entry at a time with grouped fields). Modified cells highlight yellow; edits are overlays
  until you click **Update Files**.
- 🔤 **Always-text values** — flags/hashes/hex are never coerced to numbers, so `C201081` and
  `0x00FFFFFF` are never corrupted. Empty edited cells are never written.
- 💾 **Surgical comment-aware write-back** — edits resolve entries by structural path against the
  raw text (commented-out blocks never shift item indexes) and patch only the changed values.
- 🔎 **Filter / sort / search** on every editor (text + native Type/Class or Kind/Set dropdowns).
- 📖 **Glossary view** — a parameter glossary for **every** meta (Vehicles + Weapons), registry-
  driven, searchable. Handling entries show the full original explanation (incl. flag tables) with
  a plain-language ↑/↓ summary on top.
- ❓ **In-editor hints** — every cell's "?" popover shows the same plain-language guide.
- 🎨 Dark dev-tool UI with an orange accent.

## Stack

| Layer | Tech |
| --- | --- |
| Desktop | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 |
| Table | TanStack Table v8 + TanStack Virtual |
| XML | `quick-xml` (scan) + custom comment-aware text nav (write) |

## Development

The application lives in `app/` (frontend `src/` + Rust backend `src-tauri/` together).

```bash
cd app
npm install          # first time only
npm run tauri dev    # run with HMR (browser preview at :1420 via ?demo / ?dv / ?dc / ?cv / ?vl / ?vw / ?wa / ?wp / ?pp)
npm run tauri build  # produce installer
```

> Requires Rust (rustup, stable MSVC toolchain) + Node 18+.
> On Windows, double-click `dev.bat` at the repo root — it sets up the Rust `PATH` and starts `app/`.

## Project layout (where things live)

- `app/src-tauri/src/commands/*.rs` — one scan/write module per meta (handling, vehicles, carcols,
  carvariations, vehiclelayouts, vehicleweapons, weaponanimations, weaponarchetypes,
  pedpersonality) + shared `scan.rs` (XML→DOM), `textnav.rs` (comment-aware path navigation),
  `update.rs` (surgical patchers), `pick.rs` (folder dialog). Register each module in
  `commands/mod.rs` + `lib.rs`.
- `app/src/App.tsx` — panel registry: `PanelId` union, `PANELS` config, one `useMetaDomain` per
  meta, dev demo effects (`?X` query params).
- `app/src/features/handling/` — shared editors (`VehicleTable`, `SingleHandlingEditor`,
  `ValueEditorDialog`, `GlossaryView`), demo data, and `glossaries/` (per-meta glossary modules +
  registry + plain-language handling guide).
- `app/src/ui/` — Sidebar (categories → Single/Bulk), Toolbar, StatusBar, Navbar, Toast, FilterBar.
- `assets/` — brand images; `Dev-Notes/` — private/internal notes (gitignored, never published).

## Tauri commands (Rust ↔ JS)

Per-meta pattern (X = meta): `scan_X(folderPath) → ScanResult { vehicles, columns, skipped }`,
`update_X_files(folderPath, changes) → UpdateResult`, plus `pick_folder()`. The generic list-style
metas reuse a shared scanner/writer engine (`carcols.rs` `collect_list_rows` /
`update_list_files_generic`).

## Testing

- Rust unit tests per module (comment-tolerance included) + `#[ignore]` real-pack e2e tests
  gated behind `GT_TEST_*` env vars (MBO/GGC packs): `cargo test --lib` and
  `cargo test --lib -- --ignored --nocapture`.
- Frontend: `npm run build` (tsc strict + vite).

## Building a release

```bash
cd app
npm run tauri build
```

Type-checks + bundles the frontend, compiles a Rust **release** build and produces installers under
`app/src-tauri/target/release/bundle/`:

```
nsis\GrandTheftMeta_<version>_x64-setup.exe    ← double-click installer
msi\GrandTheftMeta_<version>_x64_en-US.msi     ← MSI
```

Bump the version in **three** places before a release: `app/package.json`,
`app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml` (`Cargo.lock` updates on build).
On Windows the bundler auto-fetches NSIS/WiX; no code-signing cert is configured, so SmartScreen
warns "unknown publisher" until you add one.

## Publishing (open source)

This repo is open source (GPL-3.0). Releases are published from `main`:

```bash
git push origin main
git tag v0.1.2 && git push origin v0.1.2
gh release create v0.1.2 `
  "app\src-tauri\target\release\bundle\nsis\GrandTheftMeta_0.1.2_x64-setup.exe" `
  "app\src-tauri\target\release\bundle\msi\GrandTheftMeta_0.1.2_x64_en-US.msi" `
  --repo yossebastiands/GrandTheftMeta --title "GrandTheftMeta v0.1.2" --notes "..."
```

A committed `.github/workflows/release.yml` can build + attach installers on GitHub Actions
instead. `gh` CLI is authenticated as `yossebastiands` on this machine.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, code style, and
how to open a pull request.

## License

Distributed under the [GNU General Public License v3](./LICENSE).

---

<p align="center">
  <img src="assets/AFP.png" width="88" alt="Apollo Flight Program" /><br/>
  Built by <strong>Apollo Flight Program — FiveM Asset Development Studio</strong> ·
  <a href="https://discord.gg/BrXbYWKvrM">Join the Discord</a>
</p>
