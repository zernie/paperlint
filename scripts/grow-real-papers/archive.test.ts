/**
 * The source archive: reading the e-print, choosing what a paper keeps and where, and the record
 * of what was staged. The archives are built in memory by `testkit.ts`.
 */
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import {
  jsonOf,
  recordOf,
  sha256,
  stagingPlan,
  toplevelOf,
  unpack,
  untar,
} from "./archive.ts";
import { file, mainTex, tar, tarGz, text } from "./testkit.ts";

const paths = (fs: readonly { path: string }[]) => fs.map((f) => f.path);

describe("unpack", () => {
  test("keeps regular files at safe paths, under their long names", () => {
    const files = untar(
      tar([
        { name: "./main.tex", body: "m" },
        { name: "sec.tex", prefix: "ACL2026", body: "s" },
        {
          name: "././@LongLink",
          type: "L",
          body: `${"d/".repeat(60)}long.tex\0`,
        },
        { name: "truncated", body: "l" },
        {
          name: "PaxHeader/short.bib",
          type: "x",
          body: "30 path=pax/named.bib\n",
        },
        { name: "short.bib", body: "p" },
        { name: "PaxHeader/nul.sty", type: "x", body: "20 mtime=1700000000\n" },
        { name: "nul.sty", type: "\0", body: "n" },
        { name: "../escape.tex", body: "e" },
        { name: "/abs.tex", body: "a" },
        { name: "./", body: "" },
        { name: "link.tex", type: "2" },
        { name: "figs", type: "5" },
      ]),
    );
    // Guards: prefix and long names applied; links, directories and paths that leave the archive dropped.
    expect(paths(files)).toEqual([
      "main.tex",
      "ACL2026/sec.tex",
      `${"d/".repeat(60)}long.tex`,
      "pax/named.bib",
      "nul.sty",
    ]);
    // Guards: a stream cut before the end-of-archive blocks still ends.
    expect(
      untar(tar([{ name: "a.tex", body: "a" }]).subarray(0, 1024)),
    ).toEqual([{ path: "a.tex", bytes: Buffer.from("a") }]);
  });

  test("a gzipped tar, a lone gzipped .tex, a PDF and a broken gzip", () => {
    const archive = unpack(tarGz([{ name: "x/main.tex", body: "t" }]));
    // Guards: a tar's files.
    expect(archive.ok && paths(archive.files)).toEqual(["x/main.tex"]);
    // Guards: one gzipped file is the main file.
    expect(unpack(gzipSync(Buffer.from("tex")))).toEqual({
      ok: true,
      files: [{ path: "main.tex", bytes: Buffer.from("tex") }],
    });
    // Guards: a PDF-only submission is rejected by name.
    expect(unpack(Buffer.from("%PDF-1.5"))).toEqual({
      ok: false,
      reason: "no source: not gzip (PDF-only submission)",
    });
    // Guards: gzip magic over garbage is rejected, not thrown.
    expect(unpack(Buffer.from([0x1f, 0x8b, 1, 2, 3]))).toEqual({
      ok: false,
      reason: "unreadable source: Error: unknown compression method",
    });
  });
});

describe("unpack — a tar this reader does not take", () => {
  test("a tar without the ustar mark (old V7 format) is rejected, not staged as one .tex", () => {
    const v7 = Buffer.from(
      tar([{ name: "main.tex", body: "\\begin{document}" }]),
    );
    v7.fill(0, 257, 263);
    expect(unpack(gzipSync(v7))).toEqual({
      ok: false,
      reason: "unreadable source: binary data, not a ustar tar",
    });
  });
});

describe("the top-level file", () => {
  test.each([
    [
      "00README.json names it",
      [
        file(
          "00README.json",
          '{"sources":[{"usage":"toplevel","filename":"ACL2026/main.tex"}]}',
        ),
      ],
      "ACL2026/main.tex",
    ],
    [
      "00README.json without a toplevel",
      [file("00README.json", '{"sources":[{"filename":"a.tex"}]}')],
      null,
    ],
    ["00README.json that is not JSON", [file("00README.json", "{")], null],
    [
      "a legacy 00README.XXX",
      [file("00README.XXX", "sub/ms.tex toplevelfile\n")],
      "sub/ms.tex",
    ],
    [
      "a legacy 00README without one",
      [file("00README.XXX", "nostamp\n")],
      null,
    ],
    ["no 00README", [file("main.tex", "")], null],
  ])("%s", (_, files, named) => {
    // Guards: what arXiv compiles first, as its own README says.
    expect(toplevelOf(files)).toBe(named);
  });

  test("jsonOf: JSON, or undefined", () => {
    // Guards: both halves of the parse.
    expect([jsonOf("[1]"), jsonOf("{")]).toEqual([[1], undefined]);
  });
});

describe("the staging plan", () => {
  test("a main file in a subfolder is staged from the archive root, every input kept", () => {
    // The defect the code review found in the 2026-11-20 run: staging from the main file's folder
    // dropped `sections/intro.tex`, which arXiv resolves from the root.
    const files = [
      file(
        "00README.json",
        '{"sources":[{"usage":"toplevel","filename":"ACL2026/main.tex"}]}',
      ),
      file("ACL2026/main.tex", mainTex("\\input{sections/intro}")),
      file("ACL2026/main.bbl", "bbl"),
      file("sections/intro.tex", "Intro."),
      file("acl.sty", "sty"),
      file("figs/plot.pdf", "pdf"),
    ];
    const plan = stagingPlan(files);
    // Guards: every text file at its path from the root; only the main file and its .bbl renamed.
    expect(plan.ok && { ...plan, staged: paths(plan.staged) }).toEqual({
      ok: true,
      main: "ACL2026/main.tex",
      mainText: mainTex("\\input{sections/intro}"),
      mainCandidates: 1,
      staged: ["paper.tex", "paper.bbl", "sections/intro.tex", "acl.sty"],
      renames: [
        "ACL2026/main.tex to paper.tex",
        "ACL2026/main.bbl to paper.bbl",
      ],
      edits: [],
      size: mainTex("\\input{sections/intro}").length + 3 + 6 + 3,
    });
  });

  test("without a README: main/paper/ms first, else the largest candidate", () => {
    const named = stagingPlan([
      file("big.tex", mainTex("x".repeat(100))),
      file("ms.tex", mainTex("")),
      file("notmain.tex", "\\documentclass{article} % \\begin{document}"),
    ]);
    // Guards: a conventional name beats size; a file whose \begin{document} is commented out is no candidate.
    expect(named.ok && [named.main, named.mainCandidates]).toEqual([
      "ms.tex",
      2,
    ]);
    const largest = stagingPlan([
      file("a.tex", mainTex("")),
      file("b.tex", mainTex("longer")),
    ]);
    // Guards: else the largest.
    expect(largest.ok && largest.main).toBe("b.tex");
    // Guards: no candidate at all is a rejection.
    expect(stagingPlan([file("a.bib", "")])).toEqual({
      ok: false,
      reason: "no main .tex found",
    });
  });
});

describe("renaming the main file", () => {
  test("a wrapper's \\input of the main file is rewritten to paper", () => {
    const plan = stagingPlan([
      file("00README.XXX", "doc.tex toplevelfile"),
      file("doc.tex", mainTex("body")),
      file("wrap.tex", "\\input{doc}\\include{doc.tex}\\input{other}"),
      file("paper.tex.bak", "dropped"),
    ]);
    // Guards: each rewrite noted, the wrapper's bytes changed, other inputs untouched.
    expect(
      plan.ok && {
        edits: plan.edits,
        wrap: plan.staged.filter((f) => f.path === "wrap.tex").map(text),
      },
    ).toEqual({
      edits: [
        "\\input{doc} to \\input{paper}",
        "\\include{doc.tex} to \\include{paper.tex}",
      ],
      wrap: ["\\input{paper}\\include{paper.tex}\\input{other}"],
    });
    const already = stagingPlan([
      file("paper.tex", mainTex("")),
      file("w.tex", "\\input{paper}"),
    ]);
    // Guards: a main file already called paper.tex needs no rename and no edit.
    expect(already.ok && [already.renames, already.edits]).toEqual([[], []]);
  });
});

describe("record-by-hand.json", () => {
  test("paper.tex, root class and style files, then inputs depth first, hashed", () => {
    const staged = [
      file(
        "paper.tex",
        mainTex(
          "\\input{./a}\\include{b.tex}\\input{a}% \\input{c}\n\\input{gone}",
        ),
      ),
      file("a.tex", "\\input{sub/d}"),
      file("sub/d.tex", "d"),
      file("b.tex", "b"),
      file("c.tex", "c"),
      file("z.sty", "z"),
      file("acl.cls", "k"),
      file("styles/nested.sty", "n"),
    ];
    const hash = (p: string) =>
      sha256(staged.find((f) => f.path === p)?.bytes ?? new Uint8Array());
    const order = [
      "paper.tex",
      "acl.cls",
      "z.sty",
      "a.tex",
      "sub/d.tex",
      "b.tex",
    ];
    // Guards: the order and roles a reader audits, no repeat, a commented or missing input left out.
    expect(recordOf(staged)).toEqual({
      schema: 1,
      inputs: [
        { path: "paper.tex", role: "body" },
        { path: "acl.cls", role: "preamble" },
        { path: "z.sty", role: "preamble" },
        { path: "a.tex", role: "body" },
        { path: "sub/d.tex", role: "body" },
        { path: "b.tex", role: "body" },
      ],
      written: [],
      bibdata: [],
      bibtex: { ran: false },
      sha256: Object.fromEntries(order.map((p) => [p, hash(p)])),
    });
    // Guards: a staging without paper.tex records it as empty.
    expect(recordOf([]).sha256).toEqual({
      "paper.tex": sha256(new Uint8Array()),
    });
  });
});
