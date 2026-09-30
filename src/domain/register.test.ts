/**
 * The register measures on real parses: what counts as a contrast frame, a relation marker and a
 * claim in bold, and what does not; the band the anchors set; the excerpt a finding quotes.
 * Every "does not count" case below is a sentence shape found in an accepted ACSAC paper.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "../adapters/latex/index.ts";
import {
  bandOf,
  bodySentences,
  claimEmphasis,
  contrastFrames,
  excerpt,
  relationMarkers,
  type RegisterAnchor,
} from "./register.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
const sentencesOf = (body: string) =>
  bodySentences(latexReader.bodyProse(doc(body)));
const frames = (body: string): number =>
  contrastFrames(sentencesOf(body)).length;
const markers = (body: string): number =>
  relationMarkers(sentencesOf(body)).length;
const claims = (body: string): readonly string[] =>
  claimEmphasis(latexReader.bodyEmphasis(doc(body))).map((o) => o.match);

describe("contrastFrames — a claim set against a rejected alternative", () => {
  it.each([
    [
      "X, not Y",
      "They react to the dangerous word, not the dangerous operation.",
    ],
    ["X --- not Y", "It guarantees encryption --- not authenticity."],
    ["X; not Y", "We score the operation; not the attacker."],
    ["X, and not Y", "It reads the field, and not the raw input."],
    ["not X but Y", "Over-blocking is not a side metric but a precondition."],
    ["rather than", "It fires on the mention rather than the act."],
    ["instead of", "It reads the whole event instead of the command."],
    ["as opposed to", "It matches words as opposed to operations."],
  ])("🔴 %s is one frame", (_form, sentence) => {
    expect(frames(sentence)).toBe(1);
  });

  it.each([
    ["not only … but also", "It is not only fast but also exact."],
    [
      "a negated clause",
      "The nature of the audit is not reported, but it did not assess quality.",
    ],
    ["«, not yet»", "The fix is merged, not yet released."],
    [
      "«, not already in the corpus»",
      "We kept every guard published since, not already in the corpus.",
    ],
    ["«without»", "The attack works without any access to the device."],
    ["«unlike»", "Unlike prior work, we measure the installed guards."],
    ["a bare negation", "The guard does not block it."],
  ])("%s is no frame", (_form, sentence) => {
    expect(frames(sentence)).toBe(0);
  });

  it("two frames in one sentence are two; one phrase matching two forms is one", () => {
    expect(
      frames("It reads the word, not the act, rather than the operation."),
    ).toBe(2);
    expect(frames("It is not a word but rather than a verb.")).toBe(2);
  });

  it("a frame in a table, a caption or a heading is not prose, so not counted", () => {
    expect(
      frames(
        "\\section{Words, not operations}\n\\begin{table}\\caption{Words, not operations.}\\begin{tabular}{l}a, not b\\end{tabular}\\end{table}\nPlain text here.",
      ),
    ).toBe(0);
  });
});

describe("relationMarkers — words that name how a sentence relates to the one before", () => {
  it("🔴 each marker counts where it stands, sentence-initial or not", () => {
    expect(
      markers(
        "However, the rate is low. It fails because the rule matches words. For example, echo is blocked. It is therefore unsafe.",
      ),
    ).toBe(4);
  });

  it("a marker inside a longer word is not one: «thusly» is no «thus», «sincere» no «since»", () => {
    expect(
      markers("The sincere author wrote thusly. Eventually it held."),
    ).toBe(0);
  });
});

describe("claimEmphasis — a claim set in bold inside a sentence", () => {
  it("🔴 a bold phrase of six words or more, or holding a number, inside a sentence", () => {
    expect(
      claims(
        "We find that \\textbf{they react to the dangerous word}. The \\textbf{median coverage is 2.5/10} here.",
      ),
    ).toEqual([
      "they react to the dangerous word",
      "median coverage is 2.5/10",
    ]);
  });

  it("a term in bold, a label opening a paragraph or item, italics, and a run-in heading are not claims", () => {
    expect(
      claims(
        "BaroVox offers a \\textbf{Pressure-Acoustic Transformation (PAT)} here.\n\n\\textbf{Varying the orientation of the sound source from the device}. We vary it.\n\\begin{itemize}\n\\item \\textbf{A corpus of user security questions with sources}: we release it.\n\\end{itemize}\nWe \\emph{find that the guards react to the word}.\n\n\\textbf{Threats to validity of the 46 guards.} None.",
      ),
    ).toEqual([]);
  });
});

describe("bandOf — the anchors' range, widened by two Poisson standard deviations", () => {
  const anchor = (words: number, contrast_frames: number): RegisterAnchor => ({
    paper: "p",
    words,
    counts: { contrast_frames, claim_emphasis: 0, relation_markers: 0 },
  });

  it("🔴 the edges stand two standard deviations of the edge anchor's count beyond it", () => {
    // 4 in 10,000 words: rate 4, sd 2 → max 8. 1 in 10,000: rate 1, sd 1 → min 1 - 2 < 0 → 0.
    expect(
      bandOf([anchor(10_000, 4), anchor(10_000, 1)], "contrast_frames"),
    ).toEqual({ min: 0, max: 8, anchorMin: 1, anchorMax: 4, anchors: 2 });
  });

  it("an anchor with no occurrence is widened as if it had one; a floor above zero stays", () => {
    expect(bandOf([anchor(10_000, 0)], "contrast_frames")?.max).toBe(2);
    expect(bandOf([anchor(10_000, 100)], "contrast_frames")?.min).toBe(80);
  });

  it("no anchors, no band", () => {
    expect(bandOf([], "contrast_frames")).toBeNull();
  });
});

describe("excerpt — the words around an occurrence, as a finding quotes them", () => {
  it("the match with its neighbours, cut at a word, an ellipsis where the sentence goes on", () => {
    const s =
      "We score 46 gates and find that they react to the dangerous word, not the dangerous operation, in every one of the ten cases we built.";
    const at = s.indexOf(", not");
    expect(excerpt(s, at, at + 6)).toBe(
      "…that they react to the dangerous word, not the dangerous operation, in every one…",
    );
    expect(excerpt("a, not b", 1, 7)).toBe("a, not b");
  });
});
