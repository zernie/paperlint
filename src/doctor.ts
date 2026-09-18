/**
 * `rpp doctor` — the command that makes SILENCE VISIBLE.
 *
 * 🔴 WHY THIS EXISTS AT ALL, when none of the eight tools surveyed for `docs/install.md` ships a
 * `doctor`. None of them needs one: a formatter that is misconfigured formats nothing and you see
 * it immediately. This package has `paper-edit-guard`, whose success state IS silence — it reports
 * nothing while guarding correctly and reports nothing while guarding a directory that does not
 * exist. From outside, "installed" and "protecting you" are the same picture.
 *
 * Measured 2026-09-18, and this is the failure the command was written for: a consumer who follows
 * the documented install exactly — `rpp init`, then point the config at their papers — gets a guard
 * that allows every Bash write to their paper sources. It only appears to work when the directory
 * path happens to contain the segment `papers`, because that is the default the hook falls back to.
 * (Issue #33.)
 *
 * 🔴 THE ROOT THE HOOK WOULD USE IS ASKED OF THE HOOK, NOT RE-DERIVED. `papersRoot` is imported
 * from `paper-edit-guard.hook.mjs` itself. A second implementation here would be a second source of
 * truth, which is the very defect this command reports — and it would drift silently, because a
 * copy that disagrees with the original still prints a confident answer.
 *
 * Prior art for the shape: `brew doctor`, `flutter doctor`, `npm doctor`, `expo-doctor`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
// @ts-expect-error — the hook ships as .mjs and carries no types; see the block above for why the
// import points at the hook itself rather than at a shared module.
import { papersRoot, CONFIG_KEY } from "../hooks/paper-edit-guard.hook.mjs";
import { PAPER_MARKERS } from "./build.ts";

export interface Program {
  readonly bin: string;
  readonly from: string;
  readonly without: string;
  readonly install: string;
}

/**
 * The programs the SKILLS shell out to. `rpp lint` needs none of them — it reads files and reports.
 * Every one of these fails quietly, which is the only reason the list is worth printing: a missing
 * checker and a passing checker produce the same silence.
 */
export const PROGRAMS: readonly Program[] = [
  { bin: "pdflatex", from: "TeX Live", without: "no PDF is produced", install: "apt-get install -y texlive-latex-recommended" },
  { bin: "bibtex", from: "TeX Live", without: "the bibliography is not resolved", install: "apt-get install -y texlive-binaries" },
  { bin: "pdfinfo", from: "poppler-utils", without: "checks that read the built PDF cannot run", install: "apt-get install -y poppler-utils" },
  { bin: "pdftotext", from: "poppler-utils", without: "the PDF text checks cannot run", install: "apt-get install -y poppler-utils" },
  { bin: "texcount", from: "TeX Live (texlive-extra-utils)", without: "the length checks cannot run", install: "apt-get install -y texlive-extra-utils" },
  { bin: "java", from: "any JRE", without: "TeXtidote does not run, and nothing else spell-checks the text", install: "apt-get install -y default-jre-headless" },
  { bin: "python3", from: "your system", without: "the analysis and report scripts do not start", install: "apt-get install -y python3" },
];

export const found = (bin: string, run = spawnSync): boolean =>
  run("command", ["-v", bin], { shell: true, stdio: "ignore" }).status === 0;

/** Directories that look like papers, used to REPLACE a guessed default with a measurement. */
export function detectPapers(cwd: string, depth = 2): string[] {
  const hits: string[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "_build", ".claude"]);
  const walk = (dir: string, left: number): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || skip.has(e.name)) continue;
      const here = join(dir, e.name);
      // A directory whose CHILDREN look like papers is the papers root — not the paper itself.
      let children;
      try {
        children = readdirSync(here, { withFileTypes: true });
      } catch {
        continue;
      }
      const isPapersRoot = children.some(
        (c) => c.isDirectory() && PAPER_MARKERS.some((m) => existsSync(join(here, c.name, m))),
      );
      if (isPapersRoot) hits.push(relative(cwd, here));
      else if (left > 0) walk(here, left - 1);
    }
  };
  walk(resolve(cwd), depth);
  return hits;
}

export interface DoctorOptions {
  log?: typeof console.log;
  cwd?: string;
  /** The project root the hooks are anchored to. Claude Code sets this; it defaults to `cwd`. */
  projectDir?: string;
  run?: typeof spawnSync;
  /** The directory the CLI resolved from its own config, so both sides can be compared. */
  cliPapers?: string | null;
}

/**
 * @returns 2 when the guard and the linter do not agree, or the declaration is unusable — those
 * are binary and are the reason this command exists. A missing external program is a FACT, not a
 * verdict: it is printed and does not fail the run, because which programs you need depends on
 * which skills you use. A doctor that exits non-zero on an advisory line gets piped to /dev/null.
 */
export function doctor({
  log = console.log,
  cwd = process.cwd(),
  projectDir,
  run = spawnSync,
  cliPapers = null,
}: DoctorOptions = {}): number {
  const root = projectDir ?? cwd;
  const pkgPath = join(root, "package.json");
  const out: string[] = ["", "rpp doctor — what is wired, and what only looks wired", ""];
  let bad = 0;

  out.push("declaration");
  const rawPkg = existsSync(pkgPath) ? readFileSync(pkgPath, "utf8") : "";
  if (!rawPkg) {
    out.push(`  ✗ no package.json at ${root}`);
    out.push(`      the hooks read their papers directory from there and refuse without it`);
    bad++;
  } else {
    const declared = (() => {
      try {
        return JSON.parse(rawPkg)?.[CONFIG_KEY]?.papers;
      } catch {
        return undefined;
      }
    })();
    out.push(
      declared === undefined
        ? `  ✗ package.json has no "${CONFIG_KEY}": { "papers": … } — the hooks will fall back to a guess`
        : `  ✓ package.json → ${CONFIG_KEY}.papers = ${JSON.stringify(declared)}`,
    );
    if (declared === undefined) bad++;
  }
  if (existsSync(join(root, "rpp.json")))
    out.push(`  ⚠ rpp.json is present — deprecated; the hooks never read it`);

  out.push("", "papers directory");
  const hookRoot = rawPkg ? papersRoot(rawPkg) : null;
  const hookSays = typeof hookRoot === "string" ? hookRoot : null;
  out.push(`  the CLI will lint    ${cliPapers ?? "(nothing — no declaration found)"}`);
  out.push(
    `  the hooks will guard ${hookSays ?? "(nothing — the guard refuses and says why on first use)"}`,
  );
  if (cliPapers && hookSays) {
    const same = resolve(root, cliPapers) === resolve(root, hookSays);
    out.push(
      same
        ? `  ✓ the same directory — what is linted is what is guarded`
        : `  ✗ DIFFERENT directories. Every Bash write to ${cliPapers} passes the guard unseen.`,
    );
    if (!same) bad++;
  }
  if (hookSays && !existsSync(join(root, hookSays))) {
    out.push(`  ✗ ${hookSays} does not exist — the guard is watching nothing`);
    bad++;
    const guesses = detectPapers(root);
    if (guesses.length)
      out.push(`      papers look like they live in: ${guesses.join(", ")}`);
  }

  out.push("", "external programs (the skills shell out to these; `rpp lint` needs none of them)");
  for (const p of PROGRAMS) {
    if (found(p.bin, run)) out.push(`  ✓ ${p.bin.padEnd(10)} ${p.from}`);
    else {
      out.push(`  ✗ ${p.bin.padEnd(10)} ${p.from} — ${p.without}`);
      out.push(`      ${p.install}`);
    }
  }

  out.push(
    "",
    "the plugin (skills and hooks inside Claude Code) cannot be checked from a terminal —",
    "type /plugin inside Claude Code to see whether it is installed.",
    "",
  );
  log(out.join("\n"));
  return bad > 0 ? 2 : 0;
}
