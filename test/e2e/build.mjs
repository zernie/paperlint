#!/usr/bin/env node
/**
 * test/e2e/build.mjs — `paperlint build` against a REAL `pdflatex`, from source to finished PDF.
 *
 * 🔴 HOW THIS DIFFERS FROM `src/build.harness.mjs`, AND WHY BOTH ARE NEEDED. That harness
 * substitutes a fake TeX for `spawnSync`: it checks the shell's DECISIONS — what runs, in which
 * order, with which TEXINPUTS, and what is left on disk. Not one of its assertions can say that a
 * PDF came out at the end, let alone WHICH one. Here is the other half: paperlint compiles each fixture
 * with the real pdflatex and bibtex, and the result is measured with a tool rather than taken on
 * trust. No fixture carries a build script that paperlint would run: `cite/build.sh` exists only to
 * prove it is NOT run.
 *
 * 🔴 WHAT EXACTLY THIS CATCHES, AND IT IS NOT A HYPOTHESIS. `acmart.cls` checks for the presence
 * of `libertine.sty`, `zi4.sty` and `newtxmath.sty`; failing to find ANY of them it sets
 * `\@ACM@newfontsfalse` and silently typesets the paper in Computer Modern. The build is GREEN,
 * the PDF looks fine, and the metrics are different — which means different pagination. That is
 * how the SUBMITTED `aisec-2026` went out. A green exit code says nothing about it: the failure
 * lives in the content of the artifact, so the content is what gets measured.
 *
 * 🔴 THE ENGINE IS paperlint's OWN DECISION. The run first proves the refusal — no TeX Live and no terminal
 * gives one line naming `npx paperlint toolchain` and nothing built — which needs no TeX at all. Then it
 * asks `paperlint build --dry-run` which TeX Live the real run would use; under --strict (CI) that must
 * be paperlint's cache, the one `paperlint toolchain` installed in the step before.
 *
 * 🔴 A MISSING TeX IS A DECLARED SKIP, NOT A SILENT ONE. For a contributor without TeX Live this
 * run is legitimately impossible, and it exits zero — HAVING SAID SO. In CI the same absence
 * means a broken environment, and `--strict` turns the skip into a failure: a skipped step and a
 * passed one look identical in the interface, and that is exactly the class this whole package is
 * written against.
 *
 *   node test/e2e/build.mjs [--strict]
 */
import { spawnSync } from "node:child_process";
import { PAPERS_DIR_FIELD } from "../../lib/paper-config.mjs";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  embeddedNames,
  fontNames,
  lastPageText,
  logEmbedded,
  readBuilt,
  sameFonts,
} from "./read-pdf.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CLI = join(ROOT, "bin", "paperlint.mjs");
const strict = process.argv.includes("--strict");

/**
 * The faces `acmart` typesets a paper with when its fonts ARE IN PLACE. The list comes from a
 * measurement on a live TeX Live 2023, not from the class documentation: the PDF carries
 * `LinLibertineT` (text), `LinBiolinumTB` (headings), `LinLibertineTB` (bold text).
 */
const ACMART_FAMILIES = /^(LinLibertine|LinBiolinum)/;
/** The signature of the silent substitution: the class fell back to its default fonts. */
const FALLBACK_FAMILIES = /^(CMR|CMBX|CMTI|CMTT|CMSS|LMRoman)/;

/** Declared skip (77) on a contributor's machine, a failure under --strict (CI). */
function skipOrFail(say) {
  // The checks that ran before the skip are not waived by it.
  if (bad > 0) {
    console.error(`${say}\n🔴 and ${bad} check(s) above already failed`);
    process.exit(1);
  }
  if (!strict) {
    console.log(
      `${say}\nThis is a legitimate skip on a machine without it. In CI the same case is a failure (--strict).`,
    );
    // 77, not 0: a skip is not a pass (scripts/check.mjs, SKIP_EXIT).
    process.exit(77);
  }
  console.error(
    `${say}\nIn --strict this is a FAILURE: in CI a missing tool is a broken environment,\nand a skipped check is indistinguishable from a passed one.`,
  );
  process.exit(2);
}

let bad = 0;
const check = (label, cond, detail = "") => {
  console.log(
    `  ${cond ? "✓" : "✗"} ${label}${detail && !cond ? ` — ${detail}` : ""}`,
  );
  if (!cond) bad++;
};

// The fixtures are copied: the build leaves `paper.pdf`, `paper.aux` and `paper.log` next to the
// source, and in the working tree those would be untracked files after every run.
const work = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-build-e2e-")));
try {
  cpSync(join(ROOT, "fixtures", "build-e2e"), join(work, "papers"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  // PDFs "from an earlier build": none of these papers may end the run with one it did not write.
  // broken fails at pdflatex; empty has no pages (exit 0, no PDF); no-source has no paper.tex.
  for (const p of ["broken", "empty", "no-source"])
    writeFileSync(join(work, "papers", p, "paper.pdf"), "%PDF-stale");
  // `--all` takes the papers directory from the config, not from an argument: the CONSUMER names
  // the scope, and that is the same contract for which `lint` has no "." default.
  writeFileSync(
    join(work, "package.json"),
    JSON.stringify(
      {
        name: "consumer",
        private: true,
        paperlint: { [PAPERS_DIR_FIELD]: "papers" },
      },
      null,
      2,
    ),
  );

  // ── NO TeX LIVE, NO TERMINAL: one line, and nothing is built ─────────────────────────────
  // Runs FIRST and needs no TeX: PATH holds node alone, the cache directory is empty, CI is set.
  // This is what an agent or a CI job without `paperlint toolchain` sees.
  console.log("no TeX Live and no terminal");
  const bare = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-bare-")));
  // A PDF from an earlier build beside the paper the refusal stops at: it must not survive either.
  const acmartStale = join(work, "papers", "acmart", "paper.pdf");
  writeFileSync(acmartStale, "%PDF-stale");
  try {
    mkdirSync(join(bare, "bin"));
    symlinkSync(process.execPath, join(bare, "bin", "node"));
    const refused = spawnSync(
      process.execPath,
      [CLI, "build", join("papers", "acmart")],
      {
        cwd: work,
        encoding: "utf8",
        env: {
          HOME: bare,
          PATH: join(bare, "bin"),
          CI: "1",
          PAPERLINT_TEXLIVE_DIR: join(bare, "cache"),
        },
      },
    );
    const said = `${refused.stdout}${refused.stderr}`;
    check("refused: exit 1", refused.status === 1, said);
    check(
      "refused: ONE line naming `npx paperlint toolchain` and the venue's packages",
      said
        .split("\n")
        .some(
          (l) =>
            l.includes("run `npx paperlint toolchain`") &&
            l.includes("acmart") &&
            l.includes("libertine"),
        ),
      said,
    );
    check(
      "refused BEFORE compiling: no plan line, nothing installed",
      !said.includes("compile:") && !existsSync(join(bare, "cache")),
      said,
    );
    check(
      "🔴 refused: the stale paper.pdf is GONE, and the run says so",
      !existsSync(acmartStale) &&
        said.includes(
          "papers/acmart: paper.pdf removed — a stale PDF must not pass for this build",
        ),
      said,
    );
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
  console.log();

  // ── the engine the real build will use ────────────────────────────────────────────────
  const plan = spawnSync(
    process.execPath,
    [CLI, "build", "--all", "--dry-run"],
    {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
    },
  );
  const engine =
    `${plan.stdout}`.split("\n").find((l) => l.startsWith("engine: ")) ?? "";
  if (!engine || engine.startsWith("engine: none"))
    skipOrFail(
      `build-e2e: skipped — no TeX Live with every declared package (${engine || "no engine line"}).\n` +
        `Install one with \`node bin/paperlint.mjs toolchain\` (PAPERLINT_TEXLIVE_DIR picks the directory).`,
    );
  console.log(engine);
  // 🔴 In CI the build must run on the TeX Live `paperlint toolchain` installed — the runner has no other.
  if (strict)
    check(
      "strict: the engine is paperlint's own cache",
      engine.includes("paperlint cache"),
      engine,
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
    const facts = await readBuilt(acmartPdf);
    const f = fontNames(facts);
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
    // The producer's list against the artifact's: pdfTeX names every program it embedded.
    const logged = logEmbedded(join(work, "papers", "acmart", "paper.log"));
    check(
      "🔴 acmart: pdf.js's embedded fonts are exactly the ones pdfTeX logged as embedded",
      logged.length > 0 && sameFonts(logged, embeddedNames(facts)),
      `log: ${logged.join(", ")} · pdf.js: ${embeddedNames(facts).join(", ")}`,
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
    const facts = await readBuilt(fallbackPdf);
    const f = fontNames(facts);
    check(
      "and it is REJECTED by the font check, although the build was green",
      f.some((n) => FALLBACK_FAMILIES.test(n)) &&
        !f.every((n) => ACMART_FAMILIES.test(n)),
      f.join(", "),
    );
    const logged = logEmbedded(join(work, "papers", "fallback", "paper.log"));
    check(
      "fallback: and the cross-check agrees there too — pdfTeX embedded Computer Modern",
      logged.length > 0 && sameFonts(logged, embeddedNames(facts)),
      `log: ${logged.join(", ")} · pdf.js: ${embeddedNames(facts).join(", ")}`,
    );
  }

  console.log();
  console.log("the bibtex path, and a leftover build.sh");
  const citeDir = join(work, "papers", "cite");
  const citePdf = join(citeDir, "paper.pdf");
  check("cite: the PDF exists", existsSync(citePdf));
  if (existsSync(citePdf)) {
    // The cite fixture is one page, so its last page is all of its text.
    const facts = await readBuilt(citePdf);
    const text = lastPageText(facts);
    check("cite: one page", facts.pages === 1, String(facts.pages));
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
    /build\.sh is ignored — paperlint builds the paper itself/.test(out),
  );

  console.log();
  console.log("paper-guards resolves with no configuration");
  check(
    "guards: \\input{paper-guards} built — paperlint's venues directory is on TEXINPUTS",
    existsSync(join(work, "papers", "guards", "paper.pdf")),
  );

  console.log();
  console.log("the build does not judge the layout");
  // The plan and result lines of ONE paper: its name, then the indented lines under it.
  const block = (name) => {
    const lines = out.split("\n");
    const at = lines.findIndex((l) => l === `papers/${name}`);
    if (at < 0) return "";
    const end = lines.findIndex((l, i) => i > at && !l.startsWith(" "));
    return lines.slice(at, end < 0 ? undefined : end).join("\n");
  };
  const unb = block("unbalanced");
  check(
    "unbalanced: a two-column acmart paper with an unbalanced last page builds GREEN",
    unb.includes("✓ paper.pdf") &&
      existsSync(join(work, "papers", "unbalanced", "paper.pdf")),
    unb,
  );
  const unbFacts = join(
    work,
    "papers",
    "unbalanced",
    "_build",
    "paper.facts.json",
  );
  const uf = existsSync(unbFacts)
    ? JSON.parse(readFileSync(unbFacts, "utf8"))
    : null;
  check(
    "🔴 unbalanced: the build MEASURED it — _build/paper.facts.json, schema 2, both heights (unbalanced: ~621.5 / 264.8 pt)",
    uf?.schema === 2 &&
      uf.last_page?.kind === "measured" &&
      Math.abs(uf.last_page.columns_pt[0] - uf.last_page.columns_pt[1]) > 120,
    JSON.stringify(uf?.last_page),
  );
  check(
    "unbalanced: and the result line reports the heights without judging them",
    /facts: _build\/paper\.facts\.json, last page [\d.]+ \/ [\d.]+ pt/.test(
      unb,
    ),
    unb,
  );
  check(
    "🔴 unbalanced: the plan has no balance step, and nothing rewrote the bibliography",
    !/^ {2}balance:/m.test(out) &&
      !readFileSync(
        join(work, "papers", "unbalanced", "paper.bbl"),
        "utf8",
      ).includes("\\balance"),
    unb,
  );

  console.log();
  console.log("the optional balance rule judges what the build measured");
  // The consumer turns pdf/last-page-balance on for two papers, in the settings' `rules` key —
  // ESLint's own block shape, `files` relative to the settings file.
  writeFileSync(
    join(work, "package.json"),
    JSON.stringify(
      {
        name: "consumer",
        private: true,
        paperlint: {
          [PAPERS_DIR_FIELD]: "papers",
          rules: [
            {
              files: ["papers/unbalanced/**", "papers/acmart/**"],
              rules: { "pdf/last-page-balance": "error" },
            },
          ],
        },
      },
      null,
      2,
    ),
  );
  const linted = spawnSync(
    process.execPath,
    [CLI, "lint", "papers/unbalanced", "papers/acmart", "--json"],
    { cwd: work, encoding: "utf8" },
  );
  let findings = [];
  try {
    findings = JSON.parse(linted.stdout).flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === "pdf/last-page-balance")
        .map((m) => ({ file: r.filePath, message: m.message })),
    );
  } catch {
    findings = [
      { file: "(unparsable)", message: linted.stdout + linted.stderr },
    ];
  }
  check(
    "🔴 unbalanced: `paperlint lint` reports the last page — 621.5 and 264.8 pt, with the fix by hand",
    findings.some(
      (f) =>
        f.file.endsWith(join("unbalanced", "paper.tex")) &&
        /621\.5 and 264\.8 pt/.test(f.message) &&
        /pbalance/.test(f.message),
    ),
    JSON.stringify(findings),
  );
  check(
    "acmart: its one-page stub of a last page is not judged",
    !findings.some((f) => f.file.includes(join("acmart", "paper.tex"))),
    JSON.stringify(findings),
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
  console.log("a document with no pages — pdflatex exits 0 and writes no PDF");
  const empty = block("empty");
  check(
    "🔴 empty: a FAILURE at compile, not a green paper.pdf",
    empty.includes(
      "✗ compile: pdflatex exited 0 but wrote no paper.pdf — does the document have any pages?",
    ) && !empty.includes("✓"),
    empty,
  );
  check(
    "🔴 empty: the stale paper.pdf planted before the run is GONE — it cannot pass for this build",
    !existsSync(join(work, "papers", "empty", "paper.pdf")),
  );

  console.log();
  console.log("the command's remaining outcomes");
  check(
    "no-source: a paper with no paper.tex is a refusal, named separately",
    /✗ nothing to compile: no paper\.tex/.test(out),
  );
  check(
    "🔴 no-source: the stale paper.pdf is GONE, and the refusal says so",
    !existsSync(join(work, "papers", "no-source", "paper.pdf")) &&
      block("no-source").includes(
        "paper.pdf removed — a stale PDF must not pass for this build",
      ),
    block("no-source"),
  );
  check(
    "the plan is printed: one line per step",
    /  inputs: TEXINPUTS \+= /.test(out) && /  compile: paper\.tex/.test(out),
  );
  check(
    "and the run as a whole is a FAILURE, since three papers did not build",
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
