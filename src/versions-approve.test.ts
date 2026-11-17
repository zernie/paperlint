/**
 * `paperlint versions approve` and `versions diff`: the text the author approved is a frozen version
 * like any other (`versions/<cycle>/approved.tex`, in the lock), and `diff` lists what the draft no
 * longer has — over in-memory files and a fake `latexdiff`; no TeX runs.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import {
  memoryCopyFile,
  memoryFiles,
  memoryListDir,
  memoryMoveFile,
  type MemoryFiles,
} from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { parseYaml } from "./adapters/yaml/index.ts";
import { absolutePath } from "./domain/paths.ts";
import type { Command, ProcessExit } from "./ports/process.ts";
import { lockText, parseLock } from "./domain/versions.ts";
import { builtPaper } from "../test/recorded-fixture.ts";
import { latexDiff } from "./adapters/latexdiff/index.ts";
import { runVersions, type VersionsCommandDeps } from "./versions-command.ts";

const PAPER = "/w/papers/p";
const OPEN = {
  id: "beta-2027",
  venue: { kind: "named", name: "Beta", url: "https://beta.example" },
  opened: "2026-09-09",
  deadlines: [],
};
const REJECTED = {
  id: "alpha-2026",
  venue: { kind: "named", name: "Alpha", url: "https://alpha.example" },
  opened: "2026-06-01",
  deadlines: [],
  outcome: {
    kind: "withdrawn",
    date: "2026-09-01",
    evidence: "mail/withdraw.eml",
  },
};
const V1 =
  "\\begin{document}\nOne sentence. Another sentence.\n\\end{document}\n";
const V2 = "\\begin{document}\nOne sentence.\n\\end{document}\n";

const paper = (cycles: readonly object[] | null, tex: string | null = V1) =>
  memoryFiles({
    [`${PAPER}/paperlint.json`]: JSON.stringify(
      cycles === null ? { extends: null } : { cycles },
    ),
    ...(tex === null ? {} : { [`${PAPER}/paper.tex`]: tex }),
  });

const read = (fs: MemoryFiles, p: string): string | null => {
  const b = fs.readBytes(absolutePath(p));
  return b === null ? null : new TextDecoder().decode(b);
};

function run(
  words: readonly string[],
  files: MemoryFiles,
  latexdiff: (c: Command) => ProcessExit = () => ({
    kind: "not-found",
    file: "latexdiff",
  }),
) {
  const out: string[] = [];
  const errs: string[] = [];
  const calls: Command[] = [];
  const deps: VersionsCommandDeps = {
    files,
    listDir: memoryListDir(files),
    move: memoryMoveFile(files),
    copy: memoryCopyFile(files),
    yaml: parseYaml,
    latex: latexReader,
    codec: sourcesCodec,
    latexdiff: latexDiff({
      proc: {
        run: (c) => {
          calls.push(c);
          return latexdiff(c);
        },
      },
      env: { PATH: "/bin" },
      files,
      latex: latexReader,
    }),
    now: () => "2026-11-01T10:00:00.000Z",
    cwd: "/w",
    log: (l) => out.push(l),
    err: (l) => errs.push(l),
  };
  return { code: runVersions(words, deps), out, errs, calls };
}

const exited = (stdout: string, status = 0, stderr = ""): ProcessExit => ({
  kind: "exited",
  status,
  stdout,
  stderr,
});
const DIFF = "text \\DIFdel{Another sentence.} more \\DIFdel{\\DIFdelend} end";

const approved = () => {
  const fs = paper([REJECTED, OPEN]);
  run(["approve", "papers/p"], fs);
  fs.writeAtomic(
    absolutePath(`${PAPER}/paper.tex`),
    new TextEncoder().encode(V2),
  );
  return fs;
};

describe("paperlint versions approve", () => {
  it("🔴 freezes paper.tex as the open attempt's approved.tex and locks it", () => {
    const fs = paper([REJECTED, OPEN]);
    const r = run(["approve", "papers/p"], fs);
    expect([r.code, r.errs]).toEqual([0, []]);
    expect(read(fs, `${PAPER}/versions/beta-2027/approved.tex`)).toBe(V1);
    expect(r.out[0]).toBe(
      "approved      versions/beta-2027/approved.tex — `npx paperlint versions diff` lists what changed since",
    );
    expect(r.out[1]).toMatch(/^locked {8}versions\/beta-2027\/approved\.tex/);
    expect(read(fs, `${PAPER}/versions/lock.json`)).toContain(
      "beta-2027/approved.tex",
    );
  });

  it("approving again replaces the file and re-locks it; the table names the state", () => {
    const fs = paper([OPEN]);
    run(["approve", "papers/p"], fs);
    fs.writeAtomic(
      absolutePath(`${PAPER}/paper.tex`),
      new TextEncoder().encode(V2),
    );
    const again = run(["approve", "papers/p"], fs);
    expect(again.out[1]).toMatch(
      /^locked {8}versions\/beta-2027\/approved\.tex/,
    );
    expect(read(fs, `${PAPER}/versions/beta-2027/approved.tex`)).toBe(V2);
    expect(run(["papers/p"], fs).out.join("\n")).toContain(
      "approved by the author",
    );
  });

  it.each<[string, MemoryFiles, string]>([
    [
      "no open or accepted attempt",
      paper([REJECTED]),
      "no open or accepted attempt",
    ],
    ["no paper.tex", paper([OPEN], null), "no paper.tex to approve"],
    ["no cycles", paper(null), 'keeps no "cycles"'],
  ])("refused, exit 2: %s", (_, fs, says) => {
    const r = run(["approve", "papers/p"], fs);
    expect([r.code, r.errs[0]?.includes(says)]).toEqual([2, true]);
  });
});

const MAIN_INPUT =
  "\\begin{document}\n\\input{sections/intro}\n\\end{document}\n";
const INTRO = "Intro text.\n";
const multi = (record: boolean) =>
  memoryFiles({
    [`${PAPER}/paperlint.json`]: JSON.stringify({ cycles: [OPEN] }),
    ...(record
      ? builtPaper(
          PAPER,
          { "paper.tex": MAIN_INPUT, "sections/intro.tex": INTRO },
          [
            { path: "paper.tex", role: "body" },
            { path: "sections/intro.tex", role: "body" },
          ],
        )
      : {
          [`${PAPER}/paper.tex`]: MAIN_INPUT,
          [`${PAPER}/sections/intro.tex`]: INTRO,
        }),
  });

describe("paperlint versions approve, a paper with includes", () => {
  it("🔴 refused without a build record: an approved copy without its includes would be incomplete", () => {
    const fs = multi(false);
    const r = run(["approve", "papers/p"], fs);
    expect([r.code, r.errs[0]?.includes("_build/sources.json")]).toEqual([
      2,
      true,
    ]);
    expect(read(fs, `${PAPER}/versions/beta-2027/approved.tex`)).toBeNull();
  });

  it("🔴 refused when an included file changed since the build", () => {
    const fs = multi(true);
    fs.writeAtomic(
      absolutePath(`${PAPER}/sections/intro.tex`),
      new TextEncoder().encode("Edited.\n"),
    );
    const r = run(["approve", "papers/p"], fs);
    expect([r.code, r.errs[0]?.includes("sections/intro.tex")]).toEqual([
      2,
      true,
    ]);
  });

  it("with a fresh record the includes are spliced into the approved copy", () => {
    const fs = multi(true);
    expect(run(["approve", "papers/p"], fs).code).toBe(0);
    expect(read(fs, `${PAPER}/versions/beta-2027/approved.tex`)).toContain(
      "Intro text.",
    );
  });
});

describe("paperlint versions approve, the lock", () => {
  it("🔴 only the approved.tex entry is written: a damaged frozen file stays damaged in the lock's eyes", () => {
    const recorded = {
      kind: "file" as const,
      bytes: 3,
      sha256: "a".repeat(64),
      frozen: "2026-10-01",
    };
    const gone = {
      kind: "file" as const,
      bytes: 9,
      sha256: "b".repeat(64),
      frozen: "2026-10-01",
    };
    const fs = paper([REJECTED, OPEN]);
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/beta-2027/submitted.tex`),
      new TextEncoder().encode("changed after freezing"),
    );
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/lock.json`),
      new TextEncoder().encode(
        lockText({
          "beta-2027/submitted.tex": recorded,
          "beta-2027/submitted.pdf": gone,
        }),
      ),
    );
    const r = run(["approve", "papers/p"], fs);
    const lock = parseLock(
      JSON.parse(read(fs, `${PAPER}/versions/lock.json`) ?? "null"),
    );
    expect([r.code, r.out[1]]).toEqual([
      0,
      `locked        versions/beta-2027/approved.tex (${String(V1.length)} bytes)`,
    ]);
    expect(lock.ok && lock.value["beta-2027/submitted.tex"]).toEqual(recorded);
    expect(lock.ok && lock.value["beta-2027/submitted.pdf"]).toEqual(gone);
    expect(lock.ok && lock.value["beta-2027/approved.tex"]).toMatchObject({
      kind: "file",
      bytes: V1.length,
    });
  });

  it("a lock that does not read: the file is frozen, the lock untouched, exit 2", () => {
    const fs = paper([OPEN]);
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/lock.json`),
      new TextEncoder().encode("{not json"),
    );
    const r = run(["approve", "papers/p"], fs);
    expect([r.code, r.errs[0]?.includes("versions/lock.json")]).toEqual([
      2,
      true,
    ]);
    expect(read(fs, `${PAPER}/versions/lock.json`)).toBe("{not json");
  });
});

describe("paperlint versions diff", () => {
  it("🔴 runs latexdiff on the approved text and the draft, writes diff.tex, lists what is gone", () => {
    const fs = approved();
    const r = run(["diff", "papers/p"], fs, () => exited(DIFF));
    expect([r.code, r.errs]).toEqual([0, []]);
    expect(r.out).toEqual([
      "approved      versions/beta-2027/approved.tex",
      "wrote         _build/diff/diff.tex (not built)",
      "in the approved text, gone now (1):",
      "  - Another sentence.",
    ]);
    expect(r.calls.map((c) => [c.file, c.args, c.cwd])).toEqual([
      ["latexdiff", ["approved.tex", "current.tex"], `${PAPER}/_build/diff`],
    ]);
    expect(read(fs, `${PAPER}/_build/diff/approved.tex`)).toBe(V1);
    expect(read(fs, `${PAPER}/_build/diff/current.tex`)).toBe(V2);
    expect(read(fs, `${PAPER}/_build/diff/diff.tex`)).toBe(DIFF);
  });
});

describe("paperlint versions diff, when it cannot run", () => {
  it("nothing removed: says so", () => {
    const r = run(["diff", "papers/p"], approved(), () => exited("same"));
    expect(r.out.at(-1)).toBe("nothing of the approved text is gone");
  });

  it.each<[string, () => MemoryFiles, (c: Command) => ProcessExit, string]>([
    [
      "no approved version",
      () => paper([OPEN]),
      () => exited(""),
      "no approved version",
    ],
    [
      "latexdiff not installed",
      approved,
      () => ({ kind: "not-found", file: "latexdiff" }),
      "latexdiff is not on PATH — `npx paperlint toolchain` installs it",
    ],
    [
      "latexdiff fails",
      approved,
      () => exited("", 2, "bad tex"),
      "latexdiff failed: bad tex",
    ],
    [
      "latexdiff fails silently",
      approved,
      () => exited("", 3),
      "latexdiff failed: exit 3",
    ],
    [
      "latexdiff stopped",
      approved,
      () => ({ kind: "timed-out", afterMs: 1, stdout: "", stderr: "" }),
      "latexdiff failed: timed-out",
    ],
    ["no cycles", () => paper(null), () => exited(""), 'keeps no "cycles"'],
  ])("refused, exit 2: %s", (_, files, proc, says) => {
    const r = run(["diff", "papers/p"], files(), proc);
    expect([
      r.code,
      r.errs[0]?.startsWith(says) || r.errs[0]?.includes(says),
    ]).toEqual([2, true]);
  });

  it("an approved text with no paper.tex to compare: refused", () => {
    const fs = approved();
    const m = memoryFiles({
      [`${PAPER}/paperlint.json`]: read(fs, `${PAPER}/paperlint.json`) ?? "",
      [`${PAPER}/versions/beta-2027/approved.tex`]: V1,
    });
    expect(run(["diff", "papers/p"], m).errs).toEqual([
      "no paper.tex to compare",
    ]);
  });
});
