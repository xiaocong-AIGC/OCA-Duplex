import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { inject } from "postject";

const exec = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary = path.join(root, "dist", "sidecar");
const bundle = path.join(temporary, "oca-duplex-sidecar.cjs");
const blob = path.join(temporary, "oca-duplex-sidecar.blob");
const targetDir = path.join(root, "desktop", "src-tauri", "binaries");
const triple = process.platform === "win32" ? "x86_64-pc-windows-msvc" : process.platform === "darwin" ? "aarch64-apple-darwin" : "x86_64-unknown-linux-gnu";
const extension = process.platform === "win32" ? ".exe" : "";
const executable = path.join(targetDir, `oca-duplex-sidecar-${triple}${extension}`);

await fs.mkdir(temporary, { recursive: true });
await fs.mkdir(targetDir, { recursive: true });
await build({
  entryPoints: [path.join(root, "bin", "oca-duplex-sidecar.js")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  define: { "import.meta.url": JSON.stringify(process.platform === "win32" ? "file:///C:/snapshot/oca-duplex/bin/oca-duplex-sidecar.js" : "file:///snapshot/oca-duplex/bin/oca-duplex-sidecar.js") },
  banner: { js: "globalThis.__filename = __filename; globalThis.__dirname = __dirname;" }
});
await fs.writeFile(path.join(temporary, "sea-config.json"), JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }, null, 2));
await exec(process.execPath, ["--experimental-sea-config", path.join(temporary, "sea-config.json")]);
await fs.copyFile(process.execPath, executable);
await inject(executable, "NODE_SEA_BLOB", await fs.readFile(blob), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
});
if (process.platform !== "win32") await fs.chmod(executable, 0o755);
const stat = await fs.stat(executable);
process.stdout.write(`${JSON.stringify({ executable, bytes: stat.size }, null, 2)}\n`);
