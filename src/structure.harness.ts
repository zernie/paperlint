/**
 * Both halves for `structure.mjs` — the package's only check whose subject is a file's ABSENCE.
 *
 * 🔴 THE MAIN THING PINNED DOWN HERE IS NOT FIRING, IT'S SILENCE. An error-level check that
 * fails on a correct tree does not get fixed, it gets turned off, and real findings go with it.
 * So every "found" here has a paired "not found on the neighboring directory", and the defaults
 * are separately checked against the shape of the live corpus.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { z } from "zod";
import { createChecker } from "../lib/check.ts";

/** `asEslintResults` promises only `unknown[]`; these are the fields the checks read. */
const EslintResults = z.array(
  z.object({
    errorCount: z.number(),
    warningCount: z.number(),
    messages: z.array(
      z.object({ ruleId: z.string().nullable(), severity: z.number() }),
    ),
  }),
);
const { checkStructure, formatStructure, asEslintResults, STRUCTURE_DEFAULTS } =
  await import("./structure.ts");

const check = createChecker();

const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-struct-")));
const papers = join(root, "papers");
const paper = (name: string, files: readonly string[]) => {
  const dir = join(papers, name);
  mkdirSync(dir, { recursive: true });
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), "x");
  }
  return dir;
};

try {
  paper("complete", ["PIPELINE-STATUS.md", "paper.tex", "refs.bib"]);
  // a scorecard beside a Markdown paper: the paper the author thinks is linted is not a source
  paper("markdown", ["PIPELINE-STATUS.md", "paper.md"]);
  // a Markdown file alone is no marker: not a paper at all
  paper("markdown-alone", ["draft.md"]);
  // the marker is present (paper.tex), the scorecard is not — the directory is linted by ZERO
  // rules and reports clean
  paper("no-scorecard", ["paper.tex", "refs.bib"]);
  // the scorecard is present, the source is not
  paper("no-source", ["PIPELINE-STATUS.md"]);
  // not a single marker — this is a sibling in the corpus, not a paper
  paper("research", ["NOTES.md", "plan/ideas.md"]);
  mkdirSync(join(papers, ".hidden"), { recursive: true });
  writeFileSync(join(papers, ".hidden", "paper.tex"), "x");

  const f = checkStructure([papers], undefined, { cwd: root });
  const at = (name: string) => f.filter((x) => x.file.endsWith(name));

  check(
    "a complete paper directory — NOT A SINGLE finding",
    at("complete").length === 0,
  );
  check(
    "🔴 a scorecard beside `paper.md` is a paper with no source, and the finding says why: Markdown is not read",
    at("markdown").length === 1 &&
      /missing all of `paper\.tex` — `paper\.md` is a Markdown paper: a paper's source is `paper\.tex` \(LaTeX\); paperlint does not read Markdown papers — port it to `paper\.tex`/.test(
        at("markdown")[0]?.message ?? "",
      ),
  );
  check(
    "a Markdown file is not a marker: a folder holding only one is left alone",
    at("markdown-alone").length === 0 &&
      !STRUCTURE_DEFAULTS.markers.some(
        (m) => m.endsWith(".md") && m !== "PIPELINE-STATUS.md",
      ),
  );
  check(
    "a missing scorecard — a finding",
    at("no-scorecard").length === 1 &&
      /missing `PIPELINE-STATUS\.md`/.test(
        at("no-scorecard")[0]?.message ?? "",
      ),
  );
  check(
    "and the message names the CONSEQUENCE, not a restatement of the condition",
    /are skipped/.test(at("no-scorecard")[0]?.message ?? "") &&
      /stage and source checks/.test(at("no-scorecard")[0]?.message ?? ""),
  );
  check(
    "and the consequence names THIS directory by name",
    /no-scorecard/.test(at("no-scorecard")[0]?.message ?? ""),
  );
  check(
    "a directory with no source — a finding naming `paper.tex`, and no Markdown is mentioned where there is none",
    at("no-source").length === 1 &&
      /`paper\.tex` — a paper directory with no source/.test(
        at("no-source")[0]?.message ?? "",
      ) &&
      !/Markdown/.test(at("no-source")[0]?.message ?? ""),
  );

  // 🔴 THE PAIRED HALF: detection is GENEROUS. Without this the check would scream about every
  // neighboring directory in the corpus, get turned off, and take the three findings above with it.
  check(
    "a directory WITHOUT a single pipeline marker is left alone entirely",
    at("research").length === 0,
  );
  check("and so are hidden directories", at(".hidden").length === 0);
  check(
    "exactly three findings total — nothing extra turned up",
    f.length === 3,
  );

  // ── consumer config ────────────────────────────────────────────────────────────────
  check(
    "`ignore` exempts a directory by name",
    checkStructure(
      [papers],
      { ignore: ["no-scorecard", "no-source", "markdown"] },
      {
        cwd: root,
      },
    ).length === 0,
  );
  check(
    "`structure: false` turns the check off entirely",
    checkStructure([papers], false, { cwd: root }).length === 0,
  );
  check(
    "a requirement ON TOP OF the defaults fires — the config genuinely gets through",
    checkStructure(
      [papers],
      { require: ["PIPELINE-STATUS.md", "refs.bib"] },
      {
        cwd: root,
      },
    ).some((x) => x.file.endsWith("markdown") && /refs\.bib/.test(x.message)),
  );
  check(
    "a nonexistent root does not crash it — that's the empty-set guard talking",
    checkStructure([join(root, "nope")], undefined, { cwd: root }).length === 0,
  );

  // ── defaults: a measurement, not a taste ───────────────────────────────────────────────
  check(
    "`paper.pdf` is NOT in the defaults — two papers in the live corpus keep the pdf under a different name",
    !STRUCTURE_DEFAULTS.require.includes("paper.pdf"),
  );
  check(
    "and `paperlint.json` counts as a marker but not a requirement",
    STRUCTURE_DEFAULTS.markers.includes("paperlint.json") &&
      !STRUCTURE_DEFAULTS.require.includes("paperlint.json"),
  );

  // ── one schema for both halves ────────────────────────────────────────────────────────
  const asResults = EslintResults.parse(asEslintResults(f));
  check(
    "findings come back shaped like an ESLint result — `--json` stays one array",
    asResults.length === 3 &&
      asResults.every(
        (r) =>
          r.errorCount === 1 &&
          r.warningCount === 0 &&
          r.messages[0]?.ruleId === "structure/required-file" &&
          r.messages[0].severity === 2,
      ),
  );
  check(
    "two findings in ONE directory collapse into one result with errorCount 2",
    (() => {
      const two = checkStructure(
        [papers],
        { require: ["PIPELINE-STATUS.md", "refs.bib"] },
        { cwd: root },
      ).filter((x) => x.file.endsWith("no-source"));
      return EslintResults.parse(asEslintResults(two))[0]?.errorCount === 2;
    })(),
  );
  check(
    "the human-readable format names the directory and the finding",
    /no-scorecard/.test(formatStructure(f)) &&
      /error {2}missing/.test(formatStructure(f)),
  );
  check(
    "and the path is RELATIVE — an absolute path to the temp directory tells the reader nothing",
    f.every((x) => !x.file.startsWith("/")),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(check.count)} assertions passed — structure: a missing file cannot complain for itself`,
);
