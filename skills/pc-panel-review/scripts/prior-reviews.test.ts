/**
 * prior-reviews-core.ts: the prior-reviews seat sits exactly when `cycle/prior-reviews-answered`
 * fires, past attempts that brought no reviews, and names the points file it reads.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "#src/adapters/memory/index";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";
import { readPaperSettings } from "#src/paper-settings";
import { main, seatVerdict } from "./prior-reviews-core.ts";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "prior-reviews.ts",
);
const PAPER = "/work/papers/p";
const POINTS = "reviews/alpha-response.yaml";

const venue = (name: string) => ({
  kind: "named",
  name,
  url: `https://${name.toLowerCase()}.example`,
});
const REVIEWED = {
  id: "alpha-2026",
  venue: venue("Alpha"),
  opened: "2026-06-01",
  deadlines: [],
  outcome: {
    kind: "rejected",
    date: "2026-09-08",
    evidence: "reviews/alpha.eml",
    desk: false,
    points: POINTS,
  },
};
const between = (outcome: object) => ({
  id: "gamma-2026",
  venue: venue("Gamma"),
  opened: "2026-09-09",
  deadlines: [],
  outcome: { date: "2026-10-01", evidence: "reviews/gamma.eml", ...outcome },
});
const OPEN = {
  id: "beta-2027",
  venue: venue("Beta"),
  opened: "2026-10-02",
  deadlines: [],
};

/** The paper folder with `cycles` as its record, and the points file when `points` is true. */
const paper = (cycles: readonly object[] | undefined, points = true) =>
  memoryFiles({
    [`${PAPER}/paperlint.json`]: JSON.stringify(
      cycles === undefined ? {} : { cycles },
    ),
    ...(points ? { [`${PAPER}/${POINTS}`]: "points: []\n" } : {}),
  });

const verdict = (cycles: readonly object[] | undefined, points = true) =>
  seatVerdict(PAPER, { files: paper(cycles, points) });

/** A record whose one cycle has no id, venue or dates: the settings reader refuses it. */
const BROKEN = JSON.stringify({ cycles: [{}] });

const REQUIRED = {
  code: 0,
  line: `required: ${POINTS} (reviews from alpha-2026, answered by beta-2027)`,
};
const NOT_REQUIRED = {
  code: 0,
  line: "not required: no rejection with reviews before the open attempt",
};

describe("seatVerdict — the seat sits when the rule fires", () => {
  it("🔴 rejected with reviews → withdrawn → open: required, with the rejection's points file", () => {
    expect(verdict([REVIEWED, between({ kind: "withdrawn" }), OPEN])).toEqual(
      REQUIRED,
    );
  });

  it("🔴 rejected with reviews → desk-rejected → open: required", () => {
    expect(
      verdict([REVIEWED, between({ kind: "rejected", desk: true }), OPEN]),
    ).toEqual(REQUIRED);
  });

  it("🔴 rejected with reviews, then open directly: required", () => {
    expect(verdict([REVIEWED, { ...OPEN, opened: "2026-09-09" }])).toEqual(
      REQUIRED,
    );
  });

  it("🔴 required, and the points file is missing: exit 1, says to write it", () => {
    expect(verdict([REVIEWED, OPEN], false)).toEqual({
      code: 1,
      line: `required, and ${POINTS} is missing (reviews from alpha-2026, answered by beta-2027): write it first; cycle/prior-reviews-answered fails until it exists`,
    });
  });

  it("no cycles recorded: not required", () => {
    expect(verdict(undefined)).toEqual(NOT_REQUIRED);
  });

  it("only a desk rejection before the open attempt: not required", () => {
    expect(verdict([between({ kind: "rejected", desk: true }), OPEN])).toEqual(
      NOT_REQUIRED,
    );
  });

  it("the reviewed rejection is the last attempt, nothing open: not required", () => {
    expect(verdict([REVIEWED])).toEqual(NOT_REQUIRED);
  });

  it('🔴 a paperlint.json that does not parse: exit 2 with readPaperSettings\' reason, never "not required"', () => {
    const files = memoryFiles({
      [`${PAPER}/paperlint.json`]: '{ "cycles": [], }',
    });
    const read = readPaperSettings(files, PAPER);
    expect({ read: read.ok, verdict: seatVerdict(PAPER, { files }) }).toEqual({
      read: false,
      verdict: {
        code: 2,
        line: `prior-reviews: ${read.ok ? "" : read.error.why}`,
      },
    });
  });

  it("🔴 cycles the record cannot hold: exit 2 with the settings' reason", () => {
    const files = memoryFiles({ [`${PAPER}/paperlint.json`]: BROKEN });
    const read = readPaperSettings(files, PAPER);
    expect({ read: read.ok, verdict: seatVerdict(PAPER, { files }) }).toEqual({
      read: false,
      verdict: {
        code: 2,
        line: `prior-reviews: ${read.ok ? "" : read.error.why}`,
      },
    });
  });
});

describe("main — the command", () => {
  const run = (argv: readonly string[], cycles?: readonly object[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = main(
      argv,
      { files: paper(cycles) },
      {
        out: (s) => out.push(s),
        err: (s) => err.push(s),
      },
    );
    return { code, out: out.join(""), err: err.join("") };
  };

  it("🔴 prints the verdict on stdout", () => {
    expect(run([PAPER], [REVIEWED, OPEN])).toEqual({
      code: 0,
      out: `${REQUIRED.line}\n`,
      err: "",
    });
  });

  it("no argument: the usage on stderr, exit 2", () => {
    expect(run([])).toEqual({
      code: 2,
      out: "",
      err: "usage: node prior-reviews.js <paper-dir>\n",
    });
  });

  it("an unreadable record goes to stderr", () => {
    const err: string[] = [];
    const files = memoryFiles({ [`${PAPER}/paperlint.json`]: BROKEN });
    const code = main(
      [PAPER],
      { files },
      { out: () => {}, err: (s) => err.push(s) },
    );
    expect({ code, toStderr: err.length }).toEqual({ code: 2, toStderr: 1 });
  });
});

describe("prior-reviews.ts — the runner on a real folder", () => {
  const dir = useTempDir();

  it("🔴 required for a reviewed rejection behind a withdrawal, from any cwd", () => {
    writeTree(dir, {
      "paperlint.json": JSON.stringify({
        cycles: [REVIEWED, between({ kind: "withdrawn" }), OPEN],
      }),
      [POINTS]: "points: []\n",
    });
    const r = runNode(SCRIPT, [dir], { cwd: "/" });
    expect(r).toEqual({ status: 0, stdout: `${REQUIRED.line}\n`, stderr: "" });
  });
  it("no argument: the usage on stderr, exit 2", () => {
    expect(runNode(SCRIPT, [], { cwd: "/" })).toEqual({
      status: 2,
      stdout: "",
      stderr: "usage: node prior-reviews.js <paper-dir>\n",
    });
  });
});
