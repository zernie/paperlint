/** A paper's answers to its venue's own form fields: checked against the preset's kinds before anything is sent. */
import assert from "node:assert/strict";
import { expect, test } from "vitest";
import {
  droppedFields,
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
    pc_conflicts: {
      kind: "pc_conflicts",
      required: false,
      label: null,
      options: [],
    },
    ACMCorAut: {
      kind: "email",
      required: false,
      label: "ACM corresponding author",
      options: [],
    },
    note: { kind: "text", required: false, label: null, options: [] },
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
  assert.match(refused({}), /^"fields"\.topics: /);
  assert.match(refused([]), /^"fields": /);
});

test("🔴 parsePaperFields: no fields at all, on a venue whose form requires one — refused, not sent empty", () => {
  const r = parsePaperFields(null, VENUE, "msr.jsonc");
  expect(r.ok ? "accepted" : r.error).toMatch(/^"fields"\.topics: /);
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
      title2: { kind: "text", required: true, label: null, options: [] },
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
