# GrandTheftMeta

<p align="center">
  <img src="assets/GTM.png" width="300" alt="GrandTheftMeta" />
</p>

> **Built by Apollo Flight Program — FiveM Asset Development Studio** ·
> [Join the Discord](https://discord.gg/BrXbYWKvrM)

A **FiveM `handling.meta` bulk editor** desktop app built with **Tauri v2 + React + Vite + TypeScript**.

Point it at any folder containing FiveM vehicle resources (one subfolder per vehicle —
e.g. `resources/[mbo-vehicles]`). It auto-finds every `handling.meta`, classifies each vehicle
from its native `vehicles.meta` data, presents every vehicle + parameter in one editable table,
and writes your edits **surgically back into the original files** — preserving all XML
formatting, comments and untouched parameters.

It replaces the classic export → edit-in-Excel → import workflow with a purpose-built table UI
that operates directly on the files.

## Features

- 🔍 **Scan** — recursively finds `handling.meta` per vehicle folder using the same priority
  as the reference tool: root-level file → `fxmanifest.lua` `HANDLING_FILE` reference → shallowest.
  Multi-entry metas (e.g. Naval fleets) produce one row per `CHandlingData`.
- ✏️ **Inline editing** — click any cell to edit; modified cells are highlighted yellow.
- 🔤 **Always-text columns** — `strModelFlags`, `strHandlingFlags`, `strDamageFlags`,
  `AIHandling`, `handlingType`, `uWeaponHash` are never coerced to numbers, so hex values
  like `C201081` are never corrupted.
- 💾 **Surgical update** — regex text patching per `CHandlingData` block matched by exact
  folder name **and** exact `handlingName`; only changed values are written.
- 🔎 **Filter / sort** — text search + native Type & Class dropdowns + click-to-sort columns.
- 🏷️ **Native classification** — every row is tagged with its GTA vehicle **Type** and **Class**
  straight from `vehicles.meta` (`<type>` / `<vehicleClass>`), so it works with any vehicle pack —
  no folder-naming conventions required.
- 🎨 Dark dev-tool UI with an orange accent.

## Stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| Desktop  | Tauri v2 (Rust)                                                 |
| Frontend | React 18 + TypeScript + Vite                                    |
| Styling  | Tailwind CSS v3                                                 |
| Table    | TanStack Table v8 + TanStack Virtual                            |
| XML      | `quick-xml` (scan) + `regex` (surgical patch) on the Rust side  |

## Development

The application lives in `app/` (frontend `src/` + Rust backend `src-tauri/` together).

```bash
cd app
npm install          # first time only
npm run tauri dev    # run with HMR
npm run tauri build  # produce installer
```

> Requires Rust (rustup, stable MSVC toolchain) + Node 18+.
> On Windows, double-click `dev.bat` at the repo root — it sets up the Rust `PATH` and starts `app/`.

## Tauri commands (Rust ↔ JS)

- `scan_folder(folderPath)` → `ScanResult { vehicles, columns, skipped }`
- `update_files(folderPath, changes)` → `UpdateResult { files_changed, params_applied, params_unchanged, errors }`
- `pick_folder()` → `Option<string>` native folder picker

## Behaviour notes (parity with the Python reference)

- **Empty cells are never written** — like the Excel importer, an emptied cell is ignored.
- Numerically-equal values (e.g. file `2.000000` vs cell `2`) are treated as *unchanged* and
  are not written back.
- Vector params split into `.x` / `.y` / `.z` columns; sub-handling params are prefixed by
  their item type (e.g. `CFlyingHandlingData.fThrust`), with duplicate item types numbered
  `_2`, `_3`, … (weapon slots etc.).
- `uWeaponHash` / `WeaponVehicleModType` nested `<Item>` lists are rebuilt in place and keep
  their original slot count (empty weapon slots are not dropped).

## Building a release

```bash
cd app
npm run tauri build
```

This type-checks + bundles the frontend, compiles a Rust **release** build and produces the
installers under `app/src-tauri/target/release/bundle/`:

```
nsis\GrandTheftMeta_<version>_x64-setup.exe    ← double-click installer
msi\GrandTheftMeta_<version>_x64_en-US.msi     ← MSI
```

Pick a single target with, e.g., `npm run tauri build -- --bundles nsis`. On Windows the bundler
auto-fetches NSIS/WiX; no code-signing cert is configured, so SmartScreen will warn
"unknown publisher" until you add one.

## Publishing (open source)

1. Push the repo to GitHub (this project is set up as open source).
2. The repo ships with an MIT `LICENSE` — keep it (or swap it) before your first public release.
3. Tag a version — the committed `.github/workflows/release.yml` builds the Windows installer on
   GitHub Actions and creates a **draft Release** with the assets attached:

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. Publish the draft release (add notes, or extend the workflow to do it automatically).

> Internal/dev notes live in `Dev-Notes/` — that folder is **gitignored** and never published.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, code style,
and how to open a pull request.

## License

Distributed under the [MIT License](./LICENSE).

---

<p align="center">
  <img src="assets/AFP.png" width="88" alt="Apollo Flight Program" /><br/>
  Built by <strong>Apollo Flight Program — FiveM Asset Development Studio</strong> ·
  <a href="https://discord.gg/BrXbYWKvrM">Join the Discord</a>
</p>
