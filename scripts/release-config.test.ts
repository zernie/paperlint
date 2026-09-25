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
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";

type PluginEntry = string | [string, Record<string, unknown>];
const releaserc = JSON.parse(
  readFileSync(new URL("../.releaserc.json", import.meta.url), "utf8"),
) as { plugins: PluginEntry[] };

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
    repositoryUrl: "https://github.com/zernie/research-paper-pipeline",
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
