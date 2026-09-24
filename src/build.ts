/**
 * `rpp build <paper>` — rpp compiles the paper ITSELF. A paper-supplied script is never run.
 *
 * 🔴 WHY rpp OWNS THE BUILD, and why `build.sh` is now IGNORED rather than preferred. Until
 * issue #59 this command looked for `build.sh` / `repro/build-submission.sh` and ran it. Every
 * paper therefore carried its own copy of the same work — find the venue files, set `TEXINPUTS`,
 * run pdflatex and bibtex until the references settle — and the copies drifted: one set
 * `TEXINPUTS`, one did not; one printed the log on failure, one swallowed it; one left the old PDF
 * in place after a failed pass. A convention every author re-implements is a convention nobody
 * has. It lives here once, and a script found in the paper directory is named and ignored, so an
 * author who still has one is not surprised.
 *
 * ── THE SHAPE: an ordered list of STEPS, composed, not configured ────────────
 * Each step says whether it applies to THIS paper and why — decided from FACTS parsed out of the
 * paper (its `\documentclass` and options, the venue named in `venue.json`), never from a config
 * flag. `rpp build` prints that plan before running anything, and `--dry-run` prints only the
 * plan. Adding a step is one entry in `STEPS`.
 *
 * ── WHAT THE BUILD DOES NOT DO: JUDGE THE LAYOUT ───────────────────────────
 * Until 2026-09-24 a third step searched for a `\balance` position that evened out the last page's
 * columns, rebuilding once per `\bibitem`, and failed the build (deleting the PDF) when none worked.
 * It was removed: only some venues require a balanced last page, every mechanism for producing one
 * is documented by its own authors as unreliable, and a build step has no severity, no suppression
 * and no per-venue switch. Balance is now an optional lint rule over the facts this build writes
 * (`pdf/last-page-balance`, off unless the consumer turns it on).
 *
 * ── WHAT IS PURE AND WHAT IS NOT ─────────────────────────────────────────────
 * The decision of the LaTeX loop is `latex-loop.ts`, reading the log is `latex-log.ts`; both are
 * pure. This file is the shell: it runs processes through the injected `run` (the existing port —
 * `spawnSync` by default) and reads the files a pass left behind. Where rpp's own files live is
 * answered by `consumer.mjs`, the one module allowed to know it (rule 10).
 */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { delimiter, join, relative } from "node:path";
import { getParser } from "@unified-latex/unified-latex-util-parse";
import { packageVenuesDir } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { declaredVenue } from "./facts-file.ts";
import {
  auxBib,
  bibtexExcerpt,
  errorExcerpt,
  logMarkers,
  unwrapLog,
} from "./latex-log.ts";
import {
  nextStep,
  summarize,
  TRACKED,
  type BibInput,
  type Hashes,
  type Observation,
  type Step,
} from "./latex-loop.ts";
import type { BuildResult, PlanLine } from "./types.ts";

/** A directory counts as a paper by the same markers as `structure.ts` — one shared dictionary. */
export const PAPER_MARKERS = [
  "PIPELINE-STATUS.md",
  "paper.tex",
  "paper.md",
  "venue.json",
];

/** The source rpp compiles, and the job name every output file carries. */
export const MAIN = "paper.tex";
export const JOB = "paper";

/**
 * Scripts that `rpp build` USED to run. Their presence is reported and nothing more: running a
 * file from the paper directory is exactly what this command stopped doing.
 */
export const IGNORED_SCRIPTS = ["build.sh", "repro/build-submission.sh"];

/** The pdflatex flags: never stop for input, stop at the first error, and say file:line. */
export const PDFLATEX_FLAGS = [
  "-interaction=nonstopmode",
  "-halt-on-error",
  "-file-line-error",
];

/** Everything the steps may know about a paper — parsed from it, not configured. */
export interface PaperFacts {
  /** `paper.tex` when it exists, else null. */
  readonly main: string | null;
  readonly documentclass: {
    readonly name: string;
    readonly options: readonly string[];
  } | null;
  /** The `venue` field of `venue.json`, or null. */
  readonly venue: string | null;
  /** Paper-supplied build scripts found on disk — reported as ignored. */
  readonly ignoredScripts: readonly string[];
}

/** A process runner with `spawnSync`'s shape — the port the harness replaces. */
export type Runner = typeof spawnSync;

/** What a step's `run` receives. `env` is the environment accumulated by the steps before it. */
export interface BuildContext {
  readonly paperDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly run: Runner;
}

export type StepOutcome =
  | {
      readonly ok: true;
      readonly env?: NodeJS.ProcessEnv;
      readonly note?: string;
    }
  | { readonly ok: false; readonly lines: readonly string[] };

export interface BuildStep {
  readonly name: string;
  /** A required step REFUSES the build when it does not apply; an optional one is skipped. */
  readonly required: boolean;
  applies(facts: PaperFacts): { yes: boolean; why: string };
  run(ctx: BuildContext): StepOutcome;
}

// ── facts ───────────────────────────────────────────────────────────────────────────────

/**
 * unified-latex's own AST types, reached through the parser this package declares. The types
 * package behind it is a transitive dependency, and importing it by name would be depending on it
 * without declaring it.
 */
type LatexRoot = ReturnType<ReturnType<typeof getParser>["parse"]>;
type LatexNode = LatexRoot["content"][number];
type LatexArgument = NonNullable<
  Extract<LatexNode, { type: "macro" }>["args"]
>[number];

type LatexMacro = Extract<LatexNode, { type: "macro" }>;

/** `node` is a call of the macro `\name`. */
const isMacro = (
  node: LatexNode | LatexArgument,
  name: string,
): node is LatexMacro => node.type === "macro" && node.content === name;

/** The concatenated text of a unified-latex argument node. */
function argText(arg: LatexArgument | undefined): string {
  return (arg?.content ?? [])
    .map((n) =>
      n.type === "string" ? n.content : n.type === "whitespace" ? " " : "",
    )
    .join("");
}

/** A unified-latex AST, or null when the text does not parse. */
function parseTex(tex: string): LatexRoot | null {
  try {
    return getParser().parse(tex);
  } catch {
    return null;
  }
}

/**
 * `\documentclass[opts]{name}`, read by the unified-latex parser the lint rules already use —
 * so a `\documentclass` inside a comment is a comment, not a class.
 */
export function parseDocumentclass(tex: string): PaperFacts["documentclass"] {
  return documentclassOf(parseTex(tex));
}

function documentclassOf(ast: LatexRoot | null): PaperFacts["documentclass"] {
  const node = (ast?.content ?? []).find((n): n is LatexMacro =>
    isMacro(n, "documentclass"),
  );
  if (!node) return null;
  const args = node.args ?? [];
  const name = argText(args.find((a) => a.openMark === "{")).trim();
  if (!name) return null;
  const options = argText(args.find((a) => a.openMark === "["))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { name, options };
}

export function readFacts(paperDir: string): PaperFacts {
  const mainPath = join(paperDir, MAIN);
  const main = existsSync(mainPath) ? MAIN : null;
  const venue = declaredVenue(paperDir);
  const ast = main ? parseTex(readFileSync(mainPath, "utf8")) : null;
  return {
    main,
    documentclass: documentclassOf(ast),
    venue: venue?.venue ?? null,
    ignoredScripts: IGNORED_SCRIPTS.filter((s) =>
      existsSync(join(paperDir, s)),
    ),
  };
}

// ── step: inputs ────────────────────────────────────────────────────────────────────────

/**
 * `TEXINPUTS` with `dirs` in front. With nothing set before, the value ENDS in the separator, and
 * that is load-bearing: an empty element tells kpathsea "and then the system tree", so without it
 * `article.cls` stops resolving. A value the user already set is kept as they wrote it.
 */
export function withTexInputs(
  env: NodeJS.ProcessEnv,
  dirs: readonly string[],
): NodeJS.ProcessEnv {
  return {
    ...env,
    TEXINPUTS: [...dirs, env.TEXINPUTS ?? ""].join(delimiter),
  };
}

export const inputsStep: BuildStep = {
  name: "inputs",
  required: false,
  applies: () => ({
    yes: true,
    why: `TEXINPUTS += ${packageVenuesDir()}`,
  }),
  run: (ctx) => ({
    ok: true,
    env: withTexInputs(ctx.env, [packageVenuesDir()]),
  }),
};

// ── step: compile ───────────────────────────────────────────────────────────────────────

const sha = (buf: Buffer): string =>
  createHash("sha256").update(buf).digest("hex");

function hashes(paperDir: string): Hashes {
  const h = (ext: string): string | null => {
    const p = join(paperDir, `${JOB}.${ext}`);
    return existsSync(p) ? sha(readFileSync(p)) : null;
  };
  return Object.fromEntries(TRACKED.map((t) => [t, h(t)])) as unknown as Hashes;
}

const readOr = (path: string, enc: BufferEncoding): string | null =>
  existsSync(path) ? readFileSync(path, enc) : null;

/** What bibtex would be run on, as the `.aux` stands now. */
export function bibInput(paperDir: string): BibInput {
  const aux = readOr(join(paperDir, `${JOB}.aux`), "utf8");
  if (aux === null) return { kind: "none" };
  const bib = auxBib(aux, (name) => readOr(join(paperDir, name), "utf8"));
  if (bib.databases.length === 0) return { kind: "none" };
  const files = bib.databases
    .map((d) => join(paperDir, d.endsWith(".bib") ? d : `${d}.bib`))
    .filter((p) => existsSync(p));
  return {
    kind: "needed",
    citations: bib.citations,
    databases: bib.databases,
    style: bib.style,
    bibHash: files.length
      ? sha(Buffer.concat(files.map((p) => readFileSync(p))))
      : null,
  };
}

/** pdflatex arguments for a pass. The final pass defines `\finalpass` — see `latex-loop.ts`. */
export function pdflatexArgs(final: boolean): string[] {
  return final
    ? [
        ...PDFLATEX_FLAGS,
        `-jobname=${JOB}`,
        `\\def\\finalpass{}\\input{${MAIN}}`,
      ]
    : [...PDFLATEX_FLAGS, MAIN];
}

const notInstalled = (bin: string): string[] => [
  `${bin} could not be started — it is not installed, or not on PATH.`,
  `rpp compiles with TeX Live's pdflatex and bibtex: see docs/toolchain.md.`,
];

/** The log was read byte for byte to count TeX's columns; show it to a human as UTF-8. */
const fromLatin1 = (s: string): string =>
  Buffer.from(s, "latin1").toString("utf8");

type Terminal = Extract<Step, { kind: "done" } | { kind: "fail" }>;

/** How every pass is spawned: in the paper directory, output read byte for byte (`fromLatin1`). */
function spawnOptions(ctx: BuildContext) {
  return {
    cwd: ctx.paperDir,
    env: ctx.env,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    encoding: "latin1" as const,
    maxBuffer: 64 * 1024 * 1024,
  };
}

type SpawnOptions = ReturnType<typeof spawnOptions>;

const cannotStart = (step: "latex" | "bibtex"): Terminal => ({
  kind: "fail",
  step,
  cause: { kind: "exit", code: 127 },
  lines: notInstalled(step === "latex" ? "pdflatex" : "bibtex"),
});

/** One pdflatex pass and what it left behind, or null when pdflatex could not be started. */
function latexPass(
  ctx: BuildContext,
  final: boolean,
  opts: SpawnOptions,
): Observation | null {
  const before = hashes(ctx.paperDir);
  const r = ctx.run("pdflatex", pdflatexArgs(final), opts);
  if (r.error) return null;
  const exitCode = r.status ?? 1;
  const log = unwrapLog(
    readOr(join(ctx.paperDir, `${JOB}.log`), "latin1") ?? "",
  );
  return {
    step: "latex",
    final,
    exitCode,
    before,
    after: hashes(ctx.paperDir),
    markers: logMarkers(log),
    bib: bibInput(ctx.paperDir),
    errorLines: exitCode === 0 ? [] : errorExcerpt(log).map(fromLatin1),
  };
}

/** One bibtex run, on the input the `.aux` names BEFORE it runs, or null when it could not start. */
function bibtexPass(ctx: BuildContext, opts: SpawnOptions): Observation | null {
  const before = hashes(ctx.paperDir);
  const bib = bibInput(ctx.paperDir);
  const r = ctx.run("bibtex", [JOB], opts);
  if (r.error) return null;
  const exitCode = r.status ?? 1;
  return {
    step: "bibtex",
    exitCode,
    before,
    after: hashes(ctx.paperDir),
    bib,
    errorLines:
      exitCode === 0 ? [] : bibtexExcerpt(fromLatin1(String(r.stdout ?? ""))),
  };
}

/** Run the loop until `nextStep` says done or fail. */
export function compile(ctx: BuildContext): {
  end: Terminal;
  latex: number;
  bibtex: number;
} {
  const history: Observation[] = [];
  const opts = spawnOptions(ctx);
  const runs = { latex: 0, bibtex: 0 };
  for (;;) {
    const step = nextStep(summarize(history));
    if (step.kind === "done" || step.kind === "fail")
      return { end: step, ...runs };
    runs[step.kind]++;
    const seen =
      step.kind === "latex"
        ? latexPass(ctx, step.final, opts)
        : bibtexPass(ctx, opts);
    if (seen === null) return { end: cannotStart(step.kind), ...runs };
    history.push(seen);
  }
}

const NO_PDF = `pdflatex exited 0 but wrote no ${JOB}.pdf — does the document have any pages?`;

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export const compileStep: BuildStep = {
  name: "compile",
  required: true,
  applies: (facts) => {
    if (!facts.main)
      return {
        yes: false,
        why: `no ${MAIN}; rpp compiles LaTeX, and this paper has none`,
      };
    const dc = facts.documentclass;
    const cls = dc
      ? `\\documentclass${dc.options.length ? `[${dc.options.join(",")}]` : ""}{${dc.name}}`
      : "no \\documentclass found";
    const venue = facts.venue ? `, venue ${facts.venue}` : "";
    return { yes: true, why: `${facts.main} (${cls}${venue})` };
  },
  run: (ctx) => {
    const { end, latex, bibtex } = compile(ctx);
    if (end.kind === "fail") {
      const bin = end.step === "latex" ? "pdflatex" : "bibtex";
      const where =
        end.cause.kind === "exit"
          ? `${bin} exited with ${end.cause.code}`
          : `${bin} did not converge`;
      const log = join(
        ctx.paperDir,
        `${JOB}.${end.step === "latex" ? "log" : "blg"}`,
      );
      return {
        ok: false,
        lines: [
          where,
          ...(end.lines.length
            ? end.lines
            : ["(no error line found in the log)"]),
          `full log: ${log}`,
        ],
      };
    }
    // 🔴 EXIT 0 IS NOT A PDF. pdflatex on a document with no pages prints "No pages of output."
    // and exits 0. Existence is enough to know THIS run wrote it: `buildPapers` deleted paper.pdf
    // before anything ran, so no timestamp comparison is needed. Checked here, in the step that
    // wrote it, so a later step that reads the PDF never sees this case as its own failure.
    if (!existsSync(join(ctx.paperDir, `${JOB}.pdf`)))
      return {
        ok: false,
        lines: [NO_PDF, `full log: ${join(ctx.paperDir, `${JOB}.log`)}`],
      };
    const warn = end.warnings.length
      ? ` — ⚠️ the final log still reports ${end.warnings.join(", ")}`
      : "";
    return {
      ok: true,
      note: `${plural(latex, "pdflatex pass", "pdflatex passes")}, ${plural(bibtex, "bibtex run", "bibtex runs")}${warn}`,
    };
  },
};

/** The build, in order. A new step is one entry here. */
export const STEPS: readonly BuildStep[] = [inputsStep, compileStep];

// ── the command ─────────────────────────────────────────────────────────────────────────

export function planFor(
  facts: PaperFacts,
  steps: readonly BuildStep[] = STEPS,
): PlanLine[] {
  return steps.map((s) => {
    const a = s.applies(facts);
    return { step: s.name, applies: a.yes, required: s.required, why: a.why };
  });
}

export function formatPlan(plan: readonly PlanLine[]): string[] {
  const state = (p: PlanLine): string =>
    p.applies ? "" : p.required ? "refused — " : "skipped — ";
  return plan.map((p) => `  ${p.step}: ${state(p)}${p.why}`);
}

/**
 * 🔴 A FAILED BUILD LEAVES NO PDF. An old paper.pdf beside a red build looks current, and "the PDF
 * is there" is exactly what a human checks first. Returns whether there was one.
 */
function removePdf(paperDir: string): boolean {
  const pdf = join(paperDir, `${JOB}.pdf`);
  const was = existsSync(pdf);
  rmSync(pdf, { force: true });
  return was;
}

/** The one wording for "the PDF is gone", on every path that ends without a new one. */
export const PDF_REMOVED = `${JOB}.pdf removed — a stale PDF must not pass for this build`;

export interface BuildOptions {
  run?: Runner;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  steps?: readonly BuildStep[];
  log?: (line: string) => void;
  dryRun?: boolean;
}

/**
 * The options with their defaults. Destructuring defaults and not a spread over a defaults object:
 * an option passed as `undefined` (the CLI passes `dryRun: a.dryRun`) must still get its default.
 */
function withDefaults({
  run = spawnSync,
  cwd = process.cwd(),
  env = process.env,
  steps = STEPS,
  log = console.log,
  // 🔴 `--dry-run` must be a DECLARED option here, not only in the CLI: options destructuring
  // swallows an unknown key silently, and the first version of this flag ran a full build and
  // rewrote paper.pdf while looking like a verbose dry run.
  dryRun = false,
}: BuildOptions): Required<BuildOptions> {
  return { run, cwd, env, steps, log, dryRun };
}

/** Run the applicable steps in order, each on the environment the steps before it left. */
function runSteps(
  paperDir: string,
  dir: string,
  plan: PlanLine[],
  { run, env, steps }: Required<BuildOptions>,
): BuildResult {
  let stepEnv = env;
  const notes: string[] = [];
  for (const [i, step] of steps.entries()) {
    if (!plan[i]?.applies) continue;
    const out = step.run({ paperDir, env: stepEnv, run });
    if (!out.ok) {
      // The PDF THIS run wrote and the step then rejected (a partial pass).
      // A PDF from an earlier run is already gone — `buildPapers` removed it before anything ran.
      removePdf(paperDir);
      return {
        dir,
        status: "failed",
        plan,
        failure: { step: step.name, lines: [...out.lines] },
      };
    }
    if (out.env) stepEnv = out.env;
    if (out.note) notes.push(out.note);
  }
  return { dir, status: "built", plan, ...(notes.length ? { notes } : {}) };
}

export function buildPaper(
  paperDir: string,
  options: BuildOptions = {},
): BuildResult {
  const o = withDefaults(options);
  const { cwd, steps, log, dryRun } = o;
  const dir = relative(cwd, paperDir) || paperDir;
  log(dir);
  let facts: PaperFacts;
  try {
    facts = readFacts(paperDir);
  } catch (e) {
    return {
      dir,
      status: "failed",
      plan: [],
      failure: { step: "facts", lines: [(e as Error).message] },
    };
  }
  for (const s of facts.ignoredScripts)
    log(`  note: ${s} is ignored — rpp builds the paper itself`);
  const plan = planFor(facts, steps);
  for (const line of formatPlan(plan)) log(line);

  if (plan.some((p) => !p.applies && p.required))
    return { dir, status: "no-source", plan };
  if (dryRun) return { dir, status: "built", plan, dry: true };
  return runSteps(paperDir, dir, plan, o);
}

/** A command's run over its targets: stopped before any paper for want of an engine, or ran. */
export type BuildRun =
  | { readonly kind: "no-engine" }
  | { readonly kind: "ran"; readonly results: readonly BuildResult[] };

/**
 * `rpp build` over its targets — the ONE path every outcome goes through.
 *
 * 🔴 A STALE PDF IS REMOVED HERE, FIRST, AND NOWHERE ELSE. Before the engine is resolved and before
 * any step, every targeted paper's paper.pdf goes. Then no outcome can leave an old PDF looking
 * current, including the ones that never reach a step: no qualifying TeX Live, no paper.tex, facts
 * that do not parse. Removing it per failure path instead is how three of those paths once kept it.
 * `--dry-run` removes nothing: a plan has no side effects.
 */
export async function buildPapers(
  targets: readonly string[],
  {
    engine,
    ...options
  }: BuildOptions & { engine: () => Promise<NodeJS.ProcessEnv | null> },
): Promise<BuildRun> {
  const { cwd, log, dryRun } = withDefaults(options);
  const stale = new Set(dryRun ? [] : targets.filter(removePdf));
  const env = await engine();
  if (env === null) {
    for (const t of stale) log(`${relative(cwd, t) || t}: ${PDF_REMOVED}`);
    return { kind: "no-engine" };
  }
  const results = targets.map((t) => {
    const r = {
      ...buildPaper(t, { ...options, env }),
      staleRemoved: stale.has(t),
    };
    log(formatResult(r));
    return r;
  });
  return { kind: "ran", results };
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

/**
 * The verdict for one paper, printed under its plan.
 *
 *   ✗ compile: pdflatex exited with 1
 *       ./paper.tex:4: Undefined control sequence.
 *       l.4 \foo
 *                bar baz
 *       full log: …/paper.log
 *       paper.pdf removed — a stale PDF must not pass for this build
 */
export function formatResult(r: BuildResult): string {
  if (r.status === "built")
    return r.dry
      ? `  – not run (--dry-run)`
      : `  ✓ ${JOB}.pdf${r.notes?.length ? ` — ${r.notes.join("; ")}` : ""}`;
  return r.status === "failed" ? formatFailure(r) : formatRefusal(r);
}

/** Always says the PDF is gone: this run may have written one and rejected it. */
function formatFailure(r: BuildResult): string {
  const [head, ...rest] = r.failure?.lines ?? ["failed"];
  return [
    `  ✗ ${r.failure?.step ?? "build"}: ${head}`,
    ...rest.map((l) => `      ${l}`),
    `      ${PDF_REMOVED}`,
  ].join("\n");
}

/** Says the PDF is gone only when there was one — a paper with no paper.tex usually has none. */
function formatRefusal(r: BuildResult): string {
  const refused = `  ✗ nothing to compile: no ${MAIN}`;
  return r.staleRemoved ? `${refused}\n      ${PDF_REMOVED}` : refused;
}

export function formatResults(results: readonly BuildResult[]): string {
  return results.map(formatResult).join("\n");
}

/**
 * 🔴 "Nothing to compile" COUNTS AS A REFUSAL on a par with a failed build. Failing to tell these
 * two apart is what once produced a green run over a paper no job had built.
 */
export const anyFailed = (results: readonly BuildResult[]): boolean =>
  results.some((r) => r.status !== "built");

export function remedyFor(results: readonly BuildResult[]): string {
  const missing = results.filter((r) => r.status === "no-source");
  if (missing.length === 0) return "";
  return (
    `\nNo ${MAIN} in: ${missing.map((r) => r.dir).join(", ")}.\n` +
    `This is NOT "nothing to build" — rpp compiles LaTeX, and these papers have no LaTeX source.\n` +
    `Write the paper in ${MAIN}; \`rpp new <name>\` creates one.`
  );
}
