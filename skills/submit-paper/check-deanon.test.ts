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
import { onePagePdf } from "../../test/support.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "check-deanon.sh");
/** An AES-256 encrypted PDF (fixtures/pdf-facts/README.md). */
const ENCRYPTED = join(
  HERE,
  "..",
  "..",
  "fixtures",
  "pdf-facts",
  "encrypted.pdf",
);
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

const python = (code: string, ...args: readonly string[]) =>
  spawnSync("python3", ["-W", "ignore", "-c", code, ...args], {
    encoding: "utf8",
  });
const havePython = python("").status === 0;

/** An `artifact.zip` at `path` holding the given members. */
const writeZip = (path: string, members: Record<string, string>): void => {
  const r = python(
    "import sys,json,zipfile\nwith zipfile.ZipFile(sys.argv[1],'w') as f:\n    [f.writestr(k,v) for k,v in json.loads(sys.argv[2]).items()]",
    path,
    JSON.stringify(members),
  );
  expect(r.status).toBe(0);
};

describe("check-deanon.sh — what the deny-list matches", () => {
  const list =
    "# fake identity\nquillfeather\n\\bmoss\\b\ngithub\\.com/quillfeather\n";

  it("a word-boundary entry does not match ordinary prose that contains the word", () => {
    const { root, paper } = project(
      "The mossy-green plots in Figure 3 come from run.sh.",
    );
    mkdirSync(join(root, ".paperlint"));
    writeFileSync(join(root, ".paperlint", "deanon-denylist.txt"), list);
    expect(run([paper], { env: { CLAUDE_PROJECT_DIR: root } }).status).toBe(0);
  });

  it("a file whose extension no list names (.yml) is scanned like any other", () => {
    const { root, paper } = project("Authors omitted for double-blind review.");
    mkdirSync(join(root, ".paperlint"));
    writeFileSync(join(root, ".paperlint", "deanon-denylist.txt"), list);
    writeFileSync(
      join(paper, "artifact", "config.yml"),
      "maintainer: quillfeather\nrepo: github.com/quillfeather/toolkit\n",
    );
    const { status, stdout } = run([paper], {
      env: { CLAUDE_PROJECT_DIR: root },
    });
    expect({
      status,
      leaks: stdout.split("\n").filter((l) => l.includes("LEAK")),
    }).toEqual({
      status: 1,
      leaks: [
        "  LEAK  artifact/config.yml:1:maintainer: quillfeather",
        "  LEAK  artifact/config.yml:2:repo: github.com/quillfeather/toolkit",
      ],
    });
  });
});

describe("check-deanon.sh — the bundle that gets uploaded", () => {
  it.skipIf(!havePython)(
    "a leak that exists only inside artifact.zip names the zip and the member",
    () => {
      const { root, paper } = project(
        "Authors omitted for double-blind review.",
      );
      const deny = denyList(join(root, "deny.txt"));
      writeZip(join(paper, "artifact.zip"), {
        "artifact/README.md": "Authors omitted for double-blind review.\n",
        "artifact/METADATA.txt": "upstream: by Quillfeather\n",
      });
      expect(run([paper, "paper.pdf", deny]).stdout).toContain(
        "  LEAK  artifact.zip!artifact/METADATA.txt:1:upstream: by Quillfeather\n",
      );
      expect(run([paper, "paper.pdf", deny]).status).toBe(1);
    },
  );
});

describe("check-deanon.sh — a deny-list that cannot protect anything", () => {
  it("a named deny-list that does not exist is exit 2, never a pass", () => {
    const { root, paper } = project("by Quillfeather");
    const missing = join(root, "does-not-exist.txt");
    expect(run([paper, "paper.pdf", missing])).toEqual({
      status: 2,
      stdout: `FAIL: no deny-list ${missing}\n`,
    });
  });

  it("a deny-list that is all comments is exit 2, never a pass", () => {
    const { root, paper } = project("by Quillfeather");
    const named = join(root, "deny.txt");
    writeFileSync(
      named,
      "# emptied while chasing a false positive\n#quillfeather\n\n",
    );
    expect(run([paper, "paper.pdf", named])).toEqual({
      status: 2,
      stdout: `FAIL: deny-list ${named} has no patterns\n`,
    });
  });
});

describe("check-deanon.sh — the compiled PDF", () => {
  it("an absent PDF is a warning, not silence", () => {
    const { root, paper } = project("Authors omitted.");
    const deny = denyList(join(root, "deny.txt"));
    expect(run([paper, "nonexistent.pdf", deny]).stdout).toBe(
      [
        `== check-deanon: ${paper} (pdf=nonexistent.pdf, 1 patterns) ==`,
        `  WARN: ${paper}/nonexistent.pdf not found — PDF not scanned`,
        "-- summary: 0 identifier hit(s) across PDF + artifact + zip",
        "PASS: no author-identifying strings found. Safe for double-blind.",
        "",
      ].join("\n"),
    );
  });

  // Guards: a PDF the gate cannot read is a failure of the gate, never a pass about a document it
  // did not open.
});

describe("check-deanon.sh — a PDF it cannot read", () => {
  it("a PDF that cannot be read is exit 2, naming the PDF and pdf.js's reason", () => {
    const { root, paper } = project("Authors omitted.");
    const deny = denyList(join(root, "deny.txt"));
    writeFileSync(join(paper, "paper.pdf"), "%PDF-1.4\n% not a real pdf\n");
    expect(run([paper, "paper.pdf", deny])).toEqual({
      status: 2,
      stdout: [
        `== check-deanon: ${paper} (pdf=paper.pdf, 1 patterns) ==`,
        `FAIL: the PDF's text could not be read, so it was not scanned: could not read ${paper}/paper.pdf with pdf.js (unreadable): InvalidPDFException: Invalid PDF structure.`,
        "",
      ].join("\n"),
    });
  });

  it("an encrypted PDF is exit 2 as well: its text cannot be scanned", () => {
    const { root, paper } = project("Authors omitted.");
    const deny = denyList(join(root, "deny.txt"));
    copyFileSync(ENCRYPTED, join(paper, "paper.pdf"));
    const { status, stdout } = run([paper, "paper.pdf", deny]);
    expect({ status, fail: stdout.split("\n")[1] }).toEqual({
      status: 2,
      fail: `FAIL: the PDF's text could not be read, so it was not scanned: could not read ${paper}/paper.pdf with pdf.js (encrypted): PasswordException: No password given`,
    });
  });

  it("without its text reader beside it, the gate is exit 2, not a pass", () => {
    const { root, paper } = project("Authors omitted.");
    const deny = denyList(join(root, "deny.txt"));
    writeFileSync(join(paper, "paper.pdf"), onePagePdf(["Anonymous."]));
    const lone = join(root, "lone");
    mkdirSync(lone);
    copyFileSync(SCRIPT, join(lone, "check-deanon.sh"));
    const { status, stdout } = run([paper, "paper.pdf", deny], {
      script: join(lone, "check-deanon.sh"),
    });
    expect({ status, fail: stdout.split("\n")[1] }).toEqual({
      status: 2,
      fail: `FAIL: the PDF's text could not be read, so it was not scanned: no ${lone}/scripts/pdf-text.js (npm run build writes it)`,
    });
  });
});

describe("check-deanon.sh — the text of the compiled PDF", () => {
  it("an identifier compiled into the PDF text is a leak naming the PDF and its line", () => {
    const { root, paper } = project("Authors omitted.");
    const deny = denyList(join(root, "deny.txt"));
    writeFileSync(
      join(paper, "paper.pdf"),
      onePagePdf(["Anonymous submission.", "Tooling: Quillfeather-kit."]),
    );
    expect(run([paper, "paper.pdf", deny])).toEqual({
      status: 1,
      stdout: [
        `== check-deanon: ${paper} (pdf=paper.pdf, 1 patterns) ==`,
        "  LEAK  PDF[paper.pdf]:2:Tooling: Quillfeather-kit.",
        "-- summary: 1 identifier hit(s) across PDF + artifact + zip",
        "FAIL: de-anonymization leak(s) above — scrub before submitting double-blind.",
        "",
      ].join("\n"),
    });
  });

  it("a PDF with no identifier in it passes", () => {
    const { root, paper } = project("Authors omitted.");
    const deny = denyList(join(root, "deny.txt"));
    writeFileSync(
      join(paper, "paper.pdf"),
      onePagePdf(["Anonymous submission. Tooling: REDACTED for review."]),
    );
    expect(run([paper, "paper.pdf", deny])).toEqual({
      status: 0,
      stdout: [
        `== check-deanon: ${paper} (pdf=paper.pdf, 1 patterns) ==`,
        "-- summary: 0 identifier hit(s) across PDF + artifact + zip",
        "PASS: no author-identifying strings found. Safe for double-blind.",
        "",
      ].join("\n"),
    });
  });
});
