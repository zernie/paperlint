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
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { spawnSync } from "node:child_process";
// Types come from `paper-edit-guard.hook.d.mts`; see the block above for why the import points at
// the hook itself rather than at a shared module.
import {
  papersRoot,
  CONFIG_KEY,
  DEFAULT_PAPERS_ROOT,
  PAPERS_DIR_FIELD,
  OLD_PAPERS_DIR_FIELD,
} from "../hooks/paper-edit-guard.hook.mjs";
import {
  LEGACY_CONFIG_KEY,
  LEGACY_KEY_MESSAGE,
  declaredSettings,
} from "../lib/paper-config.mjs";
import { PAPER_MARKERS } from "./build.ts";
import { linkSkills, SKILLS_HOME, type LinkReport } from "./link-skills.ts";
import { doctorHooks } from "./hooks-settings.ts";

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
/**
 * TeX Live is installed by rpp itself, with every package the venue profiles declare. `rpp build`
 * uses that tree even when its `pdflatex` is not on PATH, so a ✗ here with the cache installed
 * only means the skills' own shell calls will not find it.
 */
export const TEX_INSTALL =
  "npx rpp toolchain   (rpp build uses its TeX Live without PATH; the skills need its bin on PATH)";

export const PROGRAMS: readonly Program[] = [
  {
    bin: "pdflatex",
    from: "TeX Live",
    without: "no PDF is produced",
    install: TEX_INSTALL,
  },
  {
    bin: "bibtex",
    from: "TeX Live",
    without: "the bibliography is not resolved",
    install: TEX_INSTALL,
  },
  {
    bin: "texcount",
    from: "TeX Live",
    without: "the length checks cannot run",
    install: TEX_INSTALL,
  },
  {
    bin: "java",
    from: "any JRE",
    without: "TeXtidote does not run, and nothing else spell-checks the text",
    install: "apt-get install -y default-jre-headless",
  },
  {
    bin: "perl",
    from: "your system (macOS ships it)",
    without:
      "banal cannot run: page size, columns and font sizes are null in the facts file",
    install:
      "apt-get install -y perl, then npx rpp toolchain (it fetches banal)",
  },
  {
    bin: "python3",
    from: "your system",
    without: "the analysis and report scripts do not start",
    install: "apt-get install -y python3",
  },
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
      if (!e.isDirectory() || e.name.startsWith(".") || skip.has(e.name))
        continue;
      const here = join(dir, e.name);
      // A directory whose CHILDREN look like papers is the papers root — not the paper itself.
      let children;
      try {
        children = readdirSync(here, { withFileTypes: true });
      } catch {
        continue;
      }
      // A dot-child is not a paper: `<papers>/.template/` holds the project's paper TEMPLATE,
      // markers and all, and a folder holding only that is not a papers root yet.
      const isPapersRoot = children.some(
        (c) =>
          c.isDirectory() &&
          !c.name.startsWith(".") &&
          PAPER_MARKERS.some((m) => existsSync(join(here, c.name, m))),
      );
      if (isPapersRoot) hits.push(relative(cwd, here));
      else if (left > 0) walk(here, left - 1);
    }
  };
  walk(resolve(cwd), depth);
  return hits;
}

/**
 * The declaration's verdict. The old field name and two differing keys are failures (every reader
 * refuses them); the old KEY is read and named; a missing declaration is a warning.
 */
function declarationVerdict(rawPkg: string): { lines: string[]; bad: number } {
  const out: string[] = [];
  const found = (() => {
    try {
      return declaredSettings(JSON.parse(rawPkg));
    } catch {
      return declaredSettings(undefined);
    }
  })();
  if (found.conflict !== null)
    return { lines: [`  ✗ ${found.conflict}`], bad: 1 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- #49: replace with a real type
  const settings = found.settings as Record<string, any> | undefined;
  const key = found.legacy ? LEGACY_CONFIG_KEY : CONFIG_KEY;
  const declared = settings?.[PAPERS_DIR_FIELD];
  if (found.legacy) out.push(`  ⚠ ${LEGACY_KEY_MESSAGE}`);
  // The old field name is a failure, not a warning: every reader refuses it.
  if (settings && Object.hasOwn(settings, OLD_PAPERS_DIR_FIELD))
    return {
      lines: [
        ...out,
        `  ✗ "${OLD_PAPERS_DIR_FIELD}" was renamed to "${PAPERS_DIR_FIELD}" in package.json → "${key}"`,
      ],
      bad: 1,
    };
  // 🔴 A MISSING DECLARATION IS A WARNING, NOT A REFUSAL, and that is a decision, not an
  // oversight. Without it the hook takes the `papers` default; if the papers do live there, the
  // install WORKS — just by coincidence, and it will break silently on the day the directory
  // moves. Failing on a working install is not allowed here: for an `error`-level check a false
  // positive costs more than a miss, because people do not fix it, they switch it off — together
  // with the binary findings below, which the command was written for. A real breakage (the roots
  // drifted apart, the directory does not exist) is caught where it is binary.
  if (declared === undefined)
    out.push(
      `  ⚠ package.json has no "${CONFIG_KEY}": { "${PAPERS_DIR_FIELD}": … } — the hooks fall back to "${DEFAULT_PAPERS_ROOT}"`,
      `      it works only while your papers happen to live there; declare it and it keeps working`,
    );
  else
    out.push(
      `  ✓ package.json → ${key}.${PAPERS_DIR_FIELD} = ${JSON.stringify(declared)}`,
    );
  return { lines: out, bad: 0 };
}

/**
 * The papers-directory verdict: whether the CLI and the hooks agree, and whether the directory
 * they name exists. `bad` counts the failures.
 */
function papersVerdict(
  root: string,
  cliPapers: string | null,
  hookSays: string | null,
): { lines: string[]; bad: number } {
  const out: string[] = [];
  let bad = 0;
  if (cliPapers && hookSays) {
    const same = resolve(root, cliPapers) === resolve(root, hookSays);
    out.push(
      same
        ? `  ✓ the same directory — what is linted is what is guarded`
        : `  ✗ DIFFERENT directories. Every Bash write to ${cliPapers} passes the guard unseen.`,
    );
    if (!same) bad++;
  }
  // A declared directory that does not exist is a failure only when papers live SOMEWHERE ELSE:
  // then every write to them passes the guard unseen (issue #33). With no papers anywhere, the
  // project is simply new — `init --yes` declares the default and creates no paper — and failing
  // it would teach people to ignore doctor.
  if (hookSays && !existsSync(join(root, hookSays))) {
    const guesses = detectPapers(root);
    if (guesses.length) {
      out.push(
        `  ✗ ${hookSays} does not exist — the guard is watching nothing`,
      );
      out.push(`      papers look like they live in: ${guesses.join(", ")}`);
      bad++;
    } else
      out.push(
        `  ⚠ ${hookSays} does not exist yet — no papers yet. \`npx rpp new <name>\` creates the first one there`,
      );
  }
  return { lines: out, bad };
}

export interface DoctorOptions {
  log?: typeof console.log;
  cwd?: string;
  /** The project root the hooks are anchored to. Claude Code sets this; it defaults to `cwd`. */
  projectDir?: string;
  run?: typeof spawnSync;
  /** The directory the CLI resolved from its own config, so both sides can be compared. */
  cliPapers?: string | null;
  /** Reads the skill links without writing any. Injected only so a test can fake the install. */
  skillLinks?: (root: string) => LinkReport;
}

/**
 * @returns 2 when the guard and the linter do not agree, or the declaration is unusable — those
 * are binary and are the reason this command exists. A missing external program is a FACT, not a
 * verdict: it is printed and does not fail the run, because which programs you need depends on
 * which skills you use. A doctor that exits non-zero on an advisory line gets piped to /dev/null.
 */
export function doctor({
  log = console.log,
  // eslint-disable-next-line no-restricted-globals -- legacy I/O, moves behind a port in #76
  cwd = process.cwd(),
  projectDir,
  run = spawnSync,
  cliPapers = null,
  skillLinks = (r: string) => linkSkills(r, { write: false }),
}: DoctorOptions = {}): number {
  const root = projectDir ?? cwd;
  const pkgPath = join(root, "package.json");
  const out: string[] = [
    "",
    "rpp doctor — what is wired, and what only looks wired",
    "",
  ];
  let bad = 0;

  out.push("declaration");
  const rawPkg = existsSync(pkgPath) ? readFileSync(pkgPath, "utf8") : "";
  if (!rawPkg) {
    out.push(`  ✗ no package.json at ${root}`);
    out.push(
      `      the hooks read their papers directory from there and refuse without it`,
    );
    bad++;
  } else {
    const declaration = declarationVerdict(rawPkg);
    out.push(...declaration.lines);
    bad += declaration.bad;
  }
  if (existsSync(join(root, "rpp.json")))
    out.push(`  ⚠ rpp.json is present — deprecated; the hooks never read it`);

  out.push("", "papers directory");
  const hookRoot = rawPkg ? papersRoot(rawPkg) : null;
  const hookSays = typeof hookRoot === "string" ? hookRoot : null;
  out.push(
    `  the CLI will lint    ${cliPapers ?? "(nothing — no declaration found)"}`,
  );
  out.push(
    `  the hooks will guard ${hookSays ?? "(nothing — the guard refuses and says why on first use)"}`,
  );
  const verdict = papersVerdict(root, cliPapers, hookSays);
  out.push(...verdict.lines);
  bad += verdict.bad;

  // A skill that is not linked is ADVISORY, like a missing program: `rpp lint`, the hooks and CI
  // work without it, and an entry of the same name that `init` refused to replace is the
  // consumer's own decision. What this section removes is the silence — before it, a consumer
  // without links had no `/paper-pipeline` and nothing anywhere said so.
  out.push(
    "",
    `skills (Claude Code finds project skills only in ${SKILLS_HOME}/)`,
  );
  const links = skillLinks(root);
  if (!links.ok) out.push(`  ⚠ not checked — ${links.error}`);
  else {
    const gaps = links.links.filter((l) => l.status !== "present");
    const total = String(links.links.length);
    if (gaps.length === 0)
      out.push(
        `  ✓ all ${total} shipped skills are reachable as ${join(SKILLS_HOME, "<name>")}`,
      );
    else {
      out.push(
        `  ⚠ ${String(gaps.length)} of ${total} shipped skills are NOT reachable as ${join(SKILLS_HOME, "<name>")}:`,
      );
      for (const g of gaps)
        out.push(
          `      ${g.name} — ${g.status === "missing" ? "not linked" : `${g.reason ?? "occupied"}, not the shipped skill`}`,
        );
      out.push(
        `      \`npx rpp init\` links the missing ones; it never replaces an entry it did not make`,
      );
    }
  }

  out.push(
    "",
    "external programs (the skills shell out to these; `rpp lint` needs none of them)",
  );
  for (const p of PROGRAMS) {
    if (found(p.bin, run)) out.push(`  ✓ ${p.bin.padEnd(10)} ${p.from}`);
    else {
      out.push(`  ✗ ${p.bin.padEnd(10)} ${p.from} — ${p.without}`);
      out.push(`      ${p.install}`);
    }
  }

  // 🔴 THE HOOKS ARE READ FROM THE FILE THAT CARRIES THEM. Until `init` wrote them into
  // `.claude/settings.json`, the only carrier was a plugin and this section said "cannot be
  // checked from a terminal". Advisory, like the skills: `--no-hooks` is a choice, not a fault.
  out.push("");
  try {
    out.push(...doctorHooks(root));
  } catch (e) {
    out.push(`hooks`, `  ⚠ not checked — ${(e as Error).message}`);
  }
  out.push("");
  log(out.join("\n"));
  return bad > 0 ? 2 : 0;
}
