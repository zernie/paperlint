/**
 * revision-plan-core.ts: the report every review skill reads before it starts. Its line format is the
 * contract (the skills read `plan:`, `scope:`, the rows and `stop:`), so the tests pin whole lines.
 * Papers are written to a temporary folder and read through the real disk adapter, so a venue preset
 * resolves against the shipped presets.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nodeFiles } from "#src/adapters/node/index";
import { revisionPlanCodec } from "#src/adapters/revision-plan/index";
import { presetsDir } from "#src/package-dirs";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";
import { main, report, stopOf, type Deps } from "./revision-plan-core.ts";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "revision-plan.ts",
);
const DEPS: Deps = {
  files: nodeFiles,
  codec: revisionPlanCodec,
  venuesDir: presetsDir(),
};
const root = useTempDir();

const cycle = (id: string, extendsSpec: string, outcome?: object) => ({
  id,
  venue: { kind: "preset", extends: extendsSpec },
  opened: "2026-11-01",
  deadlines: [],
  ...(outcome === undefined ? {} : { outcome }),
});
const LANGCODE = cycle("langcode-2027", "paperlint:langcode-2027");

const ROWS = [
  {
    id: "R1",
    what: "the threats section names the second model",
    from: { kind: "author" },
    added: "2026-11-25",
    state: "done",
    evidence: "reviews/2026-11-25-panel.md",
  },
  {
    id: "R2",
    what: "a Limitations section",
    from: { kind: "venue" },
    added: "2026-11-25",
    state: "by-rule",
    rule: "tex/required-section",
  },
  {
    id: "R3",
    what: "rerun the grid on a third model",
    from: { kind: "author" },
    added: "2026-11-25",
    state: "dropped",
    reason: "no budget this cycle",
    kind: "accepted-cap",
  },
  {
    id: "R4",
    what: "shorten the introduction",
    from: { kind: "author" },
    added: "2026-11-27",
    state: "todo",
  },
];
const PLAN = {
  cycle: "langcode-2027",
  written: "2026-11-25",
  bar: { kind: "none", why: "no corpus of this workshop yet" },
  measurement: { kind: "open" },
  remaining: ROWS,
};

/** A paper folder with these files; its path. */
const paper = (
  name: string,
  files: Readonly<Record<string, unknown>>,
): string => {
  const dir = join(root, name);
  writeTree(
    dir,
    Object.fromEntries(
      Object.entries(files).map(([k, v]) => [
        k,
        typeof v === "string" ? v : JSON.stringify(v),
      ]),
    ),
  );
  return dir;
};

const LANGCODE_SCOPE = [
  "scope: https://langcode2027.github.io/ (read 2026-11-25)",
  "  > Towards secure, trustworthy, robust, and multilingual code generation.",
  "  > We invite submissions across five areas, including but not limited to:",
];

describe("report: a plan for the current cycle", () => {
  it("prints the cycle, bar, measurement, growth, scope, each row and the stop line", () => {
    const dir = paper("current", {
      "paperlint.json": { cycles: [LANGCODE] },
      "revision-plan.json": PLAN,
    });
    const r = report(dir, DEPS);
    expect(r.code).toBe(0);
    // Guards: the scope is the preset's own sentences, verbatim, after the plan's head lines.
    expect(r.lines.slice(0, 7)).toEqual([
      "plan: langcode-2027, written 2026-11-25 · the current cycle",
      "bar: none — no corpus of this workshop yet",
      "measurement: open — new evidence may still be added",
      "rows added after the plan was written: 1 (R4)",
      ...LANGCODE_SCOPE,
    ]);
    // Guards: each row's state and what closes it; the stop line names open and lint-decided rows.
    expect(r.lines.slice(-5)).toEqual([
      "R1 done     the threats section names the second model — evidence: reviews/2026-11-25-panel.md",
      "R2 by-rule  a Limitations section — closed when paperlint lint reports nothing for tex/required-section",
      "R3 dropped  rerun the grid on a third model — accepted-cap: no budget this cycle",
      "R4 todo     shorten the introduction",
      "stop: not met — open R4 · paperlint lint decides R2",
    ]);
  });

  it("says met when every row is done or dropped", () => {
    const closed = ROWS.filter((row) => row.id === "R1" || row.id === "R3");
    const dir = paper("met", {
      "paperlint.json": { cycles: [LANGCODE] },
      "revision-plan.json": {
        ...PLAN,
        bar: { kind: "corpus", series: "naacl", editions: [2025, 2026] },
        measurement: {
          kind: "enough",
          since: "2026-11-20",
          evidence: "repro/README.md",
        },
        remaining: closed,
      },
    });
    const r = report(dir, DEPS);
    expect(r.lines.slice(1, 4)).toEqual([
      "bar: the accepted papers of naacl, 2025, 2026",
      "measurement: enough since 2026-11-20 (repro/README.md) — no new study, only the text",
      "rows added after the plan was written: 0",
    ]);
    expect(r.lines.at(-1)).toBe("stop: met — every row is done or dropped");
  });
});

describe("report: a plan that does not fit the paper's cycles", () => {
  it("says a plan for an earlier cycle must be rewritten, and gives no stop verdict", () => {
    const dir = paper("stale", {
      "paperlint.json": {
        cycles: [
          cycle("acsac-2026", "paperlint:acsac-2026", {
            kind: "withdrawn",
            date: "2026-11-02",
            evidence: "reviews/withdrawn.eml",
          }),
          LANGCODE,
        ],
      },
      "revision-plan.json": { ...PLAN, cycle: "acsac-2026" },
    });
    const r = report(dir, DEPS);
    expect(r.lines[0]).toBe(
      "plan: acsac-2026, written 2026-11-25 · the current cycle is langcode-2027 — rewrite the plan for it",
    );
    expect(r.lines.at(-1)).toBe(
      "stop: unknown — the plan is for acsac-2026, not langcode-2027",
    );
  });

  it("says so when the paper has no open cycle", () => {
    const dir = paper("closed", {
      "paperlint.json": {
        cycles: [
          cycle("langcode-2027", "paperlint:langcode-2027", {
            kind: "withdrawn",
            date: "2026-11-30",
            evidence: "reviews/withdrawn.eml",
          }),
        ],
      },
      "revision-plan.json": PLAN,
    });
    expect(report(dir, DEPS).lines[0]).toBe(
      "plan: langcode-2027, written 2026-11-25 · the paper has no open cycle",
    );
  });

  it("says so when paperlint.json keeps no cycles", () => {
    const dir = paper("flat", {
      "paperlint.json": { extends: "paperlint:acsac-2026" },
      "revision-plan.json": PLAN,
    });
    const r = report(dir, DEPS);
    expect(r.lines[0]).toBe(
      "plan: langcode-2027, written 2026-11-25 · paperlint.json keeps no cycles to hold it against",
    );
    // Guards: a venue whose preset has no `scope` says so and names the skill that adds it.
    expect(r.lines[4]).toBe(
      "scope: none recorded — acsac-2026 has no `scope` in its preset (add-venue)",
    );
  });
});

describe("report: no plan", () => {
  it("with no plan, prints that and the venue's scope, and exits 0", () => {
    const dir = paper("none", { "paperlint.json": { cycles: [LANGCODE] } });
    const r = report(dir, DEPS);
    expect(r.code).toBe(0);
    expect(r.lines.slice(0, 5)).toEqual([
      `plan: none written — ${join(dir, "revision-plan.json")} does not exist`,
      ...LANGCODE_SCOPE,
      "  topics:",
    ]);
    // Guards: the call's topic list follows, one topic a line, and the stop line closes the report.
    const topics = r.lines.slice(5, -1);
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.every((l) => l.startsWith("    - "))).toBe(true);
    expect(r.lines.at(-1)).toBe("stop: no plan — nothing says what is left");
  });

  it("with no paperlint.json, says the paper names no venue", () => {
    const dir = paper("bare", { "paper.tex": "" });
    expect(report(dir, DEPS).lines).toEqual([
      `plan: none written — ${join(dir, "revision-plan.json")} does not exist`,
      "scope: no venue — paperlint.json names no preset",
      "stop: no plan — nothing says what is left",
    ]);
  });
});

describe("report: a plan or paperlint.json that cannot be read", () => {
  it("reports a plan that does not parse at its fields, and exits 1", () => {
    const dir = paper("broken", {
      "paperlint.json": { cycles: [LANGCODE] },
      "revision-plan.json": { ...PLAN, bar: { kind: "corpus" } },
    });
    const r = report(dir, DEPS);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toBe(
      `plan: unreadable — ${join(dir, "revision-plan.json")}`,
    );
    expect(r.lines.slice(1, -1).every((l) => l.startsWith("  bar."))).toBe(
      true,
    );
    expect(r.lines.at(-1)).toBe("stop: unreadable — fix the plan first");
  });

  it("names the whole file when it is not JSON", () => {
    const dir = paper("not-json", {
      "paperlint.json": { cycles: [LANGCODE] },
      "revision-plan.json": "{",
    });
    expect(report(dir, DEPS).lines[1]).toBe("  (the file): not JSON");
  });

  it("refuses a paperlint.json that does not parse, before reading the plan", () => {
    const dir = paper("bad-settings", {
      "paperlint.json": "{",
      "revision-plan.json": PLAN,
    });
    const r = report(dir, DEPS);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]?.startsWith(join(dir, "paperlint.json"))).toBe(true);
  });

  it("prints the plan with the scope unknown when the preset does not resolve", () => {
    const dir = paper("bad-preset", {
      "paperlint.json": { extends: "paperlint:no-such-venue" },
      "revision-plan.json": PLAN,
    });
    const r = report(dir, DEPS);
    expect(r.code).toBe(0);
    expect(r.lines[4]?.startsWith("scope: unknown — ")).toBe(true);
  });
});

describe("stopOf", () => {
  it("is met on an empty list", () => {
    expect(stopOf([])).toEqual({ kind: "met" });
  });
});

describe("the command", () => {
  it("prints the report on stdout as a process", () => {
    const dir = paper("process", {
      "paperlint.json": { cycles: [LANGCODE] },
    });
    const r = runNode(SCRIPT, [dir], { cwd: "/" });
    expect(r.status).toBe(0);
    expect(r.stdout.split("\n")[0]).toBe(
      `plan: none written — ${join(dir, "revision-plan.json")} does not exist`,
    );
  });

  it("writes an unreadable plan to stderr", () => {
    const dir = paper("stderr", {
      "paperlint.json": { cycles: [LANGCODE] },
      "revision-plan.json": "{",
    });
    const out: string[] = [];
    const err: string[] = [];
    const code = main([dir], DEPS, {
      out: (s) => out.push(s),
      err: (s) => err.push(s),
    });
    expect({ code, out }).toEqual({ code: 1, out: [] });
    expect(err.join("").startsWith("plan: unreadable")).toBe(true);
  });

  it("asks for the paper folder with exit 2", () => {
    const err: string[] = [];
    expect(
      main([], DEPS, { out: () => undefined, err: (s) => err.push(s) }),
    ).toBe(2);
    expect(err).toEqual(["usage: node revision-plan.js <paper-dir>\n"]);
  });
});
