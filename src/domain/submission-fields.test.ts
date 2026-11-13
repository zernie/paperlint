/** A paper's answers to its venue's own form fields: checked against the preset's kinds before anything is sent. */
import assert from "node:assert/strict";
import { expect, test } from "vitest";
import {
  declareField,
  droppedFields,
  fileFieldKeys,
  parsePaperFields,
  type VenueFields,
} from "./submission-fields.ts";

/** The fields of an edition's form, as a preset records them (the topics of msr2027, two of them). */
const VENUE: VenueFields = {
  source: "portal",
  url: "https://example.org/api/searchcompletion",
  read: "2026-10-20",
  fields: {
    topics: {
      kind: "checkboxes",
      required: true,
      label: null,
      options: [
        "SE Topic: AI for software engineering",
        "Performance analysis and testing",
      ],
    },
    pc_conflicts: { kind: "pc_conflicts", required: false, label: null },
    ACMCorAut: {
      kind: "email",
      required: false,
      label: "ACM corresponding author",
    },
    note: { kind: "text", required: false, label: null },
  },
};

test("parsePaperFields: absent on a venue that records no fields → nothing to send; every kind's value passes as given", () => {
  assert.deepEqual(parsePaperFields(null, null, "msr.jsonc"), {
    ok: true,
    value: {},
  });
  const fields = {
    topics: ["SE Topic: AI for software engineering"],
    pc_conflicts: {
      "pc@example.org": "collaborator",
      "chair@example.org": true,
    },
    ACMCorAut: "author@example.org",
    note: "free text",
  };
  assert.deepEqual(parsePaperFields(fields, VENUE, "msr.jsonc"), {
    ok: true,
    value: fields,
  });
});

test("🔴 parsePaperFields: a topic the form does not offer is refused, naming what it offers — before any request", () => {
  assert.deepEqual(
    parsePaperFields(
      { topics: ["AI for software engineering"] },
      VENUE,
      "msr.jsonc",
    ),
    {
      ok: false,
      error:
        '"fields".topics[0]: "AI for software engineering" is not one of the form\'s options — the form offers: "SE Topic: AI for software engineering", "Performance analysis and testing"',
    },
  );
});

test("🔴 parsePaperFields: each other wrong answer is refused by key", () => {
  const refused = (v: unknown): string => {
    const r = parsePaperFields(v, VENUE, "msr.jsonc");
    return r.ok ? "accepted" : r.error;
  };
  assert.equal(
    refused({ topics: [] }),
    '"fields".topics: the form requires at least one — the form offers: "SE Topic: AI for software engineering", "Performance analysis and testing"',
  );
  assert.equal(
    refused({
      topics: [
        "Performance analysis and testing",
        "Performance analysis and testing",
      ],
    }),
    '"fields".topics: an option is given twice — the form offers: "SE Topic: AI for software engineering", "Performance analysis and testing"',
  );
  assert.equal(
    refused({ topics: ["Performance analysis and testing"], paper_type: "x" }),
    '"fields" has "paper_type", which the venue\'s form does not ask (it asks: topics, pc_conflicts, ACMCorAut, note)',
  );
  assert.match(
    refused({
      topics: ["Performance analysis and testing"],
      ACMCorAut: "Erdni Zergetaev",
    }),
    /^"fields"\.ACMCorAut: /,
  );
  assert.match(
    refused({
      topics: ["Performance analysis and testing"],
      pc_conflicts: { "pc@example.org": "" },
    }),
    /^"fields"\.pc_conflicts\.pc@example\.org: /,
  );
  assert.match(refused({}), /^"fields" does not fill 1 field /);
  assert.match(refused([]), /^"fields": /);
});

test("🔴 parsePaperFields: no fields at all, on a venue whose form requires one — refused, naming it, not sent empty", () => {
  const r = parsePaperFields(null, VENUE, "msr.jsonc");
  expect(r.ok ? "accepted" : r.error).toBe(
    '"fields" does not fill 1 field the venue\'s form requires: topics (checkboxes: one or more of "SE Topic: AI for software engineering", "Performance analysis and testing")',
  );
});

test("parsePaperFields: an optional checkbox list may be empty; a required text may not", () => {
  const venue: VenueFields = {
    ...VENUE,
    fields: {
      tags: {
        kind: "checkboxes",
        required: false,
        label: null,
        options: ["x"],
      },
      title2: { kind: "text", required: true, label: null },
    },
  };
  expect(parsePaperFields({ tags: [], title2: "t" }, venue, "v")).toStrictEqual(
    { ok: true, value: { tags: [], title2: "t" } },
  );
  const r = parsePaperFields({ title2: "  " }, venue, "v");
  expect(r.ok ? "accepted" : r.error).toMatch(/^"fields"\.title2: /);
});

test("🔴 parsePaperFields: fields on a venue whose preset records none — refused, naming where it looked", () => {
  assert.deepEqual(parsePaperFields({ topics: ["x"] }, null, "msr.jsonc"), {
    ok: false,
    error:
      '"fields" is set, but the venue preset records no "submission_fields" (read: msr.jsonc) — record the form\'s fields in the venue\'s preset first, or drop "fields"',
  });
});

test("🔴 droppedFields: a checkbox list sent, missing from the changes and named by the portal — dropped; otherwise not", () => {
  const sent = { topics: ["Performance analysis and testing"], note: "x" };
  // Measured on HotCRP 2026-10-20: an unknown topic → `change_list` without `topics`, and
  // «topics: At least one selection required».
  assert.deepEqual(
    droppedFields(sent, VENUE, {
      changes: [],
      messageFields: ["topics", "pc_conflicts"],
    }),
    ["topics"],
  );
  assert.deepEqual(
    droppedFields(sent, VENUE, {
      changes: ["topics"],
      messageFields: ["topics"],
    }),
    [],
  );
  // The same topics as the portal already holds: no change, and nothing said about them.
  assert.deepEqual(
    droppedFields(sent, VENUE, { changes: [], messageFields: [null] }),
    [],
  );
  assert.deepEqual(
    droppedFields({ topics: [] }, VENUE, {
      changes: [],
      messageFields: ["topics"],
    }),
    [],
  );
  assert.deepEqual(
    droppedFields(sent, null, { changes: [], messageFields: ["topics"] }),
    [],
  );
});

/** A form with one field of every kind a paper can answer, the required ones marked. */
const ALL: VenueFields = {
  source: "form",
  url: "https://example.org/form",
  read: "2026-11-13",
  fields: {
    attest: { kind: "checkbox", required: true, label: "Attestation" },
    anonymous: { kind: "checkbox", required: false, label: null },
    paper_type: {
      kind: "choice",
      required: true,
      label: "Submission Type",
      options: ["Full", "Short"],
    },
    area: { kind: "choice", required: false, label: null, options: ["A", "B"] },
    pages: { kind: "integer", required: false, label: null, min: 1, max: 12 },
    score: { kind: "number", required: false, label: null, min: -1, max: null },
    summary: { kind: "multiline_text", required: false, label: null },
    appendix: { kind: "attachments", required: true, label: "Appendix" },
    code: { kind: "document", required: false, label: null },
  },
};

const REQUIRED = { attest: true, paper_type: "Full" };

/** What a paper's `fields` comes to against `ALL`: the value sent, or the refusal's text. */
const against = (fields: unknown): unknown => {
  const r = parsePaperFields(fields, ALL, "v.jsonc");
  return r.ok ? r.value : r.error;
};

test("parsePaperFields: a valid answer of every kind passes as given, line breaks of a multiline text kept", () => {
  const fields = {
    ...REQUIRED,
    anonymous: false,
    area: "B",
    pages: 12,
    score: -0.5,
    summary: "line one\nline two\n",
  };
  expect(against(fields)).toStrictEqual(fields);
});

test.each([
  ["a checkbox that is not a boolean", { attest: "yes" }, "attest"],
  ["a required checkbox left unticked", { attest: false }, "attest"],
  [
    "a choice spelled differently from the form",
    { paper_type: "full" },
    "paper_type",
  ],
  ["a choice given by its position", { paper_type: 1 }, "paper_type"],
  ["a choice given as a list", { paper_type: ["Full"] }, "paper_type"],
  ["a whole number given as a decimal", { pages: 2.5 }, "pages"],
  ["a whole number as a string", { pages: "3" }, "pages"],
  ["a whole number under its minimum", { pages: 0 }, "pages"],
  ["a whole number over its maximum", { pages: 13 }, "pages"],
  ["a number under its minimum", { score: -1.5 }, "score"],
  ["a number as a string", { score: "1.5" }, "score"],
  ["a multiline text that is a list", { summary: ["a"] }, "summary"],
  ["a file field answered", { code: "main.py" }, "code"],
])("🔴 parsePaperFields: %s — refused, naming the key", (_what, bad, key) => {
  const refused = against({ ...REQUIRED, ...bad });
  expect(refused).toMatch(new RegExp(`^"fields"\\.${key}: `));
});

test("🔴 parsePaperFields: a choice names what the form offers; a file field says paperlint sends none", () => {
  expect(against({ ...REQUIRED, paper_type: "Long" })).toBe(
    '"fields".paper_type: "Long" is not one of the form\'s options — the form offers: "Full", "Short"',
  );
  expect(against({ ...REQUIRED, code: "main.py" })).toBe(
    '"fields".code: paperlint sends no file for this field — add it on the site',
  );
});

test("🔴 parsePaperFields: every required field left unfilled is named at once, with the shape it takes; a file field is not asked for", () => {
  expect(against({})).toBe(
    '"fields" does not fill 2 fields the venue\'s form requires: attest "Attestation" (checkbox: true), paper_type "Submission Type" (choice: one of "Full", "Short")',
  );
  expect(against({ attest: true })).toBe(
    '"fields" does not fill 1 field the venue\'s form requires: paper_type "Submission Type" (choice: one of "Full", "Short")',
  );
  expect(against(REQUIRED)).toStrictEqual(REQUIRED);
});

test("fileFieldKeys: the fields paperlint sends nothing for, in the form's order; none for a venue that records none", () => {
  expect(fileFieldKeys(ALL)).toStrictEqual(["appendix", "code"]);
  expect(fileFieldKeys(null)).toStrictEqual([]);
});

test.each([
  ["a choice", { kind: "choice", options: ["A", "B"] }, true],
  ["a choice without options", { kind: "choice" }, false],
  [
    "a choice with a repeated option",
    { kind: "choice", options: ["A", "A"] },
    false,
  ],
  [
    "a checkboxes with an empty option",
    { kind: "checkboxes", options: [""] },
    false,
  ],
  ["a text with options", { kind: "text", options: ["A"] }, false],
  ["an integer with bounds", { kind: "integer", min: 1, max: 5 }, true],
  ["an integer with only a minimum", { kind: "integer", min: 1 }, true],
  [
    "an integer whose minimum exceeds its maximum",
    { kind: "integer", min: 5, max: 1 },
    false,
  ],
  ["a number with a bound", { kind: "number", max: 2.5 }, true],
  ["a checkbox with a bound", { kind: "checkbox", min: 1 }, false],
  [
    "a text with a label",
    { kind: "text", label: "Note", required: true },
    true,
  ],
  ["an attachments field", { kind: "attachments" }, true],
] as const)("declareField: %s → accepted: %s", (_what, json, accepted) => {
  expect(declareField(json).ok).toBe(accepted);
});

test("declareField: the declaration is typed by kind, absent values made explicit", () => {
  expect(declareField({ kind: "integer", min: 1 })).toStrictEqual({
    ok: true,
    value: { kind: "integer", required: false, label: null, min: 1, max: null },
  });
  expect(
    declareField({
      kind: "choice",
      options: ["A"],
      required: true,
      label: "T",
    }),
  ).toStrictEqual({
    ok: true,
    value: { kind: "choice", required: true, label: "T", options: ["A"] },
  });
  expect(declareField({ kind: "choice", options: ["A", "A"] })).toStrictEqual({
    ok: false,
    error: 'options repeat "A"',
  });
});

test("🔴 parsePaperFields: the line for an unfilled field says what each kind takes, bounds included", () => {
  const venue: VenueFields = {
    source: "form",
    url: "https://example.org/form",
    read: "2026-11-13",
    fields: {
      n: { kind: "integer", required: true, label: null, min: 1, max: 12 },
      x: { kind: "number", required: true, label: null, min: null, max: null },
      y: { kind: "number", required: true, label: null, min: 0, max: null },
      pc: { kind: "pc_conflicts", required: true, label: null },
      many: { kind: "checkboxes", required: true, label: null, options: ["a"] },
      mail: { kind: "email", required: true, label: null },
    },
  };
  const r = parsePaperFields({}, venue, "v");
  expect(r.ok ? "accepted" : r.error).toBe(
    '"fields" does not fill 6 fields the venue\'s form requires: n (a whole number from 1 up to 12), x (a number), y (a number from 0), pc (pc_conflicts: PC member\'s email → conflict type), many (checkboxes: one or more of "a"), mail (email)',
  );
});

test("🔴 parsePaperFields: a required multiline text may not be blank; an optional one may be empty", () => {
  const venue: VenueFields = {
    source: "form",
    url: "https://example.org/form",
    read: "2026-11-13",
    fields: {
      must: { kind: "multiline_text", required: true, label: null },
      may: { kind: "multiline_text", required: false, label: null },
    },
  };
  expect(parsePaperFields({ must: " \n " }, venue, "v")).toStrictEqual({
    ok: false,
    error: '"fields".must: the form requires an entry',
  });
  expect(parsePaperFields({ must: "x", may: "" }, venue, "v")).toStrictEqual({
    ok: true,
    value: { must: "x", may: "" },
  });
});
