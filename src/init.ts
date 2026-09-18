/**
 * `rpp init` — the whole install except the two lines that must be typed into another program.
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
 * ── THE FOUR DECISIONS, AND HOW EACH ONE IS MADE ────────────────────────────
 *   papers directory   MEASURED — `detectPapers` walks the repo for a directory whose CHILDREN
 *                      carry a paper marker. Several hits is the only case a human is asked about.
 *   declaration        WRITTEN into `package.json`, merged, never overwriting a value that is
 *                      already there. Prior art: husky's `init` edits the consumer's package.json
 *                      to add `prepare`. `rpp.json` is no longer created at all.
 *   CI workflow        ASKED, because writing a file into `.github/` is not guessable and not
 *                      cheap to undo. Prior art: Playwright's initializer asks exactly this.
 *   external toolchain REPORTED, never installed. npm's own rule, quoted in husky's write-up:
 *                      "The only valid use of install or preinstall scripts is for compilation."
 *
 * 🔴 NOTHING IS ASKED WHEN STDIN IS NOT A TERMINAL. A question in CI is not a question, it is a
 * hang — or, with a closed stdin, an answer nobody gave. So the non-interactive path takes the
 * safe default (write no file) and SAYS which default it took, rather than pretending it asked.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { doctor, detectPapers, found, PROGRAMS } from "./doctor.ts";
import { PAPER_MARKERS } from "./build.ts";
// @ts-expect-error — the one source for the consumer's config key lives in the .mjs half of the
// package, because the ESLint rules and the skill scripts import it too and they are not TypeScript.
import { CONFIG_KEY, DEFAULT_PAPERS_ROOT } from "../lib/paper-config.mjs";

/** How the papers directory was arrived at. Printed, because a guess must not read as a fact. */
export type PapersHow =
  | "detected"
  | "chosen"
  | "not-asked"
  | "no-answer"
  | "guessed";

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

  const menu = candidates.map((c, i) => `    ${String(i + 1)}) ${c}`).join("\n");
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
  | { readonly status: "written"; readonly path: string; readonly papers: string }
  | { readonly status: "kept"; readonly path: string; readonly papers: unknown }
  | { readonly status: "unparsable"; readonly path: string; readonly reason: string }
  | { readonly status: "absent"; readonly path: string };

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
  let pkg: Record<string, any>;
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    return { status: "unparsable", path, reason: (e as Error).message };
  }
  const existing = pkg?.[CONFIG_KEY]?.papers;
  if (existing !== undefined) return { status: "kept", path, papers: existing };
  pkg[CONFIG_KEY] = { ...(pkg[CONFIG_KEY] ?? {}), papers };
  // Two-space indent and the file's own trailing newline: a declaration is not a licence to
  // reformat somebody else's file, and a one-line diff is a diff a consumer will actually read.
  writeFileSync(path, JSON.stringify(pkg, null, 2) + (raw.endsWith("\n") ? "\n" : ""), "utf8");
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
  let cfg: Record<string, any>;
  const raw = readFileSync(path, "utf8");
  try {
    cfg = JSON.parse(raw);
  } catch {
    return "unparsable";
  }
  if (cfg?.papers !== undefined) return "kept";
  cfg.papers = papers;
  writeFileSync(path, JSON.stringify(cfg, null, 2) + (raw.endsWith("\n") ? "\n" : ""), "utf8");
  return "filled";
}

export const WORKFLOW_PATH = join(".github", "workflows", "papers.yml");

/**
 * The CI step, as a whole workflow. The action is pinned by comment rather than by a sha this
 * command cannot know: a wrong sha written confidently is worse than a placeholder that is
 * obviously a placeholder.
 */
export function workflowYaml(papers: string): string {
  return [
    `# Written by \`rpp init\`. Pin <commit-sha> — this package is not on npm yet.`,
    `name: papers`,
    `on: [push, pull_request]`,
    `jobs:`,
    `  papers:`,
    `    runs-on: ubuntu-latest`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: zernie/research-paper-pipeline@<commit-sha>`,
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
  }: { ask?: (q: string) => Promise<string>; interactive: boolean },
): Promise<WorkflowResult> {
  const path = join(root, WORKFLOW_PATH);
  if (existsSync(path)) return "kept";
  if (!interactive || !ask) return "not-asked";
  const answer = (
    await askOrDefault(ask, `  add a GitHub Actions workflow that runs this in CI? [y/N] `)
  )
    ?.trim()
    .toLowerCase();
  // No answer — an empty line, or a stream that ended — is the safe default, which is "no file".
  if (answer !== "y" && answer !== "yes") return "declined";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, workflowYaml(papers), "utf8");
  return "written";
}

/**
 * The external toolchain is REPORTED, never fetched. Each entry already carries what goes quiet
 * without it, which is the only reason the list is worth printing: a missing checker and a
 * passing checker produce the same silence.
 */
export function missingPrograms(run = spawnSync): readonly (typeof PROGRAMS)[number][] {
  return PROGRAMS.filter((p) => !found(p.bin, run));
}

/**
 * Step 3 has ONE shape: two lines typed inside Claude Code. It cannot be collapsed — it is typed
 * into a different program, and nothing on disk can type it for you.
 *
 * The hook runtime (`vigiles`) arrives with this package as an ordinary dependency, so there is
 * nothing to install by hand. That replaced, in order: a copy-paste line, then a `--with-hooks`
 * flag, then a self-contained bundle — none of which were needed once the weight was measured.
 */
export function nextSteps(papersDir: string = DEFAULT_PAPERS_ROOT): string {
  return [
    ``,
    `still to do, and it cannot be done from a terminal:`,
    ``,
    `  /plugin marketplace add zernie/research-paper-pipeline`,
    `  /plugin install research-paper-pipeline@research-paper-pipeline`,
    ``,
    `  Their runtime came with this package; there is nothing else to install.`,
    `  Skip this and everything above still works — the hooks are an in-editor guard.`,
    ``,
    `then:  npx rpp lint       # runs every rule over ${papersDir}`,
    ``,
  ].join("\n");
}

export interface InitOptions {
  log?: typeof console.log;
  err?: typeof console.error;
  cwd?: string;
  /** Asks one question. Injected so the prompt is assertable without a pseudo-terminal. */
  ask?: (question: string) => Promise<string>;
  /** Whether a human is at the other end. Defaults to what stdin says, and CI says no. */
  interactive?: boolean;
  run?: typeof spawnSync;
  /**
   * What `rpp lint` would resolve from the declaration, asked of the CLI's OWN reader. A second
   * implementation here would be a second source of truth — the very defect `doctor` reports.
   */
  resolveCliPapers?: (root: string) => string | null;
}

/** Reads one line from a real terminal. Kept out of `init` so the command stays testable. */
async function askOnTerminal(question: string): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export async function init(dir: string, opts: InitOptions = {}): Promise<number> {
  const {
    log = console.log,
    err = console.error,
    cwd = process.cwd(),
    ask = askOnTerminal,
    interactive = Boolean(process.stdin.isTTY),
    run = spawnSync,
    resolveCliPapers,
  } = opts;
  const root = resolve(cwd, dir);
  const here = (p: string): string => relative(cwd, p) || p;

  log(``);
  log(`rpp init — each decision below says HOW it was decided`);

  // ── 1. where the papers are ───────────────────────────────────────────────────────────
  const choice = await choosePapers(root, { ask, interactive });
  log(``);
  log(`papers directory`);
  if (choice.how === "detected")
    log(`  ✓ ${choice.papers} — measured: its subdirectories carry ${PAPER_MARKERS.join(" / ")}`);
  else if (choice.how === "chosen")
    log(`  ✓ ${choice.papers} — you picked it out of ${String(choice.candidates.length)} candidates`);
  else if (choice.how === "not-asked" || choice.how === "no-answer") {
    log(
      `  ✓ ${choice.papers} — ${String(choice.candidates.length)} candidates, ` +
        (choice.how === "not-asked"
          ? `stdin is not a terminal so nothing was asked`
          : `no answer was given, so the first one was taken`),
    );
    log(`      the others: ${choice.candidates.slice(1).join(", ")} — change it in package.json if this is the wrong one`);
  } else {
    log(`  ⚠ ${choice.papers} — A GUESS. Nothing here looks like a papers directory yet.`);
    log(`      Nothing on disk was measured, so this is the documented default and not a finding.`);
  }

  // ── 2. one declaration, in package.json ───────────────────────────────────────────────
  log(``);
  log(`declaration`);
  const decl = declarePapers(root, choice.papers);
  if (decl.status === "written")
    log(`  ✓ ${here(decl.path)} → "${CONFIG_KEY}": { "papers": ${JSON.stringify(decl.papers)} }`);
  else if (decl.status === "kept")
    log(`  ✓ ${here(decl.path)} already declares papers = ${JSON.stringify(decl.papers)} — kept, nothing overwritten`);
  else if (decl.status === "unparsable") {
    err(`  ✗ ${here(decl.path)} is not valid JSON: ${decl.reason}`);
    err(`      nothing was written. The hooks read their papers directory from this file and`);
    err(`      refuse every Bash command while it cannot be parsed — fix the JSON first.`);
    return 2;
  } else {
    err(`  ✗ no package.json at ${here(root)} — there is nowhere to put the declaration.`);
    err(`      The hooks can only read a path they are able to name, and that path is`);
    err(`      package.json. Run \`npm init -y\` here, then \`npx rpp init\` again.`);
    return 2;
  }
  log(`      one declaration — the hooks, the rules and the CLI all read this one key`);
  const rpp = syncRppJson(root, choice.papers);
  if (rpp === "filled")
    log(`  ⚠ rpp.json was already here — gave it the same papers value; it is deprecated`);
  else if (rpp === "kept")
    log(`  ⚠ rpp.json was already here and already declares papers — left untouched; it is deprecated`);
  else if (rpp === "unparsable")
    log(`  ⚠ rpp.json is here and does not parse — left untouched; it is deprecated, delete it`);

  // ── 3. the one expensive, unguessable thing ───────────────────────────────────────────
  log(``);
  log(`CI`);
  const wf = await offerWorkflow(root, choice.papers, { ask, interactive });
  if (wf === "written") log(`  ✓ wrote ${WORKFLOW_PATH} — pin <commit-sha> before pushing it`);
  else if (wf === "kept") log(`  ✓ ${WORKFLOW_PATH} is already there — kept, nothing overwritten`);
  else if (wf === "declined") log(`  · declined — nothing written`);
  else log(`  · stdin is not a terminal, so nothing was asked. Default taken: NO file written.`);
  if (wf !== "written" && wf !== "kept") {
    log(`      to run the same checks in CI, add this step to a workflow:`);
    log(`        - uses: zernie/research-paper-pipeline@<commit-sha>`);
    log(`          with:`);
    log(`            paths: ${choice.papers}`);
  }

  // ── 4. the toolchain is reported, never installed ─────────────────────────────────────
  log(``);
  log(`external programs (the skills shell out to these; \`rpp lint\` needs none of them)`);
  const missing = missingPrograms(run);
  if (missing.length === 0) log(`  ✓ all ${String(PROGRAMS.length)} are on PATH`);
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
    log(`      what each one is for is in the doctor report below. Nothing is installed for you —`);
    log(`      an install that can fail quietly is worse than a step that says what it needs:`);
    for (const cmd of [...new Set(missing.map((p) => p.install))]) log(`        ${cmd}`);
  }

  log(nextSteps(choice.papers));

  // ── 5. the install states its own condition ───────────────────────────────────────────
  log(`── rpp doctor ${"─".repeat(56)}`);
  const cliPapers = resolveCliPapers ? resolveCliPapers(root) : choice.papers;
  const code = doctor({ log, cwd: root, projectDir: root, run, cliPapers });
  if (code !== 0)
    log(
      `doctor exits ${String(code)} — the install is NOT finished. The lines marked ✗ above say what is\n` +
        `left; re-run \`npx rpp doctor\` once you have done them.`,
    );
  return code;
}
