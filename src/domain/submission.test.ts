/** The submission values: a paper's `submission` key, the portal kinds an adapter exists for, words. */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  parsePaperSubmission,
  supportedPortal,
  wordCount,
} from "./submission.ts";

test("parsePaperSubmission: absent is null; { id } with a positive integer is the value", () => {
  assert.deepEqual(parsePaperSubmission(undefined), { ok: true, value: null });
  assert.deepEqual(parsePaperSubmission({ id: 7 }), {
    ok: true,
    value: { id: 7 },
  });
});

test("🔴 parsePaperSubmission: a string id, zero, a fraction, a list, an unknown key — each refused", () => {
  const shape = `"submission" must be { "id": <the submission number on the venue's portal> }`;
  for (const bad of [{ id: "7" }, { id: 0 }, { id: 1.5 }, [7], 7, null, {}])
    assert.deepEqual(parsePaperSubmission(bad), { ok: false, error: shape });
  assert.deepEqual(parsePaperSubmission({ id: 7, pid: 7 }), {
    ok: false,
    error: `"submission" has an unknown key "pid" — known: id`,
  });
});

test("supportedPortal: hotcrp is, with the trailing slash dropped; any other kind is refused by name", () => {
  assert.deepEqual(
    supportedPortal({ kind: "hotcrp", url: "https://example.test//" }),
    { ok: true, value: { kind: "hotcrp", url: "https://example.test" } },
  );
  assert.deepEqual(
    supportedPortal({ kind: "openreview", url: "https://example.test" }),
    {
      ok: false,
      error: `portal kind "openreview" is not supported; upload by hand`,
    },
  );
});

test("wordCount: runs of non-space, any whitespace between", () => {
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount("  one\ttwo\n\nthree  "), 3);
});
