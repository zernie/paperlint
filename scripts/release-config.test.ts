/**
 * The release pipeline, rendered locally from the real `.releaserc.json` with the installed
 * toolchain — the same plugins, the same preset, the same versions `npx --no-install
 * semantic-release` runs in release.yml.
 *
 * 🔴 WHY THIS EXISTS. In zernie/vigiles, from v16.0.0 to v31.0.0, every GitHub release shipped a
 * header and nothing else (zernie/vigiles#282). `conventional-changelog-conventionalcommits` had
 * moved to 10, which renders only through `conventional-changelog-writer@9`, while
 * `@semantic-release/release-notes-generator` 14 still loads writer 8. The release went out with
 * an empty body, and nothing checked the notes. This package copies that setup, so it copies the
 * check: a dependency bump that breaks either half of the preset's job turns this red before it
 * releases.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { analyzeCommits as runAnalyzeCmd } from "@semantic-release/exec";
import steps from "semantic-release/lib/definitions/plugins.js";
import { generateNotes } from "@semantic-release/release-notes-generator";
import { z } from "zod";

const PluginEntry = z.union([
  z.string(),
  z.tuple([z.string(), z.record(z.string(), z.unknown())]),
]);
const releaserc = z
  .object({ plugins: z.array(PluginEntry) })
  .parse(
    JSON.parse(
      readFileSync(new URL("../.releaserc.json", import.meta.url), "utf8"),
    ),
  );

/** The options `.releaserc.json` gives one plugin, exactly as semantic-release would pass them. */
function optionsFor(name: string): Record<string, unknown> {
  const entry = releaserc.plugins.find((p) =>
    Array.isArray(p) ? p[0] === name : p === name,
  );
  if (entry === undefined) throw new Error(`${name} is not in .releaserc.json`);
  return Array.isArray(entry) ? entry[1] : {};
}

const breaking = {
  hash: "1111111111111111111111111111111111111111",
  message:
    "feat!: drop the markdown profile (#90)\n\n" +
    "BREAKING CHANGE: the `markdown` venue profile is removed.",
};
/** `!` alone, no footer. The default (angular) preset ignores it; conventionalcommits makes it major. */
const bangOnly = {
  hash: "4444444444444444444444444444444444444444",
  message: "feat!: rename the lint command",
};
const feature = {
  hash: "2222222222222222222222222222222222222222",
  message: "feat(cli): add a flag (#1)",
};
const fix = {
  hash: "3333333333333333333333333333333333333333",
  message: "fix(build): resolve the paper from the config root (#2)",
};

const context = {
  cwd: process.cwd(),
  options: {
    repositoryUrl: "https://github.com/zernie/paperlint",
  },
  lastRelease: { gitTag: "v1.0.0", version: "1.0.0" },
  nextRelease: { gitTag: "v2.0.0", version: "2.0.0", type: "major" },
  logger: { log() {}, error() {} },
};

describe("release config (.releaserc.json) with the installed toolchain", () => {
  test("`feat!:` is a major (with or without a footer), `feat:` a minor, `fix:` a patch", async () => {
    const analyzer = optionsFor("@semantic-release/commit-analyzer");
    expect(
      await analyzeCommits(analyzer, { ...context, commits: [breaking] }),
    ).toBe("major");
    expect(
      await analyzeCommits(analyzer, { ...context, commits: [bangOnly] }),
    ).toBe("major");
    expect(
      await analyzeCommits(analyzer, { ...context, commits: [feature] }),
    ).toBe("minor");
    expect(await analyzeCommits(analyzer, { ...context, commits: [fix] })).toBe(
      "patch",
    );
  });

  test("the notes carry the breaking change, the feature and the fix — not just a header", async () => {
    const notes: string = await generateNotes(
      optionsFor("@semantic-release/release-notes-generator"),
      { ...context, commits: [breaking, feature, fix] },
    );
    expect(notes).toContain("BREAKING CHANGES");
    expect(notes).toContain("the `markdown` venue profile is removed.");
    expect(notes).toContain("add a flag");
    expect(notes).toContain("resolve the paper from the config root");
  });
});

/**
 * A commit whose tree holds only `default-rules.json` with `snapshot` in it, written to a throwaway
 * object directory that reads this repository's objects but never writes to them. The returned `env`
 * makes git see the commit.
 */
function releaseWithSnapshot(snapshot: string): {
  readonly sha: string;
  readonly env: NodeJS.ProcessEnv;
} {
  const repo = resolve(import.meta.dirname, "..");
  const shared = resolve(
    repo,
    execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: repo,
      encoding: "utf8",
    }).trim(),
    "objects",
  );
  const env = {
    ...process.env,
    GIT_OBJECT_DIRECTORY: realpathSync(
      mkdtempSync(join(tmpdir(), "release-objects-")),
    ),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: shared,
  };
  const git = (args: readonly string[], input?: string): string =>
    execFileSync("git", args, {
      cwd: repo,
      env,
      input,
      encoding: "utf8",
    }).trim();
  const blob = git(["hash-object", "-w", "--stdin"], snapshot);
  const tree = git(["mktree"], `100644 blob ${blob}\tdefault-rules.json\n`);
  const sha = git([
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit-tree",
    tree,
    "-m",
    "v1",
  ]);
  return { sha, env };
}

describe("the default rule set's analyzer (@semantic-release/exec)", () => {
  const run = (gitTag: string, env: NodeJS.ProcessEnv) =>
    runAnalyzeCmd(optionsFor("@semantic-release/exec"), {
      ...context,
      cwd: resolve(import.meta.dirname, ".."),
      env,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      lastRelease: { gitTag, version: "1.0.0" },
      commits: [feature],
    });

  test("runs beside the commit analyzer, so semantic-release keeps the higher of the two", () => {
    // Guards: an analyzer placed in no step, or removed, would let a breaking default set out as a minor.
    const names = releaserc.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names.slice(0, 2)).toEqual([
      "@semantic-release/commit-analyzer",
      "@semantic-release/exec",
    ]);
  });

  test("semantic-release keeps the highest type the analyzers return", () => {
    // Guards: the whole mechanism rests on this merge; a semantic-release that took the first answer
    // instead would release a breaking default set as whatever the PR title says.
    const merge = steps.analyzeCommits.postprocess;
    expect(merge(["minor", "major"])).toBe("major");
    expect(merge([null, "major"])).toBe("major");
    expect(merge(["minor", undefined])).toBe("minor");
  });

  test("says major when a rule the last release had at warn is at error now", async () => {
    // Guards: the command semantic-release renders from .releaserc.json reaches the script and its
    // answer comes back, end to end through the installed plugin.
    const now = z
      .record(z.string(), z.string())
      .parse(
        JSON.parse(
          readFileSync(
            new URL("../default-rules.json", import.meta.url),
            "utf8",
          ),
        ),
      );
    const anError = Object.keys(now).find((id) => now[id] === "error");
    expect(anError).toBeDefined();
    const release = releaseWithSnapshot(
      JSON.stringify({ ...now, [String(anError)]: "warn" }),
    );
    expect(await run(release.sha, release.env)).toBe("major");
  });

  test("says nothing when the last release had the same set, and on a first release", async () => {
    const same = releaseWithSnapshot(
      readFileSync(new URL("../default-rules.json", import.meta.url), "utf8"),
    );
    expect(await run(same.sha, same.env)).toBeUndefined();
    expect(await run("", process.env)).toBeUndefined();
  });
});
