import { spawnSync } from "node:child_process";

export function runLocalCommand(command, args = []) {
  if (process.platform === "win32") {
    if (/\.exe$/i.test(String(command))) {
      return spawnSync(command, args, { encoding: "utf8", windowsHide: true });
    }
    const line = [command, ...args].map((value) => {
      const text = String(value);
      if (/[\r\n&|<>^%]/.test(text)) throw new Error(`不安全的命令参数：${text}`);
      return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }).join(" ");
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", line], { encoding: "utf8", windowsHide: true });
  }
  return spawnSync(command, args, { encoding: "utf8", windowsHide: true });
}

export function commandText(result) {
  return String(result.stdout || result.stderr || "").trim();
}

export function parseVersion(value) {
  const match = String(value ?? "").match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  const a = Array.isArray(left) ? left : parseVersion(left);
  const b = Array.isArray(right) ? right : parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}
