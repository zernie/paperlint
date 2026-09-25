/**
 * `rpp init` — the whole install, in the terminal it was typed in.
 *
 * 🔴 WHAT THIS COMMAND USED TO DO, AND WHY THAT WAS A DEFECT RATHER THAN A SHORTFALL. It wrote
 * `rpp.json` with a GUESSED `"papers": "papers"` and never touched `package.json`. The three hooks
 * read the papers directory out of `package.json` and nothing else, so a consumer who followed the
 * documented install got a `paper-edit-guard` watching a directory that did not exist — and a guard
 * watching nothing is byte-identical, from outside, to a guard that is working (issue #33).
 *
 * The count in `docs/install.md` is the yardstick: how many actions happen between "I want this"
 * and "it works". It was nine, three of them hand-edits to files. The two that this command removes
 * are the two hand-edits that were not even documented as being the same fact twice.
 *
 * ── THE DECISIONS, AND HOW EACH ONE IS MADE ─────────────────────────────────
 *   papers directory   MEASURED — `detectPapers` walks the repo for a directory whose CHILDREN
 *                      carry a paper marker. Several hits is the only case a human is asked about.
 *   declaration        WRITTEN into `package.json`, merged, never overwriting a value that is
 *                      already there. Prior art: husky's `init` edits the consumer's package.json
 *                      to add `prepare`. `rpp.json` is no longer created at all.
 *   skills             LINKED — one relative symlink per shipped skill into `.claude/skills/`, the
 *                      only place Claude Code looks for project skills (`link-skills.ts`). An
 *                      entry of the same name that rpp did not make is reported, never replaced.
 *   hooks              WRITTEN into `.claude/settings.json` by vigiles' merge (`hooks-settings.ts`);
 *                      asked [Y/n] of a human, YES without one — the guard is what the package is
 *                      for, and the edit is idempotent and visible in `git diff`. `--no-hooks` skips.
 *   CI workflow        ASKED, because writing a file into `.github/` is not guessable and not
 *                      cheap to undo. Prior art: Playwright's initializer asks exactly this.
 *                      Without a human: NO.
 *   first paper        OFFERED only to a human and only when the papers directory holds none;
 *                      without a human only `--paper <name>` creates one (`new-paper.ts`).
 *   external toolchain REPORTED, never installed. npm's own rule, quoted in husky's write-up:
 *                      "The only valid use of install or preinstall scripts is for compilation."
 *
 * 🔴 NOTHING IS ASKED WITHOUT A HUMAN — stdin AND stdout a terminal, `CI` unset, no `--yes`
 * (`interactivity`). A question in CI is not a question, it is a hang — or, with a closed stdin,
 * an answer nobody gave. So the non-interactive path takes the stated default and SAYS which
 * default it took and why nothing was asked, rather than pretending it asked.
 */
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { doctor, detectPapers, found, PROGRAMS } from "./doctor.ts";
import { PAPER_MARKERS, papersIn } from "./build.ts";
import { linkSkills, SKILLS_HOME, type LinkReport } from "./link-skills.ts";
import { actionRef } from "./action-ref.ts";
import {
  FRESH_CLONE_NOTE,
  SETTINGS_PATH,
  UNINSTALL_PLUGIN,
  shippedWiring,
  wireHooks,
  type Merge,
  type WireResult,
} from "./hooks-settings.ts";
import {
  DEFAULT_FORMAT,
  isFormat,
  nameProblem,
  type PaperFormat,
} from "./new-paper.ts";
// The one source for the consumer's config key lives in the .mjs half of the package (the ESLint
// rules and the skill scripts import it too); its types are in lib/paper-config.d.mts.
import {
  CONFIG_KEY,
  DEFAULT_PAPERS_ROOT,
  PAPERS_DIR_FIELD,
  renamedFieldMessage,
} from "../lib/paper-config.mjs";

/** How the papers directory was arrived at. Printed, because a guess must not read as a fact. */
export type PapersHow =
  "detected" | "chosen" | "not-asked" | "no-answer" | "guessed";

/**
 * 🔴 A QUESTION CAN FAIL, AND ITS FAILURE MUST NOT BE THE COMMAND'S. Measured 2026-09-18 on a
 * real pseudo-terminal: `readline`'s `question()` REJECTS with `AbortError: Aborted with Ctrl+D`
 * when the answer stream ends, and the rejection escaped `init` as a stack trace — after the
 * declaration had already been written. So the install both succeeded and looked like a crash.
 * An unanswered question is an answer: take the default and say so.
 */
async function askOrDefault(
  ask: (q: string) => Promise<string>,
  question: string,
): Promise<string | null> {
  try {
    return await ask(question);
  } catch {
    return null;
  }
}

/**
 * WHETHER A HUMAN IS AT THE OTHER END — one decision, made once, with its reason kept, because
 * every default `init` takes is printed together with WHY nothing was asked.
 *
 * clig.dev: "Only use prompts or interactive elements if stdin is an interactive terminal".
 * stdin alone is not enough: an agent that pipes the output has a TTY-less STDOUT and would
 * never see the question it is being asked. `CI` covers runners that allocate a pseudo-terminal,
 * and `--yes` is npm's and create-next-app's way to say "take the defaults" from a terminal.
 */
export function interactivity({
  stdinTTY,
  stdoutTTY,
  env,
  yes,
}: {
  stdinTTY: boolean;
  stdoutTTY: boolean;
  env: Readonly<Record<string, string | undefined>>;
  yes: boolean;
}): { readonly interactive: boolean; readonly why: string } {
  if (yes) return { interactive: false, why: "--yes was given" };
  if (env["CI"]) return { interactive: false, why: "CI is set" };
  if (!stdinTTY) return { interactive: false, why: "stdin is not a terminal" };
  if (!stdoutTTY)
    return { interactive: false, why: "stdout is not a terminal" };
  return { interactive: true, why: "a terminal on both ends" };
}

/** The mode of THIS process — the one place `process` is read for it. */
export const processInteractivity = (yes: boolean) =>
  interactivity({
    // eslint-disable-next-line no-restricted-globals -- legacy I/O, moves behind a port in #76
    stdinTTY: Boolean(process.stdin.isTTY),
    // eslint-disable-next-line no-restricted-globals -- legacy I/O, moves behind a port in #76
    stdoutTTY: Boolean(process.stdout.isTTY),
    // eslint-disable-next-line no-restricted-globals -- legacy I/O, moves behind a port in #76
    env: process.env,
    yes,
  });

export interface PapersChoice {
  readonly papers: string;
  readonly how: PapersHow;
  readonly candidates: readonly string[];
}

/**
 * One hit is used, several are asked about, none falls back to the documented default — and the
 * fallback is labelled a guess in the same breath, because the whole class of defect this command
 * exists to close is a guess that later reads as a measurement.
 */
export async function choosePapers(
  root: string,
  {
    ask,
    interactive,
  }: { ask?: (q: string) => Promise<string>; interactive: boolean },
): Promise<PapersChoice> {
  const candidates = detectPapers(root);
  const first = candidates[0];
  if (first === undefined)
    return { papers: DEFAULT_PAPERS_ROOT, how: "guessed", candidates };
  if (candidates.length === 1)
    return { papers: first, how: "detected", candidates };
  if (!interactive || !ask)
    return { papers: first, how: "not-asked", candidates };

  const menu = candidates
    .map((c, i) => `    ${String(i + 1)}) ${c}`)
    .join("\n");
  const answer = await askOrDefault(
    ask,
    `  several directories look like papers roots:\n${menu}\n  which one? [1] `,
  );
  const picked = candidates[Number((answer ?? "").trim()) - 1];
  return picked === undefined
    ? { papers: first, how: "no-answer", candidates }
    : { papers: picked, how: "chosen", candidates };
}

export type DeclarationResult =
  | {
      readonly status: "written";
      readonly path: string;
      readonly papers: string;
    }
  | { readonly status: "kept"; readonly path: string; readonly papers: unknown }
  | {
      readonly status: "unparsable";
      readonly path: string;
      readonly reason: string;
    }
  | { readonly status: "absent"; readonly path: string }
  | {
      readonly status: "renamed";
      readonly path: string;
      readonly message: string;
    };

/**
 * Writes ONE declaration, into the file every channel can already name.
 *
 * 🔴 A HOOK CANNOT IMPORT CODE AND CANNOT WALK UP A TREE LOOKING FOR A CONFIG. It can read a path
 * it is able to spell, and the only path it can always spell is the project's own `package.json`.
 * That asymmetry is the whole reason the declaration moved here rather than the readers moving to
 * `rpp.json`: five readers against one (`docs/install.md`).
 *
 * ⚠️ Merged, not rewritten, and never over a value the consumer set — an `init` that silently
 * replaces a setting is worse than an `init` that does nothing, because the consumer keeps
 * believing the old value.
 */
export function declarePapers(root: string, papers: string): DeclarationResult {
  const path = join(root, "package.json");
  if (!existsSync(path)) return { status: "absent", path };
  const raw = readFileSync(path, "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- #49: replace with a real type
  let pkg: Record<string, any>;
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    return { status: "unparsable", path, reason: (e as Error).message };
  }
  const message = renamedFieldMessage(pkg?.[CONFIG_KEY]);
  if (message) return { status: "renamed", path, message };
  const existing = pkg?.[CONFIG_KEY]?.[PAPERS_DIR_FIELD];
  if (existing !== undefined) return { status: "kept", path, papers: existing };
  pkg[CONFIG_KEY] = { ...(pkg[CONFIG_KEY] ?? {}), [PAPERS_DIR_FIELD]: papers };
  // Two-space indent and the file's own trailing newline: a declaration is not a licence to
  // reformat somebody else's file, and a one-line diff is a diff a consumer will actually read.
  writeFileSync(
    path,
    JSON.stringify(pkg, null, 2) + (raw.endsWith("\n") ? "\n" : ""),
    "utf8",
  );
  return { status: "written", path, papers };
}

export type RppJsonResult = "absent" | "kept" | "filled" | "unparsable";

/**
 * `rpp.json` is no longer CREATED — but a consumer who already has one keeps it working, and it
 * gets the same `papers` value rather than being left to disagree with `package.json` in silence.
 * Two declarations that disagree is the defect `rpp doctor` was written to catch; writing the
 * second one on purpose would be handing it new work.
 */
export function syncRppJson(root: string, papers: string): RppJsonResult {
  const path = join(root, "rpp.json");
  if (!existsSync(path)) return "absent";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- #49: replace with a real type
  let cfg: Record<string, any>;
  const raw = readFileSync(path, "utf8");
  try {
    cfg = JSON.parse(raw);
  } catch {
    return "unparsable";
  }
  if (cfg?.[PAPERS_DIR_FIELD] !== undefined) return "kept";
  cfg[PAPERS_DIR_FIELD] = papers;
  writeFileSync(
    path,
    JSON.stringify(cfg, null, 2) + (raw.endsWith("\n") ? "\n" : ""),
    "utf8",
  );
  return "filled";
}

export const WORKFLOW_PATH = join(".github", "workflows", "papers.yml");

/** Where the action is pinned when no release tag is known — obviously a placeholder. */
export const UNPINNED_REF = "<commit-sha>";

/**
 * The CI step, as a whole workflow, pinned to `ref` — the release tag of the running package
 * (`actionRef`). With no tag known (`null`: a git checkout, `npm link`) it keeps the placeholder
 * and says so: a wrong tag written confidently is worse than a placeholder that is obviously one.
 */
export function workflowYaml(papers: string, ref: string | null): string {
  return [
    ref === null
      ? `# Written by \`rpp init\`. Replace ${UNPINNED_REF} with a commit or release tag of the action.`
      : `# Written by \`rpp init\`, pinned to ${ref} — the release you installed.`,
    `name: papers`,
    `on: [push, pull_request]`,
    `jobs:`,
    `  papers:`,
    `    runs-on: ubuntu-latest`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: zernie/research-paper-pipeline@${ref ?? UNPINNED_REF}`,
    `        with:`,
    `          paths: ${papers}`,
    ``,
  ].join("\n");
}

export type WorkflowResult = "written" | "kept" | "declined" | "not-asked";

export async function offerWorkflow(
  root: string,
  papers: string,
  {
    ask,
    interactive,
    version,
  }: {
    ask?: (q: string) => Promise<string>;
    interactive: boolean;
    /** The running package's version; see `InitOptions.version`. */
    version?: string;
  },
): Promise<WorkflowResult> {
  const path = join(root, WORKFLOW_PATH);
  if (existsSync(path)) return "kept";
  if (!interactive || !ask) return "not-asked";
  const answer = (
    await askOrDefault(
      ask,
      `  add a GitHub Actions workflow that runs this in CI? [y/N] `,
    )
  )
    ?.trim()
    .toLowerCase();
  // No answer — an empty line, or a stream that ended — is the safe default, which is "no file".
  if (answer !== "y" && answer !== "yes") return "declined";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, workflowYaml(papers, actionRef(version)), "utf8");
  return "written";
}

/** What `init` says about the CI workflow — and, when none was written, the step to paste. */
export function reportWorkflow(
  wf: WorkflowResult,
  {
    version,
    papersDir,
    why,
  }: { version?: string; papersDir: string; why: string },
): string[] {
  const ref = actionRef(version);
  const out: string[] = [];
  if (wf === "written")
    out.push(
      ref === null
        ? `  ✓ wrote ${WORKFLOW_PATH} — pin ${UNPINNED_REF} before pushing it`
        : `  ✓ wrote ${WORKFLOW_PATH}, pinned to ${ref}`,
    );
  else if (wf === "kept")
    out.push(
      `  ✓ ${WORKFLOW_PATH} is already there — kept, nothing overwritten`,
    );
  else if (wf === "declined") out.push(`  · declined — nothing written`);
  else
    out.push(
      `  · ${why}, so nothing was asked. Default taken: NO file written.`,
    );
  if (wf !== "written" && wf !== "kept")
    out.push(
      `      to run the same checks in CI, add this step to a workflow:`,
      `        - uses: zernie/research-paper-pipeline@${ref ?? UNPINNED_REF}`,
      `          with:`,
      `            paths: ${papersDir}`,
    );
  return out;
}

/**
 * The external toolchain is REPORTED, never fetched. Each entry already carries what goes quiet
 * without it, which is the only reason the list is worth printing: a missing checker and a
 * passing checker produce the same silence.
 */
export function missingPrograms(
  run = spawnSync,
): readonly (typeof PROGRAMS)[number][] {
  return PROGRAMS.filter((p) => !found(p.bin, run));
}

/**
 * What is left after `init` — commands only, all typed in the same terminal.
 *
 * 🔴 THE TWO `/plugin` LINES ARE GONE, AND THAT WAS THE POINT. They were the one step "that cannot
 * be done from a terminal": typed into another program, invisible to `rpp doctor`, impossible for
 * an agent installing this package, and (as a repository-declared plugin) not installed in a cloud
 * session at all. `init` now writes the same three hook commands into `.claude/settings.json`
 * itself (`hooks-settings.ts`), so there is nothing left to type anywhere but here.
 */
export function nextSteps(papersDir: string = DEFAULT_PAPERS_ROOT): string {
  return [
    ``,
    `next:  npx rpp new <name>   # start a paper in ${papersDir}/ from the template`,
    `       npx rpp lint         # runs every rule over ${papersDir}`,
    ``,
  ].join("\n");
}

export type HooksOutcome =
  | WireResult
  | { readonly status: "skipped" }
  | { readonly status: "declined" }
  | { readonly status: "failed"; readonly reason: string };

/**
 * The hooks step: decide, then wire. `hooks: false` is `--no-hooks`. The default without a human
 * is YES — installing a package whose purpose includes an edit guard makes "yes" guessable, and
 * the edit is idempotent and shows up in `git diff` (the rule `docs/install.md` took from
 * Playwright: ask only about what cannot be guessed or is expensive).
 */
export async function offerHooks(
  root: string,
  {
    hooks,
    interactive,
    ask,
    merge,
  }: {
    hooks: boolean;
    interactive: boolean;
    ask?: (q: string) => Promise<string>;
    merge?: Merge;
  },
): Promise<HooksOutcome> {
  if (!hooks) return { status: "skipped" };
  if (interactive && ask) {
    const answer = (
      await askOrDefault(
        ask,
        `  wire the paper hooks into ${SETTINGS_PATH} (committed, shared with every clone)? [Y/n] `,
      )
    )
      ?.trim()
      .toLowerCase();
    // An empty line or a stream that ended is the stated default, which here is YES.
    if (answer === "n" || answer === "no") return { status: "declined" };
  }
  try {
    // Called THROUGH the protocol object rather than as a detached method: the port is an
    // object, and an implementation that one day reads `this` must not break here.
    let m = merge;
    if (!m) {
      // eslint-disable-next-line boundaries/dependencies -- legacy layer, moves behind a port in #76
      const { claudeCodeHookProtocol } = await import("vigiles/claude-code");
      m = (existing, compiled, managedBy) =>
        claudeCodeHookProtocol.mergeRegistrations(
          existing,
          compiled,
          managedBy,
        );
    }
    return wireHooks(root, m, shippedWiring());
  } catch (e) {
    return { status: "failed", reason: (e as Error).message };
  }
}

/** The hooks section of init's report. Every default names the flag that changes it. */
export function reportHooks(
  outcome: HooksOutcome,
  { how, here }: { how: string; here: (p: string) => string },
): string[] {
  const out: string[] = [];
  if (outcome.status === "skipped") {
    out.push(`  · --no-hooks — nothing written`);
    return out;
  }
  if (outcome.status === "declined") {
    out.push(
      `  · declined — nothing written. \`npx rpp init\` again wires them later`,
    );
    return out;
  }
  if (outcome.status === "failed") {
    out.push(`  ✗ not wired — ${outcome.reason}`);
    out.push(
      `      the hooks need vigiles to run at all; reinstall this package, then \`npx rpp init\``,
    );
    return out;
  }
  if (outcome.status === "unparsable") {
    out.push(
      `  ✗ ${here(outcome.path)} does not parse — nothing written: ${outcome.reason}`,
    );
    return out;
  }
  if (outcome.status === "foreign") {
    out.push(
      `  ✓ already wired under another spelling in ${here(outcome.path)} — nothing written, so nothing runs twice:`,
    );
    for (const f of outcome.found) out.push(`      ${f.name}: ${f.command}`);
    if (outcome.missing.length > 0)
      out.push(
        `  ⚠ and NOT wired in any form: ${outcome.missing.join(", ")} — add them in that same form`,
      );
    out.push(
      `      to switch to the form init writes, delete those commands and run \`npx rpp init\` again`,
    );
  } else {
    out.push(
      outcome.status === "written"
        ? `  ✓ wired ${outcome.names.join(", ")} into ${here(outcome.path)}`
        : `  ✓ already wired in ${here(outcome.path)} — nothing changed`,
    );
    out.push(`      ${how}`);
    out.push(`      ${FRESH_CLONE_NOTE}`);
  }
  if (outcome.plugin.length > 0)
    out.push(
      `  ⚠ this project also enables the plugin (${outcome.plugin.join(", ")}) — with it every hook runs twice.`,
      `      the plugin no longer carries the hooks: ${UNINSTALL_PLUGIN}`,
      `      and remove it from "enabledPlugins" in ${SETTINGS_PATH}`,
    );
  return out;
}

/**
 * The skills section of init's report: what was linked, what already was, and — BY NAME — what
 * was left alone. A skipped entry does not fail init: the name is taken by something the consumer
 * made, replacing it would be worse than not linking, and doctor's report below repeats the gap.
 */
export function reportSkillLinks(
  report: LinkReport,
  here: (p: string) => string,
): string[] {
  const out: string[] = [
    ``,
    `skills (Claude Code finds project skills in ${SKILLS_HOME}/, not in node_modules)`,
  ];
  if (!report.ok) {
    out.push(`  ⚠ nothing linked — ${report.error}`);
    out.push(
      `      install the package into this project (\`npm i -D …\`), then \`npx rpp init\` again`,
    );
    return out;
  }
  const by = (s: string) => report.links.filter((l) => l.status === s);
  const created = by("created");
  const present = by("present");
  const skipped = by("foreign");
  // Only a read-only call leaves anything `missing`; counted anyway, so the sum always adds up.
  const missing = by("missing");
  const mark = skipped.length || missing.length ? "⚠" : "✓";
  out.push(
    `  ${mark} ${String(report.links.length)} shipped: ${String(created.length)} linked now, ` +
      `${String(present.length)} already linked, ${String(skipped.length)} skipped` +
      (missing.length ? `, ${String(missing.length)} NOT linked` : ``),
  );
  if (report.example !== null)
    out.push(
      `      ${join(here(report.home), "<name>")} → ${join(dirname(report.example), "<name>")}`,
    );
  if (skipped.length) {
    out.push(
      `      left untouched — the name is taken by something rpp did not make:`,
    );
    for (const l of skipped)
      out.push(`        ${l.name} — ${l.reason ?? "occupied"}`);
    out.push(
      `      those skills are NOT available in Claude Code until the entry is moved or removed`,
    );
  }
  return out;
}

export interface InitOptions {
  log?: typeof console.log;
  err?: typeof console.error;
  cwd?: string;
  /** Asks one question. Injected so the prompt is assertable without a pseudo-terminal. */
  ask?: (question: string) => Promise<string>;
  /**
   * Whether a human is at the other end. Defaults to `interactivity()` over this process: stdin
   * AND stdout are terminals, `CI` is unset, and no `--yes`.
   */
  interactive?: boolean;
  /** `--yes`: take every default without asking. */
  yes?: boolean;
  /** `false` is `--no-hooks`. */
  hooks?: boolean;
  /** vigiles' merge. Injected only so a test can observe or replace it. */
  merge?: Merge;
  /** `--paper <name>`: create this paper, even without a terminal. */
  paper?: string | null;
  /** `--format tex|md` for that paper. */
  format?: PaperFormat | null;
  /**
   * Creates one paper and lints it — `rpp new`'s own routine, passed in by the CLI so `init` and
   * `new` cannot drift into two implementations.
   */
  createPaper?: (
    papersRoot: string,
    name: string,
    format: PaperFormat,
  ) => Promise<number>;
  run?: typeof spawnSync;
  /**
   * What `rpp lint` would resolve from the declaration, asked of the CLI's OWN reader. A second
   * implementation here would be a second source of truth — the very defect `doctor` reports.
   */
  resolveCliPapers?: (root: string) => string | null;
  /** Links the skills. Injected only so a test can stand in for the installed package. */
  link?: (root: string) => LinkReport;
  /**
   * The version of the running package, read by the CLI from its own `package.json`. The CI
   * workflow is pinned to its release tag (`actionRef`); absent or unreleased, the placeholder.
   */
  version?: string;
}

/** Reads one line from a real terminal. Kept out of `init` so the command stays testable. */
export async function askOnTerminal(question: string): Promise<string> {
  // eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
  const { createInterface } = await import("node:readline/promises");
  // eslint-disable-next-line no-restricted-globals -- legacy I/O, moves behind a port in #76
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

// Documented in README.md#install-and-set-up — update it when this changes.
export async function init(
  dir: string,
  opts: InitOptions = {},
): Promise<number> {
  const {
    log = console.log,
    err = console.error,
    // eslint-disable-next-line no-restricted-globals -- legacy I/O, moves behind a port in #76
    cwd = process.cwd(),
    ask = askOnTerminal,
    yes = false,
    hooks = true,
    merge,
    paper = null,
    format = null,
    createPaper,
    run = spawnSync,
    resolveCliPapers,
    link = (r: string) => linkSkills(r),
    version,
  } = opts;
  // An injected `interactive` is a test standing in for a terminal; its reason is the classic one.
  const { interactive, why } =
    opts.interactive === undefined
      ? processInteractivity(yes)
      : {
          interactive: opts.interactive,
          why: opts.interactive
            ? "a terminal on both ends"
            : "stdin is not a terminal",
        };
  const root = resolve(cwd, dir);
  const here = (p: string): string => relative(cwd, p) || p;

  log(``);
  log(`rpp init — each decision below says HOW it was decided`);

  // ── 1. where the papers are ───────────────────────────────────────────────────────────
  const choice = await choosePapers(root, { ask, interactive });
  log(``);
  log(`papers directory`);
  if (choice.how === "detected")
    log(
      `  ✓ ${choice.papers} — measured: its subdirectories carry ${PAPER_MARKERS.join(" / ")}`,
    );
  else if (choice.how === "chosen")
    log(
      `  ✓ ${choice.papers} — you picked it out of ${String(choice.candidates.length)} candidates`,
    );
  else if (choice.how === "not-asked" || choice.how === "no-answer") {
    log(
      `  ✓ ${choice.papers} — ${String(choice.candidates.length)} candidates, ` +
        (choice.how === "not-asked"
          ? `${why} so nothing was asked`
          : `no answer was given, so the first one was taken`),
    );
    log(
      `      the others: ${choice.candidates.slice(1).join(", ")} — change it in package.json if this is the wrong one`,
    );
  } else {
    log(
      `  ⚠ ${choice.papers} — A GUESS. Nothing here looks like a papers directory yet.`,
    );
    log(
      `      Nothing on disk was measured, so this is the documented default and not a finding.`,
    );
  }

  // ── 2. one declaration, in package.json ───────────────────────────────────────────────
  log(``);
  log(`declaration`);
  const decl = declarePapers(root, choice.papers);
  if (decl.status === "written")
    log(
      `  ✓ ${here(decl.path)} → "${CONFIG_KEY}": { "${PAPERS_DIR_FIELD}": ${JSON.stringify(decl.papers)} }`,
    );
  else if (decl.status === "kept") {
    if (typeof decl.papers !== "string") {
      err(
        `  ✗ ${here(decl.path)} declares ${PAPERS_DIR_FIELD} = ${JSON.stringify(decl.papers)} — it must be a directory path (a string)`,
      );
      return 2;
    }
    log(
      `  ✓ ${here(decl.path)} already declares ${PAPERS_DIR_FIELD} = ${JSON.stringify(decl.papers)} — kept, nothing overwritten`,
    );
  } else if (decl.status === "renamed") {
    err(`  ✗ ${decl.message}`);
    err(
      `      nothing was written. Rename the field in ${here(decl.path)}, then run init again.`,
    );
    return 2;
  } else if (decl.status === "unparsable") {
    err(`  ✗ ${here(decl.path)} is not valid JSON: ${decl.reason}`);
    err(
      `      nothing was written. The hooks read their papers directory from this file and`,
    );
    err(
      `      refuse every Bash command while it cannot be parsed — fix the JSON first.`,
    );
    return 2;
  } else {
    err(
      `  ✗ no package.json at ${here(root)} — there is nowhere to put the declaration.`,
    );
    err(
      `      The hooks can only read a path they are able to name, and that path is`,
    );
    err(
      `      package.json. Run \`npm init -y\` here, then \`npx rpp init\` again.`,
    );
    return 2;
  }
  log(
    `      one declaration — the hooks, the rules and the CLI all read this one key`,
  );
  // Every step below uses the DECLARED directory. A kept declaration outranks what init
  // measured or guessed: otherwise the first paper, the workflow and rpp.json would land in the
  // guessed directory while lint and the hooks keep reading the declared one.
  const papersDir =
    decl.status === "kept" ? (decl.papers as string) : choice.papers;
  const rpp = syncRppJson(root, papersDir);
  if (rpp === "filled")
    log(
      `  ⚠ rpp.json was already here — gave it the same ${PAPERS_DIR_FIELD} value; it is deprecated`,
    );
  else if (rpp === "kept")
    log(
      `  ⚠ rpp.json was already here and already declares ${PAPERS_DIR_FIELD} — left untouched; it is deprecated`,
    );
  else if (rpp === "unparsable")
    log(
      `  ⚠ rpp.json is here and does not parse — left untouched; it is deprecated, delete it`,
    );

  // ── 3. the skills, linked where Claude Code looks for them ─────────────────────────────
  for (const line of reportSkillLinks(link(root), here)) log(line);

  // ── 4. the hooks, wired where Claude Code reads them ───────────────────────────────────
  log(``);
  log(
    `hooks (Claude Code runs them from ${SETTINGS_PATH} — committed, shared with every clone)`,
  );
  const hooked = await offerHooks(root, { hooks, interactive, ask, merge });
  for (const line of reportHooks(hooked, {
    here,
    how: interactive
      ? `you were asked; \`--no-hooks\` skips this next time`
      : `default taken: YES — ${why}, so nothing was asked. \`--no-hooks\` skips this`,
  }))
    log(line);

  // ── 5. the one expensive, unguessable thing ───────────────────────────────────────────
  log(``);
  log(`CI`);
  const wf = await offerWorkflow(root, papersDir, {
    ask,
    interactive,
    version,
  });
  for (const line of reportWorkflow(wf, { version, papersDir, why })) log(line);

  // ── 6. a first paper — offered only where there is none, and only to a human ──────────
  log(``);
  log(`first paper`);
  const papersAbs = resolve(root, papersDir);
  const hasPaper = papersIn(papersAbs).length > 0;
  let wanted: string | null = paper;
  // A paper that was asked for and not delivered decides the exit code (below): the doctor's
  // code can be 0, and automation would read an unfulfilled `--paper` as done.
  let paperCode = 0;
  if (wanted === null && !hasPaper && interactive && createPaper) {
    const answer = (
      await askOrDefault(ask, `  create a first paper? name: [skip] `)
    )?.trim();
    wanted = answer ? answer : null;
  }
  if (wanted !== null && createPaper) {
    const problem = nameProblem(wanted);
    let fmt: PaperFormat = format ?? DEFAULT_FORMAT;
    if (!problem && format === null && interactive) {
      const f = (
        await askOrDefault(ask, `  format: tex / md [${DEFAULT_FORMAT}] `)
      )?.trim();
      if (isFormat(f)) fmt = f;
    }
    if (problem) {
      log(`  ✗ ${problem} — no paper created`);
      paperCode = 2;
    } else {
      const code = await createPaper(papersAbs, wanted, fmt);
      if (code !== 0) {
        log(`  ⚠ the new paper's lint exited ${String(code)} — see above`);
        paperCode = code;
      }
    }
  } else if (hasPaper) log(`  ✓ ${papersDir} already holds a paper`);
  else
    log(
      `  · none yet${interactive ? "" : ` — ${why}, so nothing was asked`}. \`npx rpp new <name>\` or \`--paper <name>\` creates one`,
    );

  // ── 7. the toolchain is reported, never installed ─────────────────────────────────────
  log(``);
  log(
    `external programs (the skills shell out to these; \`rpp lint\` needs none of them)`,
  );
  const missing = missingPrograms(run);
  if (missing.length === 0)
    log(`  ✓ all ${String(PROGRAMS.length)} are on PATH`);
  else {
    // 🔴 THE NAMES AND THE COUNT HERE, THE CONSEQUENCES — IN THE doctor REPORT BELOW, AND THIS IS
    // NOT ABOUT SAVING LINES. The first version printed here the same "✗ program — what goes silent
    // without it" table that doctor prints twenty lines later. Not only did the reader see it
    // twice — the harness assert could not tell one from the other and left a mutation that cut the
    // remedy OUT of init green. One fact is printed by one author.
    log(
      `  ✗ ${String(missing.length)} of ${String(PROGRAMS.length)} missing: ` +
        missing.map((p) => p.bin).join(", "),
    );
    log(
      `      what each one is for is in the doctor report below. Nothing is installed for you —`,
    );
    log(
      `      an install that can fail quietly is worse than a step that says what it needs:`,
    );
    for (const cmd of [...new Set(missing.map((p) => p.install))])
      log(`        ${cmd}`);
  }

  log(nextSteps(papersDir));

  // ── 8. the install states its own condition ───────────────────────────────────────────
  log(`── rpp doctor ${"─".repeat(56)}`);
  const cliPapers = resolveCliPapers ? resolveCliPapers(root) : papersDir;
  const code = doctor({ log, cwd: root, projectDir: root, run, cliPapers });
  if (code !== 0)
    log(
      `doctor exits ${String(code)} — the install is NOT finished. The lines marked ✗ above say what is\n` +
        `left; re-run \`npx rpp doctor\` once you have done them.`,
    );
  return paperCode !== 0 ? paperCode : code;
}
