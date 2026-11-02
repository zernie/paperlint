/**
 * novelty_cells.py: one reader per neighbour writes siblings/cells/<id>.json (its read, coverage and cells);
 * the script merges them into novelty.json, and check_novelty.py fails when novelty.json is behind them.
 * Execution tier: the novelty fixture on disk, no model, no network.
 * Run: npx vigiles test skills/assess-novelty/scripts/novelty_cells.harness.ts
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "novelty");
const py = (script: string, dir: string) => {
  const r = spawnSync("python3", ["-I", join(here, script), dir], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
};

// The fixture's own doe26 data, as a reader would return it, with P5-1's comparator flipped to 'yes'.
const READER = {
  id: "doe26",
  read: "full",
  coverage: [{ lines: [1, 63], quote: "We measure this gap in 481 public AGENTS.md files." }],
};

// Copy the fixture, drop the given cells files, optionally merge, then check; returns both results.
const run = (cellFiles: Record<string, object>, { merge = true } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "novelty-cells-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const fixtureJson = JSON.parse(readFileSync(join(dir, "siblings", "novelty.json"), "utf8"));
    mkdirSync(join(dir, "siblings", "cells"));
    for (const [name, body] of Object.entries(cellFiles)) {
      const cells = Object.fromEntries(fixtureJson.claims.map((c: any) => [c.id, c.cells.doe26]));
      writeFileSync(join(dir, "siblings", "cells", name), JSON.stringify({ ...READER, cells, ...body }, null, 2));
    }
    const merged = merge ? py("novelty_cells.py", dir) : { code: null, out: "" };
    const checked = py("check_novelty.py", dir);
    const json = JSON.parse(readFileSync(join(dir, "siblings", "novelty.json"), "utf8"));
    return { merged, checked, json };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// ── clean: a reader's file equal to the fixture merges to the same table, checker green ──
{
  const r = run({ "doe26.json": {} });
  assert.equal(r.merged.code, 0, r.merged.out);
  assert.equal(r.checked.code, 0, r.checked.out);
}

// ── the merge carries the reader's cells into novelty.json ─────────────────────
{
  const r = run({ "doe26.json": { read: "abstract", coverage: [] } });
  assert.equal(r.merged.code, 0, r.merged.out);
  assert.equal(r.json.neighbours[0].read, "abstract", "read comes from the reader's file");
}

// ── a claim the reader left out loses that neighbour's old cells: they turn unknown, never stay 'no' ──
// The file is the reader's whole record of the neighbour; old 'no' cells kept for an omitted claim would
// still grant novelty on evidence nobody re-read.
{
  const r = run({ "doe26.json": { cells: {} } });
  assert.equal(r.merged.code, 0, r.merged.out);
  assert.deepEqual(r.json.claims.map((c: any) => c.cells?.doe26), [undefined, undefined]);
  const behind = run({ "doe26.json": { cells: {} } }, { merge: false });
  assert.match(behind.checked.out, /novelty\.json is behind siblings\/cells\/doe26\.json/);
}

// ── novelty.json behind a cells file: the checker says so ──────────────────────
{
  const r = run({ "doe26.json": { read: "abstract", coverage: [] } }, { merge: false });
  assert.equal(r.checked.code, 1, r.checked.out);
  assert.match(r.checked.out, /novelty\.json is behind siblings\/cells\/doe26\.json: run novelty_cells\.py/);
}

// ── a file for a neighbour the table does not list ─────────────────────────────
{
  const r = run({ "zhou26.json": { id: "zhou26" } });
  assert.equal(r.merged.code, 1, r.merged.out);
  assert.match(r.merged.out, /cells\/zhou26\.json: no neighbour 'zhou26' in novelty\.json/);
}

// ── the file name and its id disagree ──────────────────────────────────────────
{
  const r = run({ "doe.json": {} });
  assert.equal(r.merged.code, 1, r.merged.out);
  assert.match(r.merged.out, /cells\/doe\.json: id 'doe26' does not match the file name/);
}

// ── a claim or piece the table does not have ───────────────────────────────────
{
  const r = run({ "doe26.json": { cells: { R9: {}, "P5-1": { colour: { has: "no" } } } } });
  assert.equal(r.merged.code, 1, r.merged.out);
  assert.match(r.merged.out, /cells\/doe26\.json: claim 'R9' is not in novelty\.json/);
  assert.match(r.merged.out, /cells\/doe26\.json: P5-1 has no piece 'colour'/);
}
