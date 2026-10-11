/**
 * pdf/venue-shape — the built paper's shape (words before the references, figures, tables, abstract
 * words, references) against the shape of its venue's accepted papers, measured into the preset's
 * `shape` block by `scripts/measure-venue-shape.ts` with the same counter (src/domain/venue-shape.ts).
 *
 * OPTIONAL and a WARNING: a preset that carries a `shape` turns it on for its papers; a paper turns
 * it off in its own paperlint.json. It reports and proposes; it never edits the paper — which of the
 * differences matter is the author's call, and a quarter of the accepted papers sit past each
 * quartile by construction. Every message names the venue's numbers and where they came from.
 *
 * Loud where it cannot judge, never a clean pass over nothing: a preset without `shape` (`noShape`),
 * a measure the paper's PDF does not let the counter read (`unmeasured`), a measure too few of the
 * venue's papers carry (`thin`). Not built, or built against another PDF: `pdf/measured` and
 * `pdf/fresh` already speak, and this rule is silent.
 */
import {
  DEFAULT_ABSTRACT_FACTOR,
  judgeShape,
  MIN_PAPERS,
  shapeOf,
  SHAPE_MEASURES,
  type Distribution,
  type ShapeFinding,
  type ShapeMeasure,
  type ShapeOptions,
  type VenueShape,
} from "./domain/venue-shape.ts";
import { fieldOf } from "./domain/record.ts";

/** One finding, as the venue rules report them (`Finding` in venue-rules.ts). */
interface Finding {
  readonly messageId: string;
  readonly data: Readonly<Record<string, string | number>>;
}

/** What each measure is called in a message. */
const WHAT: Readonly<Record<ShapeMeasure, string>> = {
  body_words: "words before the references",
  figures: "figures (numbered captions)",
  tables: "tables (numbered captions)",
  abstract_words: "words in the abstract",
  references: "numbered references",
};

/** Why the counter could not read a measure in a PDF. Figures and tables are always counted. */
const WHY_UNMEASURED: Readonly<Record<ShapeMeasure, string>> = {
  body_words: "no line reads «References» or «Bibliography»",
  figures: "",
  tables: "",
  abstract_words:
    "no «Abstract» heading ended, on the first two pages, by «Index Terms», «Keywords», «CCS Concepts», «ACM Reference Format» or the introduction's heading",
  references:
    "no references heading, or no entry after it opening with a number in brackets — an author-year bibliography is not counted",
};

/** What the author might look at, per measure and side. A proposal, never an instruction. */
const HINT: Readonly<Record<ShapeMeasure, Record<"below" | "above", string>>> =
  {
    body_words: {
      below:
        "Worth checking that the method and the threats to validity are not described more briefly than the venue's readers expect.",
      above:
        "Denser than most accepted papers at the same page limit; detail that could move to the artifact or an appendix is one option, smaller type is not.",
    },
    figures: {
      below:
        "The venue's accepted papers show more of their results as figures; a table or a run of numbers that would read better as a plot is one place to look.",
      above:
        "More figures than most accepted papers; worth checking that each carries a result the text relies on.",
    },
    tables: {
      below:
        "Fewer tables than most accepted papers; worth checking that no comparison the reader needs is left in running text.",
      above:
        "More tables than most accepted papers; one that would read better as a figure, or belongs in the artifact, is one place to look.",
    },
    abstract_words: {
      below:
        "Shorter than most accepted abstracts; worth checking that it states the question, the method and the result.",
      above:
        "Longer than most accepted abstracts, which reviewers read first and skim.",
    },
    references: {
      below:
        "Fewer references than most accepted papers; worth checking that the related work covers the venue's own recent papers.",
      above:
        "More references than most accepted papers; fine where each is cited for a reason.",
    },
  };

/** A number as a message shows it: at most one decimal. */
const shown = (n: number): string => String(Math.round(n * 10) / 10);

/** The rule's options: which measures, and the abstract's factor. Unknown fields were refused by the schema. */
export function shapeOptionsOf(options: unknown): ShapeOptions {
  const measures = fieldOf(options, "measures");
  const factor = fieldOf(options, "abstractFactor");
  return {
    measures: Array.isArray(measures)
      ? SHAPE_MEASURES.filter((m) => measures.includes(m))
      : SHAPE_MEASURES,
    abstractFactor:
      typeof factor === "number" ? factor : DEFAULT_ABSTRACT_FACTOR,
  };
}

/** The venue's five numbers and source, as every `below`/`above` message names them. */
const venueData = (
  d: Distribution,
  shape: VenueShape,
): Readonly<Record<string, string | number>> => ({
  n: d.n,
  min: shown(d.min),
  q1: shown(d.q1),
  median: shown(d.median),
  q3: shown(d.q3),
  max: shown(d.max),
  source: shape.source,
  measured: shape.measured,
});

/** The words for the fence a measure is past. */
function boundOf(f: Outside, factor: number): string {
  if (f.bound === "factor")
    return f.side === "above"
      ? `${shown(factor)} × the median`
      : `the median ÷ ${shown(factor)}`;
  return f.side === "above" ? "the upper quartile" : "the lower quartile";
}

type Outside = Extract<ShapeFinding, { readonly kind: "outside" }>;

/** A measure past its fence, as a message: the paper's number, the venue's, a caveat, a proposal. */
const outsideOf = (
  f: Outside,
  shape: VenueShape,
  venue: string,
  factor: number,
): Finding => ({
  messageId: f.side,
  data: {
    what: WHAT[f.measure],
    got: f.got,
    venue,
    bound: boundOf(f, factor),
    fence: shown(f.fence),
    caveat:
      f.bound === "factor"
        ? "The factor is a choice (the rule's `abstractFactor` option)"
        : "A quarter of accepted papers sit past each quartile",
    hint: HINT[f.measure][f.side],
    ...venueData(f.dist, shape),
  },
});

/** One domain finding as a message. */
function findingOf(
  f: ShapeFinding,
  shape: VenueShape,
  venue: string,
  factor: number,
): Finding {
  switch (f.kind) {
    case "outside":
      return outsideOf(f, shape, venue, factor);
    case "unmeasured":
      return {
        messageId: "unmeasured",
        data: { what: WHAT[f.measure], venue, why: WHY_UNMEASURED[f.measure] },
      };
    case "thin":
      return {
        messageId: "thin",
        data: { what: WHAT[f.measure], venue, n: f.n, min: MIN_PAPERS },
      };
  }
}

/** The built paper's page texts against the venue's `shape`; `noShape` when the preset has none. */
export function judgeVenueShape(
  pages: readonly string[],
  shape: VenueShape | null,
  venue: string,
  options: unknown,
): readonly Finding[] {
  if (shape === null) return [{ messageId: "noShape", data: { venue } }];
  const o = shapeOptionsOf(options);
  return judgeShape(shapeOf(pages), shape, o).map((f) =>
    findingOf(f, shape, venue, o.abstractFactor),
  );
}

/** The two messages a measure past a fence prints; they differ only in the side. */
const OUTSIDE = (side: "below" | "above"): string =>
  `{{what}}: {{got}}, ${side} {{bound}} ({{fence}}) of {{venue}}'s accepted papers. Its {{n}} measured papers: lower quartile {{q1}}, median {{median}}, upper quartile {{q3}}, range {{min}}–{{max}} ({{source}}, measured {{measured}}). {{caveat}}, so this is a difference to weigh, not a requirement. {{hint}}`;

/** The rule's meta: its options and messages. */
export const VENUE_SHAPE_META = {
  type: "suggestion" as const,
  docs: {
    description:
      "the built paper's words, figures, tables, abstract and references fall within the range of its venue's accepted papers",
  },
  schema: [
    {
      type: "object",
      properties: {
        measures: {
          type: "array",
          items: { enum: [...SHAPE_MEASURES] },
          uniqueItems: true,
        },
        abstractFactor: { type: "number", minimum: 1 },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    below: OUTSIDE("below"),
    above: OUTSIDE("above"),
    unmeasured:
      "{{what}} could not be counted in this paper's PDF ({{why}}), so it was NOT compared with {{venue}}'s accepted papers",
    thin: "{{venue}}'s measured shape counts {{what}} on {{n}} accepted papers — fewer than {{min}}, too few for quartiles, so it was NOT compared. Add papers to the preset's `shape` (scripts/measure-venue-shape.ts in paperlint's repository)",
    noShape:
      "pdf/venue-shape is on, and {{venue}}'s preset carries no measured `shape`, so there is nothing to compare this paper with. Measure the venue's accepted papers into the preset (scripts/measure-venue-shape.ts in paperlint's repository), or turn the rule off",
  },
};
