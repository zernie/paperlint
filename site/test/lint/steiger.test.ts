// Both halves of Steiger's Feature-Sliced Design check (site/steiger.config.mjs). Steiger has no
// JS API for a run, so this spawns its CLI with the JSON reporter, as `npm run lint` does.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "remeda";
import { describe, expect, it } from "vitest";

const site = fileURLToPath(new URL("../../", import.meta.url));
// The package's bin, beside the module its "exports" names.
const cli = path.join(
  path.dirname(fileURLToPath(import.meta.resolve("steiger"))),
  "cli.mjs",
);

interface Diagnostic {
  readonly ruleName: string;
  readonly location: { readonly path: string };
}

/** Steiger's exit code and each finding as `rule path-under-the-tree`. */
const steiger = (tree: string) => {
  const root = path.join(site, tree);
  const run = spawnSync(
    process.execPath,
    [cli, root, "--reporter", "json", "--fail-on-warnings"],
    { cwd: site, encoding: "utf8" },
  );
  const diagnostics = JSON.parse(run.stdout || "[]") as readonly Diagnostic[];
  return {
    status: run.status,
    findings: R.map(
      diagnostics,
      (d) => `${d.ruleName} ${path.relative(root, d.location.path)}`,
    ),
  };
};

describe("steiger", () => {
  it("fires on the planted tree: Shared importing Entities, and a deep import past a slice's index", () => {
    expect(steiger("test/lint/fixtures/fsd-violation/src")).toEqual({
      status: 1,
      findings: [
        "fsd/forbidden-imports shared/lib/index.ts",
        "fsd/no-public-api-sidestep features/greet/ui/greet.ts",
      ],
    });
  });

  it("stays quiet on site/src", () => {
    expect(steiger("src")).toEqual({ status: 0, findings: [] });
  });
});
