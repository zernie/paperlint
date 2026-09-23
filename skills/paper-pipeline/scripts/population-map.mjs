#!/usr/bin/env node
/**
 * population-map.mjs — does the population registry keep its link to the body of the paper?
 *
 * (Before 2026-08-26 this file answered the question "can the reader tell WHICH SET each number
 *  counts" in full; half of the answer now lives in ESLint rules — see below.)
 *
 *   node population-map.mjs <paper-dir>              report
 *   node population-map.mjs <paper-dir> --flags-only for hooks and pre-commit
 *
 * 🔴 WHY THIS EXISTS. `papers/CLAUDE.md` has carried this as writing rule #3 since 2026-08-05:
 *
 *     "A number arrives together with what it counts, and out of what. […] If two numbers come
 *      from different experiments — say so IN THE SAME SENTENCE."
 *
 * It was written after a cold reader gave up tracking the abstract's populations halfway through.
 * It is prose. Nothing enforced it. On 2026-08-06 the author read the finished paper and said he
 * could not follow his own §4 — and the cause was not the count of measurements, it was that §4
 * moves between TWO SAMPLES THAT BARELY OVERLAP (a targeted census of 134 repositories and a broad
 * corpus of 1,921; seven repositories are in both) and never says so. §4.1's rate and §4.3's rate
 * read as if one replicated the other. They cannot: they are different populations.
 *
 * That is this repository's own thesis turned on its own manuscript — a rule written in a rules
 * file, with no mechanism behind it, that therefore did nothing for a year of edits. So the rule
 * gets a leg.
 *
 * 🔴 TWO OF THE FOUR FINDINGS MOVED INTO ESLint RULES ON 2026-08-26. What is left here is only
 * what speaks about THE REGISTRY ITSELF, not about the paper:
 *
 *   stale    a registry row for a quantity the body NO LONGER PRINTS. The registry shrinks together
 *            with the paper and does not rot.
 *   badref   a row points at a `related_to` that is not a row anywhere.
 *
 * Both are inseparable from the file `repro/populations.tsv` and HAVE NO ADDRESS IN THE PAPER:
 * `stale` by definition speaks about a number that is not in the paper, and `badref` about two
 * fields of one TSV row. An ESLint rule can only report into the file being linted, so moving them
 * would mean pointing a finger at the paper while talking about a different file.
 *
 * MOVED INTO `eslint-rules/paper-registry.mjs` (the rules `paper/population-untied` and
 * `paper/population-undeclared`):
 *   untied      — a population is not named IN THE SAME SENTENCE as the one it is derived from;
 *   undeclared  — a number is printed in the shape of a population, and no registry row declares it.
 * Both speak about a place IN THE PAPER, and for them the registry is configuration, exactly like a
 * venue profile for `pdf/profile`. Parity was proved before the deletion (the real paper + 17
 * fixtures), the write-up is in `the author's private research notes`.
 *
 * Advisory.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  headings as mdHeadings,
  requireMarkdown,
} from "../../../lib/markdown.mjs";
import { isMain } from "./consumer.mjs";

// Markup is parsed with a parser (`CLAUDE.md`, 2026-08-11). We fail rather than degrade: without
// the body boundaries `bodyOf()` would return an empty string, and out of an empty string this
// check concludes "not a single registry number is printed", that is, ALL rows stale — a confident
// list of findings about a paper nobody read.
requireMarkdown();

/** The body is everything before the bibliography; appendices sit after it in this paper and are
 *  not under the page limit, so a relation stated only there does not reach the reader who stops
 *  at the References. That asymmetry is the whole point of checking the body separately. */
export function bodyOf(md) {
  const stripped = md.replace(/<!--[\s\S]*?-->/g, "");
  // 2026-08-11: both body boundaries come from the parser. `/^##\s+References\s*$/m` opened and
  // closed the body on hashes at the start of a line — including hashes inside a ```-block, and this
  // paper quotes whole chunks of other people's papers. The `-1` convention and the `< 0`
  // comparisons are left as they were.
  const at = (re) => {
    const h = mdHeadings(stripped).find(
      (x) => x.depth === 2 && re.test(x.text),
    );
    return h ? h.offset : -1;
  };
  const cut = at(/^References$/u);
  const start = at(/^Abstract$/u);
  return stripped.slice(start < 0 ? 0 : start, cut < 0 ? stripped.length : cut);
}

const asLiteral = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A printed quantity, not a substring of a longer one: 189 must not match inside 1,189 or 1893.
 *  The trailing guard must still allow ORDINARY PUNCTUATION after the number — "of the 1,921, we
 *  could enumerate 189" and a sentence-final "...over all 1,921." are both the number being
 *  printed. Forbidding any following `.` or `,` silently loses exactly the positions a summary
 *  figure lands in; only a DIGIT after the separator makes it part of a longer quantity. */
const printed = (n) => new RegExp(`(?<![\\d,.])${asLiteral(n)}(?!\\d|[,.]\\d)`);

export function parseRegistry(tsv) {
  const rows = [];
  for (const line of tsv.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [id, print, relation, relatedTo, gloss] = line
      .split("\t")
      .map((c) => (c ?? "").trim());
    if (!id || id === "id") continue;
    rows.push({ id, print, relation, relatedTo, gloss });
  }
  return rows;
}

export function findings(md, tsv) {
  const body = bodyOf(md);
  const reg = parseRegistry(tsv);
  const byId = new Map(reg.map((r) => [r.id, r]));
  const out = [];

  for (const row of reg) {
    const appears = printed(row.print).test(body);
    if (!appears) {
      // A registry row for a quantity the body no longer prints. Same discipline as the
      // grandfathered numbers list: the registry shrinks when the paper does, and never rots.
      if (row.relation !== "retired") out.push({ kind: "stale", row });
      continue;
    }
    if (row.relation === "root" || row.relation === "external") continue;
    // The order is preserved from the original: `untied` was computed AFTER this check and moved
    // into `paper/population-untied`; the dangling reference stayed here because it is about a TSV
    // row.
    if (!byId.get(row.relatedTo)) out.push({ kind: "badref", row });
  }
  return out;
}

/* Importable above this line; the CLI only runs when this file is the entry point, so the selftest
 * can exercise findings() without the argv handling firing. */
if (!isMain(import.meta.url)) {
  // imported — nothing to do
} else main();

function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  const flagsOnly = args.includes("--flags-only");
  if (!dir) {
    console.error("usage: node population-map.mjs <paper-dir> [--flags-only]");
    process.exit(0);
  }

  const paperPath = ["paper.md", "draft.md"]
    .map((f) => join(dir, f))
    .find(existsSync);
  const regPath = join(dir, "repro", "populations.tsv");
  // Same silent-skip class as artifact-coverage.mjs — see the note there (measured 2026-08-25).
  if (!paperPath || !existsSync(regPath)) {
    const why = !paperPath
      ? "no paper.md/draft.md — this checker reads markdown only, a .tex paper is NOT covered"
      : `no registry at ${regPath}`;
    console.error(`⏭️  population map SKIPPED for ${dir} — ${why}.`);
    process.exit(0);
  }

  const found = findings(
    readFileSync(paperPath, "utf8"),
    readFileSync(regPath, "utf8"),
  );

  if (!found.length) {
    if (!flagsOnly)
      console.log(
        "population map: the registry matches the body — no stale rows, no dangling related_to.",
      );
    process.exit(0);
  }

  console.log(`population map — ${found.length} finding(s) in ${paperPath}`);
  for (const f of found) {
    if (f.kind === "stale") {
      console.log(
        `  ·  ${f.row.print} (${f.row.id}) is declared and the body no longer prints it — drop the row or mark it retired`,
      );
    } else if (f.kind === "badref") {
      console.log(
        `  🔴 ${f.row.id} says it relates to "${f.row.relatedTo}", which is not a row in populations.tsv`,
      );
    }
  }
  process.exit(0);
}
