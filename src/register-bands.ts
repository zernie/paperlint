/**
 * THE REGISTER RULES THAT MEASURE A BODY AGAINST ITS VENUE'S ACCEPTED PAPERS — each a rate per
 * 10,000 words, judged against the band the venue preset's anchors set (`src/domain/register.ts`):
 *
 *   tex/contrast-frames   warn  «X, not Y», «rather than», «instead of» … outside the band; above it,
 *                               each frame is reported where it stands
 *   tex/claim-emphasis    warn  claims set in bold inside a sentence outside the band; above it, each
 *                               is reported where it stands
 *   tex/relation-markers  warn  words naming how a sentence relates to the one before (because,
 *                               therefore, however, for example …) outside the band
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────
 * Reviewers called a paper "too informal" and "a blogpost". Its text differed from the accepted
 * papers of the venue's parent conference in exactly these three counts, each several times over
 * the anchors' range, while sentence length, contractions, questions and the second person did not
 * separate them. The measurements are on the rules' pages.
 *
 * ── TWO-SIDED, AND THE VENUE'S OWN ───────────────────────────────────────────────
 * Every rule judges both ends of its band: a rewrite that strips every relation marker is as far
 * from the venue as one that stacks contrast frames. The band is the venue preset's, derived from
 * its anchors, so a venue with other accepted papers gets another band, and a preset without
 * anchors is not judged — there is nothing to compare, as `tex/template` is silent for a preset that
 * names no template. A body under `MIN_WORDS` is not judged either: one sentence would decide it.
 */
import { basename, dirname } from "node:path";
import {
  bandOf,
  bodySentences,
  claimEmphasis,
  contrastFrames,
  rateOf,
  relationMarkers,
  wordsOf,
  type Band,
  type Occurrence,
  type RegisterMeasureName,
} from "./domain/register.ts";
import type { Emphasis, Passage, Span } from "./domain/tex-document.ts";
import type { LatexReader } from "./ports/latex.ts";
import { paperPreset } from "./presets.ts";
import { MIN_WORDS, startOf } from "./register.ts";
import { readPaper, reportInPaper } from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleContext,
  type TexRuleModule,
} from "./tex-venue-rules.ts";
import type { VenueRuleDeps } from "./venue-rules.ts";

/** What the three rules read: the preset store, and the LaTeX reader. */
export interface RegisterBandDeps extends VenueRuleDeps {
  readonly latex: LatexReader;
}

export type RegisterBandRuleName =
  "contrast-frames" | "claim-emphasis" | "relation-markers";

/** What one body measures for one rule: its words, the occurrences, where the body starts. */
export interface BodyMeasure {
  readonly words: number;
  readonly occurrences: readonly Occurrence[];
  readonly at: Span | null;
}

/** How a rate stands against a band. */
export type Standing = "below" | "within" | "above";

export const standingOf = (rate: number, band: Band): Standing =>
  rate < band.min ? "below" : rate > band.max ? "above" : "within";

const fixed = (n: number): string => n.toFixed(1);

/** How many examples a finding about the whole body quotes. */
const EXAMPLES = 3;

/** What every message about a body names: its count and rate, the band, the anchors' range, examples. */
function dataOf(
  m: BodyMeasure,
  band: Band,
  venue: string,
): Readonly<Record<string, string | number>> {
  return {
    count: m.occurrences.length,
    words: m.words,
    rate: fixed(rateOf(m.occurrences.length, m.words)),
    venue,
    min: fixed(band.min),
    max: fixed(band.max),
    anchors: band.anchors,
    anchorMin: fixed(band.anchorMin),
    anchorMax: fixed(band.anchorMax),
    examples: m.occurrences
      .slice(0, EXAMPLES)
      .map((o) => `«${o.sentence}»`)
      .join(", "),
  };
}

/**
 * A body against a band: nothing within it; outside it, one finding at the body's start naming the
 * count, the rate, the band and the anchors' range — and, above it when `each` is set, one finding
 * at every occurrence, so an editor shows the author where to rewrite.
 */
export function judgeBand(
  m: BodyMeasure,
  band: Band | null,
  venue: string,
  each: boolean,
): readonly Located[] {
  if (band === null || m.words < MIN_WORDS) return [];
  const standing = standingOf(rateOf(m.occurrences.length, m.words), band);
  if (standing === "within") return [];
  const data = dataOf(m, band, venue);
  const whole: Located = { messageId: standing, data, at: m.at };
  if (standing === "below" || !each) return [whole];
  const at = (o: Occurrence, i: number): Located => ({
    messageId: "each",
    data: { ...data, match: o.match, index: i + 1 },
    at: o.at,
  });
  return [whole, ...m.occurrences.map(at)];
}

/** The band words every message shares: the rate, and where the venue's anchors put it. */
const AGAINST =
  "{{rate}} per 10,000 words; {{venue}}'s {{anchors}} anchor papers measure {{anchorMin}}–{{anchorMax}}, and this rule warns outside {{min}}–{{max}}";

/** The body as the measures read it: its prose, and the phrases emphasised in it (read on demand). */
interface Body {
  readonly passages: readonly Passage[];
  readonly emphasis: () => readonly Emphasis[];
}

/** What each rule counts, how it reads the paper, and what it says. */
interface Measure {
  readonly name: RegisterMeasureName;
  readonly description: string;
  /** Above the band, report every occurrence where it stands. */
  readonly each: boolean;
  readonly count: (body: Body) => readonly Occurrence[];
  readonly messages: Readonly<Record<string, string>>;
}

const MEASURES: Readonly<Record<RegisterBandRuleName, Measure>> = {
  "contrast-frames": {
    name: "contrast_frames",
    description:
      "contrast frames («X, not Y», «rather than», «instead of») stay within the rate the venue's accepted papers show",
    each: true,
    count: (b) => contrastFrames(bodySentences(b.passages)),
    messages: {
      above: `{{count}} contrast frames («X, not Y», «not X but Y», «rather than», «instead of», «as opposed to») — ${AGAINST}. First: {{examples}}. Say what the thing is and why, with the evidence; keep a frame only where a reader would otherwise assume the rejected alternative`,
      below: `{{count}} contrast frames — ${AGAINST}. A rewrite may have dropped relations the argument needs: check that each claim still says what it is set against`,
      each: "contrast frame «{{match}}» ({{index}} of {{count}}; the body is at {{rate}} per 10,000 words, above {{venue}}'s {{max}})",
    },
  },
  "claim-emphasis": {
    name: "claim_emphasis",
    description:
      "claims set in bold inside a sentence stay within the rate the venue's accepted papers show",
    each: true,
    count: (b) => claimEmphasis(b.emphasis()),
    messages: {
      above: `{{count}} claims set in bold inside a sentence (a bold phrase of six words or more, or holding a number) — ${AGAINST}. First: {{examples}}. Accepted papers set a term or a label in bold; take the bold off a finding and let the sentence, a table or a figure carry it`,
      below: `{{count}} claims set in bold inside a sentence — ${AGAINST}`,
      each: "a claim set in bold, «{{match}}» ({{index}} of {{count}}; the body is at {{rate}} per 10,000 words, above {{venue}}'s {{max}})",
    },
  },
  "relation-markers": {
    name: "relation_markers",
    description:
      "words that name how a sentence relates to the one before (because, therefore, however, for example) stay within the rate the venue's accepted papers show",
    each: false,
    count: (b) => relationMarkers(bodySentences(b.passages)),
    messages: {
      below: `{{count}} words name how a sentence relates to the one before (because, therefore, however, in contrast, for example, that is …) — ${AGAINST}. Where two sentences stand side by side, say whether the second is the cause, the consequence, an example or a limit of the first`,
      above: `{{count}} relation markers — ${AGAINST}. First: {{examples}}`,
    },
  },
};

/** What a body measures for a rule: its words, its occurrences, and where it starts. */
export function measureBody(
  rule: RegisterBandRuleName,
  src: string,
  latex: LatexReader,
): BodyMeasure {
  const passages = latex.bodyProse(src);
  const [first] = passages;
  const body: Body = { passages, emphasis: () => latex.bodyEmphasis(src) };
  return {
    words: wordsOf(bodySentences(passages)),
    occurrences: MEASURES[rule].count(body),
    at: first === undefined ? null : startOf(first),
  };
}

/** The findings for the paper whose `paper.tex` is `filename`; none when its preset has no anchors. */
function judgePaper(
  name: RegisterBandRuleName,
  context: TexRuleContext,
  deps: RegisterBandDeps,
): void {
  const p = paperPreset(dirname(context.filename), deps);
  if (p.kind !== "resolved") return;
  const measure = MEASURES[name];
  const band = bandOf(p.preset.registerAnchors, measure.name);
  if (band === null) return;
  const sc = context.sourceCode;
  const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
  const m = measureBody(name, paper.text, deps.latex);
  const findings = judgeBand(m, band, p.preset.label, measure.each);
  reportInPaper(context, measure.messages, paper, findings);
}

function rule(
  name: RegisterBandRuleName,
  deps: RegisterBandDeps,
): TexRuleModule {
  const measure = MEASURES[name];
  return {
    meta: {
      type: "suggestion",
      docs: { description: measure.description, url: ruleDocsUrl(name) },
      schema: [],
      messages: measure.messages,
    },
    create(context) {
      // Judged once per paper, on its paper.tex: the paper directory is the file's directory.
      if (basename(context.filename) !== "paper.tex") return {};
      return {
        root: () => {
          judgePaper(name, context, deps);
        },
      };
    },
  };
}

/** The three rules, as rules of the `tex` plugin. */
export function registerBandRules(
  deps: RegisterBandDeps,
): Readonly<Record<RegisterBandRuleName, TexRuleModule>> {
  return {
    "contrast-frames": rule("contrast-frames", deps),
    "claim-emphasis": rule("claim-emphasis", deps),
    "relation-markers": rule("relation-markers", deps),
  };
}

/** The level each rule is on at in paperlint's own config, for every `paper.tex`. */
export const REGISTER_BAND_RULE_LEVELS: Readonly<
  Record<`tex/${RegisterBandRuleName}`, "warn">
> = {
  "tex/contrast-frames": "warn",
  "tex/claim-emphasis": "warn",
  "tex/relation-markers": "warn",
};
