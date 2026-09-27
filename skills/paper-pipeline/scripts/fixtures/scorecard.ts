/**
 * A PIPELINE-STATUS.md fixture shared by the pipeline-check harness and its CLI test: the four
 * template sections, every row green and dated `today`, so a test plants exactly one defect.
 */
export const FAR = "2027-12-31";

/** What a test may replace in one row: any cell, and for a GATES row its `Requires` cell. */
export interface RowOverride {
  readonly status?: string;
  readonly date?: string;
  readonly skill?: string;
  readonly result?: string;
  readonly requires?: string;
}

/** Per-row overrides by row id, plus the four free-text parts of the file. */
export interface ScorecardOverrides {
  readonly verdict?: string;
  readonly deadline?: string;
  readonly tail?: string;
  readonly preamble?: string;
  readonly [id: string]: RowOverride | string | undefined;
}

interface Row extends RowOverride {
  readonly id: string;
  readonly status: string;
  readonly date: string;
}

/** A row's overrides; the free-text keys never name a row, so a string here is none. */
const cellsOf = (v: RowOverride | string | undefined): RowOverride =>
  typeof v === "object" ? v : {};

/**
 * A scorecard with the four sections the template requires, all green. `over` replaces individual
 * cells: `{ cites: { date: "2020-01-01" } }`, `{ verdict: "…" }`, `{ deadline: "2026-08-18" }`,
 * `{ tail: "…" }` for anything appended after the last section, `{ preamble: "…" }` for anything
 * inserted BEFORE the first heading (the only way to plant a row under no heading at all).
 */
export function scorecard(
  over: ScorecardOverrides = {},
  today: string = new Date().toISOString().slice(0, 10),
): string {
  const r = (id: string, status = "☑", date = today): Row => ({
    id,
    status,
    date,
    ...cellsOf(over[id]),
  });
  const row = (o: Row, ...mid: string[]): string =>
    `| ${o.id} | work | ${o.skill ?? "skill"} | ${mid.length ? mid.join(" | ") + " | " : ""}${o.status} | ${o.date} | ${o.result ?? "result"} | — |`;
  // The GATES `Requires` cell, canonical by default so the baseline is silent — `{ structure: {
  // requires: "render" } }` plants a dropped edge. `harden` deliberately declares four of its five
  // canonical inputs: the fifth (`priordelta`) has no row in this fixture, and the clean case asserts that the checker stays
  // quiet about an edge there is nowhere to point at.
  const req = (id: string, dflt: string): string =>
    cellsOf(over[id]).requires ?? dflt;
  const verdict =
    over.verdict ??
    "Submit-ready — every gate green, artifact reproduces clean, nothing blocking.";
  return [
    "# PIPELINE-STATUS — harness fixture",
    `Venue: Fixture Workshop · Deadline: ${over.deadline ?? FAR} · Blind: double · State: drafting`,
    "",
    `**Readiness verdict:** ${verdict}`,
    "",
    over.preamble ?? "",
    "",
    "### SETUP",
    "| id | Work | Skill | Status | Date | Result | Open |",
    "|----|------|-------|--------|------|--------|------|",
    row(r("idea")),
    row(r("access")),
    row(r("frame")),
    "",
    "### LOOP",
    "| id | Work | Skill | Status | Date | Result | Open |",
    "|----|------|-------|--------|------|--------|------|",
    row(r("study")),
    row(r("draft")),
    row(r("arc")),
    "",
    "### CONTINUOUS",
    "| id | Trigger | Skill | Status | Date | Result | Open |",
    "|----|---------|-------|--------|------|--------|------|",
    row(r("cites")),
    row(r("render")),
    "",
    "### GATES",
    "| id | Gate | Skill | Requires | Status | Date | Result | Open |",
    "|----|------|-------|----------|--------|------|--------|------|",
    row(r("structure"), req("structure", "render, arc")),
    row(r("writing"), req("writing", "draft, arc, structure")),
    row(r("panel"), req("panel", "structure, writing")),
    row(r("harden"), req("harden", "panel, structure, writing, cites")),
    "",
    over.tail ?? "",
  ].join("\n");
}
