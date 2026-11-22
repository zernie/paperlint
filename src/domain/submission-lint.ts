import { partition } from "remeda";
import type { PaperSource, Segment } from "./paper-source.ts";
import type { Outline, Span } from "./tex-document.ts";

export interface LintFinding {
  readonly file: string;
  readonly severity: 1 | 2;
  readonly line?: number | undefined;
  readonly column?: number | undefined;
  readonly ruleId: string | null;
  readonly message: string;
  readonly fatal?: boolean | undefined;
}

export interface SubmissionLint {
  readonly errors: readonly LintFinding[];
  readonly warnings: readonly LintFinding[];
  readonly abstractWarnings: readonly LintFinding[];
  readonly introductionWarnings: readonly LintFinding[];
}

export interface PaperSections {
  readonly paper: PaperSource;
  readonly abstract: Span | null;
  readonly outline: Outline;
}

const introductionNames: ReadonlySet<string> = new Set([
  "introduction",
  "intro",
]);

function introductionOf({ sections, backMatter, end }: Outline): Span | null {
  const headings = sections.flatMap(({ place, title }) =>
    place.kind === "at" ? [{ start: place.span.start, title }] : [],
  );
  const at = headings.findIndex(({ title }) =>
    introductionNames.has(title.toLowerCase().split(" ")[0] ?? ""),
  );
  const heading = headings[at];
  if (heading === undefined) return null;
  return {
    start: heading.start,
    end: Math.min(
      headings[at + 1]?.start ?? Infinity,
      backMatter ?? end ?? Infinity,
    ),
  };
}

function offsetOf(
  source: string,
  { line, column }: LintFinding,
): number | null {
  if (line === undefined || line < 1) return null;
  const lines = source.split("\n");
  if (line > lines.length) return null;
  return (
    lines
      .slice(0, line - 1)
      .reduce((offset, text) => offset + text.length + 1, 0) +
    (column ?? 1) -
    1
  );
}

const contains = ({ start, end }: Span, offset: number): boolean =>
  start <= offset && offset < end;

const onlySectionText = (text: string, section: Span, s: Segment): boolean =>
  !text.slice(s.start, Math.min(s.end, section.start)).trim() &&
  !text.slice(Math.max(s.start, section.end), s.end).trim();

/** Given ESLint's structured location, recover the assembled position or its outer include. */
function inSection(
  paper: PaperSource,
  finding: LintFinding,
  section: Span,
): boolean {
  const source = paper.segments.find((s) => s.file === finding.file)?.source;
  const offset = source === undefined ? null : offsetOf(source, finding);
  if (offset === null) return false;
  const included = paper.segments.filter(
    (s) =>
      finding.file === paper.main && s.via !== null && contains(s.via, offset),
  );
  // An include can hold more than one section. Its anchor alone cannot decide which warned.
  if (included.length > 0)
    return (
      included.some((s) => s.start < section.end && s.end > section.start) &&
      included.every((s) => onlySectionText(paper.text, section, s))
    );
  return paper.segments.some(
    (s) =>
      s.file === finding.file &&
      offset >= s.from &&
      offset < s.from + s.end - s.start &&
      contains(section, s.start + offset - s.from),
  );
}

export function submissionLint(
  findings: readonly LintFinding[],
  sections: PaperSections | null,
): SubmissionLint {
  const [warnings, errors] = partition(findings, (m) => m.severity === 1);
  const inSpan = (span: Span | null) =>
    sections === null || span === null
      ? []
      : warnings.filter((m) => inSection(sections.paper, m, span));
  return {
    errors,
    warnings,
    abstractWarnings: inSpan(sections?.abstract ?? null),
    introductionWarnings: inSpan(
      sections === null ? null : introductionOf(sections.outline),
    ),
  };
}

export const lintFindingLine = (m: LintFinding): string => {
  const place = m.line
    ? `${m.file}:${String(m.line)}:${String(m.column ?? 1)}`
    : m.file;
  return `${place}${m.ruleId === null ? "" : ` ${m.ruleId}`} — ${m.message.trim()}`;
};

const count = (n: number, noun: string): string =>
  `${String(n)} ${noun}${n === 1 ? "" : "s"}`;

export const lintSummary = (lint: SubmissionLint): string =>
  `lint: ${count(lint.errors.length, "error")}, ${count(lint.warnings.length, "warning")} (abstract: ${String(lint.abstractWarnings.length)}, introduction: ${String(lint.introductionWarnings.length)})`;

const block = (
  title: string,
  findings: readonly LintFinding[],
): readonly string[] =>
  findings.length === 0
    ? []
    : [title, ...findings.map((m) => `  ${lintFindingLine(m)}`)];

export const lintReportLines = (lint: SubmissionLint): readonly string[] => [
  lintSummary(lint),
  ...block("Abstract warnings", lint.abstractWarnings),
  ...block("Introduction warnings", lint.introductionWarnings),
  ...block("Lint errors", lint.errors),
  ...block(
    "Other lint warnings",
    lint.warnings.filter(
      (m) =>
        !lint.abstractWarnings.includes(m) &&
        !lint.introductionWarnings.includes(m),
    ),
  ),
];

export const lintExceptionReason = (reason: string): string =>
  `Allow lint errors: ${JSON.stringify(reason.trim())}`;

export const lintExceptionLines = (
  lint: SubmissionLint,
  reason: string,
): readonly string[] => [
  lintExceptionReason(reason),
  ...lint.errors.map((m) => `  ${lintFindingLine(m)}`),
];
