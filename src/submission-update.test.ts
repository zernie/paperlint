/** `paperlint submission update`: a dry run by default, what is sent, the portal's verdict and the exit. */
import assert from "node:assert/strict";
import { test } from "vitest";
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
} from "../test/submission-fixtures.ts";

test("update: a dry run by default — the paper's PDF sent, nothing saved, exit 0", async () => {
  const r = await run({ sub: "update" });
  assert.equal(r.code, 0);
  assert.deepEqual(r.seen[0]?.calls, [
    [
      "update",
      7,
      { pdf: { name: "paper.pdf", bytes: PDF }, abstract: null, submit: false },
      { save: false },
    ],
  ]);
  assert.deepEqual(r.out, [
    CHECK("papers/p/paper.pdf", "the call for papers, https://example.org/cfp"),
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
  assert.equal(r.code, 0);
  assert.deepEqual(r.seen[0]?.calls, [
    [
      "update",
      7,
      {
        pdf: { name: "other.pdf", bytes: PDF },
        abstract: "The abstract.",
        submit: true,
      },
      { save: true },
    ],
  ]);
  // Guards: the PDF that is sent is the one named, and --save is told to check it too.
  assert.deepEqual(r.out.slice(0, 2), [
    CHECK("other.pdf", "the call for papers, https://example.org/cfp"),
    "saved",
  ]);
});

test("🔴 update: the check line names the venue's call from the preset's `url`; a preset that names no venue gets the generic line", async () => {
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
  assert.equal(r.code, 0);
  assert.equal(
    r.out[0],
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
  assert.equal(r1.code, 1);
  assert.deepEqual(r1.out.slice(3), [
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
  assert.equal(
    (await run({ sub: "update" }, { portal: fakePortal({ update: status }) }))
      .code,
    1,
  );
  const unreachable = err<PortalFailure>({
    kind: "unreachable",
    detail: "down",
  });
  const r3 = await run(
    { sub: "update" },
    { portal: fakePortal({ update: unreachable }) },
  );
  assert.equal(r3.code, 1);
  assert.deepEqual(r3.errs, ["the portal cannot be reached: down"]);
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
  assert.equal(r.out[1], "SAVE WITHHELD by the portal — nothing changed");
});

test("update: no PDF to send, or no abstract file, is refused before the portal is asked", async () => {
  const r1 = await run({ sub: "update", pdf: "nope.pdf" });
  assert.equal(r1.code, 2);
  assert.deepEqual(r1.errs, [
    "no PDF at nope.pdf — build the paper, or name one with --pdf",
  ]);
  assert.deepEqual(r1.seen[0]?.calls, []);
  const r2 = await run({ sub: "update", abstract: "nope.txt" });
  assert.equal(r2.code, 2);
  assert.deepEqual(r2.errs, ["--abstract: no file at nope.txt"]);
});
