// The README's first lint output, one finding per line, each with the plain words a scientist who
// does not program reads first. The lines come from README.md at build time; the words here are
// keyed by rule id, so a README line whose rule has no words fails the build rather than showing
// raw output alone (site/CLAUDE.md, "Not Scary For Non Programmers").

export interface Explained {
  readonly rule: string;
  readonly level: "error" | "warning";
  readonly title: string;
  readonly plain: string;
  /** The line exactly as the README prints it, its leading indent removed. */
  readonly raw: string;
}

/** Plain words for each rule the README's first lint output shows, checked against the README and docs/rules.md. */
export const plainByRule: Readonly<
  Record<string, { readonly title: string; readonly plain: string }>
> = {
  "pdf/geometry": {
    title: "One column; AgenticDev needs two",
    plain:
      "The PDF is set in one column, and AgenticDev requires two. Switch to the venue's document class and build again.",
  },
  "pdf/fonts": {
    title: "The wrong body font",
    plain:
      "LaTeX fell back to Computer Modern (CMR10) instead of the Libertine font AgenticDev requires. Use the venue's template and build again.",
  },
  "paper/section-word": {
    title: "Write “Section”, not §",
    plain:
      "Line 8 uses the § sign where the word “Section” belongs. paperlint can rewrite it for you.",
  },
};

const LINE = /^\s*\d+:\d+\s+(error|warning)\s+(.*?)\s{2,}(\S+)\s*$/;

const fail = (message: string): never => {
  throw new Error(`site: ${message}`);
};

/** One README lint line, explained; throws on a line it cannot read or a rule it has no words for. */
export const explain = (line: string): Explained => {
  const m = LINE.exec(line) ?? fail(`not a lint line — «${line}»`);
  const level = m.slice(1, 2).join("");
  const rule = m.slice(3, 4).join("");
  const words =
    plainByRule[rule] ??
    fail(
      `no plain words for ${rule} — add them to site/src/entities/finding/model/explain.ts`,
    );
  return {
    rule,
    level: level === "warning" ? "warning" : "error",
    ...words,
    raw: line.trim(),
  };
};
