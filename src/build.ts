/**
 * `rpp build <paper>` — build a paper with ITS OWN script.
 *
 * 🔴 WHY NOT A UNIVERSAL LOOP. Building a paper does not reduce to "run pdflatex three times".
 * One live example has an `\input{}` in its preamble for a file that sits NOT next to the paper
 * but in the venue's data, and without `TEXINPUTS` the build fails immediately; another has a
 * loop searching for the `\balance` position, where there are two dozen builds. Writing a
 * "general" loop means either handling neither of them, or dragging both peculiarities into a
 * package that must not know about them. The paper's script already knows its own job and finds
 * its own directory ITSELF, so the CLI just runs it.
 *
 * 🔴 WHAT THIS COMMAND FIXES, AND IT IS NOT CONVENIENCE. Written by hand in the consumer's
 * workflow:
 *   "The loop above only reaches a paper that ships `repro/build-submission.sh`, and exactly
 *    ONE of five does… So the accepted AgenticDev paper was checked by no paper job at all."
 *   "A paper with no `.log` is SKIPPED, not failed… That is a real gap, named rather than hidden."
 * That is, the loop looked for ONE name, the accepted paper had ANOTHER (`build.sh` at the root
 * versus `repro/build-submission.sh`), and the name mismatch looked like "nothing to build".
 *
 * ⇒ Two consequences, both deliberate:
 *   1. there are SEVERAL candidates and they are DECLARED — a name match stops being luck;
 *   2. NOT FOUND is a REFUSAL, not a skip. The skip is exactly the mode that let a paper go out
 *      to the venue without passing a single paper job.
 */
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, extname } from "node:path";
import type { BuildResult } from "./types.ts";

/** What to run, and with which pre-set arguments. */
export type Interpreter = readonly [bin: string, preArgs: readonly string[]];

/**
 * The order MATTERS: the first one found wins. `build.sh` at the paper's root comes first, because
 * that is what the author sees on opening the directory; `repro/…` is the reproduction-artifact
 * convention.
 */
export const BUILD_SCRIPTS = ["build.sh", "repro/build-submission.sh"];

/** A directory counts as a paper by the same markers as `structure.mjs` — one shared dictionary. */
export const PAPER_MARKERS = [
  "PIPELINE-STATUS.md",
  "paper.tex",
  "paper.md",
  "venue.json",
];

export function findBuildScript(
  paperDir: string,
  candidates: readonly string[] = BUILD_SCRIPTS,
): { rel: string; path: string } | null {
  for (const rel of candidates) {
    const p = join(paperDir, rel);
    if (existsSync(p)) return { rel, path: p };
  }
  return null;
}

/**
 * The interpreter is chosen by EXTENSION, not by the execute bit: a file in a fresh clone may not
 * have `+x` at all (git stores it, unpacking a tarball does not always), and then a direct run
 * fails with "Permission denied" for a reason that has nothing to do with the paper.
 */
export function interpreterFor(scriptPath: string): Interpreter {
  const ext = extname(scriptPath);
  if (ext === ".mjs" || ext === ".js") return [process.execPath, []];
  if (ext === ".py") return ["python3", []];
  return ["bash", []];
}

/** @returns {{dir: string, status: "built"|"failed"|"no-script", script?: string, code?: number}} */
export function buildPaper(
  paperDir: string,
  {
    candidates = BUILD_SCRIPTS,
    run = spawnSync,
    cwd = process.cwd(),
    // 🔴 `--dry-run` is NOT a convenience. "Which paper has no build script" is exactly the
    // question the corpus has answered with silence until now, and it must be possible to ask it
    // in a second, without running two dozen pdflatex passes and without touching the PDF in the
    // working tree.
    //
    // ⚠️ This parameter arrived on the second attempt, and the first attempt is a lesson in
    // itself: the flag was parsed in the CLI and passed down here, and HERE it did not exist.
    // Options destructuring swallows an unknown key SILENTLY, so `--dry-run` ran as a full build
    // and rewrote `paper.pdf` in the working tree. The failure looked like success: build output
    // on screen is easy to mistake for a verbose dry-run.
    dryRun = false,
  }: {
    candidates?: readonly string[];
    run?: typeof spawnSync;
    cwd?: string;
    dryRun?: boolean;
  } = {},
): BuildResult {
  const found = findBuildScript(paperDir, candidates);
  const dir = relative(cwd, paperDir) || paperDir;
  if (!found) return { dir, status: "no-script" };
  if (dryRun)
    return { dir, status: "built", script: found.rel, code: 0, dry: true };
  const [bin, pre] = interpreterFor(found.path);
  const r = run(bin, [...pre, found.path], { stdio: "inherit" });
  const code = r.status ?? 1;
  return {
    dir,
    status: code === 0 ? "built" : "failed",
    script: found.rel,
    code,
  };
}

/** Immediate subdirectories that look like a paper. Hidden ones are not papers. */
export function papersIn(
  root: string,
  markers: readonly string[] = PAPER_MARKERS,
): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => join(root, e.name))
      .filter((d) => markers.some((m) => existsSync(join(d, m))));
  } catch {
    return [];
  }
}

export function formatResults(results: readonly BuildResult[]): string {
  const line = (r: BuildResult): string =>
    r.status === "built"
      ? `  ✓ ${r.dir} — ${r.script}${r.dry ? "  (not run: --dry-run)" : ""}`
      : r.status === "failed"
        ? `  ✗ ${r.dir} — ${r.script} exited with code ${r.code}`
        : `  ✗ ${r.dir} — NO build script`;
  return results.map(line).join("\n");
}

/**
 * 🔴 "No script" COUNTS AS A REFUSAL on a par with a failed build. It was precisely the failure to
 * distinguish these two cases that produced the silent skip: "nothing to build" and "built" gave
 * one and the same green run.
 */
export const anyFailed = (results: readonly BuildResult[]): boolean =>
  results.some((r) => r.status !== "built");

export function remedyFor(
  results: readonly BuildResult[],
  candidates: readonly string[] = BUILD_SCRIPTS,
): string {
  const missing = results.filter((r) => r.status === "no-script");
  if (missing.length === 0) return "";
  return (
    `\nNo build script was found for: ${missing.map((r) => r.dir).join(", ")}.\n` +
    `Looked for, in this order: ${candidates.join(", ")}.\n` +
    `This is NOT "nothing to build" — it is a paper that neither CI nor a person can build with\n` +
    `one command.\n` +
    `Put a script at one of those paths, or name your own in package.json:\n` +
    `  { "research-paper-pipeline": { "buildScripts": ["my-build.sh"] } }`
  );
}
