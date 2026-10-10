#!/usr/bin/env node
// Checks that this machine has what SmartMap needs to build. Run with `npm run doctor`.
import { execSync } from "node:child_process";
import { platform } from "node:os";

const results = [];
const run = (cmd) => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
};
const check = (name, ok, detail, fix) => results.push({ name, ok, detail, fix });

// Node
const nodeMajor = Number(process.versions.node.split(".")[0]);
check("Node.js >= 22", nodeMajor >= 22, `v${process.versions.node}`, "Install Node 22 (`nvm install 22 && nvm use`; the repo has an .nvmrc).");

// Rust
const rustc = run("rustc --version");
check("Rust compiler", !!rustc, rustc ?? "not found", "Install Rust with rustup: https://rustup.rs");
const rustup = run("rustup --version");
check(
  "rustup (needed for extra targets)",
  !!rustup,
  rustup ?? "not found",
  "Install rustup (https://rustup.rs). Homebrew's `rust` can only build for this machine's own CPU.",
);
if (rustc?.includes("Homebrew")) {
  check(
    "rustc comes from rustup",
    false,
    "the rustc on PATH is Homebrew's, so `rustup target add` has no effect",
    "brew uninstall rust, then install via https://rustup.rs (or put ~/.cargo/bin first on PATH).",
  );
}
if (rustup) {
  const installed = (run("rustup target list --installed") ?? "").split("\n");
  const wanted = {
    darwin: ["aarch64-apple-darwin", "x86_64-apple-darwin"],
    win32: ["x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc"],
    linux: ["x86_64-unknown-linux-gnu"],
  }[platform()] ?? [];
  for (const t of wanted) {
    check(`Rust target ${t}`, installed.includes(t), installed.includes(t) ? "installed" : "missing", `rustup target add ${t}`);
  }
}

// Platform specifics
if (platform() === "darwin") {
  check("Xcode command line tools", !!run("xcode-select -p"), run("xcode-select -p") ?? "not found", "xcode-select --install");
}
if (platform() === "linux") {
  const webkit = run("pkg-config --modversion webkit2gtk-4.1");
  check(
    "webkit2gtk-4.1",
    !!webkit,
    webkit ?? "not found",
    "sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev",
  );
}
if (platform() === "win32") {
  check(
    "WebView2 runtime",
    true,
    "preinstalled on Windows 10/11",
    "If missing: https://developer.microsoft.com/microsoft-edge/webview2/",
  );
  check("MSVC build tools", !!run("where cl"), run("where cl") ? "found" : "not on PATH (fine if VS is installed)", "Install 'Desktop development with C++' from Visual Studio Build Tools.");
}

let failures = 0;
for (const r of results) {
  console.log(`${r.ok ? "✔" : "✘"} ${r.name}: ${r.detail}`);
  if (!r.ok) {
    failures++;
    console.log(`    fix: ${r.fix}`);
  }
}
console.log(failures ? `\n${failures} problem(s) found.` : "\nAll good.");
process.exitCode = failures ? 1 : 0;
