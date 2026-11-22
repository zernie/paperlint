/**
 * ONE-COMMAND INSTALL E2E: `npx --yes --package=<tarball> paperlint init --yes` in an empty directory adds paperlint to
 * that directory's devDependencies and installs it there (`src/self-install.ts`). The command runs
 * out of npx's cache, so it is not the project's own copy, which is the case the step exists for.
 *
 * `PAPERLINT_INSTALL_SPEC` points the install at the same tarball: this build's version
 * (`0.0.0-semantically-released`) is on no registry, so `paperlint@<version>` cannot be fetched.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { afterAll, expect, it } from "vitest";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const work = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-e2e-one-")));

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

const Manifest = z.looseObject({
  private: z.literal(true),
  devDependencies: z.object({ paperlint: z.string() }),
});

it("npx paperlint init --yes from the tarball, in an empty directory: paperlint is a devDependency and installed", () => {
  const packed = execFileSync(
    "npm",
    ["pack", "--silent", "--pack-destination", work],
    { cwd: ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .at(-1);
  const tgz = join(work, packed ?? "");
  const project = join(work, "project");
  mkdirSync(project);
  // `npx <tarball> init` runs the tarball itself as the command (measured: "Permission denied"), so
  // the package is named with `--package` and its bin by name.
  const r = spawnSync(
    "npx",
    ["--yes", `--package=${tgz}`, "paperlint", "init", "--yes"],
    {
      cwd: project,
      encoding: "utf8",
      env: {
        ...process.env,
        PAPERLINT_INSTALL_SPEC: tgz,
        npm_config_cache: join(work, "npm-cache"),
      },
    },
  );
  const said = `${r.stdout}\n${r.stderr}`;
  expect(said).toContain(`  → npm install --save-dev --save-exact ${tgz}`);
  const manifest = Manifest.parse(
    JSON.parse(readFileSync(join(project, "package.json"), "utf8")),
  );
  expect([
    manifest.devDependencies.paperlint.startsWith("file:"),
    existsSync(join(project, "node_modules", "paperlint", "package.json")),
  ]).toEqual([true, true]);
});
