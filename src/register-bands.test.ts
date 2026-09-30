/**
 * The register band rules on REAL papers — the accepted ones in `fixtures/accepted-papers/`, and
 * variants derived from their sources, one change each:
 *
 * - every anchor the AIDC preset records is re-measured from its fixture and must equal the preset's
 *   numbers, so a counter cannot change without the anchors (and so the band) changing with it;
 * - every accepted ACSAC paper stands inside AIDC's band on every measure — a rule that fires on a
 *   paper the venue accepted is wrong about the venue;
 * - a variant that adds contrast frames, sets numbers in bold, or strips the relation markers from
 *   one of those papers leaves the band on exactly that measure.
 *
 * `judgeBand` itself, on constructed measures: both ends, the floor of words, and what it reports.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { nodeFiles } from "./adapters/node/index.ts";
import {
  bandOf,
  rateOf,
  REGISTER_MEASURES,
  type Band,
  type RegisterAnchor,
  type RegisterMeasureName,
} from "./domain/register.ts";
import { presetsDir } from "./package-dirs.ts";
import { resolvePreset } from "./presets.ts";
import { MIN_WORDS } from "./register.ts";
import { anchorOf, judgeBand, standingOf } from "./register-bands.ts";
import { readPaper } from "./tex-paper.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CORPUS = join(ROOT, "fixtures", "accepted-papers");

/** The AIDC preset, resolved as a paper extending it would resolve it. */
const aidc = (() => {
  const r = resolvePreset(
    "paperlint:aidc",
    join(ROOT, "papers", "p", "paperlint.json"),
    { files: nodeFiles, venuesDir: presetsDir() },
  );
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
})();

/** A fixture paper's text, its includes spliced, as the rules read it. */
const sourceOf = (paper: string): string => {
  const file = join(CORPUS, paper, "paper.tex");
  return readPaper(file, readFileSync(file, "utf8"), {
    files: nodeFiles,
    latex: latexReader,
  }).text;
};

const measured = new Map<string, RegisterAnchor>();
/** A fixture paper measured the way an anchor is (cached: each parse costs a second). */
const anchorFor = (paper: string, src = sourceOf(paper)): RegisterAnchor => {
  const key = `${paper}\n${src}`;
  const hit = measured.get(key);
  if (hit) return hit;
  const a = anchorOf(paper, src, latexReader);
  measured.set(key, a);
  return a;
};

/** Where each measure of a paper stands against AIDC's band. */
const standings = (
  a: RegisterAnchor,
): Readonly<Record<RegisterMeasureName, string>> => {
  const at = (m: RegisterMeasureName): string => {
    const band = bandOf(aidc.registerAnchors, m);
    return band === null
      ? "no band"
      : standingOf(rateOf(a.counts[m], a.words), band);
  };
  return {
    contrast_frames: at("contrast_frames"),
    claim_emphasis: at("claim_emphasis"),
    relation_markers: at("relation_markers"),
  };
};

const WITHIN = {
  contrast_frames: "within",
  claim_emphasis: "within",
  relation_markers: "within",
};

const ACSAC = readdirSync(CORPUS).filter((d) => /acsac\d\d$/u.test(d));

/** Parsing a real paper takes a second or more, several under coverage with every suite running. */
const PAPER_TIMEOUT_MS = 60_000;

describe("AIDC's anchors are the accepted ACSAC papers, as the counters measure them today", () => {
  it("🔴 the preset records every ACSAC paper of the corpus, and nothing else", () => {
    expect(aidc.registerAnchors.map((a) => a.paper).sort()).toEqual(
      [...ACSAC].sort(),
    );
  });

  it.each(aidc.registerAnchors.map((a) => [a.paper, a] as const))(
    "🔴 %s: words and every count equal the fixture's, re-measured",
    { timeout: PAPER_TIMEOUT_MS },
    (paper, recorded) => {
      expect(anchorFor(paper)).toEqual(recorded);
    },
  );
});

describe("every accepted ACSAC paper stands inside AIDC's band on every measure", () => {
  it.each(ACSAC)("%s", { timeout: PAPER_TIMEOUT_MS }, (paper) => {
    expect(standings(anchorFor(paper))).toEqual(WITHIN);
  });
});

/** `src` with the first `n` matches of `re` after `\begin{document}` rewritten by `to`. */
function inBody(
  src: string,
  re: RegExp,
  to: (match: string) => string,
  n: number,
): string {
  const start = src.indexOf("\\begin{document}");
  const matches = new Set(
    [...src.slice(start).matchAll(re)].slice(0, n).map((m) => m.index + start),
  );
  return src.replace(re, (m: string, ...rest: readonly unknown[]) => {
    const at = rest.find((x) => typeof x === "number");
    return typeof at === "number" && matches.has(at) ? to(m) : m;
  });
}

/** The markers `tex/relation-markers` counts, as a writer who leaves the relation to the reader drops them. */
const ADVERBIAL =
  /\b(?:however|therefore|thus|hence|consequently|as a result|in contrast|specifically|for example|for instance|in particular),\s*/giu;

describe("variants of real accepted papers, one change each, leave the band on that measure only", () => {
  it(
    "🔴 secure-acsac24 with a contrast frame after 20 mentions of the model: contrast frames above",
    { timeout: PAPER_TIMEOUT_MS },
    () => {
      const src = inBody(
        sourceOf("secure-acsac24"),
        /\bthe model\b/gu,
        () => "the model, not the prompt",
        20,
      );
      expect(standings(anchorFor("secure-acsac24", src))).toEqual({
        ...WITHIN,
        contrast_frames: "above",
      });
    },
  );

  it(
    "🔴 llm-splained-acsac25 with its first 20 percentages set in bold: claims in bold above",
    { timeout: PAPER_TIMEOUT_MS },
    () => {
      const src = inBody(
        sourceOf("llm-splained-acsac25"),
        /\b\d+(?:\.\d+)?\\%/gu,
        (m) => `\\textbf{${m}}`,
        20,
      );
      expect(standings(anchorFor("llm-splained-acsac25", src))).toEqual({
        ...WITHIN,
        claim_emphasis: "above",
      });
    },
  );

  it(
    "🔴 rr-dataset-quality-acsac24 with its relations left to the reader: relation markers below",
    { timeout: PAPER_TIMEOUT_MS },
    () => {
      // One change: the sentence adverbials that name a relation are dropped, and «because» becomes
      // «as» — the same claims, the relation between them no longer named.
      const dropped = inBody(
        sourceOf("rr-dataset-quality-acsac24"),
        ADVERBIAL,
        () => "",
        Number.POSITIVE_INFINITY,
      );
      const src = inBody(
        dropped,
        /\bbecause\b/gu,
        () => "as",
        Number.POSITIVE_INFINITY,
      );
      expect(standings(anchorFor("rr-dataset-quality-acsac24", src))).toEqual({
        ...WITHIN,
        relation_markers: "below",
      });
    },
  );
});

describe("judgeBand — a body's rate against a band", () => {
  const band: Band = {
    min: 20,
    max: 10_000 * (5 / MIN_WORDS),
    anchorMin: 30,
    anchorMax: 20,
    anchors: 5,
  };
  const occurrence = (i: number) => ({
    match: `m${String(i)}`,
    sentence: `s${String(i)}`,
    at: { start: i, end: i + 1 },
  });
  const body = (n: number, words = MIN_WORDS) => ({
    words,
    occurrences: Array.from({ length: n }, (_, i) => occurrence(i)),
    at: { start: 0, end: 1 },
  });
  const ids = (n: number, each = true, words = MIN_WORDS) =>
    judgeBand(body(n, words), band, "aidc", each).map((f) => f.messageId);

  it("inside the band, including its edges, nothing", () => {
    expect(ids(5)).toEqual([]);
    expect(ids(4)).toEqual([]);
  });

  it("🔴 above it: one finding for the body, then one at every occurrence", () => {
    expect(ids(6)).toEqual([
      "above",
      ...Array.from({ length: 6 }, () => "each"),
    ]);
    expect(ids(6, false)).toEqual(["above"]);
  });

  it("🔴 below it: one finding for the body, never one per occurrence", () => {
    expect(ids(3)).toEqual(["below"]);
  });

  it("under the floor of words, or without a band, nothing", () => {
    expect(ids(1, true, MIN_WORDS - 1)).toEqual([]);
    expect(judgeBand(body(99), null, "aidc", true)).toEqual([]);
  });

  it("the finding names the count, the rate, the band, the anchors' range and the first examples", () => {
    const [f] = judgeBand(body(6), band, "aidc", true);
    expect(f?.data).toMatchObject({
      count: 6,
      rate: "30.0",
      min: "20.0",
      max: "25.0",
      anchors: 5,
      venue: "aidc",
      examples: "«s0», «s1», «s2»",
    });
  });
});

describe("the measures a preset may set a band for", () => {
  it("each of them is recorded for every anchor", () => {
    aidc.registerAnchors.forEach((a) => {
      expect(Object.keys(a.counts).sort()).toEqual(
        [...REGISTER_MEASURES].sort(),
      );
    });
  });
});
