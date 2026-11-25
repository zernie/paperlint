/**
 * Prints `major` when the default rule set breaks a build that passed at the last release, and
 * nothing otherwise. `.releaserc.json` runs it through `@semantic-release/exec` (`analyzeCommitsCmd`),
 * whose contract is exactly that: a release type on stdout, or no output for "no release from me".
 * semantic-release keeps the highest type any analyzer returns, so the commit analyzer still decides
 * every other release.
 *
 * Breaking means a rule that a project with no configuration now gets at `error` and did not before:
 * one that joins the set at `error`, or one raised from `warn`. A warning never fails a build
 * (`--max-warnings` defaults to -1), so a rule that joins at `warn`, is lowered or leaves is not.
 *
 * The set at each point is `default-rules.json`, which `src/default-levels.test.ts` keeps equal to
 * the real config on every CI run. Usage: `node scripts/release-type.ts <last release tag>`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const SNAPSHOT = "default-rules.json";

const RuleSet = z.record(z.string(), z.enum(["warn", "error"]));
type RuleSet = z.infer<typeof RuleSet>;

/** The rules at `error` in `after` that were not at `error` in `before`, sorted. */
export const breakingRules = (
  before: Readonly<RuleSet>,
  after: Readonly<RuleSet>,
): readonly string[] =>
  Object.keys(after)
    .filter((id) => after[id] === "error" && before[id] !== "error")
    .sort();

/** The snapshot as it was at `tag` in `repo`, or none when the tag predates it. */
function snapshotAt(repo: string, tag: string): RuleSet | undefined {
  const ls = execFileSync("git", ["ls-tree", "--name-only", tag, SNAPSHOT], {
    cwd: repo,
    encoding: "utf8",
  });
  if (ls.trim() === "") return undefined;
  return RuleSet.parse(
    JSON.parse(
      execFileSync("git", ["show", `${tag}:${SNAPSHOT}`], {
        cwd: repo,
        encoding: "utf8",
      }),
    ),
  );
}

/** The rules that break since `tag` in `repo`; none for no tag, or a tag from before the snapshot. */
export function breakingSince(
  repo: string,
  tag: string,
  now: Readonly<RuleSet>,
): readonly string[] {
  const before = tag === "" ? undefined : snapshotAt(repo, tag);
  return before === undefined ? [] : breakingRules(before, now);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));
  const now = RuleSet.parse(
    JSON.parse(readFileSync(join(repo, SNAPSHOT), "utf8")),
  );
  const tag = process.argv[2] ?? "";
  const broken = breakingSince(repo, tag, now);
  if (broken.length > 0) {
    // stderr reaches the release log; stdout carries the release type alone.
    process.stderr.write(
      `now at error by default since ${tag}: ${broken.join(", ")}\n`,
    );
    process.stdout.write("major");
  }
}
