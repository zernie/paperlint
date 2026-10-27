/**
 * `paperlint versions [show|lock|migrate] [paper]`: the version → state table, the lock written from
 * the files on disk, and the one-command migration from `stages:` — over in-memory files.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import {
  memoryFiles,
  memoryCopyFile,
  memoryListDir,
  memoryMoveFile,
  type MemoryFiles,
} from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { parseYaml } from "./adapters/yaml/index.ts";
import { absolutePath } from "./domain/paths.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { lockText, parseLock, type Lock } from "./domain/versions.ts";
import { runVersions } from "./versions-command.ts";
import { factsOfFrozen } from "./versions.ts";

const PAPER = "/w/papers/p";
const enc = (t: string) => new TextEncoder().encode(t);
const locked = (t: string, frozen = "2026-10-23T16:58:01.000Z") => ({
  kind: "file" as const,
  bytes: enc(t).length,
  sha256: sha256Hex(enc(t)),
  frozen,
});

const decision = (kind: string, date: string) => ({
  kind,
  date,
  evidence: "reviews/decision.md",
});
/** A workshop version accepted, a conference attempt rejected, a journal attempt open. */
const CYCLES = [
  {
    id: "workshop-2026",
    venue: { kind: "preset", extends: "paperlint:agenticdev" },
    opened: "2026-03-01",
    submission: { id: 3 },
    outcome: decision("accepted", "2026-05-01"),
  },
  {
    id: "conf-2026",
    venue: { kind: "preset", extends: "paperlint:aisec" },
    opened: "2026-06-01",
    submission: { id: 11 },
    outcome: decision("rejected", "2026-09-08"),
  },
  {
    id: "journal-2027",
    venue: { kind: "named", name: "Journal 2027", url: "https://j.example" },
    opened: "2026-09-10",
    submission: { id: 7 },
  },
];
const SENT =
  "\\documentclass{article}\n\\begin{document}\nA.\n\\end{document}\n";
const DRAFT = SENT.replace("A.", "A, then B.\nC.");
const PDF = "%PDF sent";

/** The paper: settings, draft, and each attempt's frozen files with the lock that records them. */
function paper(o: { readonly cycles?: readonly object[] | null } = {}) {
  return memoryFiles({
    [`${PAPER}/paperlint.json`]: JSON.stringify(
      o.cycles === null ? { extends: null } : { cycles: o.cycles ?? CYCLES },
    ),
    [`${PAPER}/paper.tex`]: DRAFT,
    [`${PAPER}/versions/workshop-2026/submitted.pdf`]: PDF,
    [`${PAPER}/versions/workshop-2026/submitted.tex`]: SENT,
    [`${PAPER}/versions/workshop-2026/camera-ready.pdf`]: PDF,
    [`${PAPER}/versions/workshop-2026/camera-ready.tex`]: SENT,
    [`${PAPER}/versions/conf-2026/submitted.pdf`]: PDF,
    [`${PAPER}/versions/journal-2027/submitted.pdf`]: PDF,
    [`${PAPER}/versions/journal-2027/submitted.tex`]: SENT,
    [`${PAPER}/versions/lock.json`]: lockText({
      "workshop-2026/submitted.pdf": locked(PDF, "2026-03-20"),
      "workshop-2026/submitted.tex": locked(SENT, "2026-03-20"),
      "workshop-2026/camera-ready.pdf": locked(PDF, "2026-05-20T10:00:00.000Z"),
      "workshop-2026/camera-ready.tex": locked(
        SENT,
        "2026-05-20T10:00:00.000Z",
      ),
      "conf-2026/submitted.pdf": locked(PDF, "2026-07-22"),
      "conf-2026/submitted.tex": { kind: "lost", frozen: "2026-07-22" },
      "journal-2027/submitted.pdf": locked(PDF),
      "journal-2027/submitted.tex": locked(SENT),
    }),
  });
}

function run(words: readonly string[], files: MemoryFiles, cwd = "/w") {
  const out: string[] = [];
  const errs: string[] = [];
  const code = runVersions(words, {
    files,
    listDir: memoryListDir(files),
    move: memoryMoveFile(files),
    copy: memoryCopyFile(files),
    yaml: parseYaml,
    latex: latexReader,
    codec: sourcesCodec,
    now: () => "2026-10-27T12:00:00.000Z",
    cwd,
    log: (l) => out.push(l),
    err: (l) => errs.push(l),
  });
  return { code, out, errs };
}

const read = (fs: MemoryFiles, p: string): string | null => {
  const b = fs.readBytes(absolutePath(p));
  return b === null ? null : new TextDecoder().decode(b);
};

describe("paperlint versions — the table", () => {
  it("each attempt's versions and their state, newest first, then the draft and how far it moved", () => {
    const r = run(["papers/p"], paper());
    expect(r.code).toBe(0);
    expect(r.out).toStrictEqual([
      "  journal-2027   submitted     CURRENT (under review at Journal 2027)  9 B  frozen 2026-10-23 16:58 UTC",
      "  conf-2026      submitted     historical (rejected)                   9 B  frozen 2026-07-22, source lost",
      "  workshop-2026  submitted     camera-ready base                       9 B  frozen 2026-03-20",
      "  workshop-2026  camera-ready  final                                   9 B  frozen 2026-05-20 10:00 UTC",
      "  paper.tex      draft         target not chosen                       differs from journal-2027/submitted.tex: 2 lines added, 1 removed",
    ]);
    // `show` is the same; run from the paper's folder, no argument names it.
    expect(run(["show"], paper(), PAPER).out).toStrictEqual(r.out);
  });

  it("a paper without cycles, or words past the paper: refused with the reason", () => {
    expect(run(["show", "papers/p"], paper({ cycles: null }))).toStrictEqual({
      code: 2,
      out: [],
      errs: [
        'the paper keeps no "cycles" in paperlint.json (or they do not read — `paperlint lint` says why): versions are kept per attempt, versions/<cycle>/<stage>.pdf',
      ],
    });
    expect(
      run(["lock", "papers/p"], paper({ cycles: null })).errs,
    ).toStrictEqual([
      'the paper keeps no "cycles" in paperlint.json: there is no versions/<cycle>/ to lock (docs/configuration.md, "The paper\'s cycles")',
    ]);
    expect(run(["lock", "papers/p", "more"], paper()).errs).toStrictEqual([
      "`versions lock` takes one paper folder — got also `more`",
    ]);
  });
});

describe("paperlint versions — the table, when there is less to show", () => {
  it("no attempt open, no lock, no paper.tex: the attempts as they ended, and nothing to measure a draft against", () => {
    const fs = memoryFiles({
      [`${PAPER}/paperlint.json`]: JSON.stringify({
        cycles: CYCLES.slice(0, 2),
      }),
      [`${PAPER}/versions/conf-2026/submitted.pdf`]: PDF,
    });
    expect(run(["papers/p"], fs).out).toStrictEqual([
      "  conf-2026      submitted  historical (rejected)                       not locked",
      "  workshop-2026  submitted  NOT FROZEN — submission 3 is on the portal",
      "  paper.tex      draft      target not chosen                           no attempt to compare with",
    ]);
    // With a draft on disk and no attempt open, there is still nothing to measure it against.
    fs.writeAtomic(absolutePath(`${PAPER}/paper.tex`), enc(DRAFT));
    expect(run(["papers/p"], fs).out.at(-1)).toBe(
      "  paper.tex      draft      target not chosen                           no attempt to compare with",
    );
  });

  it("an attempt record that does not read: no table, and the reason is lint's", () => {
    const fs = memoryFiles({
      [`${PAPER}/paperlint.json`]: JSON.stringify({ cycles: [{ id: "x" }] }),
    });
    const r = run(["papers/p"], fs);
    expect(r.code).toBe(2);
    expect(r.errs[0]).toMatch(
      /^the paper keeps no "cycles" in paperlint\.json \(or they do not read/,
    );
  });

  it("a frozen file's facts: zero bytes of nothing once it is gone", () => {
    expect(
      factsOfFrozen(PAPER, memoryFiles({}))("x/submitted.pdf"),
    ).toStrictEqual({
      bytes: 0,
      sha256: sha256Hex(new Uint8Array()),
    });
  });
});

describe("paperlint versions lock", () => {
  it("records a file put there by hand, drops one that is gone, says when nothing changed", () => {
    const fs = paper();
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/journal-2027/arxiv.pdf`),
      enc("%PDF arxiv"),
    );
    fs.map.delete(`${PAPER}/versions/workshop-2026/camera-ready.tex`);
    // Not a frozen version: a note and a folder inside an attempt's folder (versions/layout names them).
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/journal-2027/notes.md`),
      enc("x"),
    );
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/journal-2027/old/submitted.pdf`),
      enc("x"),
    );
    const r = run(["lock", "papers/p"], fs);
    expect(r.code).toBe(0);
    expect(r.out).toStrictEqual([
      "locked        versions/journal-2027/arxiv.pdf (10 bytes)",
      "dropped       versions/workshop-2026/camera-ready.tex: the file is gone",
    ]);
    const lock = parseLock(
      JSON.parse(read(fs, `${PAPER}/versions/lock.json`) ?? ""),
    );
    expect(lock.ok && lock.value["journal-2027/arxiv.pdf"]).toStrictEqual(
      locked("%PDF arxiv", "2026-10-27T12:00:00.000Z"),
    );
    expect(run(["lock", "papers/p"], fs).out).toStrictEqual([
      "versions/lock.json records every frozen file as it stands",
    ]);
  });

  it("a lock that does not read is written anew from the files; no frozen file, no lock", () => {
    const fs = paper();
    fs.writeAtomic(absolutePath(`${PAPER}/versions/lock.json`), enc("{"));
    const r = run(["lock", "papers/p"], fs);
    expect(r.code).toBe(0);
    expect(r.out[0]).toMatch(
      /^versions\/lock\.json did not read \(not JSON: .*\): written anew from the files$/,
    );
    const empty = memoryFiles({
      [`${PAPER}/paperlint.json`]: JSON.stringify({ cycles: CYCLES }),
    });
    expect(run(["lock", "papers/p"], empty).out).toStrictEqual([
      "nothing frozen in versions/ — no lock to write",
    ]);
    expect(empty.isFile(absolutePath(`${PAPER}/versions/lock.json`))).toBe(
      false,
    );
  });
});

/** A paper in the old layout: dated files and the `stages:` list that declares them. */
function oldLayout(stages: string) {
  return memoryFiles({
    [`${PAPER}/paperlint.json`]: JSON.stringify({ cycles: CYCLES.slice(1) }),
    [`${PAPER}/PIPELINE-STATUS.md`]: `---\ntitle: My paper\nstages:\n${stages}state: open\n---\n# Status\n`,
    [`${PAPER}/versions/2026-07-22-submitted.pdf`]: PDF,
    [`${PAPER}/versions/2026-10-23-submitted.pdf`]: PDF,
    [`${PAPER}/versions/2026-10-23-submitted.tex`]: SENT,
  });
}
const STAGES = `  - stage: submitted
    cycle: conf-2026
    date: 2026-07-22
    pdf: versions/2026-07-22-submitted.pdf
    bytes: 9
    sourceLost: true
  - stage: submitted
    cycle: journal-2027
    date: 2026-10-23
    pdf: versions/2026-10-23-submitted.pdf
    bytes: 9
    source: versions/2026-10-23-submitted.tex
    sourceBytes: ${String(enc(SENT).length)}
`;

describe("paperlint versions migrate", () => {
  it("moves each declared file into its attempt's folder, writes the lock, drops the list — and the paper is then in the convention", () => {
    const fs = oldLayout(STAGES);
    const r = run(["migrate", "papers/p"], fs);
    expect(r.errs).toStrictEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toStrictEqual([
      "moved         versions/2026-07-22-submitted.pdf → versions/conf-2026/submitted.pdf",
      "moved         versions/2026-10-23-submitted.pdf → versions/journal-2027/submitted.pdf",
      "moved         versions/2026-10-23-submitted.tex → versions/journal-2027/submitted.tex",
      "recorded      versions/lock.json, 4 entries",
      "removed       the stages: list from PIPELINE-STATUS.md — the folders and the lock are the record now",
    ]);
    expect(read(fs, `${PAPER}/PIPELINE-STATUS.md`)).toBe(
      "---\ntitle: My paper\nstate: open\n---\n# Status\n",
    );
    expect(read(fs, `${PAPER}/versions/journal-2027/submitted.tex`)).toBe(SENT);
    const lock = parseLock(
      JSON.parse(read(fs, `${PAPER}/versions/lock.json`) ?? ""),
    );
    const want: Lock = {
      "conf-2026/submitted.pdf": locked(PDF, "2026-07-22"),
      "conf-2026/submitted.tex": { kind: "lost", frozen: "2026-07-22" },
      "journal-2027/submitted.pdf": locked(PDF, "2026-10-23"),
      "journal-2027/submitted.tex": locked(SENT, "2026-10-23"),
    };
    expect(lock).toStrictEqual({ ok: true, value: want });
    // Run again: nothing left to do.
    expect(run(["migrate", "papers/p"], fs).out).toStrictEqual([
      "nothing to migrate: PIPELINE-STATUS.md has no stages: list, and no file of the old layout is left in versions/",
    ]);
  });

  it("refused as a whole, nothing moved: a declared file that is not the one frozen", () => {
    const fs = oldLayout(
      STAGES.replace("bytes: 9\n    sourceLost", "bytes: 8\n    sourceLost"),
    );
    const before = [...fs.map.keys()];
    const r = run(["migrate", "papers/p"], fs);
    expect(r.code).toBe(2);
    expect(r.errs).toStrictEqual([
      "stages[0]: `versions/2026-07-22-submitted.pdf` has 9 bytes, the stage declares 8 — it is not the file that was frozen: restore it from git first",
      "nothing was moved",
    ]);
    expect([...fs.map.keys()]).toStrictEqual(before);
  });
});

describe("paperlint versions migrate, refused", () => {
  it("refused before anything moves: no cycles, a frontmatter that does not parse, a lock that does not read", () => {
    const flat = oldLayout(STAGES);
    flat.writeAtomic(
      absolutePath(`${PAPER}/paperlint.json`),
      enc('{"extends":null}'),
    );
    expect(run(["migrate", "papers/p"], flat).errs).toStrictEqual([
      'the paper keeps no "cycles" in paperlint.json: its stages: list stays its record — folders per attempt are named by cycle ids (docs/configuration.md, "The paper\'s cycles")',
    ]);
    const bad = oldLayout("  - [\n");
    const r = run(["migrate", "papers/p"], bad);
    expect(r.code).toBe(2);
    expect(r.errs[0]).toMatch(
      /^PIPELINE-STATUS\.md: the frontmatter does not parse \(.*\) — fix it, then migrate$/,
    );
    const lock = oldLayout(STAGES);
    lock.writeAtomic(absolutePath(`${PAPER}/versions/lock.json`), enc("[]"));
    expect(run(["migrate", "papers/p"], lock).errs).toStrictEqual([
      'versions/lock.json: not a lock this paperlint writes ("lockfileVersion": 1) — `npx paperlint versions lock papers/p` writes it anew; then migrate',
    ]);
    // Run from the paper itself, the command it names is the paper as `.`.
    expect(run(["migrate"], lock, PAPER).errs).toStrictEqual([
      'versions/lock.json: not a lock this paperlint writes ("lockfileVersion": 1) — `npx paperlint versions lock .` writes it anew; then migrate',
    ]);
  });

  it("a list the text edit would not take out cleanly: refused, nothing moved", () => {
    // An anchor on the list that another key reuses: without the list, that key reads nothing.
    const fs = oldLayout(
      `  - stage: submitted\n    cycle: conf-2026\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\ncopy: *s\n`,
    );
    fs.writeAtomic(
      absolutePath(`${PAPER}/PIPELINE-STATUS.md`),
      enc(
        (read(fs, `${PAPER}/PIPELINE-STATUS.md`) ?? "").replace(
          "stages:\n",
          "stages: &s\n",
        ),
      ),
    );
    const r = run(["migrate", "papers/p"], fs);
    expect(r.errs).toStrictEqual([
      "PIPELINE-STATUS.md: taking the stages: list out would change the rest of its frontmatter — take it out by hand, then migrate",
    ]);
    expect(r.code).toBe(2);
  });

  it("a paper with no scorecard and nothing of the old layout: nothing to migrate", () => {
    const fs = memoryFiles({
      [`${PAPER}/paperlint.json`]: JSON.stringify({ cycles: CYCLES }),
    });
    expect(run(["migrate", "papers/p"], fs)).toStrictEqual({
      code: 0,
      out: [
        "nothing to migrate: PIPELINE-STATUS.md has no stages: list, and no file of the old layout is left in versions/",
      ],
      errs: [],
    });
  });
});

describe("paperlint versions migrate, edge cases", () => {
  it("a scorecard whose frontmatter is a bare value has no list to take out: nothing to migrate", () => {
    const fs = memoryFiles({
      [`${PAPER}/paperlint.json`]: JSON.stringify({ cycles: CYCLES }),
      [`${PAPER}/PIPELINE-STATUS.md`]: "---\njust a line\n---\n# Status\n",
    });
    expect(run(["migrate", "papers/p"], fs).out).toStrictEqual([
      "nothing to migrate: PIPELINE-STATUS.md has no stages: list, and no file of the old layout is left in versions/",
    ]);
  });

  it("a declared file that is not on disk: refused, nothing moved", () => {
    const fs = oldLayout(
      STAGES.replace("2026-07-22-submitted.pdf", "gone.pdf"),
    );
    const r = run(["migrate", "papers/p"], fs);
    expect(r.errs).toStrictEqual([
      "stages[0]: `versions/gone.pdf` is not on disk",
      // The file it should have named is then named by nobody.
      "versions/2026-07-22-submitted.pdf: no stage in `stages:` names it — declare it with its cycle, or move it to extra/, then migrate",
      "nothing was moved",
    ]);
    expect(r.code).toBe(2);
  });
});

/** Every file and its bytes: what a refused migration must leave exactly as it was. */
const disk = (fs: MemoryFiles) =>
  [...fs.map.entries()].map(([p, b]) => [p, sha256Hex(b)]);

describe("paperlint versions migrate, where a destination is taken", () => {
  it("a cycle already frozen on send keeps its files: refused before anything moves, the tree byte-identical", () => {
    const fs = oldLayout(STAGES);
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/journal-2027/submitted.pdf`),
      enc("%PDF newer, sent with --save"),
    );
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/journal-2027/submitted.tex`),
      enc("newer source"),
    );
    const before = disk(fs);
    const r = run(["migrate", "papers/p"], fs);
    expect(r.code).toBe(2);
    expect(r.errs).toStrictEqual([
      "versions/journal-2027/submitted.pdf is already there, and `versions/2026-10-23-submitted.pdf` would replace it — compare the two, keep one, move the other out of versions/, then migrate",
      "versions/journal-2027/submitted.tex is already there, and `versions/2026-10-23-submitted.tex` would replace it — compare the two, keep one, move the other out of versions/, then migrate",
      "nothing was moved",
    ]);
    expect(disk(fs)).toStrictEqual(before);
  });

  it("a loose file whose place in extra/versions/ is taken: refused too", () => {
    const fs = oldLayout(STAGES);
    fs.writeAtomic(absolutePath(`${PAPER}/versions/README.md`), enc("old"));
    fs.writeAtomic(
      absolutePath(`${PAPER}/extra/versions/README.md`),
      enc("older"),
    );
    const before = disk(fs);
    const r = run(["migrate", "papers/p"], fs);
    expect(r.errs[0]).toBe(
      "extra/versions/README.md is already there, and `versions/README.md` would replace it — compare the two, keep one, move the other out of versions/, then migrate",
    );
    expect(disk(fs)).toStrictEqual(before);
  });
});

describe("paperlint versions migrate, one source for two stages", () => {
  it("a source two stages were built from is copied to each, then removed: both frozen, both locked", () => {
    const fs = oldLayout(
      `${STAGES}  - stage: arxiv
    cycle: journal-2027
    date: 2026-10-25
    pdf: versions/2026-10-25-arxiv.pdf
    bytes: 9
    source: versions/2026-10-23-submitted.tex
`,
    );
    fs.writeAtomic(
      absolutePath(`${PAPER}/versions/2026-10-25-arxiv.pdf`),
      enc(PDF),
    );
    const r = run(["migrate", "papers/p"], fs);
    expect(r.errs).toStrictEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "copied        versions/2026-10-23-submitted.tex → versions/journal-2027/submitted.tex",
    );
    expect(r.out).toContain(
      "moved         versions/2026-10-23-submitted.tex → versions/journal-2027/arxiv.tex",
    );
    expect(read(fs, `${PAPER}/versions/journal-2027/submitted.tex`)).toBe(SENT);
    expect(read(fs, `${PAPER}/versions/journal-2027/arxiv.tex`)).toBe(SENT);
    expect(
      fs.isFile(absolutePath(`${PAPER}/versions/2026-10-23-submitted.tex`)),
    ).toBe(false);
    const lock = parseLock(
      JSON.parse(read(fs, `${PAPER}/versions/lock.json`) ?? ""),
    );
    expect(lock.ok && lock.value["journal-2027/arxiv.tex"]).toStrictEqual(
      lock.ok && {
        ...lock.value["journal-2027/submitted.tex"],
        frozen: "2026-10-25",
      },
    );
  });
});
