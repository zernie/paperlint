/**
 * Colocated test for `eslint-rules/pdf-last-page-balance.mjs` (`pdf/last-page-balance`).
 * Run: `npx vigiles test eslint-rules/pdf-last-page-balance.harness.mjs`
 *
 * The rule is driven the way a consumer drives it: through rpp's own `buildConfig`, with the
 * rule turned on by a `rules` block in the settings — not through a config invented here. Each
 * paper is a temporary directory holding `paper.tex`, `paper.pdf` and the facts `paperlint build`
 * would write beside them.
 *
 * Both halves: it FIRES on an unbalanced page and on every input it cannot judge (no facts, a
 * foreign schema, facts about another PDF), and it is QUIET on a balanced page, a stub, a review
 * build, a file that is not paper.tex — and when nobody turned it on.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { texLanguage } from "./latex-language.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const { parseFacts, judgeColumns, DEFAULT_TOLERANCE_PT } = await import(
  join(HERE, "pdf-last-page-balance.mjs")
);
const { buildConfig } = await import(join(HERE, "..", "src", "cli.ts"));

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, detail ? `${label} — ${detail}` : label);
  n++;
};

const TEX =
  "% a paper\n\\documentclass[sigconf]{acmart}\n\\begin{document}x\\end{document}\n";
const PDF = "%PDF-1.5 pretend";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const facts = (lastPage, over = {}) => ({
  schema: 2,
  pdf: "paper.pdf",
  pdf_sha256: sha(PDF),
  last_page: lastPage,
  ...over,
});
const MEASURED = (l, r) => ({ kind: "measured", columns_pt: [l, r] });

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-balance-rule-")));
/** A paper directory with paper.tex, paper.pdf and, unless `null`, `_build/paper.facts.json`. */
const paper = (name, f, { pdf = PDF } = {}) => {
  const dir = join(root, "papers", name);
  mkdirSync(join(dir, "_build"), { recursive: true });
  writeFileSync(join(dir, "paper.tex"), TEX);
  writeFileSync(join(dir, "NOTES.md"), "# notes\n");
  if (pdf !== null) writeFileSync(join(dir, "paper.pdf"), pdf);
  if (f !== null)
    writeFileSync(
      join(dir, "_build", "paper.facts.json"),
      typeof f === "string" ? f : JSON.stringify(f),
    );
  return dir;
};

/** Lint files with rpp's config, the rule turned on for `papers/**` (unless `rules` says otherwise). */
async function lint(
  files,
  rules = [
    {
      basePath: root,
      files: ["papers/**"],
      rules: { "pdf/last-page-balance": "error" },
    },
  ],
) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: buildConfig({ rules }, texLanguage),
  });
  const results = await eslint.lintFiles(files);
  return results.flatMap((r) =>
    r.messages.map((m) => ({ file: r.filePath, ...m })),
  );
}
const only = (msgs) => msgs.filter((m) => m.ruleId === "pdf/last-page-balance");

try {
  // ── pure: parsing the facts and judging the columns ──────────────────────────────────
  check(
    "parseFacts: a schema-1 file is refused by name",
    parseFacts(JSON.stringify({ schema: 1 })).messageId === "schema",
  );
  check(
    "parseFacts: not JSON is `factsBroken`, not a crash",
    parseFacts("{").messageId === "factsBroken",
  );
  check(
    "parseFacts: a measured page without two finite heights is `factsBroken`",
    parseFacts(JSON.stringify(facts({ kind: "measured", columns_pt: [1] })))
      .messageId === "factsBroken",
  );
  check(
    "judgeColumns: at the tolerance it is balanced; one point more is not",
    judgeColumns({ kind: "measured", left: 220, right: 100 }, 120) === null &&
      judgeColumns({ kind: "measured", left: 221, right: 100 }, 120)
        ?.messageId === "unbalanced",
  );
  check("the default tolerance is 120 pt", DEFAULT_TOLERANCE_PT === 120);

  // ── fires ───────────────────────────────────────────────────────────────────────────
  const unb = paper("unbalanced", facts(MEASURED(621.5, 264.8)));
  const u = only(await lint([join(unb, "paper.tex")]));
  check(
    "🔴 an unbalanced last page is a finding, with both heights and the difference",
    u.length === 1 &&
      u[0].severity === 2 &&
      /621\.5 and 264\.8 pt, 356\.7 pt apart \(tolerance 120 pt\)/.test(
        u[0].message,
      ),
    JSON.stringify(u),
  );
  check(
    "…at the \\documentclass line, where the class option that fixes it goes",
    u[0]?.line === 2,
    String(u[0]?.line),
  );
  check(
    "…and the message says how to fix it by hand: pbalance, flushend, \\balance in the first column",
    /pbalance/.test(u[0]?.message) &&
      /flushend/.test(u[0]?.message) &&
      /FIRST column of the last page/.test(u[0]?.message),
  );
  const loose = only(
    await lint(
      [join(unb, "paper.tex")],
      [
        {
          basePath: root,
          files: ["papers/**"],
          rules: { "pdf/last-page-balance": ["warn", { tolerancePt: 400 }] },
        },
      ],
    ),
  );
  check(
    "the tolerance is the consumer's: 400 pt lets 356.7 pass",
    loose.length === 0,
    JSON.stringify(loose),
  );

  const noFacts = paper("no-facts", null);
  check(
    "🔴 on, but no facts file: a finding telling the author to build — not silence",
    only(await lint([join(noFacts, "paper.tex")]))[0]?.messageId === "noFacts",
  );
  const stale = paper("stale", facts(MEASURED(400, 400)), {
    pdf: "%PDF-1.5 rebuilt since",
  });
  check(
    "🔴 facts about a different PDF than the one on disk are refused as stale",
    only(await lint([join(stale, "paper.tex")]))[0]?.messageId === "stale",
  );
  const gone = paper("gone", facts(MEASURED(400, 400)), { pdf: null });
  check(
    "facts whose PDF is gone (a failed build removes it) are refused",
    only(await lint([join(gone, "paper.tex")]))[0]?.messageId === "pdfMissing",
  );
  const old = paper("old-schema", facts(MEASURED(400, 400), { schema: 1 }));
  check(
    "schema-1 facts are refused, not read with new meanings",
    only(await lint([join(old, "paper.tex")]))[0]?.messageId === "schema",
  );

  // ── quiet ───────────────────────────────────────────────────────────────────────────
  const bal = paper("balanced", facts(MEASURED(464.2, 461.5)));
  const stub = paper("stub", facts({ kind: "stub", words: 12 }));
  const review = paper("review", facts({ kind: "review", line_numbers: 60 }));
  const quiet = only(
    await lint([bal, stub, review].map((d) => join(d, "paper.tex"))),
  );
  check(
    "quiet on a balanced page, a stub last page and a review build",
    quiet.length === 0,
    JSON.stringify(quiet),
  );
  check(
    "quiet on a file that is not paper.tex, even inside the glob",
    only(await lint([join(unb, "NOTES.md")])).length === 0,
  );
  check(
    "🔴 OFF BY DEFAULT: with no `rules` block, an unbalanced paper gets no finding",
    only(await lint([join(unb, "paper.tex")], [])).length === 0,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — pdf/last-page-balance: fires on unbalanced and unjudgeable, quiet on balanced/stub/review/off`,
);
