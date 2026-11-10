/**
 * cold-read-core.ts — the whole cold read of a paper diff, as one process the caller starts in
 * the background: extract the changed paragraphs as plain text, hand them to two context-free
 * readers in parallel, write their answers verbatim to a report file, and print a short table.
 *
 * Usage: node cold-read.js <paper.tex> [--base=REV] [--venue=NAME] [--out=PATH]
 *                          [--macros=FILE.json] [--max=N] [--extract-only]
 * Exit: 0 — report written (or, with --extract-only, the extract printed) · 1 — a reader failed
 * or answered nothing parseable · 2 — refused: nothing changed, too many paragraphs, a bad flag.
 *
 * WHY A SCRIPT AND NOT A FORKED SKILL (#405, #301). Run with `context: fork`, the skill's
 * orchestrator was a whole agent: on 2026-11-10 one consumer run took about 15 minutes, applied
 * fixes to the paper, rebuilt the PDF and landed its full report in the caller's context, and a
 * batched run on 2026-10-23 took about 35 minutes with no progress line and hand-rolled its own
 * extractor (which turned `--no-verify` into `-no-verify`). The readers themselves are cheap.
 * Here the orchestrator is this file: it carries no conversation, it fixes nothing, its progress
 * goes to stderr, and what it prints to the caller is the table, not the report.
 *
 * WHAT A READER GETS. Only the paragraphs, as text in its prompt, run from an empty directory
 * with no tools — so it cannot read the neighbours, and its confusion is the finding.
 *
 * The reader command is `claude` unless PAPERLINT_COLD_READ_READER names another executable;
 * tests point it at a fake, so no test spends money or touches the network.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { z } from "zod";

/** Above this many changed paragraphs the run refuses and asks for a narrower range (#301). */
export const DEFAULT_MAX = 15;

/** A blank-line separated block of the paper, 1-based lines. */
export interface Block {
  readonly start: number;
  readonly end: number;
  readonly lines: readonly string[];
}

/** A changed paragraph as a reader gets it. */
export interface Paragraph {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly unexpanded: readonly string[];
}

/** One row of a reader's answer: one sentence. Anything else a reader adds is dropped. */
const RowSchema = z.object({
  p: z.number().optional().catch(undefined),
  sentence: z.string().catch(""),
  verdict: z.string().catch("OK"),
  why: z.string().catch(""),
});
export type Row = z.infer<typeof RowSchema>;

/** What `claude -p --output-format json` prints, as far as this file reads it. */
const EnvelopeSchema = z.object({
  result: z.string().catch(""),
  usage: z
    .object({
      input_tokens: z.number().catch(0),
      cache_read_input_tokens: z.number().catch(0),
      cache_creation_input_tokens: z.number().catch(0),
      output_tokens: z.number().catch(0),
    })
    .catch({
      input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
    }),
  total_cost_usd: z.number().catch(0),
});

const MacrosSchema = z.record(z.string(), z.union([z.string(), z.number()]));
type Macros = z.infer<typeof MacrosSchema>;

export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_usd: number;
}

export interface Answer {
  readonly rows: readonly Row[];
  readonly usage: Usage;
  readonly text: string;
  readonly error: string | null;
}

export interface ReaderAnswer extends Answer {
  readonly persona: string;
  readonly ms: number;
}

export interface Finding extends Row {
  readonly id: number;
  readonly persona: string;
}

/** The 1-based line numbers of the NEW file that a `git diff -U0` adds or changes. */
export const changedLines = (diff: string): number[] =>
  [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].flatMap(
    (m) => {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      return Array.from({ length: count }, (_, i) => start + i);
    },
  );

/** Blank-line separated blocks of `tex`, each with its 1-based first and last line. */
export const paragraphsOf = (tex: string): Block[] =>
  tex
    .split("\n")
    .reduce<readonly (Block | null)[]>(
      (blocks, line, i) => {
        const last = blocks.at(-1);
        if (line.trim() === "") return [...blocks, null];
        return last
          ? [
              ...blocks.slice(0, -1),
              { ...last, end: i + 1, lines: [...last.lines, line] },
            ]
          : [...blocks, { start: i + 1, end: i + 1, lines: [line] }];
      },
      [null],
    )
    .filter((b): b is Block => b !== null);

/** A block that is not prose a reader should judge: a float, a table, the bibliography. */
const NOT_PROSE =
  /\\begin\{(table|figure|tabular|thebibliography|lstlisting|verbatim|equation|align)\*?\}|\\bibliography\{/;

/** A line that is only a command (`\section{…}`, `\label{…}`, `\begin{document}`): no prose on it. */
const COMMAND_ONLY = /^\s*\\[A-Za-z]+\*?(\[[^\]]*\])?(\{[^{}]*\})*\s*$/;

/** A `{{placeholder}}` a build fills in. */
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * One block as the plain text a reader gets: working comments dropped, `{{macros}}` expanded,
 * light markup removed. Dashes are left exactly as written — `--no-verify` stays `--no-verify`.
 * `unexpanded` lists the placeholders `macros` had no value for.
 */
export const plainText = (
  lines: readonly string[],
  macros: Macros = {},
): { text: string; unexpanded: string[] } => {
  const text = lines
    .map((l) => l.replace(/(^|[^\\])%.*$/, "$1"))
    .filter((l) => l.trim() !== "" && !COMMAND_ONLY.test(l))
    .join(" ")
    .replace(PLACEHOLDER, (m, k: string) => String(macros[k] ?? m))
    .replace(/\\(?:emph|textbf|textit|texttt|textsc|mbox)\{([^{}]*)\}/g, "$1")
    .replace(
      /\\(?:cite[tp]?|citeauthor)\*?(?:\[[^\]]*\])?\{[^}]*\}/g,
      "[citation]",
    )
    .replace(/\\(?:ref|cref|Cref|autoref)\{[^}]*\}/g, "[ref]")
    .replace(/\\([%&#_$])/g, "$1")
    .replace(/~/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, unexpanded: [...text.matchAll(PLACEHOLDER)].map((m) => m[0]) };
};

/** The changed paragraphs of `tex`, widened to whole blocks and made plain. */
export const extract = (
  tex: string,
  lines: readonly number[],
  macros: Macros = {},
): Paragraph[] =>
  paragraphsOf(tex)
    .filter((b) => lines.some((n) => n >= b.start && n <= b.end))
    .filter((b) => !NOT_PROSE.test(b.lines.join("\n")))
    .map((b) => ({
      start: b.start,
      end: b.end,
      ...plainText(b.lines, macros),
    }))
    .filter((p) => p.text !== "");

const ANSWER_FORMAT = `Answer with ONE fenced \`\`\`json block and nothing else: an array with one object per sentence,
in order: {"p": <paragraph number>, "sentence": "<the sentence, quoted exactly>", "restated": "<what it claims, in your own words, or empty>", "verdict": "<one of the verdicts above>", "why": "<what stopped you, or empty for OK>"}.`;

const CLEVER = `Also: a sentence that sounds clever but says less than it appears to gets the verdict CLEVER.
Otherwise the verdict is OK.`;

/** The two prompts. Nothing but the paragraphs and, for the reviewer, the venue's name. */
export const prompts = (
  paragraphs: readonly Paragraph[],
  venue: string,
): { engineer: string; reviewer: string } => {
  const body = paragraphs
    .map((p, i) => `[${String(i + 1)}]\n${p.text}`)
    .join("\n\n");
  return {
    engineer: `You are a strong software engineer outside academia, reading closely. Below are paragraphs of prose, numbered. For every sentence, answer two questions.
1. What does this sentence claim? Restate it in your own words. If restating requires guessing, the verdict is CANNOT PARSE and "why" says what stopped you: an undefined term, a pronoun with no referent, a number with no denominator, two clauses that do not connect.
2. Would a reader who stops here understand it? If only a reader who already knows something would, the verdict is ONLY-IF and "why" names what they would need to know.
${CLEVER}
${ANSWER_FORMAT}

${body}`,
    reviewer: `You are a program-committee member at ${venue || "a peer-reviewed workshop"}, with 40 minutes for a whole paper, skimming. Confidence 3. Below are paragraphs of a submission, numbered. For every sentence, answer two questions.
1. Whose result does this sentence state: the authors' measurement, a cited work, or a property of the world? If you cannot tell, the verdict is WHOSE?.
2. Does it read like a paper at this venue? If not, the verdict is REGISTER and "why" says what a paper there would write instead: an aphorism, a fragment, a colloquial turn, or two claims side by side with the relation between them unstated.
${CLEVER}
${ANSWER_FORMAT}

${body}`,
  };
};

/** `JSON.parse` that answers `undefined` instead of throwing. */
const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/**
 * A reader's answer as rows. `claude -p --output-format json` wraps the model's text in
 * `{ result, usage, total_cost_usd }`; the text holds one fenced json array. `error` is set when
 * nothing parseable came back.
 */
export const parseAnswer = (stdout: string): Answer => {
  const outer = EnvelopeSchema.safeParse(parseJson(stdout));
  const env = outer.success
    ? outer.data
    : EnvelopeSchema.parse({ result: stdout });
  const text = env.result;
  const inner = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const rows = z.array(RowSchema).safeParse(parseJson(inner));
  const u = env.usage;
  const usage = {
    input_tokens:
      u.input_tokens +
      u.cache_read_input_tokens +
      u.cache_creation_input_tokens,
    output_tokens: u.output_tokens,
    cost_usd: env.total_cost_usd,
  };
  return rows.success
    ? { rows: rows.data, usage, text, error: null }
    : { rows: [], usage, text, error: "no json array in the answer" };
};

/** Rows that are findings, numbered from 1 across both readers. */
export const findingsOf = (
  answers: readonly {
    readonly persona: string;
    readonly rows: readonly Row[];
  }[],
): Finding[] =>
  answers
    .flatMap(({ persona, rows }) =>
      rows.filter((r) => r.verdict !== "OK").map((r) => ({ persona, ...r })),
    )
    .map((f, i) => ({ id: i + 1, ...f }));

const clip = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;
const cell = (s: string): string => s.replace(/\|/g, "\\|");
const secs = (ms: number): string => (ms / 1000).toFixed(1);

/** At most this many findings in the caller's table; the rest are counted, and in the report. */
const SHOWN = 10;

/** What the caller sees: at most 15 lines, the full answers stay in the report. */
export const summary = (
  findings: readonly Finding[],
  paragraphs: readonly unknown[],
  reportPath: string,
): string => {
  const head = `cold read: ${String(paragraphs.length)} paragraph(s), ${String(findings.length)} finding(s) → ${reportPath}`;
  if (!findings.length) return head;
  const rest = findings.length - SHOWN;
  return [
    head,
    "| # | reader | verdict | sentence |",
    "|---|---|---|---|",
    ...findings
      .slice(0, SHOWN)
      .map(
        (f) =>
          `| ${String(f.id)} | ${f.persona} | ${f.verdict} | ${cell(clip(f.sentence, 70))} |`,
      ),
    ...(rest > 0 ? [`… and ${String(rest)} more in the report`] : []),
  ].join("\n");
};

const findingsTable = (findings: readonly Finding[]): string[] =>
  findings.length
    ? [
        "| # | reader | ¶ | verdict | sentence | why |",
        "|---|---|---|---|---|---|",
        ...findings.map(
          (f) =>
            `| ${String(f.id)} | ${f.persona} | ${String(f.p ?? "")} | ${f.verdict} | ${cell(f.sentence)} | ${cell(f.why)} |`,
        ),
      ]
    : ["None."];

const verbatim = (a: ReaderAnswer): string[] => [
  `## The ${a.persona}'s answer, verbatim`,
  "",
  `Tokens: ${String(a.usage.input_tokens)} in, ${String(a.usage.output_tokens)} out · $${a.usage.cost_usd.toFixed(4)} · ${secs(a.ms)} s`,
  "",
  "````",
  a.text.trim(),
  "````",
  "",
];

/** The report file: the findings, the extract, and each reader's answer verbatim. */
export const reportOf = (r: {
  readonly paper: string;
  readonly base: string;
  readonly venue: string;
  readonly paragraphs: readonly Paragraph[];
  readonly answers: readonly ReaderAnswer[];
  readonly findings: readonly Finding[];
}): string =>
  [
    `# Cold read — ${r.paper} (${r.base}..working tree)`,
    "",
    `Readers: engineer, workshop reviewer (venue: ${r.venue || "not named"}), model sonnet, no tools, no context.`,
    "No fix was applied. The caller decides; once it has, it adds a `findings` record per row",
    "(open, with its `cause`, or fixed / wontfix) to this file's frontmatter.",
    "",
    "## Findings",
    "",
    ...findingsTable(r.findings),
    "",
    "## What the readers were given",
    "",
    ...r.paragraphs.flatMap((p, i) => [
      `[${String(i + 1)}] (lines ${String(p.start)}–${String(p.end)}) ${p.text}`,
      "",
    ]),
    ...r.answers.flatMap(verbatim),
  ].join("\n");

/** The flags a run reads. */
interface Options {
  readonly paper: string;
  readonly base: string;
  readonly venue: string;
  readonly out: string | undefined;
  readonly macros: string | undefined;
  readonly max: number;
  readonly extractOnly: boolean;
}

/** A refusal: printed as one line, exit 2. */
class Refusal extends Error {}

const KNOWN = ["base", "venue", "out", "macros", "max", "extract-only"];

/** The command line as options, or a refusal naming what is wrong with it. */
export const optionsOf = (argv: readonly string[]): Options => {
  const pairs = argv
    .filter((a) => a.startsWith("--"))
    .map((a): [string, string] => {
      const at = a.indexOf("=");
      return at < 0 ? [a.slice(2), ""] : [a.slice(2, at), a.slice(at + 1)];
    });
  const unknown = pairs.filter(([k]) => !KNOWN.includes(k)).map(([k]) => k);
  if (unknown.length)
    throw new Refusal(`unknown flag(s) --${unknown.join(", --")}`);
  const files = argv.filter((a) => !a.startsWith("--"));
  if (files.length !== 1) throw new Refusal("name exactly one paper .tex file");
  const flags = new Map(pairs);
  const max = Number(flags.get("max") ?? DEFAULT_MAX);
  if (!Number.isInteger(max) || max < 1)
    throw new Refusal("--max takes a positive integer");
  return {
    paper: files[0] ?? "",
    base: flags.get("base") || "HEAD",
    venue: flags.get("venue") ?? "",
    out: flags.get("out"),
    macros: flags.get("macros"),
    max,
    extractOnly: flags.has("extract-only"),
  };
};

/** Everything a stream carries, as one string once it ends. */
const collect = (stream: NodeJS.ReadableStream): Promise<string> =>
  new Promise((done) => {
    const parts: Buffer[] = [];
    stream.on("data", (d: Buffer) => {
      parts.push(d);
    });
    stream.on("end", () => {
      done(Buffer.concat(parts).toString("utf8"));
    });
  });

/** How a child process ended: its exit code, or why it never ran. */
const exitOf = (
  child: ReturnType<typeof spawn>,
  cmd: string,
): Promise<{ code: number | null; failed: string }> =>
  new Promise((done) => {
    child.on("error", (e) => {
      done({ code: null, failed: `${cmd}: ${e.message}` });
    });
    child.on("close", (code) => {
      done({ code, failed: "" });
    });
  });

/** The process a reader runs as, its stdout and the first line of its stderr. */
const spawnReader = async (
  prompt: string,
  cwd: string,
): Promise<{
  code: number | null;
  out: string;
  err: string;
  failed: string;
}> => {
  const cmd = process.env["PAPERLINT_COLD_READ_READER"] || "claude";
  const child = spawn(
    cmd,
    ["-p", "--model", "sonnet", "--tools", "", "--output-format", "json"],
    { cwd, stdio: ["pipe", "pipe", "pipe"] },
  );
  const exited = exitOf(child, cmd);
  child.stdin.on("error", () => undefined);
  child.stdin.end(prompt);
  const [out, err, end] = await Promise.all([
    collect(child.stdout),
    collect(child.stderr),
    exited,
  ]);
  return { ...end, out, err: err.trim().split("\n")[0] ?? "" };
};

/** Run one reader from an empty directory with no tools; the prompt goes on stdin. */
const runReader = async (
  persona: string,
  prompt: string,
): Promise<ReaderAnswer> => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "cold-read-")));
  const t0 = Date.now();
  const run = await spawnReader(prompt, cwd);
  rmSync(cwd, { recursive: true, force: true });
  const ms = Date.now() - t0;
  const parsed = parseAnswer(run.out);
  const error =
    run.failed ||
    (run.code === 0
      ? parsed.error
      : `reader exited ${String(run.code)}: ${run.err}`);
  process.stderr.write(
    `cold read: ${persona} ${error ? `FAILED (${error})` : "done"} in ${secs(ms)} s\n`,
  );
  return { persona, ms, ...parsed, error };
};

const stamp = (d: Date): string =>
  d.toISOString().slice(0, 19).replace(/:/g, "").replace("T", "-");

/** The changed paragraphs `o` names, or a refusal saying why there is nothing to read. */
const paragraphsFor = (o: Options): Paragraph[] => {
  const paper = resolve(o.paper);
  if (!existsSync(paper)) throw new Refusal(`${o.paper} does not exist`);
  const macros = o.macros
    ? MacrosSchema.parse(JSON.parse(readFileSync(resolve(o.macros), "utf8")))
    : {};
  const diff = execFileSync(
    "git",
    ["diff", "-U0", "--no-color", o.base, "--", basename(paper)],
    { cwd: dirname(paper), encoding: "utf8" },
  );
  return checked(
    o,
    extract(readFileSync(paper, "utf8"), changedLines(diff), macros),
  );
};

/** `found`, unless it is empty or above the cap; warns of placeholders left unexpanded. */
const checked = (o: Options, found: Paragraph[]): Paragraph[] => {
  if (!found.length)
    throw new Refusal(`no changed prose in ${o.paper} since ${o.base}`);
  if (found.length > o.max)
    throw new Refusal(
      `${String(found.length)} changed paragraphs since ${o.base}, above the cap of ${String(o.max)}: ` +
        `narrow --base to fewer commits, or raise --max knowingly`,
    );
  found
    .flatMap((p) => p.unexpanded)
    .forEach((m) => {
      process.stderr.write(
        `cold read: warning — ${m} has no value; pass --macros\n`,
      );
    });
  return found;
};

/** Read, write the report, print the table. Returns the exit code. */
const read = async (o: Options, paragraphs: Paragraph[]): Promise<number> => {
  const asked = prompts(paragraphs, o.venue);
  process.stderr.write(
    `cold read: ${String(paragraphs.length)} paragraph(s), two readers started\n`,
  );
  const answers = await Promise.all([
    runReader("engineer", asked.engineer),
    runReader("reviewer", asked.reviewer),
  ]);
  const findings = findingsOf(answers);
  const paper = resolve(o.paper);
  const out = o.out
    ? resolve(o.out)
    : join(dirname(paper), "reviews", `${stamp(new Date())}-cold-read-diff.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    reportOf({ ...o, paper: basename(paper), paragraphs, answers, findings }),
  );
  process.stdout.write(
    `${summary(findings, paragraphs, relative(process.cwd(), out))}\n`,
  );
  return answers.some((a) => a.error) ? 1 : 0;
};

/** The command. Returns its exit code; a refusal is one line on stderr and exit 2. */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    const o = optionsOf(argv);
    const paragraphs = paragraphsFor(o);
    if (!o.extractOnly) return await read(o, paragraphs);
    process.stdout.write(`${prompts(paragraphs, o.venue).engineer}\n`);
    return 0;
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    process.stderr.write(`cold read: ${e.message}\n`);
    return 2;
  }
}
