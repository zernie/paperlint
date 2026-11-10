/**
 * cold-read-report.ts — the two readers' prompts, and what is done with their answers: the rows
 * parsed out of each answer's markdown table, the report file, the short table for the caller.
 * It calls no model. The prompts and the report were prose in `SKILL.md` that an agent rebuilt by
 * hand on every run; here they are the same every time, and tested.
 */
import MarkdownIt from "markdown-it";
import type { Paragraph } from "./cold-read-core.ts";

/** The readers, in the order they are asked and reported. */
export const READERS = ["engineer", "reviewer"] as const;
export type Reader = (typeof READERS)[number];

/** What both readers end with: the only shape `rowsOf` reads back. */
const ANSWER_FORMAT = `Reply with one markdown table, | ¶ | verdict | sentence | why |, one row per sentence that is not fine, the sentence quoted exactly; nothing else. No rows if every sentence reads.`;

const CLEVER = `A sentence that sounds clever but says less than it appears to is CLEVER.`;

/** The paragraphs as a reader gets them: numbered, one blank line apart, nothing else. */
export const numbered = (paragraphs: readonly Paragraph[]): string =>
  paragraphs.map((p, i) => `¶${String(i + 1)} ${p.text}`).join("\n\n");

/** Each reader's whole prompt: the persona, the questions, the answer format, the paragraphs. */
export const prompts = (
  paragraphs: readonly Paragraph[],
  venue: string,
): Readonly<Record<Reader, string>> => ({
  engineer: `You are a strong software engineer outside academia. Answer from the text below alone; use no tools. For every sentence: what does it claim, in your own words? If restating needs a guess, the verdict is CANNOT PARSE and "why" says what stopped you (an undefined term, a pronoun with no referent, a number with no denominator, two clauses that do not connect). Would a reader who stops here understand it? If only one who knows X would, the verdict is ONLY-IF, naming X. ${CLEVER}
${ANSWER_FORMAT}

${numbered(paragraphs)}`,
  reviewer: `You are a programme-committee member at ${venue || "a peer-reviewed workshop"}, with 40 minutes for a whole paper, skimming, Confidence 3. Answer from the text below alone; use no tools. For every sentence: whose result does it state — the authors' measurement, a cited work, or a property of the world? If you cannot tell, the verdict is WHOSE?. Does it read like a paper at this venue? If not, the verdict is REGISTER, and "why" says what a paper there would write instead (an aphorism, a fragment, a colloquial turn, two claims side by side with the relation unstated). ${CLEVER}
${ANSWER_FORMAT}

${numbered(paragraphs)}`,
});

/** One finding as a reader wrote it: one row of its table. */
export interface Row {
  readonly p: string;
  readonly verdict: string;
  readonly sentence: string;
  readonly why: string;
}

const md = new MarkdownIt();

/** The parse's state while it walks a table: the rows so far, the row being read, where it is. */
interface Walk {
  readonly rows: readonly (readonly string[])[];
  readonly row: readonly string[];
  readonly inBody: boolean;
}

/** One token of the markdown parse, folded into the walk. */
const step = (
  w: Walk,
  t: { readonly type: string; readonly content: string },
): Walk => {
  if (t.type === "tbody_open" || t.type === "tbody_close")
    return { ...w, inBody: t.type === "tbody_open" };
  if (!w.inBody) return w;
  if (t.type === "tr_open") return { ...w, row: [] };
  if (t.type === "tr_close") return { ...w, rows: [...w.rows, w.row] };
  return t.type === "inline" ? { ...w, row: [...w.row, t.content] } : w;
};

/** The text of each cell of each body row of every table in `markdown`, by the markdown parse. */
const bodyRows = (markdown: string): readonly (readonly string[])[] =>
  md.parse(markdown, {}).reduce(step, { rows: [], row: [], inBody: false })
    .rows;

/** The findings in a reader's answer, or null when the answer holds no four-column table. */
export const rowsOf = (answer: string): Row[] | null => {
  const rows = bodyRows(answer);
  if (rows.some((r) => r.length !== 4)) return null;
  if (rows.length === 0 && !answer.includes("|")) return null;
  return rows.map(([p = "", verdict = "", sentence = "", why = ""]) => ({
    p,
    verdict,
    sentence,
    why,
  }));
};

/** A reader's answer, as the report reads it: none, unreadable, or its rows. */
export type Answer =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable"; readonly text: string }
  | { readonly kind: "rows"; readonly text: string; readonly rows: Row[] };

/** `text` read as an answer; null is a reader that did not answer in time. */
export const answerOf = (text: string | null): Answer => {
  if (text === null) return { kind: "none" };
  const rows = rowsOf(text);
  return rows === null
    ? { kind: "unreadable", text }
    : { kind: "rows", text, rows };
};

/** A finding numbered across both readers, as the report and the table list it. */
export interface Finding extends Row {
  readonly id: number;
  readonly reader: Reader;
}

export const findingsOf = (
  answers: Readonly<Record<Reader, Answer>>,
): Finding[] =>
  READERS.flatMap((reader) => {
    const a = answers[reader];
    return a.kind === "rows" ? a.rows.map((r) => ({ reader, ...r })) : [];
  }).map((f, i) => ({ id: i + 1, ...f }));

const cell = (s: string): string => s.replaceAll("|", "\\|");
const clip = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** At most this many findings in the caller's table; the rest are counted, and in the report. */
const SHOWN = 10;

/** What a reader's answer was, in a word, when it gave no rows. */
const missing = (answers: Readonly<Record<Reader, Answer>>): string[] =>
  READERS.flatMap((r) => {
    const kind = answers[r].kind;
    return kind === "rows"
      ? []
      : [`${r}: ${kind === "none" ? "no answer" : "unreadable"}`];
  });

/** What the caller shows the author: at most 15 lines; the full answers are in the report. */
export const summary = (
  answers: Readonly<Record<Reader, Answer>>,
  paragraphs: number,
  path: string,
): string => {
  const findings = findingsOf(answers);
  const gaps = missing(answers);
  const head = `cold read: ${String(paragraphs)} paragraph(s), ${String(findings.length)} finding(s)${gaps.length ? ` (${gaps.join(", ")})` : ""} → ${path}`;
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
          `| ${String(f.id)} | ${f.reader} | ${cell(f.verdict)} | ${cell(clip(f.sentence, 70))} |`,
      ),
    ...(rest > 0 ? [`… and ${String(rest)} more in the report`] : []),
  ].join("\n");
};

const verbatim = (reader: Reader, a: Answer): string[] => [
  `## The ${reader}'s answer, verbatim`,
  "",
  ...(a.kind === "none"
    ? ["No answer within the time limit."]
    : ["````", a.text.trim(), "````"]),
  "",
];

/** The report's findings: one row each, or "None.". */
const findingsTable = (findings: readonly Finding[]): string[] =>
  findings.length
    ? [
        "| # | reader | ¶ | verdict | sentence | why |",
        "|---|---|---|---|---|---|",
        ...findings.map(
          (f) =>
            `| ${String(f.id)} | ${f.reader} | ${cell(f.p)} | ${cell(f.verdict)} | ${cell(f.sentence)} | ${cell(f.why)} |`,
        ),
      ]
    : ["None."];

/** The report file: the findings numbered, what the readers were given, each answer verbatim. */
export const reportOf = (r: {
  readonly paper: string;
  readonly base: string;
  readonly venue: string;
  readonly paragraphs: readonly Paragraph[];
  readonly answers: Readonly<Record<Reader, Answer>>;
}): string =>
  [
    `# Cold read — ${r.paper} (${r.base} to the working tree)`,
    "",
    `Readers: engineer, reviewer (venue: ${r.venue || "not named"}), each given only the paragraphs below.`,
    "No fix was applied. Once a finding is decided, add its record to this file's frontmatter",
    "(`findings:`, checked by `review/frontmatter`).",
    "",
    "## Findings",
    "",
    ...findingsTable(findingsOf(r.answers)),
    "",
    "## What the readers were given",
    "",
    numbered(r.paragraphs),
    "",
    ...READERS.flatMap((reader) => verbatim(reader, r.answers[reader])),
  ].join("\n");
