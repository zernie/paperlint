/** `paperlint submission` with a venue whose preset records its form's own fields: checked, sent, a dropped option said. */
import { expect, test } from "vitest";
import { ok } from "./domain/result.ts";
import {
  PAPER,
  SITE,
  PDF,
  files,
  fakePortal,
  run,
  SUBMISSION_FIELDS,
} from "../test/submission-fixtures.ts";

const FIELDS = {
  topics: ["Group: Topic A"],
  pc_conflicts: { "pc@example.org": "collaborator" },
  ACMCorAut: "ada@example.org",
};

const paperWith = (fields: unknown) =>
  files({
    submissionFields: SUBMISSION_FIELDS,
    paper: { extends: "../../venue.jsonc", submission: { id: 7 }, fields },
  });

test("update: the paper's fields are checked and sent with the change, and printed first", async () => {
  const portal = fakePortal({
    update: ok({
      httpStatus: 200,
      valid: true,
      changes: ["topics", "pc_conflicts", "ACM corresponding author"],
      messages: [],
      dryRun: true,
    }),
  });
  const r = await run({ sub: "update" }, { files: paperWith(FIELDS), portal });
  expect(r.code).toBe(0);
  expect(r.seen[0]?.calls).toStrictEqual([
    [
      "update",
      7,
      {
        pdf: { name: "paper.pdf", bytes: PDF },
        abstract: null,
        submit: false,
        fields: FIELDS,
      },
      { save: false },
    ],
  ]);
  expect(r.out.slice(3, 6)).toStrictEqual([
    'field         topics: ["Group: Topic A"]',
    'field         pc_conflicts: {"pc@example.org":"collaborator"}',
    'field         ACMCorAut: "ada@example.org"',
  ]);
});

test("🔴 update: a topic the portal did not take — said, exit 1 (HotCRP drops an unknown one without an error)", async () => {
  const portal = fakePortal({
    update: ok({
      httpStatus: 200,
      valid: true,
      changes: [],
      messages: [
        {
          message: "At least one selection required",
          field: "topics",
          status: 2,
        },
      ],
      dryRun: true,
    }),
  });
  const r = await run({ sub: "update" }, { files: paperWith(FIELDS), portal });
  expect(r.code).toBe(1);
  expect(r.out.at(-1)).toBe(
    'NOT TAKEN     topics: the portal kept none of ["Group: Topic A"] — an option it does not know is dropped without an error; `paperlint submission topics` lists what it offers',
  );
});

test("🔴 a topic the venue's form does not offer: refused before anything is sent, exit 2", async () => {
  const r = await run(
    { sub: "update" },
    { files: paperWith({ topics: ["Topic A"] }) },
  );
  expect(r.code).toBe(2);
  expect(r.seen).toStrictEqual([]);
  expect(r.errs).toStrictEqual([
    `${PAPER}/paperlint.json: "fields".topics[0]: "Topic A" is not one of the form's options — the form offers: "Group: Topic A", "Topic B"`,
  ]);
});

test("new: the fields go with the creation; the venue's fields the paper left out are named as still to do", async () => {
  const fs = files({
    submissionFields: SUBMISSION_FIELDS,
    paper: {
      extends: "../../venue.jsonc",
      authors: [{ name: "Ada", email: "ada@example.org" }],
      fields: { topics: ["Topic B"] },
    },
    extra: {
      [`${PAPER}/paper.tex`]:
        "\\title{T}\\begin{document}\\begin{abstract}An abstract.\\end{abstract}\\end{document}",
    },
  });
  const portal = fakePortal({});
  const r = await run({ sub: "new" }, { files: fs, portal });
  expect(r.code).toBe(0);
  const call = r.seen[0]?.calls[0];
  expect(Array.isArray(call) ? call[1] : null).toMatchObject({
    fields: { topics: ["Topic B"] },
  });
  expect(r.out).toContain('field         topics: ["Topic B"]');
  expect(r.out).toContain(
    `still to do for ${SITE}/paper/<its number> — paperlint sent the title, the abstract, the authors and the PDF, and topics:`,
  );
  expect(r.out).toContain(
    `  - answer pc_conflicts in the paper's paperlint.json "fields" (the venue preset records it), then: npx paperlint submission update papers/p (a dry run; --save after your yes)`,
  );
});

test("topics: the portal's list against the preset's — agreeing exit 0, differing exit 1 with each difference marked", async () => {
  const same = await run(
    { sub: "topics" },
    {
      files: paperWith(undefined),
      portal: fakePortal({
        options: ok({ topics: ["Group: Topic A", "Topic B"] }),
      }),
    },
  );
  expect(same.code).toBe(0);
  expect(same.out).toStrictEqual([
    `topics on ${SITE}: 2; the preset records 2 (read 2026-10-20)`,
    "  ✓ Group: Topic A",
    "  ✓ Topic B",
  ]);
  const differs = await run(
    { sub: "topics" },
    {
      files: paperWith(undefined),
      portal: fakePortal({
        options: ok({ topics: ["Group: Topic A", "Topic C"] }),
      }),
    },
  );
  expect(differs.code).toBe(1);
  expect(differs.out).toStrictEqual([
    `topics on ${SITE}: 2; the preset records 2 (read 2026-10-20)`,
    "  ✓ Group: Topic A",
    "  + not in the preset: Topic C",
    "  − in the preset, not offered: Topic B",
  ]);
});

test("topics: a preset that records none — the portal's list, and what to record; exit 1", async () => {
  const r = await run(
    { sub: "topics" },
    { portal: fakePortal({ options: ok({ topics: ["Topic B"] }) }) },
  );
  expect(r.code).toBe(1);
  expect(r.out).toStrictEqual([
    `topics on ${SITE}: 1`,
    "  Topic B",
    'the venue preset records no "submission_fields" with "topics" — record these, spelled as listed, before a paper can send any',
  ]);
});

test("🔴 show and topics read past a paper's invalid fields — the commands that diagnose the drift", async () => {
  const bad = paperWith({ topics: ["Topic A"] });
  const shown = await run({ sub: "show" }, { files: bad });
  expect(shown.code).toBe(0);
  const topics = await run(
    { sub: "topics" },
    {
      files: bad,
      portal: fakePortal({
        options: ok({ topics: ["Group: Topic A", "Topic B"] }),
      }),
    },
  );
  expect(topics.code).toBe(0);
});

test("🔴 update on a venue whose form requires a topic, the paper giving no fields: refused, nothing sent", async () => {
  const r = await run({ sub: "update" }, { files: paperWith(undefined) });
  expect(r.code).toBe(2);
  expect(r.seen).toStrictEqual([]);
  expect(r.errs[0]).toMatch(/paperlint\.json: "fields"\.topics: /);
});

test("🔴 new: a topic the portal did not take — said, and exit 1 even though it created the submission", async () => {
  const fs = files({
    submissionFields: SUBMISSION_FIELDS,
    paper: {
      extends: "../../venue.jsonc",
      authors: [{ name: "Ada", email: "ada@example.org" }],
      fields: { topics: ["Topic B"] },
    },
    extra: {
      [`${PAPER}/paper.tex`]:
        "\\title{T}\\begin{document}\\begin{abstract}An abstract.\\end{abstract}\\end{document}",
    },
  });
  const portal = fakePortal({
    create: ok({
      httpStatus: 200,
      valid: true,
      changes: ["new", "title"],
      messages: [
        {
          message: "At least one selection required",
          field: "topics",
          status: 2,
        },
      ],
      dryRun: true,
      id: null,
    }),
  });
  const r = await run({ sub: "new" }, { files: fs, portal });
  expect(r.code).toBe(1);
  expect(r.out).toContain(
    'NOT TAKEN     topics: the portal kept none of ["Topic B"] — an option it does not know is dropped without an error; `paperlint submission topics` lists what it offers',
  );
});

test("topics: a writing flag is refused — topics reads", async () => {
  const r = await run({ sub: "topics", save: true });
  expect(r.code).toBe(2);
  expect(r.errs).toStrictEqual([
    "--save: only `submission new` and `submission update` change anything; `topics` reads",
  ]);
});

test("topics: a failure in the portal's words, exit 1", async () => {
  const r = await run(
    { sub: "topics" },
    {
      portal: fakePortal({
        options: { ok: false, error: { kind: "unreachable", detail: "down" } },
      }),
    },
  );
  expect(r.code).toBe(1);
  expect(r.errs[0]).toBe("the portal cannot be reached: down");
});
