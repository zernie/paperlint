/**
 * The rules over a paper's frozen versions, each module called directly over in-memory files: the
 * finding on a planted defect, silence on a clean folder, on another file, and on a paper without
 * cycles. (`rule-cases.test.ts` runs each through real ESLint.)
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { lockText, type Lock } from "./domain/versions.ts";
import {
  draftRules,
  submittedFrozenRules,
  versionLayoutRules,
} from "./version-rules.ts";

const DIR = "/w/papers/p";
const enc = (t: string) => new TextEncoder().encode(t);
const locked = (t: string) => ({
  kind: "file" as const,
  bytes: enc(t).length,
  sha256: sha256Hex(enc(t)),
  frozen: "2026-10-23T16:58:01.000Z",
});

const OPEN = {
  id: "beta-2027",
  venue: { kind: "named", name: "Beta 2027", url: "https://beta.example" },
  opened: "2026-09-09",
  submission: { id: 7 },
};
const ACCEPTED = {
  ...OPEN,
  outcome: { kind: "accepted", date: "2026-12-01", evidence: "m.eml" },
};
const SOURCE =
  "\\documentclass{article}\n\\begin{document}\nA.\n\\end{document}\n";
const DRIFTED = SOURCE.replace("A.", "A, then B.\nC.");

/** A paper folder: its settings, paper.tex, and `submitted.*` of beta-2027 frozen and locked. */
function tree(
  o: {
    readonly cycles?: readonly object[] | null;
    readonly draft?: string;
    readonly extra?: Readonly<Record<string, string>>;
    readonly lock?: Lock;
  } = {},
): Record<string, string> {
  const pdf = "%PDF sent";
  return {
    [`${DIR}/paperlint.json`]: JSON.stringify(
      o.cycles === null ? { extends: null } : { cycles: o.cycles ?? [OPEN] },
    ),
    [`${DIR}/paper.tex`]: o.draft ?? SOURCE,
    [`${DIR}/versions/beta-2027/submitted.pdf`]: pdf,
    [`${DIR}/versions/beta-2027/submitted.tex`]: SOURCE,
    [`${DIR}/versions/lock.json`]: lockText(
      o.lock ?? {
        "beta-2027/submitted.pdf": locked(pdf),
        "beta-2027/submitted.tex": locked(SOURCE),
      },
    ),
    ...o.extra,
  };
}

interface Seen {
  readonly messageId: string;
  readonly data: Readonly<Record<string, string | number>>;
}

/** Every finding of the scorecard rules on `file` of the tree. */
function status(
  t: Record<string, string>,
  file = "PIPELINE-STATUS.md",
): Seen[] {
  const files = memoryFiles(t);
  const deps = { files, listDir: memoryListDir(files) };
  const rules = { ...versionLayoutRules(deps), ...submittedFrozenRules(deps) };
  const out: Seen[] = [];
  Object.values(rules).forEach((rule) => {
    rule
      .create({
        filename: `${DIR}/${file}`,
        sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
        report: (d) => out.push({ messageId: d.messageId, data: d.data }),
      })
      .root?.();
  });
  return out;
}

/** Every finding of the draft rules on `file` (paper.tex by default), its text read off the tree. */
function draft(t: Record<string, string>, file = "paper.tex"): Seen[] {
  const files = memoryFiles(t);
  const rules = draftRules({ files, latex: latexReader, codec: sourcesCodec });
  const out: Seen[] = [];
  Object.values(rules).forEach((rule) => {
    rule
      .create({
        filename: `${DIR}/${file}`,
        sourceCode: {
          text: t[`${DIR}/${file}`] ?? "",
          getLocFromIndex: () => ({ line: 1, column: 0 }),
        },
        report: (d) => {
          if ("messageId" in d)
            out.push({ messageId: d.messageId, data: d.data ?? {} });
        },
      })
      .root?.();
  });
  return out;
}

describe("versions/layout and cycle/submitted-frozen", () => {
  it("a submission frozen, every file locked as it stands: silent", () => {
    expect(status(tree())).toStrictEqual([]);
  });

  it("report on the scorecard only, and say nothing for a paper without cycles", () => {
    const stray = { [`${DIR}/versions/notes.md`]: "x" };
    expect(status(tree({ extra: stray }), "paper.tex")).toStrictEqual([]);
    expect(status(tree({ cycles: null, extra: stray }))).toStrictEqual([]);
  });

  it("a stray file and a submission not frozen, each said by its rule", () => {
    const t = tree({
      cycles: [
        {
          ...OPEN,
          outcome: { kind: "rejected", date: "2026-10-01", evidence: "m.eml" },
        },
        { ...OPEN, id: "gamma-2027", submission: { id: 9 } },
      ],
      extra: { [`${DIR}/versions/notes.md`]: "x" },
    });
    expect(status(t).map((f) => f.messageId)).toStrictEqual([
      "stray",
      "unfrozen",
    ]);
  });
});

describe("cycle/draft-drift and cycle/camera-ready-source", () => {
  it("the draft as frozen: silent; paper.tex only", () => {
    expect(draft(tree())).toStrictEqual([]);
    expect(draft(tree({ draft: DRIFTED }), "notes.tex")).toStrictEqual([]);
  });

  it("an open cycle and a drifted draft: the drift, with the lines", () => {
    expect(draft(tree({ draft: DRIFTED }))).toStrictEqual([
      {
        messageId: "drift",
        data: {
          key: "beta-2027/submitted.tex",
          venue: "Beta 2027",
          drift: "2 lines added, 1 removed",
        },
      },
    ]);
  });

  it("no cycles, a cycle parked between venues, or no frozen source: nothing to measure", () => {
    expect(draft(tree({ cycles: null, draft: DRIFTED }))).toStrictEqual([]);
    const rejected = {
      ...OPEN,
      outcome: { kind: "rejected", date: "2026-12-01", evidence: "m.eml" },
    };
    expect(draft(tree({ cycles: [rejected], draft: DRIFTED }))).toStrictEqual(
      [],
    );
    const t = Object.fromEntries(
      Object.entries(tree({ draft: DRIFTED })).filter(
        ([k]) => !k.endsWith("/submitted.tex"),
      ),
    );
    expect(draft(t)).toStrictEqual([]);
  });
});

describe("cycle/camera-ready-source", () => {
  it("an accepted cycle: silent while the camera-ready is edited, however far the draft moved", () => {
    expect(draft(tree({ cycles: [ACCEPTED], draft: DRIFTED }))).toStrictEqual(
      [],
    );
    // A PDF frozen without its source: nothing to compare (versions/layout names the missing source).
    const pdfOnly = {
      [`${DIR}/versions/beta-2027/camera-ready.pdf`]: "%PDF final",
    };
    expect(
      draft(tree({ cycles: [ACCEPTED], draft: DRIFTED, extra: pdfOnly })),
    ).toStrictEqual([]);
  });

  it("an accepted cycle with its camera-ready frozen: judged against what was accepted, the draft no more", () => {
    const camera = (source: string) => ({
      [`${DIR}/versions/beta-2027/camera-ready.pdf`]: "%PDF final",
      [`${DIR}/versions/beta-2027/camera-ready.tex`]: source,
    });
    // The accepted source plus a change: it derives, and the draft moving on after it is free.
    expect(
      draft(
        tree({ cycles: [ACCEPTED], draft: "Next.", extra: camera(DRIFTED) }),
      ),
    ).toStrictEqual([]);
    expect(
      draft(
        tree({
          cycles: [ACCEPTED],
          extra: camera("\\documentclass{book}\nAnother paper.\n"),
        }),
      ),
    ).toStrictEqual([
      {
        messageId: "base",
        data: { id: "beta-2027", kept: "0", total: "4" },
      },
    ]);
  });
});
