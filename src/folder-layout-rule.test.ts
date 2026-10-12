/**
 * `paper/folder-layout` (`src/folder-layout-rule.ts`) on paper folders held in memory, run the way
 * ESLint runs it: `create`, then `root`. Both halves: a stray file or folder at the paper's root is
 * reported once each, on the first line of `PIPELINE-STATUS.md`; the scaffold, and what the paper's
 * settings name at its root, are not.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import { KNOWN_CURES, strayMessage } from "./domain/paper-layout.ts";
import {
  FOLDER_LAYOUT_RULE_LEVELS,
  declaredRoots,
  folderLayoutRules,
} from "./folder-layout-rule.ts";

const DIR = "/work/papers/p";
const SCAFFOLD = {
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/paper.tex`]: "\\documentclass{article}\n",
  [`${DIR}/paperlint.json`]: "{}\n",
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
  const rule = folderLayoutRules({
    files,
    listDir: memoryListDir(files),
  })["folder-layout"];
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

describe("paper/folder-layout — reports", () => {
  it("a stray file at the root, once, on the first line, with the one stray text", () => {
    expect(lint({ ...SCAFFOLD, [`${DIR}/PLAN.md`]: "x" })).toEqual([
      {
        messageId: "stray",
        message: strayMessage({
          name: "PLAN.md",
          kind: "file",
          cure: KNOWN_CURES[0]?.cure ?? "",
        }),
        line: 1,
      },
    ]);
  });

  it("a stray folder, by its name with a slash, whatever it holds", () => {
    expect(
      lint({ ...SCAFFOLD, [`${DIR}/archive/old/x.pdf`]: "x" }).map(
        (r) => r.message,
      ),
    ).toEqual([
      expect.stringMatching(
        /^`archive\/` is at the root of a paper folder.* Where it goes: versions\/ for frozen PDFs/,
      ),
    ]);
  });

  it("every stray entry, each once", () => {
    expect(
      lint({
        ...SCAFFOLD,
        [`${DIR}/a.pdf`]: "x",
        [`${DIR}/data/x.json`]: "x",
        [`${DIR}/run.py`]: "x",
      }).length,
    ).toBe(3);
  });

  it("a folder the settings name is allowed only while they name it", () => {
    expect(
      lint({ ...SCAFFOLD, [`${DIR}/video/talk.mp4`]: "x" }).map((r) =>
        r.message.slice(0, 9),
      ),
    ).toEqual(["`video/` "]);
  });
});

describe("paper/folder-layout — silent", () => {
  it("on the scaffold `paperlint new` writes", () => {
    expect(lint(SCAFFOLD)).toEqual([]);
  });

  it("on the allowed folders, whatever they hold, and on extra/", () => {
    expect(
      lint({
        ...SCAFFOLD,
        [`${DIR}/reviews/2026-10-12-x.md`]: "x",
        [`${DIR}/repro/run.py`]: "x",
        [`${DIR}/extra/anything/at/all.bin`]: "x",
        [`${DIR}/_build/paper.facts.json`]: "{}",
        [`${DIR}/paper.aux`]: "x",
        [`${DIR}/refs.bib`]: "x",
      }),
    ).toEqual([]);
  });

  it("on what the settings name at the root: the PDF, the talk folder, the paper's own preset", () => {
    expect(
      lint({
        ...SCAFFOLD,
        [`${DIR}/paperlint.json`]: JSON.stringify({
          extends: "./venue.jsonc",
          pdf: "out/main.pdf",
          talk: { mode: "remote-video", dir: "video" },
        }),
        [`${DIR}/venue.jsonc`]: "{}",
        [`${DIR}/out/main.pdf`]: "x",
        [`${DIR}/video/talk.mp4`]: "x",
      }),
    ).toEqual([]);
  });

  it("on any file but PIPELINE-STATUS.md: the folder is judged once per paper", () => {
    expect(
      lint({ ...SCAFFOLD, [`${DIR}/PLAN.md`]: "x" }, `${DIR}/paper.tex`),
    ).toEqual([]);
  });
});

describe("declaredRoots — what a paper's settings name at its root", () => {
  const roots = (settings: object, tree: Record<string, string> = {}) =>
    declaredRoots(
      DIR,
      memoryFiles({
        [`${DIR}/paperlint.json`]: JSON.stringify(settings),
        ...tree,
      }),
    );

  it("the first segment of each path inside the folder", () => {
    expect(
      roots({
        pdf: "build/out/paper.pdf",
        talk: { mode: "remote-video", dir: "media/talk" },
      }),
    ).toEqual(["build", "media"]);
  });

  it("every cycle's own preset file, and none outside the folder or shipped", () => {
    expect(
      roots({
        cycles: [
          {
            id: "a",
            venue: { kind: "preset", extends: "./a.jsonc" },
            opened: "2026-01-01",
            deadlines: [],
            outcome: {
              kind: "rejected",
              date: "2026-02-01",
              evidence: "submission/a.eml",
              desk: false,
            },
          },
          {
            id: "c",
            venue: { kind: "named", name: "C", url: "https://c.example" },
            opened: "2026-03-01",
            deadlines: [],
            outcome: {
              kind: "withdrawn",
              date: "2026-03-02",
              evidence: "submission/c.eml",
            },
          },
          {
            id: "b",
            venue: { kind: "preset", extends: "../shared/b.jsonc" },
            opened: "2026-03-01",
            deadlines: [],
            outcome: { kind: "open" },
          },
        ],
      }),
    ).toEqual(["a.jsonc"]);
  });
});

describe("declaredRoots — nothing to add", () => {
  const roots = (settings: object) =>
    declaredRoots(
      DIR,
      memoryFiles({ [`${DIR}/paperlint.json`]: JSON.stringify(settings) }),
    );

  it("nothing when the settings do not parse, or there are none", () => {
    expect(roots({ venu: "x" })).toEqual([]);
    expect(declaredRoots(DIR, memoryFiles({}))).toEqual([]);
  });

  it("a shipped preset names no file", () => {
    expect(roots({ extends: "paperlint:aidc" })).toEqual([]);
  });
});

it("is on at error in paperlint's own config", () => {
  expect(FOLDER_LAYOUT_RULE_LEVELS).toEqual({ "paper/folder-layout": "error" });
});
