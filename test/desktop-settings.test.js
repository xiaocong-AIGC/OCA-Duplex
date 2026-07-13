import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleDesktopRequest } from "../runtime/desktop-data.js";
import { defaultConfig } from "../runtime/config.js";

test("desktop settings add and remove workspace mappings", async () => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oca-desktop-settings-"));
  const config = defaultConfig(vaultRoot, "en-US");
  config.capture.mode = "manual";
  config.capture.workspaces = [{ path: vaultRoot, project: "Primary" }];
  const secondPath = path.join(vaultRoot, "second-project");

  const added = await handleDesktopRequest(config, {
    method: "settings.add_workspace",
    params: { path: secondPath, project: "Second Project" }
  });
  assert.equal(added.workspaces.at(-1).project, "Second Project");

  const removed = await handleDesktopRequest(config, {
    method: "settings.remove_workspace",
    params: { path: secondPath }
  });
  assert.equal(removed.workspaces.some((entry) => entry.project === "Second Project"), false);

  const watch = await handleDesktopRequest(config, {
    method: "settings.set_auto_watch",
    params: { enabled: false }
  });
  assert.equal(watch.enabled, false);
  assert.equal(config.capture.autoWatch, false);
  await fs.rm(vaultRoot, { recursive: true, force: true });
});
