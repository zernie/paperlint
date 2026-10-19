/** The submission values: a paper's `submission` key, the portal kinds an adapter exists for, words. */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  parsePaperAuthors,
  parsePaperSubmission,
  withSubmissionId,
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

test("parsePaperAuthors: absent is null; each author trimmed, in order, affiliation optional", () => {
  assert.deepEqual(parsePaperAuthors(undefined), { ok: true, value: null });
  assert.deepEqual(
    parsePaperAuthors([
      { name: " Ada Lovelace ", email: "ada@example.org", affiliation: "AE" },
      { name: "Bob", email: " bob@example.org " },
    ]),
    {
      ok: true,
      value: [
        { name: "Ada Lovelace", email: "ada@example.org", affiliation: "AE" },
        { name: "Bob", email: "bob@example.org", affiliation: null },
      ],
    },
  );
});

test("🔴 parsePaperAuthors: every malformed list refused with what to fix — never a partial list", () => {
  const shape = /^"authors" must be a non-empty list of \{ "name"/;
  const ada = { name: "Ada", email: "ada@example.org" };
  const cases: readonly (readonly [unknown, RegExp])[] = [
    [[], shape],
    ["Ada", shape],
    [["Ada"], shape],
    [
      [ada, { ...ada, orcid: "x" }],
      /^"authors"\[1\] has an unknown key "orcid" — known: name, email, affiliation$/,
    ],
    [
      [{ ...ada, name: " " }],
      /^"authors"\[0\]: "name" must be a non-empty string$/,
    ],
    [
      [{ ...ada, email: "ada" }],
      /^"authors"\[0\]: "email" must be an email address, got "ada"$/,
    ],
    [
      [{ name: "Ada" }, ada],
      /^"authors"\[0\]: "email" must be an email address, got undefined$/,
    ],
    [
      [{ ...ada, affiliation: "" }],
      /^"authors"\[0\]: "affiliation", when given, must be a non-empty string$/,
    ],
    [
      [ada, { name: "Ada 2", email: "ADA@example.org" }],
      /^"authors": the email ada@example\.org is given twice$/,
    ],
  ];
  for (const [v, why] of cases) {
    const r = parsePaperAuthors(v);
    assert.ok(!r.ok, JSON.stringify(v));
    assert.match(r.error, why);
  }
});

test("withSubmissionId: the flat form at the top level; the cycles form in the last cycle, the others untouched", () => {
  assert.deepEqual(withSubmissionId({ extends: "x" }, 4), {
    ok: true,
    value: { extends: "x", submission: { id: 4 } },
  });
  assert.deepEqual(
    withSubmissionId({ cycles: [{ id: "a" }, { id: "b" }] }, 4),
    {
      ok: true,
      value: { cycles: [{ id: "a" }, { id: "b", submission: { id: 4 } }] },
    },
  );
});

test("🔴 withSubmissionId: nowhere to record it — refused, never guessed", () => {
  assert.deepEqual(withSubmissionId([], 4), {
    ok: false,
    error: "must be a JSON object",
  });
  for (const cycles of [[], "x"])
    assert.deepEqual(withSubmissionId({ cycles }, 4), {
      ok: false,
      error: `"cycles" has no attempt to record the submission in`,
    });
  assert.deepEqual(withSubmissionId({ cycles: [{ id: "a" }, 3] }, 4), {
    ok: false,
    error: `the last entry of "cycles" is not an object`,
  });
});
