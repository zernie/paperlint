/**
 * `paperlint doctor` — the command that makes SILENCE VISIBLE.
 *
 * 🔴 WHY THIS EXISTS AT ALL, when none of the eight tools surveyed for `docs/install.md` ships a
 * `doctor`. None of them needs one: a formatter that is misconfigured formats nothing and you see
 * it immediately. This package has hooks whose success state IS silence: a hook watching the right
 * directory and one watching a directory that does not exist both print nothing. From outside,
 * "installed" and "working" are the same picture.
 *
 * Measured 2026-09-18, and this is the failure the command was written for: a consumer who follows
 * the documented install exactly — `paperlint init`, then point the config at their papers — gets hooks
 * that watch the wrong directory. It only appears to work when the directory
 * path happens to contain the segment `papers`, because that is the default the hook falls back to.
 * (Issue #33.)
 *
 * 🔴 THE CLI READS THE PAPERS DIRECTORY THROUGH ONE READER (`papersRoots`, src/papers-roots.ts); what
 * doctor checks is that the directory exists, and that the papers do not live somewhere else.
 *
 * Prior art for the shape: `brew doctor`, `flutter doctor`, `npm doctor`, `expo-doctor`.
 */
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { type Dirent, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { spawnSync } from "node:child_process";
import {
  DEFAULT_PAPERS_ROOT,
  PAPERS_DIR_FIELD,
  CONFIG_FILE,
} from "#lib/paper-config";
import { PAPER_MARKERS } from "./build.ts";
import { linkSkills, SKILLS_HOME, type LinkReport } from "./link-skills.ts";
import { doctorHooks, initWiredHooks } from "./hooks-settings.ts";
import { retiredLines, retiredWired } from "./retired-hooks.ts";
import { pluginLines } from "./doctor-plugin.ts";
import { installedPluginVersion } from "./plugin-offer.ts";
import type { PluginState } from "./ports/claude-code.ts";
import { messageOf } from "./domain/text.ts";
import { fieldOf } from "./domain/record.ts";

export interface Program {
  readonly bin: string;
  readonly from: string;
  readonly without: string;
  readonly install: string;
}

/**
 * The programs the SKILLS shell out to. `paperlint lint` needs none of them — it reads files and reports.
 * Every one of these fails quietly, which is the only reason the list is worth printing: a missing
 * checker and a passing checker produce the same silence.
 */
/**
 * TeX Live is installed by paperlint itself, with every package the venue profiles declare. `paperlint build`
 * uses that tree even when its `pdflatex` is not on PATH, so a ✗ here with the cache installed
 * only means the skills' own shell calls will not find it.
 */
export const TEX_INSTALL =
  "npx paperlint toolchain   (paperlint build uses its TeX Live without PATH; the skills need its bin on PATH)";

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
      "apt-get install -y perl, then npx paperlint toolchain (it fetches banal)",
  },
  {
    bin: "python3",
    from: "your system",
    without:
      "the analysis and report scripts and the novelty checks (assess-novelty) do not start",
    install: "apt-get install -y python3",
  },
];

/**
 * Asks the shell whether a program is on PATH. `spawnSync` is one; a fake answers with a status
 * alone, because a status is all `found` reads.
 */
export type ProgramProbe = (
  file: string,
  args: readonly string[],
  options: { readonly shell: true; readonly stdio: "ignore" },
) => { readonly status: number | null };

export const found = (bin: string, run: ProgramProbe = spawnSync): boolean =>
  run("command", ["-v", bin], { shell: true, stdio: "ignore" }).status === 0;

/** Lists a directory's entries; the disk by default, a test stages an unreadable child. */
type ReadDir = (dir: string) => Dirent[];
const readDir: ReadDir = (dir) => readdirSync(dir, { withFileTypes: true });

/** Directories that look like papers, used to REPLACE a guessed default with a measurement. */
export function detectPapers(
  cwd: string,
  depth = 2,
  readdir: ReadDir = readDir,
): string[] {
  const hits: string[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "_build", ".claude"]);
  const walk = (dir: string, left: number): void => {
    let entries;
    try {
      entries = readdir(dir);
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
        children = readdir(here);
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
 * The root `paperlint.json`'s verdict. Absent, or silent on `papersDir`, is fine: the default is
 * `papers`, and the CLI and the hooks take it alike. Only a file that does not parse is a failure —
 * `paperlint lint` refuses to run while it cannot read it.
 */
function declarationVerdict(raw: string | null): {
  lines: string[];
  bad: number;
} {
  if (raw === null)
    return {
      lines: [
        `  ✓ no ${CONFIG_FILE} — every setting has its default; papers are in "${DEFAULT_PAPERS_ROOT}"`,
      ],
      bad: 0,
    };
  let settings: unknown;
  try {
    settings = JSON.parse(raw);
  } catch (e) {
    return {
      lines: [
        `  ✗ ${CONFIG_FILE} is not valid JSON: ${messageOf(e)}`,
        `      \`paperlint lint\` refuses to run until it parses`,
      ],
      bad: 1,
    };
  }
  const declared = fieldOf(settings, PAPERS_DIR_FIELD);
  return {
    lines: [
      declared === undefined
        ? `  ✓ ${CONFIG_FILE} names no ${PAPERS_DIR_FIELD} — the default "${DEFAULT_PAPERS_ROOT}"`
        : `  ✓ ${CONFIG_FILE} → ${PAPERS_DIR_FIELD} = ${JSON.stringify(declared)}`,
    ],
    bad: 0,
  };
}

/**
 * The papers-directory verdict: whether the directory the CLI and the hooks read exists, and
 * whether the papers live somewhere else. `bad` counts the failures.
 */
function papersVerdict(
  root: string,
  hookSays: string | null,
): { lines: string[]; bad: number } {
  const out: string[] = [];
  let bad = 0;
  // A declared directory that does not exist is a failure only when papers live SOMEWHERE ELSE:
  // then lint and the hooks watch nothing while the papers go unchecked (issue #33). With no papers anywhere, the
  // project is simply new — `init --yes` declares the default and creates no paper — and failing
  // it would teach people to ignore doctor.
  if (hookSays && !existsSync(join(root, hookSays))) {
    const guesses = detectPapers(root);
    if (guesses.length) {
      out.push(
        `  ✗ ${hookSays} does not exist — lint and the hooks are watching nothing`,
      );
      out.push(`      papers look like they live in: ${guesses.join(", ")}`);
      bad++;
    } else
      out.push(
        `  ⚠ ${hookSays} does not exist yet — no papers yet. \`npx paperlint new <name>\` creates the first one there`,
      );
  }
  return { lines: out, bad };
}

/** The hooks init's own commands run; none when they cannot be read (the plugin carries them anyway). */
function oldHooksOf(root: string): readonly string[] {
  try {
    return initWiredHooks(root);
  } catch {
    return [];
  }
}

/** init's skill links that lead to the shipped skill. */
const presentLinks = (links: LinkReport): readonly string[] =>
  links.ok
    ? links.links.filter((l) => l.status === "present").map((l) => l.name)
    : [];

/** The skills section; the plugin, when it is on, carries them. */
function skillsLines(links: LinkReport, on: boolean): readonly string[] {
  const head = `skills (Claude Code finds project skills only in ${SKILLS_HOME}/)`;
  if (on) return [head, `  ✓ carried by the plugin`];
  if (!links.ok) return [head, `  ⚠ not checked — ${links.error}`];
  const gaps = links.links.filter((l) => l.status !== "present");
  const total = String(links.links.length);
  const as = join(SKILLS_HOME, "<name>");
  return gaps.length === 0
    ? [head, `  ✓ all ${total} shipped skills are reachable as ${as}`]
    : [
        head,
        `  ⚠ ${String(gaps.length)} of ${total} shipped skills are NOT reachable as ${as}:`,
        ...gaps.map(
          (g) =>
            `      ${g.name} — ${g.status === "missing" ? "not linked" : `${g.reason ?? "occupied"}, not the shipped skill`}`,
        ),
        `      \`npx paperlint init\` links the missing ones; it never replaces an entry it did not make`,
      ];
}

/**
 * 🔴 THE HOOKS ARE READ FROM THE FILE THAT CARRIES THEM. Until `init` wrote them into
 * `.claude/settings.json`, the only carrier was a plugin and this section said "cannot be checked
 * from a terminal". Hooks wired NOT AT ALL are advisory, like the skills: `--no-hooks` is a choice,
 * not a fault. Partly wired, wired twice, or a retired hook still wired, is a fault and fails the run —
 * unless the plugin is on, which carries them.
 */
function hooksSection(
  root: string,
  on: boolean,
): { readonly lines: readonly string[]; readonly bad: number } {
  if (on) return { lines: [`hooks`, `  ✓ carried by the plugin`], bad: 0 };
  try {
    const wired = doctorHooks(root);
    const retired = retiredWired(root);
    return {
      lines: [...wired.lines, ...retiredLines(retired)],
      bad: wired.bad + (retired.length > 0 ? 1 : 0),
    };
  } catch (e) {
    return { lines: [`hooks`, `  ⚠ not checked — ${messageOf(e)}`], bad: 0 };
  }
}

export interface DoctorOptions {
  log?: typeof console.log;
  cwd?: string;
  /** The project root the hooks are anchored to. Claude Code sets this; it defaults to `cwd`. */
  projectDir?: string;
  run?: ProgramProbe;
  /** The directory the CLI resolved from its own config, so both sides can be compared. */
  cliPapers?: string | null;
  /** Reads the skill links without writing any. Injected only so a test can fake the install. */
  skillLinks?: (root: string) => LinkReport;
  /** The Claude Code plugin in this project, as the CLI read it; null where Claude Code is not. */
  plugin?: PluginState | null;
  /** The installed paperlint's version, compared with the plugin's; null skips the comparison. */
  installed?: string | null;
}

/**
 * @returns 2 when the papers live outside the declared directory, the declaration is unusable, or the hooks
 * are miswired (partly wired, or one wired twice) — those are binary and are the reason this
 * command exists. A missing external program is a FACT, not a
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
  plugin = null,
  installed = null,
}: DoctorOptions = {}): number {
  const root = projectDir ?? cwd;
  const configPath = join(root, CONFIG_FILE);
  const out: string[] = [
    "",
    "paperlint doctor — what is wired, and what only looks wired",
    "",
  ];
  let bad = 0;

  out.push("settings");
  const raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
  const declaration = declarationVerdict(raw);
  out.push(...declaration.lines);
  bad += declaration.bad;

  out.push("", "papers directory");
  out.push(
    `  linted               ${cliPapers ?? "(nothing — the settings do not read or name no directory)"}`,
  );
  const verdict = papersVerdict(root, cliPapers);
  out.push(...verdict.lines);
  bad += verdict.bad;

  // A skill that is not linked is ADVISORY, like a missing program: `paperlint lint`, the hooks and CI
  // work without it, and an entry of the same name that `init` refused to replace is the
  // consumer's own decision. What this section removes is the silence — before it, a consumer
  // without links had no `/paper-pipeline` and nothing anywhere said so.
  const links = skillLinks(root);
  // Without Claude Code there is no plugin to speak of, so no section at all.
  const on = installedPluginVersion(plugin ?? null) !== null;
  out.push(
    ...(plugin
      ? [
          "",
          ...pluginLines({
            state: plugin,
            installed,
            oldLinks: presentLinks(links),
            oldHooks: on ? oldHooksOf(root) : [],
          }),
        ]
      : []),
    "",
    ...skillsLines(links, on),
  );

  out.push(
    "",
    "external programs (the skills shell out to these; `paperlint lint` needs none of them)",
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
  // checked from a terminal". Hooks wired NOT AT ALL are advisory, like the skills: `--no-hooks`
  // is a choice, not a fault. Partly wired, or wired twice, is a fault and fails the run.
  const hooks = hooksSection(root, on);
  out.push("", ...hooks.lines);
  bad += hooks.bad;
  out.push("");
  log(out.join("\n"));
  return bad > 0 ? 2 : 0;
}
