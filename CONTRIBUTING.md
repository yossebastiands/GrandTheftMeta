# Contributing to GrandTheftMeta

Thanks for wanting to help! GrandTheftMeta is built and maintained by
**Apollo Flight Program — FiveM Asset Development Studio**
([Discord](https://discord.gg/BrXbYWKvrM)).

Contributions of all kinds are welcome: bug reports, feature ideas, docs, and
pull requests.

## Getting started

Prerequisites:

- **Node.js 18+** and npm
- **Rust** (stable, MSVC toolchain on Windows) — on Windows you can use the
  included `dev.bat` launcher, which sets up the Rust `PATH` automatically
- Tauri v2 system deps are pulled automatically on first build

```bash
cd app
npm install           # first time only
npm run tauri dev     # run the app with hot reload
```

## Project layout

Everything application-related lives under `app/`:

```
app/
├── src/              React + TypeScript frontend
│   ├── shared/       shared types (Rust-mirror models) + typed Tauri API wrappers
│   ├── ui/           reusable chrome (Toolbar, FilterBar, StatusBar, Toast)
│   └── features/     one folder per editor/domain:
│       └── handling/ the handling.meta editor (VehicleTable, …)
└── src-tauri/        Rust backend
    └── src/commands/ Tauri commands (scan_folder, update_files, pick_folder)
```

> `Dev-Notes/` is **private and gitignored** — internal design notes that are
> never published. Public documentation lives in `README.md`.

## Adding a new editor / feature

1. Add a `src/features/<name>/` folder for the UI (mirror the structure of
   `features/handling/`).
2. Add the corresponding Rust module(s) under `src-tauri/src/commands/`, expose
   them in `commands/mod.rs`, and register them with `invoke_handler` in
   `src-tauri/src/lib.rs`.
3. If a new capability is needed (file/dialog permissions), update
   `src-tauri/capabilities/default.json`.
4. Add types to `src/shared/models.ts` and wrappers to `src/shared/api.ts`.

## Code style & checks

- TypeScript is strict (`tsc`), keep it clean — run `npm run build`.
- Rust: keep `cargo test` green and code reasonably formatted.
- Follow existing naming/patterns in the touched feature folder.

## Testing

```bash
cd app/src-tauri && cargo test              # unit tests
cd app && npm run build                     # type-check + bundle the frontend
```

The two end-to-end tests are ignored by default because they run against a real
vehicle pack. To run them, point them at any folder of FiveM vehicle resources
(one subfolder per vehicle):

```powershell
$env:GT_TEST_VEHICLES = "C:\path\to\your\vehicles"
cd app/src-tauri && cargo test -- --ignored
```

## Git workflow

1. Fork the repo (or create a branch) and make your changes.
2. Run the checks above.
3. Open a pull request with a clear description of what changed and why.
4. Be kind and constructive in review threads.

Prefer small, focused PRs. For larger changes or questions, open a discussion
first so we can align before you invest the time.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](./LICENSE).
