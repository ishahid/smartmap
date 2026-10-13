# Developing SmartMap 2

This covers setting up a machine, the everyday commands, and how SmartMap is built for each platform and CPU. For the 2004 Qt 3 version, see [BUILDING.md](BUILDING.md).

## One-time setup

| | All platforms | macOS | Windows | Linux (Debian/Ubuntu) |
|---|---|---|---|---|
| Node.js 22+ | `nvm install 22 && nvm use` (the repo has an `.nvmrc`) | | | |
| Rust (via **rustup**) | https://rustup.rs | | | |
| System pieces | | `xcode-select --install` | Visual Studio Build Tools with "Desktop development with C++"; WebView2 (preinstalled on 10/11) | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |

Then, from the repo root:

```bash
npm ci
```

```bash
npm run doctor
```

`npm run doctor` checks Node, Rust, rustup targets and the platform libraries, and prints the fix for anything missing.

**Use rustup, not Homebrew's `rust`.** Homebrew's Rust can only build for the machine's own CPU, so it can't produce the macOS universal build or any other extra target. If `rustc --version` says "Homebrew", run `brew uninstall rust` and install rustup.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run app:dev` | Runs the desktop app with hot reload (Vite for the UI, Rust rebuilds on change) |
| `npm run dev` | UI only, in a normal browser at http://localhost:1420. Fast for layout work. Rust commands return placeholders. |
| `npm run app:build` | Builds installers for this machine's OS and CPU |
| `npm test` / `npm run test:rust` / `npm run test:all` | Vitest, cargo test, or both |
| `npm run lint` | svelte-check, rustfmt check, clippy (warnings are errors) |
| `npm run doctor` | Checks your toolchain |

## Platform and CPU targets

| Target | npm script | Output | Build on | Rust target(s) |
|---|---|---|---|---|
| macOS universal (Apple Silicon + Intel) | `build:mac` | `.app`, `.dmg` | macOS only | `aarch64-apple-darwin` + `x86_64-apple-darwin` |
| macOS Apple Silicon | `build:mac:arm` | `.app`, `.dmg` | macOS only | `aarch64-apple-darwin` |
| macOS Intel | `build:mac:intel` | `.app`, `.dmg` | macOS only | `x86_64-apple-darwin` |
| Windows x64 | `build:win` | `.msi`, `.exe` (NSIS) | Windows | `x86_64-pc-windows-msvc` |
| Windows ARM64 | `build:win:arm` | `.exe` (NSIS only; WiX can't target ARM64) | Windows (x64 or ARM) | `aarch64-pc-windows-msvc` |
| Windows x64, cross-built | `build:win:cross` | `.exe` (NSIS only) | macOS or Linux, **experimental** | `x86_64-pc-windows-msvc` + `cargo-xwin` |
| Linux x64 | `build:linux` | `.deb`, `.rpm`, `.AppImage` | Linux x64 | `x86_64-unknown-linux-gnu` |
| Linux ARM64 | `build:linux:arm` | `.deb`, `.rpm`, `.AppImage` | Linux ARM64 | `aarch64-unknown-linux-gnu` |

Add a Rust target once with `rustup target add <target>`. For example, on an Apple Silicon Mac, the universal build needs:

```bash
rustup target add x86_64-apple-darwin
```

Output lands in `src-tauri/target/<target>/release/bundle/`. A host build without `--target` lands in `src-tauri/target/release/bundle/`.

### Why not build everything from one machine?

Tauri apps link against each OS's own web view and toolchain, so true cross-compiling is limited:

- **macOS builds need macOS.** Apple's SDK and `.dmg` tooling only run there.
- **Linux builds need Linux.** WebKitGTK and the AppImage tooling are Linux-only. From a Mac, use a Linux VM or container with the `apt` packages above.
- **Windows builds** can be cross-compiled from macOS/Linux with `cargo-xwin` and NSIS (`cargo install cargo-xwin`, `brew install nsis` or `apt install nsis llvm lld`). Tauri marks this experimental, and it can't make `.msi` files.

**CI is the real build farm.** GitHub provides macOS, Windows, Linux x64 and Linux ARM64 runners, so every installer comes from a native machine (below).

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `master` and every pull request. On Ubuntu 22.04, macOS and Windows it runs:

1. `npm ci`
2. `npm run lint`
3. `npm run test:all`

## Releases

`.github/workflows/release.yml` builds every installer in the target table (except the experimental cross-build) and attaches them to a **draft** GitHub release:

| Job | Runner | Output |
|---|---|---|
| macOS (universal) | `macos-latest` | `.dmg` |
| Windows x64 | `windows-latest` | `.msi`, `.exe` |
| Windows ARM64 | `windows-latest` (cross-compiled) | `.exe` |
| Linux x64 | `ubuntu-22.04` | `.deb`, `.rpm`, `.AppImage` |
| Linux ARM64 | `ubuntu-22.04-arm` | `.deb`, `.rpm`, `.AppImage` |

Linux builds run on 22.04 deliberately: binaries built against an older glibc also run on newer distros.

To cut a release:

1. Bump `version` in `package.json` and `src-tauri/Cargo.toml` (Tauri reads the app version from `package.json`).
2. Commit, then tag and push:

   ```bash
   git tag v2.0.0
   ```

   ```bash
   git push origin v2.0.0
   ```

3. Wait for the workflow, review the draft release on GitHub, then publish it.

You can also start the workflow by hand from the Actions tab ("Run workflow") to get installers without tagging.

### Signing

Builds are **unsigned**, which is fine for personal use:

- **macOS:** Gatekeeper blocks the first launch. Right-click the app → Open → Open. (Signing and notarisation need a paid Apple Developer account. tauri-action reads `APPLE_CERTIFICATE`, `APPLE_ID` and related secrets if you add them later.)
- **Windows:** SmartScreen may warn. Choose More info → Run anyway.
- **Linux:** no signing needed. Make the AppImage executable with `chmod +x`.

## Project layout

```
src/                  Svelte 5 + TypeScript UI
  lib/api.ts          every invoke() call to Rust lives here
  lib/map/            MapView, basemaps, MapLibre setup (maplibre.ts)
  lib/util/           pure helpers + *.test.ts (Vitest)
src-tauri/            Rust core (Tauri 2)
  src/lib.rs          app builder, command registration
  src/commands.rs     #[tauri::command] functions
  src/crs.rs          coordinate systems and reprojection (proj4rs)
  src/io/             one reader per file format
  tests/fixtures/     small hand-written test files
  tauri.conf.json     window, CSP, bundle settings
  capabilities/       permissions granted to the UI
  icons/              generated from app-icon.svg (`npx tauri icon src-tauri/app-icon.svg -o src-tauri/icons`)
scripts/doctor.mjs    toolchain checker
.github/workflows/    ci.yml, release.yml
legacy/               the 2004 Qt 3 app and thesis (read-only history)
```

## Debugging tools

- **See what a reader produces:** this prints the exact JSON the UI receives (a list of layers; most files give one). It works for any supported format.

  ```bash
  cargo run --manifest-path src-tauri/Cargo.toml --example dump_layer -- legacy/source/data/world.shp
  ```

- **Load data in browser mode.** `npm run dev` can't show the native Open dialog. Dump a layer into the git-ignored `.dev-data/` folder:

  ```bash
  cargo run --manifest-path src-tauri/Cargo.toml --example dump_layer -- legacy/source/data/world.shp > .dev-data/world.json
  ```

  Then run this in the browser console (it accepts one layer or a list):

  ```js
  __smartmapAddLayer(await (await fetch("/.dev-data/world.json")).json())
  ```

- **Rust tests with output:** `cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture`.

## Gotchas

- **Keep Tauri versions in step.** The `tauri` crate and the `@tauri-apps/api` / `@tauri-apps/cli` npm packages must share a major.minor version (currently 2.11), or `tauri build` refuses to run. The npm packages are pinned with `~2.11` for that reason. Bump them together.
- **Import MapLibre from `src/lib/map/maplibre.ts`**, never from `"maplibre-gl"` directly. That module sets the worker URL. Without it, tiles fail to load in the packaged app (`tauri://` origin) and in Vite dev ("Worker failed to load").
- **CSP.** `tauri.conf.json` only allows network access to `tiles.openfreemap.org`. Add new tile or style hosts to `img-src` and `connect-src`, or they'll be blocked silently.
- **TypeScript is pinned to 6.x** because `svelte-check` doesn't support TypeScript 7 yet.
