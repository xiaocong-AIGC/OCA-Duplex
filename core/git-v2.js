import path from "node:path";
import { spawn } from "node:child_process";

function run(command, args, cwd, acceptedCodes = [0]) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout: stdout.trim(), stderr: stderr.trim() };
      if (acceptedCodes.includes(code)) resolve(result);
      else reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
    });
  });
}

function relativePath(filePath, config) {
  const value = path.isAbsolute(filePath) ? path.relative(config.vaultRoot, filePath) : filePath;
  return value.replace(/\\/g, "/");
}

export function planGitActions(writeResults, config) {
  const files = [...new Set(writeResults
    .filter((result) => ["created", "updated"].includes(result.outcome))
    .map((result) => relativePath(result.absolute_path, config)))];
  if (files.length === 0) return [];
  return [
    { command: "git", args: ["add", "--", ...files], files },
    { command: "git", args: ["commit", "-m", config.write.commitMessage], files }
  ];
}

export async function currentHead(config) {
  return (await run("git", ["rev-parse", "HEAD"], config.vaultRoot)).stdout;
}

export async function commitPaths(files, config, message) {
  const relativeFiles = [...new Set(files.map((file) => relativePath(file, config)))];
  if (relativeFiles.length === 0) return { committed: false, files: [], commit_hash: await currentHead(config), diff_summary: "" };
  await run("git", ["add", "--", ...relativeFiles], config.vaultRoot);
  const quiet = await run("git", ["diff", "--cached", "--quiet", "--", ...relativeFiles], config.vaultRoot, [0, 1]);
  if (quiet.code === 0) return { committed: false, files: relativeFiles, commit_hash: await currentHead(config), diff_summary: "" };
  const diff = await run("git", ["diff", "--cached", "--stat", "--", ...relativeFiles], config.vaultRoot);
  const commit = await run("git", ["commit", "-m", message, "--", ...relativeFiles], config.vaultRoot);
  return {
    committed: true,
    files: relativeFiles,
    commit_hash: await currentHead(config),
    diff_summary: diff.stdout,
    commit_output: commit.stdout,
    actions: [
      { command: "git", args: ["add", "--", ...relativeFiles], files: relativeFiles },
      { command: "git", args: ["commit", "-m", message, "--", ...relativeFiles], files: relativeFiles }
    ]
  };
}

export async function executeGitActions(writeResults, config) {
  const files = writeResults
    .filter((result) => ["created", "updated"].includes(result.outcome))
    .map((result) => result.absolute_path);
  return commitPaths(files, config, config.write.commitMessage);
}

export async function commitRuntimeState(stateResult, config) {
  return commitPaths([stateResult.absolute_path], config, "oca-duplex: record runtime state");
}
