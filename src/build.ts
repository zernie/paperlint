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
 * plan. Adding a step (the `\balance` search is next) is one entry in `STEPS`.
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
// @ts-expect-error — a plain .mjs script, untyped; `declaredVenue` is the one reader of venue.json
import { declaredVenue } from "../skills/render-paper/extract-pdf-facts.mjs";
import {
  auxBib,
  bibtexExcerpt,
  errorExcerpt,
  logMarkers,
  unwrapLog,
} from "./latex-log.ts";
import {
  nextStep,
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

/** The concatenated text of a unified-latex argument node. */
function argText(arg: any): string {
  return (arg?.content ?? [])
    .map((n: any) =>
      n.type === "string" ? n.content : n.type === "whitespace" ? " " : "",
    )
    .join("");
}

/**
 * `\documentclass[opts]{name}`, read by the unified-latex parser the lint rules already use —
 * so a `\documentclass` inside a comment is a comment, not a class.
 */
export function parseDocumentclass(tex: string): PaperFacts["documentclass"] {
  let ast: any;
  try {
    ast = getParser().parse(tex);
  } catch {
    return null;
  }
  const node = (ast?.content ?? []).find(
    (n: any) => n.type === "macro" && n.content === "documentclass",
  );
  if (!node) return null;
  const args: any[] = node.args ?? [];
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
  const venue = declaredVenue(paperDir) as { venue?: string } | null;
  return {
    main,
    documentclass: main
      ? parseDocumentclass(readFileSync(mainPath, "utf8"))
      : null,
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

/** Run the loop until `nextStep` says done or fail. */
export function compile(ctx: BuildContext): {
  end: Terminal;
  latex: number;
  bibtex: number;
} {
  const history: Observation[] = [];
  const opts = {
    cwd: ctx.paperDir,
    env: ctx.env,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    encoding: "latin1" as const,
    maxBuffer: 64 * 1024 * 1024,
  };
  const cannotStart = (step: "latex" | "bibtex"): Terminal => ({
    kind: "fail",
    step,
    cause: { kind: "exit", code: 127 },
    lines: notInstalled(step === "latex" ? "pdflatex" : "bibtex"),
  });
  let latex = 0;
  let bibtex = 0;
  for (;;) {
    const step = nextStep(history);
    if (step.kind === "done" || step.kind === "fail")
      return { end: step, latex, bibtex };
    const before = hashes(ctx.paperDir);
    if (step.kind === "latex") {
      latex++;
      const r = ctx.run("pdflatex", pdflatexArgs(step.final), opts);
      if (r.error) return { end: cannotStart("latex"), latex, bibtex };
      const exitCode = r.status ?? 1;
      const log = unwrapLog(
        readOr(join(ctx.paperDir, `${JOB}.log`), "latin1") ?? "",
      );
      history.push({
        step: "latex",
        final: step.final,
        exitCode,
        before,
        after: hashes(ctx.paperDir),
        markers: logMarkers(log),
        bib: bibInput(ctx.paperDir),
        errorLines: exitCode === 0 ? [] : errorExcerpt(log).map(fromLatin1),
      });
    } else {
      bibtex++;
      const bib = bibInput(ctx.paperDir);
      const r = ctx.run("bibtex", [JOB], opts);
      if (r.error) return { end: cannotStart("bibtex"), latex, bibtex };
      const exitCode = r.status ?? 1;
      history.push({
        step: "bibtex",
        exitCode,
        before,
        after: hashes(ctx.paperDir),
        bib,
        errorLines:
          exitCode === 0
            ? []
            : bibtexExcerpt(fromLatin1(String(r.stdout ?? ""))),
      });
    }
  }
}

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
 * is there" is exactly what a human checks first.
 */
function removePdf(paperDir: string): void {
  rmSync(join(paperDir, `${JOB}.pdf`), { force: true });
}

export function buildPaper(
  paperDir: string,
  {
    run = spawnSync,
    cwd = process.cwd(),
    env = process.env,
    steps = STEPS,
    log = console.log,
    // 🔴 `--dry-run` must be a DECLARED option here, not only in the CLI: options destructuring
    // swallows an unknown key silently, and the first version of this flag ran a full build and
    // rewrote paper.pdf while looking like a verbose dry run.
    dryRun = false,
  }: {
    run?: Runner;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    steps?: readonly BuildStep[];
    log?: (line: string) => void;
    dryRun?: boolean;
  } = {},
): BuildResult {
  const dir = relative(cwd, paperDir) || paperDir;
  log(dir);
  let facts: PaperFacts;
  try {
    facts = readFacts(paperDir);
  } catch (e) {
    removePdf(paperDir);
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

  let stepEnv = env;
  const notes: string[] = [];
  for (const [i, step] of steps.entries()) {
    if (!plan[i]?.applies) continue;
    const out = step.run({ paperDir, env: stepEnv, run });
    if (!out.ok) {
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
  if (r.status === "failed") {
    const [head, ...rest] = r.failure?.lines ?? ["failed"];
    return [
      `  ✗ ${r.failure?.step ?? "build"}: ${head}`,
      ...rest.map((l) => `      ${l}`),
      `      ${JOB}.pdf removed — a stale PDF must not pass for this build`,
    ].join("\n");
  }
  return `  ✗ nothing to compile: no ${MAIN}`;
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
