#!/usr/bin/env node
/**
 * build-e2e.mjs — `rpp build` against a REAL `pdflatex`, from source to finished PDF.
 *
 * 🔴 HOW THIS DIFFERS FROM `src/build.harness.mjs`, AND WHY BOTH ARE NEEDED. That harness
 * substitutes its own function for `spawnSync`: it checks DECISIONS — which script was picked,
 * with which interpreter, what came back on a non-zero code. Not one of its assertions can say
 * that a PDF came out at the end, let alone WHICH one. Here is the other half: the script is run
 * for real, and the result is measured with a tool rather than taken on trust.
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
 *   node scripts/build-e2e.mjs [--strict]
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFonts } from "../skills/render-paper/extract-pdf-facts.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
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

const missing = ["pdflatex", "pdffonts"].filter(
  (b) => spawnSync("command", ["-v", b], { shell: true, stdio: "ignore" }).status !== 0,
);
if (missing.length) {
  const say = `build-e2e: skipped — this machine has no ${missing.join(", ")}.`;
  if (!strict) {
    console.log(`${say}\nThis is a legitimate skip for a clone without TeX Live. In CI the same case is a failure (--strict).`);
    // 77, not 0: a skip is not a pass (scripts/check.mjs, SKIP_EXIT).
    process.exit(77);
  }
  console.error(`${say}\nIn --strict this is a FAILURE: in CI a missing tool is a broken environment,\nand a skipped check is indistinguishable from a passed one.`);
  process.exit(2);
}

const fonts = (pdf) =>
  readFonts(execFileSync("pdffonts", [pdf], { encoding: "utf8" })).map((f) => f.name);

let bad = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail && !cond ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};

// The fixtures are copied: the build leaves `paper.pdf`, `paper.aux` and `build.log` next to the
// source, and in the working tree those would be untracked files after every run.
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-build-e2e-")));
try {
  cpSync(join(ROOT, "fixtures", "build-e2e"), join(work, "papers"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  // `--all` takes the papers directory from the config, not from an argument: the CONSUMER names
  // the scope, and that is the same contract for which `lint` has no "." default.
  writeFileSync(join(work, "rpp.json"), JSON.stringify({ papers: "papers" }, null, 2));

  const r = spawnSync(process.execPath, [CLI, "build", "--all"], {
    cwd: work,
    encoding: "utf8",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  console.log(out.trim().split("\n").map((l) => `  │ ${l}`).join("\n"));
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
  check("the substituted PDF built too — the failure is not in the build", existsSync(fallbackPdf));
  if (existsSync(fallbackPdf)) {
    const f = fonts(fallbackPdf);
    check(
      "and it is REJECTED by the font check, although the build was green",
      f.some((n) => FALLBACK_FAMILIES.test(n)) && !f.every((n) => ACMART_FAMILIES.test(n)),
      f.join(", "),
    );
  }

  console.log();
  console.log("the command's remaining outcomes");
  check(
    "a failed build is named as failed, with its code",
    /✗ .*broken/.test(out) && /\b3\b/.test(out),
  );
  check("a paper with no script is named separately", /NO build script/.test(out));
  check(
    "and the run as a whole is a FAILURE, since two papers out of four did not build",
    r.status !== 0,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log();
console.log(bad === 0 ? "✅ build e2e: everything matched" : `🔴 build e2e: ${bad} mismatch(es)`);
process.exit(bad === 0 ? 0 : 1);
