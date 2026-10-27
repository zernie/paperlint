/**
 * `submission new|update --save` freeze what they send: the exact PDF and the source it was built
 * from (a multi-file paper: assembled, as the build read it) into `versions/<cycle>/<stage>.*`, and
 * record both in `versions/lock.json` — the manual step behind #308, gone.
 */
import { expect, test } from "vitest";
import { builtPaper } from "../test/recorded-fixture.ts";
import { absolutePath } from "./domain/paths.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { ok } from "./domain/result.ts";
import { parseLock } from "./domain/versions.ts";
import type { Files } from "./ports/files.ts";
import {
  AUTHORS,
  PAPER,
  PDF,
  fakePortal,
  files,
  run,
} from "../test/submission-fixtures.ts";

const NOW = "2026-10-23T16:58:01.000Z";
const MAIN =
  "\\documentclass{article}\n\\title{Agents That Lie}\n\\begin{document}\n\\begin{abstract}An abstract.\\end{abstract}\n\\input{sections/intro}\n\\end{document}\n";
const INTRO = "Intro text.\n";
/** paper.tex with its include spliced where it stands, as the build read it. */
const ASSEMBLED = MAIN.replace("\\input{sections/intro}", "Intro text.\n");

const cycle = (id: string, more: object = {}) => ({
  id,
  venue: { kind: "preset", extends: "../../venue.jsonc" },
  opened: "2026-10-01",
  ...more,
});
const SENT = cycle("venue-2026", { submission: { id: 7 } });

/** A paper in the cycles form, built: its two source files and the record of the build. */
const built = (
  paper: Readonly<Record<string, unknown>>,
  sources: Readonly<Record<string, string>> = {
    "paper.tex": MAIN,
    "sections/intro.tex": INTRO,
  },
) =>
  files({
    paper,
    extra: builtPaper(PAPER, sources, [
      { path: "paper.tex", role: "body" },
      { path: "sections/intro.tex", role: "body" },
    ]),
  });

const text = (fs: Files, p: string): string | null => {
  const b = fs.readBytes(absolutePath(p));
  return b === null ? null : new TextDecoder().decode(b);
};
const lockOf = (fs: Files) =>
  parseLock(JSON.parse(text(fs, `${PAPER}/versions/lock.json`) ?? "null"));
const enc = (t: string) => new TextEncoder().encode(t);

test("update --save in an open cycle: the PDF sent and its assembled source frozen as submitted, both locked", async () => {
  const fs = built({ cycles: [SENT] });
  const r = await run({ sub: "update", save: true }, { files: fs });
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(
    fs.readBytes(absolutePath(`${PAPER}/versions/venue-2026/submitted.pdf`)),
  ).toStrictEqual(PDF);
  expect(text(fs, `${PAPER}/versions/venue-2026/submitted.tex`)).toBe(
    ASSEMBLED,
  );
  expect(lockOf(fs)).toStrictEqual(
    ok({
      "venue-2026/submitted.pdf": {
        kind: "file",
        bytes: PDF.length,
        sha256: sha256Hex(PDF),
        frozen: NOW,
      },
      "venue-2026/submitted.tex": {
        kind: "file",
        bytes: enc(ASSEMBLED).length,
        sha256: sha256Hex(enc(ASSEMBLED)),
        frozen: NOW,
      },
    }),
  );
  expect(r.out.at(-1)).toBe(
    `frozen        versions/venue-2026/submitted.pdf (${String(PDF.length)} bytes) and submitted.tex (${String(enc(ASSEMBLED).length)} bytes), recorded in versions/lock.json`,
  );
});

test("a later --save in the same cycle replaces submitted.* — the last upload is the one under review — and keeps the lock's other entries", async () => {
  const fs = built({
    cycles: [
      cycle("old-2026", {
        outcome: { kind: "rejected", date: "2026-10-02", evidence: "m.eml" },
      }),
      SENT,
    ],
  });
  fs.writeAtomic(
    absolutePath(`${PAPER}/versions/venue-2026/submitted.pdf`),
    enc("%PDF older"),
  );
  fs.writeAtomic(
    absolutePath(`${PAPER}/versions/lock.json`),
    enc(
      JSON.stringify({
        lockfileVersion: 1,
        files: {
          "old-2026/submitted.tex": { sourceLost: true },
          "venue-2026/submitted.pdf": {
            bytes: 10,
            sha256: "0".repeat(64),
            frozen: "2026-10-20",
          },
        },
      }),
    ),
  );
  const r = await run({ sub: "update", save: true }, { files: fs });
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(
    fs.readBytes(absolutePath(`${PAPER}/versions/venue-2026/submitted.pdf`)),
  ).toStrictEqual(PDF);
  const lock = lockOf(fs);
  expect(lock.ok && Object.keys(lock.value).sort()).toStrictEqual([
    "old-2026/submitted.tex",
    "venue-2026/submitted.pdf",
    "venue-2026/submitted.tex",
  ]);
  expect(lock.ok && lock.value["venue-2026/submitted.pdf"]).toStrictEqual({
    kind: "file",
    bytes: PDF.length,
    sha256: sha256Hex(PDF),
    frozen: NOW,
  });
});

test("an accepted cycle: what update --save sends is the camera-ready, frozen as such", async () => {
  const fs = built({
    cycles: [
      cycle("venue-2026", {
        submission: { id: 7 },
        outcome: { kind: "accepted", date: "2026-12-01", evidence: "m.eml" },
      }),
    ],
  });
  const r = await run({ sub: "update", save: true }, { files: fs });
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(text(fs, `${PAPER}/versions/venue-2026/camera-ready.tex`)).toBe(
    ASSEMBLED,
  );
  expect(r.out.at(-1)).toMatch(
    /^frozen {8}versions\/venue-2026\/camera-ready\.pdf/,
  );
});

test("a dry run, or a save the portal withheld, freezes nothing", async () => {
  const fs = built({ cycles: [SENT] });
  expect((await run({ sub: "update" }, { files: fs })).code).toBe(0);
  const withheld = fakePortal({
    update: ok({
      httpStatus: 200,
      valid: true,
      changes: [],
      messages: [],
      dryRun: true,
    }),
  });
  await run({ sub: "update", save: true }, { files: fs, portal: withheld });
  expect(fs.isFile(absolutePath(`${PAPER}/versions/lock.json`))).toBe(false);
  expect(
    fs.isFile(absolutePath(`${PAPER}/versions/venue-2026/submitted.pdf`)),
  ).toBe(false);
});

test("--save refuses, before anything is sent, a paper whose sources changed since the build: the source could not be frozen with its PDF", async () => {
  const fs = built({ cycles: [SENT] });
  fs.writeAtomic(
    absolutePath(`${PAPER}/sections/intro.tex`),
    enc("Rewritten after the build.\n"),
  );
  const r = await run({ sub: "update", save: true }, { files: fs });
  expect(r.code).toBe(2);
  expect(r.seen[0]?.calls).toStrictEqual([]);
  expect(r.errs).toStrictEqual([
    "refused: sections/intro.tex changed since the build, so the PDF is not what the source builds now, and the two could not be frozen together in versions/venue-2026/ — rebuild (`paperlint build`), run the dry run again, then --save; nothing was sent",
  ]);
  const unbuilt = files({ paper: { cycles: [SENT] } });
  const u = await run({ sub: "update", save: true }, { files: unbuilt });
  expect(u.code).toBe(2);
  expect(u.errs).toStrictEqual([
    "refused: no record of the build (_build/sources.json), so which source the PDF was built from is not known, and the two could not be frozen together in versions/venue-2026/ — rebuild (`paperlint build`), run the dry run again, then --save; nothing was sent",
  ]);
});

test("the flat form, without cycles: sent, and said not to be frozen — there is no attempt to name a folder after", async () => {
  const r = await run({ sub: "update", save: true });
  expect(r.code).toBe(0);
  expect(r.out.at(-1)).toBe(
    'not frozen    the paper keeps no "cycles" in paperlint.json: versions are frozen per attempt, in versions/<cycle>/ (docs/configuration.md, "The paper\'s cycles")',
  );
});

test("a lock that does not read: the files are frozen, the lock is left alone, and the command fails naming the fix", async () => {
  const fs = built({ cycles: [SENT] });
  fs.writeAtomic(absolutePath(`${PAPER}/versions/lock.json`), enc("{ broken"));
  const r = await run({ sub: "update", save: true }, { files: fs });
  expect(r.code).toBe(1);
  expect(
    fs.isFile(absolutePath(`${PAPER}/versions/venue-2026/submitted.pdf`)),
  ).toBe(true);
  expect(text(fs, `${PAPER}/versions/lock.json`)).toBe("{ broken");
  expect(r.errs.at(-1)).toMatch(
    /^versions\/lock\.json does not read \(not JSON: .*\): versions\/venue-2026\/submitted\.pdf and submitted\.tex are frozen, not recorded — `npx paperlint versions lock papers\/p` records them$/,
  );
});

test("new --save in the cycles form: the PDF it created the submission with is frozen as submitted", async () => {
  const fs = built(
    { authors: AUTHORS, cycles: [cycle("venue-2026")] },
    { "paper.tex": MAIN, "sections/intro.tex": INTRO },
  );
  const r = await run({ sub: "new", save: true }, { files: fs });
  expect(r.code, r.errs.join("\n")).toBe(0);
  expect(text(fs, `${PAPER}/versions/venue-2026/submitted.tex`)).toBe(
    ASSEMBLED,
  );
  expect(r.out).toContain(
    `frozen        versions/venue-2026/submitted.pdf (${String(PDF.length)} bytes) and submitted.tex (${String(enc(ASSEMBLED).length)} bytes), recorded in versions/lock.json`,
  );
});

test("new --save refuses the same way, before the portal is asked to create anything", async () => {
  const fs = built({ authors: AUTHORS, cycles: [cycle("venue-2026")] });
  fs.writeAtomic(
    absolutePath(`${PAPER}/sections/intro.tex`),
    enc("Rewritten after the build.\n"),
  );
  const r = await run({ sub: "new", save: true }, { files: fs });
  expect(r.code).toBe(2);
  expect(r.seen[0]?.calls ?? []).toStrictEqual([]);
  expect(r.errs.at(-1)).toMatch(
    /^refused: sections\/intro\.tex changed since the build/,
  );
});

test("a build whose record does not list paper.tex, and no paper.tex: refused — there is no source to freeze beside the PDF", async () => {
  const fs = files({
    paper: { cycles: [SENT] },
    extra: builtPaper(PAPER, { "sections/intro.tex": INTRO }, [
      { path: "sections/intro.tex", role: "body" },
    ]),
  });
  const r = await run({ sub: "update", save: true }, { files: fs });
  expect(r.code).toBe(2);
  expect(r.errs).toStrictEqual([
    "refused: no paper.tex to freeze beside the PDF, and the two could not be frozen together in versions/venue-2026/ — rebuild (`paperlint build`), run the dry run again, then --save; nothing was sent",
  ]);
});

test("show in the cycles form: the frozen versions follow the portal's copy, the draft measured against them", async () => {
  const fs = built({ cycles: [SENT] });
  await run({ sub: "update", save: true }, { files: fs });
  const r = await run({}, { files: fs });
  expect(r.code, r.errs.join("\n")).toBe(0);
  const at = r.out.indexOf("versions");
  expect(at).toBeGreaterThan(0);
  expect(r.out.slice(at - 1)).toStrictEqual([
    "",
    "versions",
    "  venue-2026  submitted  CURRENT (under review at venue)  9 B  frozen 2026-10-23 16:58 UTC",
    "  paper.tex   draft      target not chosen                same as venue-2026/submitted.tex",
  ]);
});
