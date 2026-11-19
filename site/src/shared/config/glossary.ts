// What the page's jargon means, in one line each, for a scientist who has not met the word. Each
// line is checked against README.md and docs/ in the pass that writes it.

export const glossary = {
  deskReject:
    "A rejection by the chairs before any reviewer reads the paper, often for breaking the venue's format or page limit.",
  doubleBlind:
    "Reviewers do not learn who wrote the paper, so the PDF must not show the authors' names.",
  cameraReady:
    "The final version of an accepted paper, the one that goes into the proceedings.",
  preset:
    "One small file that holds a venue's format and page limits. Your paper names its venue once, and every check reads it from there.",
  nodejs:
    "The program paperlint runs on, version 22.13 or newer. You install it once, from nodejs.org.",
  texLive: "The usual LaTeX distribution, which turns paper.tex into a PDF.",
} as const;
