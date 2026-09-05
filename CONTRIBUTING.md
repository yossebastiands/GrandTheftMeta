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

## How contributions work (pull-request flow)

`main` is protected — nobody pushes to it directly. Every change lands through a
**pull request** that is reviewed and merged by the maintainers
(Apollo Flight Program).

- **Who can push?** Only maintainers (repo owner / collaborators with write
  access). As an external contributor you cannot push to this repo — that's
  normal and expected.
- **How to contribute:** *fork* the repo, make changes in your fork, then open a
  **Pull Request (PR)** here. Maintainers review it and merge it when ready.
- **Releases:** created by maintainers pushing version tags (`v0.1.0`, …). A
  merged PR never ships an installer on its own.

## Contributing step-by-step (fork & PR)

1. **Fork** the repo on GitHub (top-right "Fork" button).
2. **Clone your fork** and add the original as `upstream`:

   ```bash
   git clone https://github.com/<your-username>/GrandTheftMeta.git
   cd GrandTheftMeta
   git remote add upstream https://github.com/yossebastiands/GrandTheftMeta.git
   ```

3. **Create a branch** for your change:

   ```bash
   git checkout -b fix/my-change
   ```

4. Make your changes, then **run the checks** from the [Testing](#testing) section.
5. **Commit and push** to your fork:

   ```bash
   git add .
   git commit -m "Describe your change"
   git push -u origin fix/my-change
   ```

6. **Open a Pull Request** here with a clear title and a short description of
   what changed and why.
7. **Address review feedback** — push more commits to the same branch and they
   update the PR automatically.
8. A maintainer reviews and **merges** your PR. 🎉

Later, keep your fork in sync:

```bash
git fetch upstream
git merge upstream/main
```

Prefer small, focused PRs. For larger changes or questions, open a
discussion first so we can align before you invest the time. Be kind and
constructive in review threads.

## License

By contributing you agree that your contributions are licensed under the
[GNU General Public License v3](./LICENSE).
