import { lineOf, PLAN, planText } from "./revision-plan-fixture.ts";

/**
 * The both-halves cases of the JSON records' rules (`corpus/`, `revision-plan/`), for `src/rule-cases.test.ts`: a tree on which the rule
 * reports, and one on which it is silent. Kept here, apart from that file's table, so the table does
 * not grow with every rule of the family.
 */

/** A rule's case: where it reports on a planted defect, and a tree it stays silent on. */
export interface RuleCases {
  readonly reports: {
    readonly tree: Record<string, string | Uint8Array>;
    /** The file the finding is on, relative to the project. */
    readonly file: string;
    readonly severity: 1 | 2;
    readonly line: number;
  };
  /** A tree on which the rule says nothing, on any file. */
  readonly silent: Record<string, string | Uint8Array>;
}

const RECORD = "papers/venues/agent/papers.json";
const EMPTY = '{"venue":"agent","editions":[],"papers":[],"rebuild":[]}';

/** A one-paper project: its scorecard and paper.tex, and what the case adds. */
const project = (
  extra: Readonly<Record<string, string>>,
): Record<string, string> => ({
  "papers/p/PIPELINE-STATUS.md": "---\nstages: []\n---\n# PIPELINE-STATUS\n",
  "papers/p/paper.tex":
    "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n",
  ...extra,
});

/** A record whose one copy stores a PDF under no licence read (`NOASSERTION`). */
const UNREAD = JSON.stringify(
  {
    venue: "agent",
    editions: [
      {
        edition: 2026,
        listed_from: "https://example.org/accepted",
        read_on: "2026-11-03",
        accepted: 1,
        capped: null,
        proxy: null,
      },
    ],
    papers: [
      {
        key: "a",
        edition: 2026,
        group: "accepted",
        title: "A",
        ids: { doi: "10.1/x" },
        copies: [
          {
            version: "published",
            url: "https://doi.org/10.1/x",
            licence: { id: "NOASSERTION" },
            stored: ["pdf"],
            fetched_from: "https://doi.org/10.1/x",
          },
        ],
      },
    ],
    rebuild: [],
  },
  null,
  2,
);
const PLAN_ON = {
  "paperlint.json": '{"rules":{"paperlint:revision-plan":"warn"}}',
};
const PLAN_FILE = "papers/p/revision-plan.json";
const NO_EVIDENCE = planText({
  ...PLAN,
  remaining: PLAN.remaining.map((r) =>
    r.state === "done" ? { ...r, evidence: undefined } : r,
  ),
});

const LICENCE_ON = { "paperlint.json": '{"rules":{"corpus/licence":"warn"}}' };

export const CORPUS_CASES: Readonly<Record<string, RuleCases>> = {
  // A venue corpus storing a PDF its papers.json lists no paper for; silent while it stores nothing.
  "corpus/record": {
    reports: {
      tree: project({
        [RECORD]: EMPTY,
        "papers/venues/agent/pdf/a.pdf": "",
      }),
      file: RECORD,
      severity: 2,
      line: 1,
    },
    silent: project({ [RECORD]: EMPTY }),
  },
  // A copy stored with no licence read; opt-in, so the case turns it on. Silent while it stores nothing.
  "corpus/licence": {
    reports: {
      tree: project({
        ...LICENCE_ON,
        [RECORD]: UNREAD,
        "papers/venues/agent/pdf/a.pdf": "",
      }),
      file: RECORD,
      severity: 1,
      line: UNREAD.split("\n").findIndex((l) => l.includes('"stored"')) + 1,
    },
    silent: project({ ...LICENCE_ON, [RECORD]: EMPTY }),
  },
  // A note at the top of a venue corpus: its place is MANIFEST.md or deep-reads/<key>.md.
  "corpus/allowed-files-only": {
    reports: {
      tree: project({
        [RECORD]: EMPTY,
        "papers/venues/agent/notes.md": "# notes\n",
      }),
      file: RECORD,
      severity: 1,
      line: 1,
    },
    silent: project({
      [RECORD]: EMPTY,
      "papers/venues/agent/MANIFEST.md": "# caveats\n",
    }),
  },
  // A paper's revision plan whose done row gives no evidence, the set turned on.
  "revision-plan/record": {
    reports: {
      tree: project({
        ...PLAN_ON,
        [PLAN_FILE]: NO_EVIDENCE,
      }),
      file: PLAN_FILE,
      severity: 1,
      // A field left out is reported at the row that should hold it: its opening line.
      line: lineOf(NO_EVIDENCE, '"id": "R3"') - 1,
    },
    silent: project({ ...PLAN_ON, [PLAN_FILE]: planText() }),
  },
};
