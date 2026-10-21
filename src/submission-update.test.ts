/** `paperlint submission update`: a dry run by default, what is sent, the portal's verdict and the exit. */
import { expect, test } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { err, ok } from "./domain/result.ts";
import { type PortalFailure, type UpdateOutcome } from "./domain/submission.ts";
import {
  PAPER,
  SITE,
  PDF,
  HEX,
  files,
  fakePortal,
  CHECK,
  run,
  PREFLIGHT_OK,
  facts,
  pagesText,
} from "../test/submission-fixtures.ts";

test("update: a dry run by default — the paper's PDF sent, nothing saved, exit 0", async () => {
  const r = await run({ sub: "update" });
  expect(r.code).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([
    [
      "update",
      7,
      {
        pdf: { name: "paper.pdf", bytes: PDF },
        abstract: null,
        submit: false,
        fields: {},
      },
      { save: false },
    ],
  ]);
  expect(r.out).toStrictEqual([
    CHECK("papers/p/paper.pdf", "the call for papers, https://example.org/cfp"),
    ...PREFLIGHT_OK(),
    "dry run — the portal checked the change and kept nothing; --save sends it for real",
    "HTTP          200",
    "valid         yes",
    "changes       submission",
    `local PDF     papers/p/paper.pdf sha2-${HEX}`,
  ]);
});

test("update --save --submit --abstract --pdf: all of it sent, and said to be saved", async () => {
  const fs = files({
    extra: { "/w/abs.txt": "  The abstract.\n", "/w/other.pdf": PDF },
  });
  const r = await run(
    {
      sub: "update",
      save: true,
      submit: true,
      abstract: "abs.txt",
      pdf: "other.pdf",
    },
    { files: fs },
  );
  expect(r.code).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([
    [
      "update",
      7,
      {
        pdf: { name: "other.pdf", bytes: PDF },
        abstract: "The abstract.",
        submit: true,
        fields: {},
      },
      { save: true },
    ],
  ]);
  // Guards: the PDF that is sent is the one named, and --save is told to check it too.
  expect(r.out.slice(0, 4)).toStrictEqual([
    CHECK("other.pdf", "the call for papers, https://example.org/cfp"),
    ...PREFLIGHT_OK("other.pdf"),
    "saved",
  ]);
});

test("update: the check line names the venue's call from the preset's `url`; a preset that names no venue gets the generic line", async () => {
  const family = memoryFiles({
    "/w/package.json": "{}",
    "/w/house.jsonc": JSON.stringify({
      type: "family",
      extends: "paperlint:ieee-conference",
      portal: { kind: "hotcrp", url: `${SITE}/` },
    }),
    [`${PAPER}/paperlint.json`]: JSON.stringify({
      extends: "../../house.jsonc",
      submission: { id: 7 },
    }),
    [`${PAPER}/paper.pdf`]: PDF,
  });
  const r = await run({ sub: "update" }, { files: family });
  expect(r.code).toBe(0);
  expect(r.out[0]).toBe(
    CHECK("papers/p/paper.pdf", "the venue's call for papers"),
  );
});

test("update: valid:false, or a non-2xx status, exits 1 with the portal's messages", async () => {
  const invalid = ok<UpdateOutcome>({
    httpStatus: 200,
    valid: false,
    changes: [],
    messages: [{ message: "Bad PDF", field: "submission", status: 2 }],
    dryRun: true,
  });
  const r1 = await run(
    { sub: "update" },
    { portal: fakePortal({ update: invalid }) },
  );
  expect(r1.code).toBe(1);
  expect(r1.out.slice(5)).toStrictEqual([
    "valid         NO",
    "changes       —",
    `local PDF     papers/p/paper.pdf sha2-${HEX}`,
    "  portal says: submission: Bad PDF",
  ]);
  const status = ok<UpdateOutcome>({
    httpStatus: 400,
    valid: true,
    changes: [],
    messages: [],
    dryRun: false,
  });
  expect(
    (await run({ sub: "update" }, { portal: fakePortal({ update: status }) }))
      .code,
  ).toBe(1);
  const unreachable = err<PortalFailure>({
    kind: "unreachable",
    detail: "down",
  });
  const r3 = await run(
    { sub: "update" },
    { portal: fakePortal({ update: unreachable }) },
  );
  expect(r3.code).toBe(1);
  expect(r3.errs).toStrictEqual(["the portal cannot be reached: down"]);
});

test("update --save that the portal withheld says so", async () => {
  const withheld = ok<UpdateOutcome>({
    httpStatus: 200,
    valid: true,
    changes: [],
    messages: [],
    dryRun: true,
  });
  const r = await run(
    { sub: "update", save: true },
    { portal: fakePortal({ update: withheld }) },
  );
  expect(r.out[3]).toBe("SAVE WITHHELD by the portal — nothing changed");
});

test("update: no PDF to send, or no abstract file, is refused before the portal is asked", async () => {
  const r1 = await run({ sub: "update", pdf: "nope.pdf" });
  expect(r1.code).toBe(2);
  expect(r1.errs).toStrictEqual([
    "no PDF at nope.pdf — build the paper, or name one with --pdf",
  ]);
  expect(r1.seen[0]?.calls).toStrictEqual([]);
  const r2 = await run({ sub: "update", abstract: "nope.txt" });
  expect(r2.code).toBe(2);
  expect(r2.errs).toStrictEqual(["--abstract: no file at nope.txt"]);
});

// ── the preflight (paperlint#264) ─────────────────────────────────────────────────────

/** A paper of kind `short` (6 body pages) at a venue over AIDC, not blind, built 8 body pages long. */
const OVER = files({
  venue: { extends: "paperlint:aidc", blind: false },
  paper: { extends: "../../venue.jsonc", kind: "short", submission: { id: 7 } },
  facts: facts({ pages: pagesText(8) }),
});
const OVER_HEADLINE =
  "PREFLIGHT: OVER LIMIT — body pages (up to the references on page 9): 8 > 6, for venue/short";

test("update over the limit, dry run: the PREFLIGHT block says OVER LIMIT before the portal is asked, and the dry run still runs, exit 0", async () => {
  const r = await run({ sub: "update" }, { files: OVER });
  expect(r.code).toBe(0);
  expect(r.out.slice(1, 3)).toStrictEqual([
    OVER_HEADLINE,
    "  format/page-limit: body pages (up to the references on page 9): 8, over the limit 6 for venue/short — a desk reject; cut the text",
  ]);
  expect(r.out[3]).toMatch(/^ {2}limit {7}venue\/short: body_pages_max 6 — /u);
  expect(r.out.slice(4, 6)).toStrictEqual([
    `  sent        papers/p/paper.pdf sha2-${HEX}`,
    "dry run — the portal checked the change and kept nothing; --save sends it for real",
  ]);
  expect(r.seen[0]?.calls).toHaveLength(1);
});

test("update --save over the limit: the same block, and the send goes ahead — sending over the limit is the author's decision, not the command's", async () => {
  const r = await run({ sub: "update", save: true }, { files: OVER });
  expect(r.code).toBe(0);
  expect(r.out[1]).toBe(OVER_HEADLINE);
  expect(r.out).toContain("saved");
  expect(r.errs).toStrictEqual([]);
});

test("update --save with facts about other bytes, or none: refused with exit 2, nothing sent; the dry run reports it and goes on", async () => {
  const other = new TextEncoder().encode("%PDF a later build");
  const later = files({ extra: { [`${PAPER}/paper.pdf`]: other } });
  const saved = await run({ sub: "update", save: true }, { files: later });
  expect(saved.code).toBe(2);
  expect(saved.seen[0]?.calls).toStrictEqual([]);
  expect(saved.out[1]).toBe(
    "PREFLIGHT: STALE FACTS — _build/paper.facts.json describes a DIFFERENT paper.pdf than the one on disk (its SHA-256 differs), so the venue checks would judge an earlier build — rebuild the paper",
  );
  expect(saved.errs).toStrictEqual([
    "refused: the facts do not describe the PDF being sent, so it was not checked against the venue — nothing was sent. Rebuild, then run the dry run again and read its PREFLIGHT block",
  ]);
  const unbuilt = await run(
    { sub: "update", save: true, submit: true },
    { files: files({ facts: null }) },
  );
  expect([unbuilt.code, unbuilt.seen[0]?.calls]).toStrictEqual([2, []]);
  const dry = await run({ sub: "update" }, { files: later });
  expect([dry.code, dry.errs, dry.seen[0]?.calls.length]).toStrictEqual([
    0,
    [],
    1,
  ]);
  expect(dry.out[1]).toMatch(/^PREFLIGHT: STALE FACTS — /u);
});
