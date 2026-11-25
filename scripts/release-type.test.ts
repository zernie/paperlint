/**
 * The release type the default rule set asks for (`scripts/release-type.ts`), which `.releaserc.json`
 * runs through `@semantic-release/exec` beside the commit analyzer: semantic-release takes the
 * higher of the two, so a pull request titled `feat:` or `chore:` that makes a default rule fail a
 * build still releases a major version.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { breakingRules, breakingSince } from "./release-type.ts";

describe("breakingRules", () => {
  it("names a rule that joins the set at error, and one raised from warn to error", () => {
    // Guards: both ways a default rule starts failing a build that passed.
    expect(
      breakingRules(
        { "a/kept": "error", "a/raised": "warn" },
        { "a/kept": "error", "a/raised": "error", "a/new": "error" },
      ),
    ).toEqual(["a/new", "a/raised"]);
  });

  it("names nothing for a rule that joins at warn, is lowered, or leaves the set", () => {
    // Guards: a warning never fails a build (`--max-warnings` defaults to -1), so none of these
    // breaks a consumer.
    expect(
      breakingRules(
        { "a/lowered": "error", "a/gone": "error" },
        { "a/lowered": "warn", "a/new": "warn" },
      ),
    ).toEqual([]);
  });
});

/** A git repository whose tag `v1.0.0` holds `before` as the snapshot, or no snapshot at all. */
function repoWith(before: string | undefined): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "release-type-")));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  writeFileSync(
    join(dir, before === undefined ? "README.md" : "default-rules.json"),
    before ?? "no snapshot yet\n",
  );
  git("add", ".");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "-qm",
    "init",
  );
  git("tag", "v1.0.0");
  return dir;
}

describe("breakingSince", () => {
  const now = { "a/x": "error" } as const;

  it("names the rule the tagged snapshot had at warn", () => {
    const repo = repoWith(JSON.stringify({ "a/x": "warn" }));
    expect(breakingSince(repo, "v1.0.0", now)).toEqual(["a/x"]);
  });

  it("names nothing when the set did not break", () => {
    const repo = repoWith(JSON.stringify({ "a/x": "error" }));
    expect(breakingSince(repo, "v1.0.0", now)).toEqual([]);
  });

  it("names nothing for a first release, or a tag from before the snapshot existed", () => {
    // Guards: `${lastRelease.gitTag}` renders empty on a first release, and every tag before this
    // file has no snapshot; neither may stop the release.
    expect(breakingSince(repoWith(undefined), "", now)).toEqual([]);
    expect(breakingSince(repoWith(undefined), "v1.0.0", now)).toEqual([]);
  });

  it("refuses a tagged snapshot that is not a rule set", () => {
    // Guards: a corrupt snapshot fails the release loudly instead of reading as "nothing broke".
    const repo = repoWith(JSON.stringify({ "a/x": "loud" }));
    expect(() => breakingSince(repo, "v1.0.0", now)).toThrow();
  });
});
