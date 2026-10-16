/**
 * `paperlint studies methods <paper-dir> [--format md|tex]` (`src/study-methods.ts`) on papers held in
 * memory, git a stand-in: one row or sentence per study the paper reports, derived from its mode, its
 * manifest and its history — and the refusals.
 */
import { expect, it } from "vitest";
import { manifestText, type SealManifest } from "./domain/sealed-study.ts";
import { texEscape } from "./domain/study-methods.ts";
import type { StudyMode } from "./domain/study-mode.ts";
import { planText, registryText, type Study } from "./domain/study-registry.ts";
import {
  BLIND,
  DIR,
  NOW,
  R1,
  ROW,
  planOf,
  studies,
} from "../test/study-tree.ts";

const D = { commit: "d".repeat(40), date: "2026-10-16T10:00:00+05:00" };
const A = { commit: "a".repeat(40), date: "2026-10-17T10:00:00+05:00" };
const DECIDED: StudyMode = {
  kind: "decide_before_run",
  outputs: ["RESULTS.md"],
  decision: { file: "repro/P1-S01-a/decision.md", note: "exclusions" },
};

/** A study `id` in folder `P1-Sxx-a…`, reported, of `mode`, with `files` in its folder. */
const study = (
  n: string,
  mode: StudyMode | undefined,
  files: Readonly<Record<string, string>> = {},
): { readonly row: Study; readonly tree: Readonly<Record<string, string>> } => {
  const folder = `P1-S${n}-a`;
  return {
    row: {
      ...ROW,
      id: `P1-S${n}`,
      folder,
      title: `Study ${n}`,
      in_paper: "yes",
    },
    tree: {
      [`${DIR}/repro/${folder}/plan.json`]: planText(planOf(mode)),
      ...Object.fromEntries(
        Object.entries(files).map(([k, v]) => [
          `${DIR}/repro/${folder}/${k}`,
          v,
        ]),
      ),
    },
  };
};

const UNSEALED: SealManifest = {
  recipients: [R1],
  files: [
    {
      path: "RESULTS.md",
      sha256: "a".repeat(64),
      size: 1,
      age_sha256: "c".repeat(64),
      sealed_at: NOW,
    },
  ],
  unsealed: {
    at: NOW,
    gate: {
      file: "repro/P1-S02-a/exclusions.md",
      commit: A.commit,
      date: A.date,
    },
  },
};

/** A paper with `parts`, and an unreported study beside them. */
const paperOf = (parts: readonly ReturnType<typeof study>[]) => ({
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/repro/studies.json`]: registryText({
    prefix: "P1",
    studies: [
      ...parts.map((p) => p.row),
      { ...ROW, id: "P1-S09", folder: "P1-S09-x", in_paper: "no" },
    ],
  }),
  ...Object.fromEntries(parts.flatMap((p) => Object.entries(p.tree))),
});

const ALL = paperOf([
  study("01", DECIDED),
  study(
    "02",
    {
      ...BLIND,
      unseal_after: {
        ...BLIND.unseal_after,
        file: "repro/P1-S02-a/exclusions.md",
      },
    },
    {
      "sealed.json": manifestText(UNSEALED),
    },
  ),
  study("03", { kind: "exploratory", reason: "a first look, 50% of the logs" }),
  study("04", undefined),
  study(
    "05",
    {
      ...BLIND,
      unseal_after: { ...BLIND.unseal_after, file: "repro/P1-S05-a/x.md" },
    },
    {
      "sealed.json": manifestText({ ...UNSEALED, files: [], unsealed: null }),
    },
  ),
  study("06", {
    ...BLIND,
    unseal_after: { ...BLIND.unseal_after, file: "repro/P1-S06-a/x.md" },
  }),
]);
const READ = {
  kind: "read",
  decision: D,
  files: [
    { path: "decision.md", ...D, order: "same" },
    { path: "RESULTS.md", ...A, order: "after" },
  ],
} as const;
const methods = (
  format: "md" | "tex",
  order: Parameters<typeof studies>[3] = { order: READ },
) => studies("methods", ALL, { title: undefined, format }, order);

it("the Markdown table: every reported study's mode, decision, first output and check", () => {
  // Guards: the whole table — one row per reported study, the unreported one left out.
  expect(methods("md")).toMatchObject({
    code: 0,
    err: [],
    log: [
      [
        "| study | title | mode | decision | first output | check |",
        "| --- | --- | --- | --- | --- | --- |",
        "| P1-S01 | Study 01 | decided before its run | `dddddddddddd` (2026-10-16) | `aaaaaaaaaaaa` (2026-10-17) | `npx paperlint lint papers/example` |",
        "| P1-S02 | Study 02 | blind (sealed) | `aaaaaaaaaaaa` (2026-10-17) | sealed from 2026-10-16 | `npx paperlint studies verify papers/example P1-S02` |",
        "| P1-S03 | Study 03 | exploratory: a first look, 50% of the logs | — | — | — |",
        "| P1-S04 | Study 04 | no mode declared | — | — | — |",
        "| P1-S05 | Study 05 | blind (sealed) | sealed, not unsealed | nothing sealed | `npx paperlint studies verify papers/example P1-S05` |",
        "| P1-S06 | Study 06 | blind (sealed) | sealed, not unsealed | nothing sealed | `npx paperlint studies verify papers/example P1-S06` |",
      ].join("\n"),
    ],
  });
});

it("the LaTeX sentences, special characters escaped", () => {
  // Guards: a sentence per study the author can adapt; `%` in a reason does not comment out the rest.
  expect(methods("tex").log).toEqual([
    [
      "Study P1-S01 (Study 01) was decided before its run: its decision was committed in \\texttt{dddddddddddd} on 2026-10-16, and its first output in \\texttt{aaaaaaaaaaaa} on 2026-10-17; \\texttt{npx paperlint lint papers/example} re-checks this order from the repository's history.",
      "Study P1-S02 (Study 02) was run blind: its outputs were sealed with age from 2026-10-16 and unsealed only after its decision was committed in \\texttt{aaaaaaaaaaaa} on 2026-10-17; \\texttt{npx paperlint studies verify papers/example P1-S02} checks every file against the hashes recorded before unsealing.",
      "Study P1-S03 (Study 03) is exploratory: a first look, 50\\% of the logs. Its results are reported as exploratory.",
      "Study P1-S04 (Study 04) declares no mode.",
      "Study P1-S05 (Study 05) is run blind: its outputs are sealed with age and are not unsealed yet.",
      "Study P1-S06 (Study 06) is run blind: its outputs are sealed with age and are not unsealed yet.",
    ].join("\n\n"),
  ]);
});

it("a decide-first study whose history is unread, uncommitted, or without outputs yet", () => {
  const first = (order: Parameters<typeof studies>[3]) =>
    String(methods("tex", order).log[0]).split("\n\n")[0];
  // Guards: the sentence never claims an order the history does not give.
  expect([
    first({ order: { kind: "shallow" } }),
    first({ order: { kind: "read", decision: null, files: [] } }),
    first({ order: { kind: "read", decision: D, files: [] } }),
  ]).toEqual([
    "Study P1-S01 (Study 01) was decided before its run; its history could not be read here, and \\texttt{npx paperlint lint papers/example} re-checks the order on a full clone.",
    "Study P1-S01 (Study 01) is declared decided before its run, but its decision is not committed yet.",
    "Study P1-S01 (Study 01) was decided before its run: its decision was committed in \\texttt{dddddddddddd} on 2026-10-16, and no output is committed yet; \\texttt{npx paperlint lint papers/example} re-checks this order from the repository's history.",
  ]);
  expect(
    String(methods("md", { order: { kind: "shallow" } }).log[0]).split("\n")[2],
  ).toBe(
    "| P1-S01 | Study 01 | decided before its run | history not read | history not read | `npx paperlint lint papers/example` |",
  );
  expect(
    String(
      methods("md", { order: { kind: "read", decision: null, files: [] } })
        .log[0],
    ).split("\n")[2],
  ).toBe(
    "| P1-S01 | Study 01 | decided before its run | not committed | none committed | `npx paperlint lint papers/example` |",
  );
});

it("refuses a paper that reports no study, an argument too many, and an unknown form", () => {
  // Guards: exit 1 for the paper's state, 2 for the command line.
  expect(
    [
      studies("methods", paperOf([]), { title: undefined }),
      studies(
        "methods",
        { ...ALL, [`${DIR}/repro/studies.json`]: "{" },
        { title: undefined },
      ),
      studies("methods", ALL, { title: "P1-S01" }),
      studies("methods", ALL, { title: undefined, format: "html" }),
    ].map((r) => [r.code, r.err]),
  ).toEqual([
    [
      1,
      [
        'papers/example reports no study: no row of papers/example/repro/studies.json has `"in_paper": "yes"`.',
      ],
    ],
    [
      1,
      [
        'papers/example reports no study: no row of papers/example/repro/studies.json has `"in_paper": "yes"`.',
      ],
    ],
    [
      2,
      [
        "studies methods takes only the paper's folder — `P1-S01` is one argument too many",
      ],
    ],
    [2, ["--format html is not a form: md or tex"]],
  ]);
  // Guards: the default form is the table.
  expect(
    String(
      studies("methods", ALL, { title: undefined }, { order: READ }).log[0],
    ).split("\n")[0],
  ).toBe("| study | title | mode | decision | first output | check |");
});

it("texEscape escapes every character TeX reads as markup", () => {
  // Guards: a title or a reason cannot break the sentence it is pasted into.
  expect(texEscape("a\\b{c}$d&e#f%g_h~i^j")).toBe(
    "a\\textbackslash{}b\\{c\\}\\$d\\&e\\#f\\%g\\_h\\textasciitilde{}i\\textasciicircum{}j",
  );
});
