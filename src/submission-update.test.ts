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
  NO_ERRORS,
  facts,
  DEFAULT_TEX,
  VIEW,
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
        title: null,
        abstract: null,
        submit: false,
        fields: {},
      },
      { save: false },
    ],
  ]);
  expect(r.out).toStrictEqual([
    CHECK("papers/p/paper.pdf", "the call for papers, https://example.org/cfp"),
    NO_ERRORS,
    NOT_CHECKED,
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
        title: null,
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
    NO_ERRORS,
    NOT_CHECKED,
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

/** `update`'s title line for the made-up paper, which has no paper.tex and no PDF Title. */
const NOT_CHECKED =
  "title         not checked — no \\title in paper.tex, and the PDF names no Title — add \\title{…}, or \\hypersetup{pdftitle={…}}, and rebuild";

// ── the venue check before a send (paperlint#264) ─────────────────────────────────────

/** A paper of kind `short` (6 body pages) at a venue over AIDC, not blind, built 8 body pages long. */
const OVER = files({
  venue: { extends: "paperlint:aidc-2026", blind: false },
  paper: { extends: "../../venue.jsonc", kind: "short", submission: { id: 7 } },
  facts: facts({ body: 8 }),
});

/** What `new` and `update` refuse a `--save` with when no build facts describe the PDF. */
const REFUSAL =
  "refused: no build facts describe this PDF (none, unreadable, or of other bytes), so the venue rules did not see it — rebuild (`paperlint build`), run the dry run again, and read its venue check; nothing was sent";

/**
 * The block printed for one finding on the made-up paper (no paper.tex, so line 1): what the check
 * is — the venue rules at their default options, not the project's overrides — then lint's report.
 */
const LINT_BLOCK = (level: "error" | "warning", text: string): string[] => [
  "venue rules at their default options:",
  `${PAPER}/paper.tex`,
  `  1:2  ${level}  ${text}`,
  "",
  `✖ 1 problem (${level === "error" ? "1 error, 0 warnings" : "0 errors, 1 warning"})`,
];

test("update over the page limit: the venue rules' findings on that PDF, as lint prints them, before the portal is asked; a dry run still runs", async () => {
  const r = await run({ sub: "update" }, { files: OVER });
  expect(r.code).toBe(0);
  expect(r.out.slice(1, 8)).toStrictEqual([
    ...LINT_BLOCK(
      "error",
      "body pages (up to the references on page 9): 8, over the limit 6 for venue/short — a desk reject; cut the text  format/page-limit",
    ),
    NOT_CHECKED,
    "dry run — the portal checked the change and kept nothing; --save sends it for real",
  ]);
  expect(r.seen[0]?.calls).toHaveLength(1);
});

test("update --save over the limit: the same findings, and the send goes ahead — the person decides on them, not the command", async () => {
  const r = await run({ sub: "update", save: true }, { files: OVER });
  expect([r.code, r.errs, r.out[2], r.out[7]]).toStrictEqual([
    0,
    [],
    `${PAPER}/paper.tex`,
    "saved",
  ]);
});

test("no geometry measured: pdf/measured says the page checks did not run, so the check never reads as no errors", async () => {
  const r = await run(
    { sub: "update" },
    { files: files({ facts: facts({ measured: false }) }) },
  );
  expect(r.out.slice(1, 6)).toStrictEqual(
    LINT_BLOCK(
      "warning",
      "the build measured no page geometry (banal was not found or failed), so page size, columns, page limits and font sizes were NOT checked — run `paperlint toolchain`, then `paperlint build`  pdf/measured",
    ),
  );
});

test("update --save with facts about other bytes, or none: refused with exit 2 and nothing sent; the dry run prints the finding and goes on", async () => {
  const later = files({
    extra: { [`${PAPER}/paper.pdf`]: new TextEncoder().encode("%PDF later") },
  });
  const saved = await run({ sub: "update", save: true }, { files: later });
  expect([saved.code, saved.errs, saved.seen[0]?.calls]).toStrictEqual([
    2,
    [REFUSAL],
    [],
  ]);
  const dry = await run({ sub: "update" }, { files: later });
  expect([dry.code, dry.errs, dry.seen[0]?.calls.length]).toStrictEqual([
    0,
    [],
    1,
  ]);
  expect(dry.out.slice(1, 6)).toStrictEqual(
    LINT_BLOCK(
      "error",
      "_build/paper.facts.json describes a paper.pdf with another SHA-256 than the PDF being sent, so the venue checks would judge other bytes — rebuild the paper (`paperlint build`) from the source of the PDF you send  pdf/fresh",
    ),
  );
  const unbuilt = await run(
    { sub: "update", save: true, submit: true },
    { files: files({ facts: null }) },
  );
  expect([unbuilt.code, unbuilt.errs, unbuilt.seen[0]?.calls]).toStrictEqual([
    2,
    [REFUSAL],
    [],
  ]);
  const broken = await run(
    { sub: "update", save: true },
    { files: files({ facts: "{" }) },
  );
  expect([broken.code, broken.errs]).toStrictEqual([2, [REFUSAL]]);
});

test("facts whose SHA-256 is the sent bytes' hold, wherever the PDF they name is — even gone from disk", async () => {
  const gone = files({ facts: facts({ pdf: "gone.pdf" }) });
  const r = await run({ sub: "update", save: true }, { files: gone });
  expect([r.code, r.errs, r.out[1]]).toStrictEqual([0, [], NO_ERRORS]);
});

/** A paper whose current cycle is still porting to the venue's template, with the facts given. */
const porting = (factsText?: string | null) =>
  files({
    paper: {
      cycles: [
        {
          id: "venue-2027",
          venue: { kind: "preset", extends: "../../venue.jsonc" },
          opened: "2026-09-09",
          phase: "porting",
          submission: { id: 7 },
        },
      ],
    },
    ...(factsText === undefined ? {} : { facts: factsText }),
  });

test("a cycle still porting to the venue's template: no venue rule runs, and the check says so rather than no errors", async () => {
  const r = await run({ sub: "update" }, { files: porting() });
  expect(r.out[1]).toBe(
    "venue rules: none run — the current cycle's phase is \"porting\", so the venue's format does not apply yet",
  );
});

test("porting skips the venue rules, not the freshness: --save with facts about other bytes, or none, is still refused", async () => {
  const stale = await run(
    { sub: "update", save: true },
    { files: porting(facts({ sha: "b".repeat(64) })) },
  );
  expect([stale.code, stale.errs, stale.seen[0]?.calls]).toStrictEqual([
    2,
    [REFUSAL],
    [],
  ]);
  const unbuilt = await run(
    { sub: "update", save: true },
    { files: porting(null) },
  );
  expect([unbuilt.code, unbuilt.errs]).toStrictEqual([2, [REFUSAL]]);
});

/** The made-up paper with a `\title`, so `update` has a title to compare with the portal's. */
const titled = (tex: string = DEFAULT_TEX) =>
  files({ extra: { [`${PAPER}/paper.tex`]: tex } });

test("🔴 update: a \\title that differs from the portal's is sent, and said, in the dry run", async () => {
  const r = await run({ sub: "update" }, { files: titled() });
  expect(r.code).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([
    ["show", 7],
    [
      "update",
      7,
      {
        pdf: { name: "paper.pdf", bytes: PDF },
        title: "Agents That Lie",
        abstract: null,
        submit: false,
        fields: {},
      },
      { save: false },
    ],
  ]);
  expect(r.out.slice(0, 4)).toStrictEqual([
    CHECK("papers/p/paper.pdf", "the call for papers, https://example.org/cfp"),
    NO_ERRORS,
    "title         sends «Agents That Lie» — the portal has «A Fake Title»",
    "dry run — the portal checked the change and kept nothing; --save sends it for real",
  ]);
});

test("update: a \\title the portal already holds is not sent", async () => {
  const same = fakePortal({
    show: ok({ ...VIEW, title: " Agents  That Lie " }),
  });
  const r = await run({ sub: "update" }, { files: titled(), portal: same });
  expect(r.code).toBe(0);
  const [, sent] = r.seen[0]?.calls ?? [];
  expect(sent).toStrictEqual([
    "update",
    7,
    {
      pdf: { name: "paper.pdf", bytes: PDF },
      title: null,
      abstract: null,
      submit: false,
      fields: {},
    },
    { save: false },
  ]);
  expect(r.out[2]).toBe(
    "title         unchanged — the portal holds «Agents That Lie»",
  );
});

test("update: a title paperlint cannot read is said, nothing asked of the portal for it, and the PDF still sent", async () => {
  const r = await run({ sub: "update" });
  expect(r.code).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([
    ["update", 7, expect.anything(), { save: false }],
  ]);
  expect(r.out[2]).toBe(NOT_CHECKED);
});

test("update: the portal refusing the read of its title exits 1 and sends nothing", async () => {
  const refused = fakePortal({
    show: err<PortalFailure>({
      kind: "refused",
      httpStatus: 401,
      messages: [{ message: "Missing credentials", field: null, status: 2 }],
    }),
  });
  const r = await run({ sub: "update" }, { files: titled(), portal: refused });
  expect(r.code).toBe(1);
  expect(r.seen[0]?.calls).toStrictEqual([["show", 7]]);
});

test("update: a portal with no title gets the paper's, said as none", async () => {
  const none = fakePortal({ show: ok({ ...VIEW, title: null }) });
  const r = await run({ sub: "update" }, { files: titled(), portal: none });
  expect(r.out[2]).toBe(
    "title         sends «Agents That Lie» — the portal has none",
  );
});
