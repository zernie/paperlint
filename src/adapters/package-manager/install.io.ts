/**
 * `ProjectInstall` over the disk and the package manager's own program: the lockfiles are looked
 * for in the project root, and the command runs there with the terminal's streams, so its progress
 * and its errors reach the person who ran `paperlint init`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectInstall } from "../../ports/project-install.ts";
import { addCommand, managerOf } from "./manager.ts";

export const projectInstall: ProjectInstall = {
  command: (root, spec) =>
    addCommand(
      managerOf((file) => existsSync(join(root, file))),
      spec,
    ),
  run: (root, [file, ...args]) => {
    const r = spawnSync(file, args, { cwd: root, stdio: "inherit" });
    if (r.error) return { ok: false, reason: r.error.message };
    if (r.signal !== null)
      return { ok: false, reason: `killed by ${r.signal}` };
    return r.status === 0
      ? { ok: true }
      : { ok: false, reason: `exited ${String(r.status)}` };
  },
};
