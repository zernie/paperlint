/**
 * `paper/repro-layout` (`src/repro-layout-rule.ts`) on paper folders held in memory, run the way
 * ESLint runs it: `create`, then `root`. Both halves: each misplaced entry at the top of `repro/` is
 * reported once, on the first line of `PIPELINE-STATUS.md`; the layout, a paper with no `repro/`, and
 * any file but the scorecard are not.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import { reproMessage, SCRIPT_CURE } from "./domain/repro-layout.ts";
import {
  REPRO_LAYOUT_RULE_LEVELS,
  reproLayoutRules,
} from "./repro-layout-rule.ts";

const DIR = "/work/papers/p";
const SCAFFOLD = {
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/paper.tex`]: "\\documentclass{article}\n",
};

interface Reported {
  readonly messageId: string;
  readonly message: string;
  readonly line: number;
}

/** The rule over the folder `tree` describes, reached through `file` (default the scorecard). */
function lint(
  tree: Readonly<Record<string, string>>,
  file = `${DIR}/PIPELINE-STATUS.md`,
): Reported[] {
  const files = memoryFiles(tree);
  const rule = reproLayoutRules({ files, listDir: memoryListDir(files) })[
    "repro-layout"
  ];
  const out: Reported[] = [];
  const visitor = rule.create({
    filename: file,
    sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
    report: (d) => {
      const template = rule.meta.messages[d.messageId] ?? "";
      const message = Object.entries(d.data).reduce(
        (m, [k, v]) => m.split(`{{${k}}}`).join(String(v)),
        template,
      );
      out.push({ messageId: d.messageId, message, line: d.loc.start.line });
    },
  });
  visitor.root?.();
  return out;
}

describe("paper/repro-layout — reports", () => {
  it("a loose script, once, on the first line, with the one text", () => {
    expect(lint({ ...SCAFFOLD, [`${DIR}/repro/run.py`]: "x" })).toEqual([
      {
        messageId: "misplaced",
        message: reproMessage({
          path: "repro/run.py",
          problem: "stray",
          cure: SCRIPT_CURE,
        }),
        line: 1,
      },
    ]);
  });

  it("an undated folder and a study without a README.md, each once, in name order", () => {
    expect(
      lint({
        ...SCAFFOLD,
        [`${DIR}/repro/spike/x.py`]: "x",
        [`${DIR}/repro/ablation-2026-10-12/run.py`]: "x",
      }).map((r) => r.message.split(" ", 1).join("")),
    ).toEqual(["`repro/ablation-2026-10-12/`", "`repro/spike/`"]);
  });
});

describe("paper/repro-layout — silent", () => {
  it("on the layout, whatever tools/, data/ and the studies hold", () => {
    expect(
      lint({
        ...SCAFFOLD,
        [`${DIR}/repro/README.md`]: "x",
        [`${DIR}/repro/.gitignore`]: "x",
        [`${DIR}/repro/tools/paper_numbers.py`]: "x",
        [`${DIR}/repro/data/numbers.tsv`]: "x",
        [`${DIR}/repro/data/references-cache.json`]: "{}",
        [`${DIR}/repro/ablation-2026-10-12/README.md`]: "x",
        [`${DIR}/repro/ablation-2026-10-12/loose.py`]: "x",
        [`${DIR}/repro/human-labels-2026-10/README.md`]: "x",
        [`${DIR}/repro/__pycache__/x.pyc`]: "x",
      }),
    ).toEqual([]);
  });

  it("on a paper with no repro/", () => {
    expect(lint(SCAFFOLD)).toEqual([]);
  });

  it("on any file but PIPELINE-STATUS.md", () => {
    expect(
      lint({ ...SCAFFOLD, [`${DIR}/repro/run.py`]: "x" }, `${DIR}/paper.tex`),
    ).toEqual([]);
  });
});

describe("paper/repro-layout — level", () => {
  it("is an error from the start", () => {
    expect(REPRO_LAYOUT_RULE_LEVELS).toEqual({ "paper/repro-layout": "error" });
  });
});
