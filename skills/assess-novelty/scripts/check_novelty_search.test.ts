/**
 * check_novelty.py, the search behind a 🟢: for each of the three sources (venue-pc, prev-edition, arxiv-recent) a
 * free verdict needs a `searched` entry that covers THAT claim. Execution tier: the novelty fixture on disk, no
 * model, no network. Run: npx vitest run skills/assess-novelty/scripts/check_novelty_search.test.ts
 *
 * Why (paperlint#367): three planned claims added to a table on 2026-11-04, whose searches were dated 2026-10-27
 * and 2026-11-03, came out 🟢 against 30 neighbours collected for other claims; four works the consumer's own
 * ledger names for one of them were not neighbours at all. `searched` was one list for the whole table, and the
 * checker asked only for a refutation file.
 *
 * An entry covers a claim when its "claims" names it; an entry without "claims" (a table-wide search, as every
 * table had before) covers a claim whose "added" date is on or before the entry's date.
 * Each case copies the fixture and makes ONE change; every failing class has a clean twin that passes.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "novelty");
const CHECKER = join(here, "check_novelty.py");
const SOURCES = ["venue-pc", "prev-edition", "arxiv-recent"];

// Copy the fixture, let `change` edit the novelty table, run the checker: the exit code, the printed verdict
// lines and every ERROR line, so a case can compare the whole list of errors.
const run = (change: (json: any) => void) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "novelty-search-")));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const path = join(dir, "siblings", "novelty.json");
    const json = JSON.parse(readFileSync(path, "utf8"));
    change(json);
    writeFileSync(path, JSON.stringify(json, null, 2));
    const r = spawnSync("python3", ["-I", CHECKER, dir], { encoding: "utf8" });
    const errors = r.stderr
      .split("\n")
      .filter((l) => l.startsWith("ERROR "))
      .map((l) => l.slice("ERROR ".length));
    return { code: r.status, out: r.stdout, errors };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const claim = (j: any, id: string) => j.claims.find((c: any) => c.id === id);
const entry = (source: string, date: string, claims?: string[]) => ({
  source,
  how: `${source}: the search, as run`,
  date,
  ...(claims ? { claims } : {}),
});
// The searches as every table had them before: one list, no "claims"; the issue's two dates.
const legacy = (j: any) => {
  j.searched = [
    entry("venue-pc", "2026-10-27"),
    entry("prev-edition", "2026-10-27"),
    entry("arxiv-recent", "2026-11-03"),
  ];
};
// A design-stage claim added after the last search, with P5-1's cells (🟢) and a refutation file.
const addC8 = (j: any, added?: string) => {
  const c8 = { ...structuredClone(claim(j, "P5-1")), id: "C8", planned: true };
  delete c8.ledger;
  delete c8.added;
  j.claims.push(added ? { ...c8, added } : c8);
};
const missingC8 = (sources: string, hint: string) =>
  `C8: 🟢 but no search covers it in ${sources}: search for C8 there and record it with "claims": ["C8"]${hint}`;
const AFTER = (added: string) =>
  ` (a search without "claims" covers only the claims added on or before its date; C8 was added ${added})`;
const NO_ADDED =
  ' (or set "added" to the day C8 entered the table: a search without "claims" covers only the claims added on or before its date)';

test("check_novelty_search: a claim added after the table's searches", () => {
  // fires: the issue's case — a claim added 2026-11-04, searches of 2026-10-27 and 2026-11-03, no "claims"
  {
    const r = run((j) => {
      legacy(j);
      for (const c of j.claims) c.added = "2026-10-08";
      addC8(j, "2026-11-04");
    });
    // Guards: C8 computes 🟢 (the table prints it), yet the run fails, naming C8, all three sources and the fix.
    assert.match(r.out, /C8\s+🟢/);
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      {
        code: 1,
        errors: [missingC8(SOURCES.join(", "), AFTER("2026-11-04"))],
      },
    );
  }
  // fires: the same claim with no "added" at all — the error names both fixes
  {
    const r = run((j) => {
      legacy(j);
      for (const c of j.claims) c.added = "2026-10-08";
      addC8(j);
    });
    // Guards: a claim with no date is not assumed to predate the searches.
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      { code: 1, errors: [missingC8(SOURCES.join(", "), NO_ADDED)] },
    );
  }
  // silent: the delta search recorded for C8 in each source
  {
    const r = run((j) => {
      legacy(j);
      for (const c of j.claims) c.added = "2026-10-08";
      addC8(j, "2026-11-04");
      j.searched.push(...SOURCES.map((s) => entry(s, "2026-11-04", ["C8"])));
    });
    // Guards: the per-claim search is what lets a 🟢 through.
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      { code: 0, errors: [] },
    );
  }
}, 120_000);

test("check_novelty_search: one source short, and searches without claims", () => {
  // fires: the delta search ran in two sources only (the third entry says nothing of how) — the error names it
  {
    const r = run((j) => {
      legacy(j);
      for (const c of j.claims) c.added = "2026-10-08";
      addC8(j, "2026-11-04");
      j.searched.push(entry("venue-pc", "2026-11-04", ["C8"]));
      j.searched.push(entry("prev-edition", "2026-11-04", ["C8"]));
      j.searched.push({
        ...entry("arxiv-recent", "2026-11-04", ["C8"]),
        how: " ",
      });
    });
    // Guards: coverage is counted per source, not "some search names C8"; an entry without a "how" is no search.
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      { code: 1, errors: [missingC8("arxiv-recent", AFTER("2026-11-04"))] },
    );
  }
  // silent: a search without "claims" dated on or after the claim's added date covers it (same day counts)
  {
    const r = run((j) => {
      legacy(j);
      for (const c of j.claims) c.added = "2026-10-08";
      addC8(j, "2026-10-27");
      j.searched.push(entry("arxiv-recent", "2026-10-27"));
    });
    // Guards: a table-wide search still counts for every claim the table had on its date.
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      { code: 0, errors: [] },
    );
  }
  // fires: a search that names other claims does not cover C8, whatever its date
  {
    const r = run((j) => {
      addC8(j, "2026-10-01");
      // the fixture's searches name R1 and P5-1, dated 2026-10-08, after C8's added date
    });
    // Guards: an entry with "claims" covers only the claims it names; no hint, since no entry lacks "claims".
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      { code: 1, errors: [missingC8(SOURCES.join(", "), "")] },
    );
  }
}, 120_000);

test("check_novelty_search: migrating a table, and claims that are not free", () => {
  // fires: an old table as it was (no "claims", no "added") whose 🟢 claim must now say when it entered
  {
    const r = run((j) => {
      for (const s of j.searched) delete s.claims;
    });
    // Guards: the migration is named in the error itself; R1 is 🔴 and needs no search to stay 🔴.
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      {
        code: 1,
        errors: [
          `P5-1: 🟢 but no search covers it in ${SOURCES.join(", ")}: search for P5-1 there and record it with "claims": ["P5-1"] (or set "added" to the day P5-1 entered the table: a search without "claims" covers only the claims added on or before its date)`,
        ],
      },
    );
  }
  // silent: the same table migrated by dating its claims
  {
    const r = run((j) => {
      for (const s of j.searched) delete s.claims;
      for (const c of j.claims) c.added = "2026-10-08";
    });
    // Guards: "added" on or before the searches' date is the whole migration for a table searched once.
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      { code: 0, errors: [] },
    );
  }
  // silent: a 🔴 claim that no search covers
  {
    const r = run((j) => {
      for (const s of j.searched) s.claims = ["P5-1"];
    });
    // Guards: only a 🟢 rests on the search having covered the claim.
    assert.deepEqual(
      { code: r.code, errors: r.errors },
      { code: 0, errors: [] },
    );
  }
}, 120_000);

test("check_novelty_search: an explicit null scope is malformed, not a table-wide search", () => {
  const r = run((j) => {
    for (const e of j.searched) e.claims = null;
    for (const c of j.claims) c.added = "2026-10-08";
  });
  // Guards: "claims": null is not the same as no "claims". A null scope in every source must not authorize 🟢 for
  // every claim added before the searches (Codex review on #370); it is named and covers nothing.
  assert.equal(r.code, 1);
  assert.deepEqual(
    r.errors.filter((e) => e.startsWith("searched[")),
    nullScopeErrors(3),
  );
  assert.ok(
    r.errors.some((e) =>
      e.startsWith(
        "P5-1: 🟢 but no search covers it in venue-pc, prev-edition, arxiv-recent",
      ),
    ),
    r.errors.join("\n"),
  );
}, 120_000);
const nullScopeErrors = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `searched[${i}]: "claims" must be a non-empty list of claim ids, got None`,
  );

test("check_novelty_search: malformed claims, added and dates", () => {
  const r = run((j) => {
    j.searched[0].claims = ["R1", "P5-1", "C9"];
    j.searched[1].claims = [];
    j.searched[2].claims = "P5-1";
    claim(j, "R1").added = "4 Nov 2026";
    j.searched.push({
      source: "venue-pc",
      how: "a later sweep",
      date: "2026-13-01",
    });
    j.searched.push({ source: "venue-pc", how: "a sweep with no date" });
  });
  // Guards: each malformed field is named with its fix, and a malformed entry covers nothing (P5-1 is short of
  // prev-edition and arxiv-recent, whose only entries are malformed). C9, no claim of the table, is no error: the
  // entry records what was searched that day, and a claim dropped later does not make the record wrong.
  assert.deepEqual(
    { code: r.code, errors: r.errors },
    {
      code: 1,
      errors: [
        'searched[1]: "claims" must be a non-empty list of claim ids, got []',
        "searched[2]: \"claims\" must be a non-empty list of claim ids, got 'P5-1'",
        "searched[3]: date '2026-13-01' is not YYYY-MM-DD; a search without \"claims\" covers the claims added on or before its date",
        'searched[4]: date None is not YYYY-MM-DD; a search without "claims" covers the claims added on or before its date',
        "R1: \"added\" '4 Nov 2026' is not a date (YYYY-MM-DD)",
        'P5-1: 🟢 but no search covers it in prev-edition, arxiv-recent: search for P5-1 there and record it with "claims": ["P5-1"]',
      ],
    },
  );
}, 120_000);
