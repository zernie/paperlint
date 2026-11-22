/**
 * `check-deanon.sh`, the double-blind gate: where it finds the author's deny-list, and both halves
 * of the scan. The deny-list is the author's data, so it lives in their project
 * (`.paperlint/deanon-denylist.txt`), never in the package: under the Claude Code plugin the
 * script runs from the plugin's own folder, where no list of the author's can be.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check-deanon.sh");
const made: string[] = [];
afterEach(() => {
  made.splice(0).forEach((d) => {
    rmSync(d, { recursive: true, force: true });
  });
});

/** A project with one paper whose artifact README says `readme`. */
const project = (readme: string): { root: string; paper: string } => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "deanon-")));
  made.push(root);
  const paper = join(root, "papers", "p");
  mkdirSync(join(paper, "artifact"), { recursive: true });
  writeFileSync(join(paper, "artifact", "README.md"), `${readme}\n`);
  return { root, paper };
};

const denyList = (path: string): string => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "# my identifiers\nQuillfeather\n");
  return path;
};

/** Runs the gate with no `CLAUDE_PROJECT_DIR` unless `env` sets one. */
const run = (
  args: readonly string[],
  {
    script = SCRIPT,
    env = {},
  }: { script?: string; env?: Record<string, string> } = {},
) => {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== "CLAUDE_PROJECT_DIR"),
  );
  const r = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    cwd: tmpdir(),
    env: { ...inherited, ...env },
  });
  return { status: r.status, stdout: r.stdout };
};

const leak = (paper: string): string =>
  [
    `== check-deanon: ${paper} (pdf=paper.pdf, 1 patterns) ==`,
    `  WARN: ${paper}/paper.pdf not found — PDF not scanned`,
    `  LEAK  artifact/README.md:1:by Quillfeather`,
    `-- summary: 1 identifier hit(s) across PDF + artifact + zip`,
    `FAIL: de-anonymization leak(s) above — scrub before submitting double-blind.`,
    ``,
  ].join("\n");

describe("check-deanon.sh — where the deny-list comes from", () => {
  it("reads the project's .paperlint/deanon-denylist.txt, the project being CLAUDE_PROJECT_DIR", () => {
    const { root, paper } = project("by Quillfeather");
    denyList(join(root, ".paperlint", "deanon-denylist.txt"));
    expect(run([paper], { env: { CLAUDE_PROJECT_DIR: root } })).toEqual({
      status: 1,
      stdout: leak(paper),
    });
  });

  it("without CLAUDE_PROJECT_DIR, the project is the git repository that holds the paper", () => {
    const { root, paper } = project("by Quillfeather");
    spawnSync("git", ["init", "-q", root]);
    denyList(join(root, ".paperlint", "deanon-denylist.txt"));
    expect(run([paper])).toEqual({ status: 1, stdout: leak(paper) });
  });

  it("a deny-list named as the third argument wins over the project's", () => {
    const { root, paper } = project("by Quillfeather");
    mkdirSync(join(root, ".paperlint"));
    writeFileSync(join(root, ".paperlint", "deanon-denylist.txt"), "Nobody\n");
    const named = denyList(join(root, "mine.txt"));
    expect(
      run([paper, "paper.pdf", named], { env: { CLAUDE_PROJECT_DIR: root } }),
    ).toEqual({ status: 1, stdout: leak(paper) });
  });

  it("a list beside the script, the older place, is still read when the project has none", () => {
    const { root, paper } = project("by Quillfeather");
    const skill = join(root, ".claude", "skills", "submit-paper");
    mkdirSync(skill, { recursive: true });
    copyFileSync(SCRIPT, join(skill, "check-deanon.sh"));
    denyList(join(skill, "deanon-denylist.txt"));
    expect(
      run([paper], {
        script: join(skill, "check-deanon.sh"),
        env: { CLAUDE_PROJECT_DIR: root },
      }),
    ).toEqual({ status: 1, stdout: leak(paper) });
  });

  it("no deny-list anywhere: exit 2, naming the file to write", () => {
    const { root, paper } = project("by Quillfeather");
    expect(run([paper], { env: { CLAUDE_PROJECT_DIR: root } })).toEqual({
      status: 2,
      stdout:
        `FAIL: no deny-list. Write your identifiers, one extended regex per line, to ` +
        `${root}/.paperlint/deanon-denylist.txt\n`,
    });
  });
});

describe("check-deanon.sh — both halves of the scan", () => {
  it("a clean artifact passes", () => {
    const { root, paper } = project("by Anonymous");
    denyList(join(root, ".paperlint", "deanon-denylist.txt"));
    expect(run([paper], { env: { CLAUDE_PROJECT_DIR: root } })).toEqual({
      status: 0,
      stdout: [
        `== check-deanon: ${paper} (pdf=paper.pdf, 1 patterns) ==`,
        `  WARN: ${paper}/paper.pdf not found — PDF not scanned`,
        `-- summary: 0 identifier hit(s) across PDF + artifact + zip`,
        `PASS: no author-identifying strings found. Safe for double-blind.`,
        ``,
      ].join("\n"),
    });
  });
});
