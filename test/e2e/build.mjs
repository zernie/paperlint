#!/usr/bin/env node
/**
 * test/e2e/build.mjs — `rpp build` against a REAL `pdflatex`, from source to finished PDF.
 *
 * 🔴 HOW THIS DIFFERS FROM `src/build.harness.mjs`, AND WHY BOTH ARE NEEDED. That harness
 * substitutes a fake TeX for `spawnSync`: it checks the shell's DECISIONS — what runs, in which
 * order, with which TEXINPUTS, and what is left on disk. Not one of its assertions can say that a
 * PDF came out at the end, let alone WHICH one. Here is the other half: rpp compiles each fixture
 * with the real pdflatex and bibtex, and the result is measured with a tool rather than taken on
 * trust. No fixture carries a build script that rpp would run: `cite/build.sh` exists only to
 * prove it is NOT run.
 *
 * 🔴 WHAT EXACTLY THIS CATCHES, AND IT IS NOT A HYPOTHESIS. `acmart.cls` checks for the presence
 * of `libertine.sty`, `zi4.sty` and `newtxmath.sty`; failing to find ANY of them it sets
 * `\@ACM@newfontsfalse` and silently typesets the paper in Computer Modern. The build is GREEN,
 * the PDF looks fine, and the metrics are different — which means different pagination. That is
 * how the SUBMITTED `aisec-2026` went out. A green exit code says nothing about it: the failure
 * lives in the content of the artifact, so the content is what gets measured.
 *
 * 🔴 A MISSING TeX IS A DECLARED SKIP, NOT A SILENT ONE. For a contributor without TeX Live this
 * run is legitimately impossible, and it exits zero — HAVING SAID SO. In CI the same absence
 * means a broken environment, and `--strict` turns the skip into a failure: a skipped step and a
 * passed one look identical in the interface, and that is exactly the class this whole package is
 * written against.
 *
 *   node test/e2e/build.mjs [--strict]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { PAPERS_DIR_FIELD } from "../../lib/paper-config.mjs";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  columnHeights,
  readFonts,
} from "../../skills/render-paper/extract-pdf-facts.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CLI = join(ROOT, "bin", "rpp.mjs");
const strict = process.argv.includes("--strict");

/**
 * The faces `acmart` typesets a paper with when its fonts ARE IN PLACE. The list comes from a
 * measurement on a live TeX Live 2023, not from the class documentation: `pdffonts` shows
 * `LinLibertineT` (text), `LinBiolinumTB` (headings), `LinLibertineTB` (bold text).
 */
const ACMART_FAMILIES = /^(LinLibertine|LinBiolinum)/;
/** The signature of the silent substitution: the class fell back to its default fonts. */
const FALLBACK_FAMILIES = /^(CMR|CMBX|CMTI|CMTT|CMSS|LMRoman)/;

const missing = ["pdflatex", "bibtex", "pdffonts", "pdftotext"].filter(
  (b) =>
    spawnSync("command", ["-v", b], { shell: true, stdio: "ignore" }).status !==
    0,
);
if (missing.length) {
  const say = `build-e2e: skipped — this machine has no ${missing.join(", ")}.`;
  if (!strict) {
    console.log(
      `${say}\nThis is a legitimate skip for a clone without TeX Live. In CI the same case is a failure (--strict).`,
    );
    // 77, not 0: a skip is not a pass (scripts/check.mjs, SKIP_EXIT).
    process.exit(77);
  }
  console.error(
    `${say}\nIn --strict this is a FAILURE: in CI a missing tool is a broken environment,\nand a skipped check is indistinguishable from a passed one.`,
  );
  process.exit(2);
}

const fonts = (pdf) =>
  readFonts(execFileSync("pdffonts", [pdf], { encoding: "utf8" })).map(
    (f) => f.name,
  );

let bad = 0;
const check = (label, cond, detail = "") => {
  console.log(
    `  ${cond ? "✓" : "✗"} ${label}${detail && !cond ? ` — ${detail}` : ""}`,
  );
  if (!cond) bad++;
};

// The fixtures are copied: the build leaves `paper.pdf`, `paper.aux` and `paper.log` next to the
// source, and in the working tree those would be untracked files after every run.
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-build-e2e-")));
try {
  cpSync(join(ROOT, "fixtures", "build-e2e"), join(work, "papers"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  // A PDF "from an earlier build" beside the broken paper: a failed build must remove it.
  writeFileSync(join(work, "papers", "broken", "paper.pdf"), "%PDF-stale");
  // `--all` takes the papers directory from the config, not from an argument: the CONSUMER names
  // the scope, and that is the same contract for which `lint` has no "." default.
  writeFileSync(
    join(work, "rpp.json"),
    JSON.stringify({ [PAPERS_DIR_FIELD]: "papers" }, null, 2),
  );

  const r = spawnSync(process.execPath, [CLI, "build", "--all"], {
    cwd: work,
    encoding: "utf8",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  console.log(
    out
      .trim()
      .split("\n")
      .map((l) => `  │ ${l}`)
      .join("\n"),
  );
  console.log();

  console.log("build on a real pdflatex");
  const acmartPdf = join(work, "papers", "acmart", "paper.pdf");
  check("acmart: the PDF exists", existsSync(acmartPdf));
  if (existsSync(acmartPdf)) {
    const f = fonts(acmartPdf);
    check(
      "acmart: typeset with the class's OWN fonts",
      f.length > 0 && f.every((n) => ACMART_FAMILIES.test(n)),
      f.join(", "),
    );
    check(
      "🔴 acmart: and NOT ONE font of the silent substitution",
      !f.some((n) => FALLBACK_FAMILIES.test(n)),
      f.join(", "),
    );
  }

  console.log();
  console.log("the font check can go red");
  const fallbackPdf = join(work, "papers", "fallback", "paper.pdf");
  check(
    "the substituted PDF built too — the failure is not in the build",
    existsSync(fallbackPdf),
  );
  if (existsSync(fallbackPdf)) {
    const f = fonts(fallbackPdf);
    check(
      "and it is REJECTED by the font check, although the build was green",
      f.some((n) => FALLBACK_FAMILIES.test(n)) &&
        !f.every((n) => ACMART_FAMILIES.test(n)),
      f.join(", "),
    );
  }

  console.log();
  console.log("the bibtex path, and a leftover build.sh");
  const citeDir = join(work, "papers", "cite");
  const citePdf = join(citeDir, "paper.pdf");
  check("cite: the PDF exists", existsSync(citePdf));
  if (existsSync(citePdf)) {
    const text = execFileSync("pdftotext", [citePdf, "-"], {
      encoding: "utf8",
    });
    check(
      "cite: the citation resolved — [1] in the PDF, not [?]",
      text.includes("[1]") && !text.includes("[?]"),
      text.replace(/\s+/g, " ").slice(0, 120),
    );
    check("cite: the \\ref resolved — no ?? in the PDF", !text.includes("??"));
  }
  check(
    "cite: bibtex ran (paper.bbl exists)",
    existsSync(join(citeDir, "paper.bbl")),
  );
  check(
    "🔴 cite: the leftover build.sh did NOT run — no RAN on disk",
    !existsSync(join(citeDir, "RAN")),
  );
  check(
    "cite: and the run said it was ignored",
    /build\.sh is ignored — rpp builds the paper itself/.test(out),
  );

  console.log();
  console.log("paper-guards resolves with no configuration");
  check(
    "guards: \\input{paper-guards} built — rpp's venues directory is on TEXINPUTS",
    existsSync(join(work, "papers", "guards", "paper.pdf")),
  );

  console.log();
  console.log("the last page of a two-column acmart paper is balanced");
  // The plan and result lines of ONE paper: its name, then the indented lines under it.
  const block = (name) => {
    const lines = out.split("\n");
    const at = lines.findIndex((l) => l === `papers/${name}`);
    if (at < 0) return "";
    const end = lines.findIndex((l, i) => i > at && !l.startsWith(" "));
    return lines.slice(at, end < 0 ? undefined : end).join("\n");
  };
  const bal = block("balance");
  check(
    "balance: the plan says the step applies, and why",
    bal.includes(
      "  balance: acmart sigconf is two-column — will place \\balance in the bibliography",
    ),
    bal,
  );
  check(
    "balance: the result names the chosen position and both heights",
    /balance: \\balance before \\bibitem #\d+ of 30, last page [\d.]+ \/ [\d.]+ pt \(was [\d.]+ \/ [\d.]+ pt\)/.test(
      bal,
    ),
    bal,
  );
  const balPdf = join(work, "papers", "balance", "paper.pdf");
  check("balance: the PDF exists", existsSync(balPdf));
  if (existsSync(balPdf)) {
    // Measured HERE, with the tool, not taken from the step's own report: the last page of the
    // bbox output, split by the middle of the page — the same function the CI rule uses.
    const xml = execFileSync("pdftotext", ["-bbox", balPdf, "-"], {
      encoding: "utf8",
    });
    const pages = [
      ...xml.matchAll(
        /<page width="([\d.]+)" height="[\d.]+">([\s\S]*?)<\/page>/g,
      ),
    ];
    const last = pages.at(-1);
    const cols = last ? columnHeights(last[2], Number(last[1])) : null;
    check(
      "🔴 balance: the PDF's last page IS balanced — columns within 120 pt (unbalanced it is 621.5 / 264.8)",
      cols !== null && Math.abs(cols[0] - cols[1]) <= 120,
      JSON.stringify(cols),
    );
  }
  check(
    "🔴 balance: the balanced build ended on the \\finalpass pass (paper-guards armed)",
    existsSync(join(work, "papers", "balance", "paper.log")) &&
      readFileSync(
        join(work, "papers", "balance", "paper.log"),
        "latin1",
      ).includes("rpp-e2e: final pass"),
  );
  const one = block("balance-one-column");
  check(
    "one-column acmart with a bibliography: the step is SKIPPED, and the plan says why",
    one.includes(
      "  balance: skipped — acmart acmsmall is one-column; there is no last page to balance",
    ),
    one,
  );
  check(
    "one-column: and the paper still builds",
    existsSync(join(work, "papers", "balance-one-column", "paper.pdf")),
  );
  check(
    "article (cite): skipped as not acmart",
    block("cite").includes("  balance: skipped — article is not acmart"),
  );

  console.log();
  console.log("a failed build");
  const brokenDir = join(work, "papers", "broken");
  check(
    "broken: named as failed at pdflatex, with its exit code",
    /✗ compile: pdflatex exited with 1/.test(out),
  );
  check(
    "broken: the first error line from the log is quoted",
    /\.\/paper\.tex:6: Undefined control sequence\./.test(out),
  );
  check(
    "broken: and its l.6 source context",
    /l\.6 Text before, then \\undefinedmacro/.test(out),
  );
  check(
    "🔴 broken: the stale paper.pdf planted before the run is GONE",
    !existsSync(join(brokenDir, "paper.pdf")),
  );

  console.log();
  console.log("the command's remaining outcomes");
  check(
    "no-source: a paper with no paper.tex is a refusal, named separately",
    /✗ nothing to compile: no paper\.tex/.test(out),
  );
  check(
    "the plan is printed: one line per step",
    /  inputs: TEXINPUTS \+= /.test(out) && /  compile: paper\.tex/.test(out),
  );
  check(
    "and the run as a whole is a FAILURE, since two papers did not build",
    r.status !== 0,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log();
console.log(
  bad === 0
    ? "✅ build e2e: everything matched"
    : `🔴 build e2e: ${bad} mismatch(es)`,
);
process.exit(bad === 0 ? 0 : 1);
