import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir } from "../../../test/support.ts";
import { addCommand, managerOf, projectInstall } from "./index.ts";

describe("the package manager, read from the lockfile", () => {
  it("each lockfile names its manager; none is npm", () => {
    const of = (file: string) => managerOf((f) => f === file);
    expect([
      of("package-lock.json"),
      of("pnpm-lock.yaml"),
      of("yarn.lock"),
      of("bun.lock"),
      of("bun.lockb"),
      of("nothing"),
    ]).toEqual(["npm", "pnpm", "yarn", "bun", "bun", "npm"]);
  });

  it("each manager adds a devDependency saved exact", () => {
    expect(
      (["npm", "pnpm", "yarn", "bun"] as const).map((m) =>
        addCommand(m, "paperlint@1.2.3").join(" "),
      ),
    ).toEqual([
      "npm install --save-dev --save-exact paperlint@1.2.3",
      "pnpm add --save-dev --save-exact paperlint@1.2.3",
      "yarn add --dev --exact paperlint@1.2.3",
      "bun add --dev --exact paperlint@1.2.3",
    ]);
  });
});

describe("projectInstall — the disk and the manager's program", () => {
  it("the command follows the lockfile in the project root", () => {
    const root = useTempDir("paperlint-pm-");
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    expect(projectInstall.command(absolutePath(root), "x@1")).toEqual([
      "pnpm",
      "add",
      "--save-dev",
      "--save-exact",
      "x@1",
    ]);
  });

  it("runs in the root: exit 0 is ok, any other exit and a missing program are failures", () => {
    const root = absolutePath(useTempDir("paperlint-pm-"));
    const node = process.execPath;
    expect([
      projectInstall.run(root, [node, "-e", "process.exit(0)"]),
      projectInstall.run(root, [node, "-e", "process.exit(3)"]),
      projectInstall.run(root, [
        node,
        "-e",
        "process.kill(process.pid, 'SIGTERM')",
      ]),
      projectInstall.run(root, ["paperlint-no-such-program"]),
    ]).toEqual([
      { ok: true },
      { ok: false, reason: "exited 3" },
      { ok: false, reason: "killed by SIGTERM" },
      { ok: false, reason: "spawnSync paperlint-no-such-program ENOENT" },
    ]);
  });
});
