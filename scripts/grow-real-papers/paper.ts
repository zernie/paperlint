/**
 * What a kept paper becomes: its directory's files (the staged sources, `record-by-hand.json`,
 * `paperlint.json`, `PIPELINE-STATUS.md`, `README.md`), its `venue-manifest.json` entry, and its
 * `staging-notes.json` note. Pure: the collector hands the bytes it fetched, and gets back what to write.
 */
import { recordOf, type StagingPlan } from "./archive.ts";
import type { Preamble, Slot } from "./rules.ts";

/** One candidate paper, as the arXiv API (and, for a listing, Semantic Scholar) describes it. */
export type Candidate = Readonly<{
  id: string;
  updated: string;
  title: string;
  comment: string;
  journal_ref: string;
  category: string;
  authors: readonly string[];
  rank: number;
  query: string;
  /** Set when the candidate came from a Semantic Scholar venue listing. */
  s2?: Readonly<{ venue: string; publicationDate: string | null }>;
}>;

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const FAMILIES: readonly (readonly [RegExp, string, string])[] = [
  [/^(neurips|nips)_/, "neurips-style", "the NeurIPS style family"],
  [/^icml/, "icml-style", "the ICML style family"],
  [/^(acl|emnlp|naacl|eacl)/, "acl-latex", "the ACL style family"],
  [/^aaai/, "aaai-press", "the AAAI Press style family"],
];
const NONE = " as no preset ships for this edition";

type PresetChoice = Readonly<{ preset: string | null; why: string }>;
const ALIAS: Readonly<Record<string, string>> = {
  "acm-ccs": "ccs",
  "ieee-s-p": "sp",
};

/** The template family of an acmart or IEEEtran class, or null. */
const classFamily = (p: Preamble): PresetChoice | null => {
  if (p.cls === "IEEEtran" && p.clsOpts.includes("conference"))
    return {
      preset: "paperlint:ieee-conference",
      why: `the IEEE conference family${NONE}`,
    };
  if (p.cls !== "acmart") return null;
  const fmt = /acmsmall|sigconf/.exec(p.clsOpts)?.[0];
  return fmt === undefined
    ? {
        preset: null,
        why: `no preset: the class is acmart with format [${p.clsOpts}], which is neither the sigconf nor the acmsmall family, and no preset ships for this edition`,
      }
    : {
        preset: `paperlint:acm-${fmt}`,
        why: `the acmart ${fmt} family${NONE}`,
      };
};

/**
 * The preset a paper is linted against: the edition's when paperlint ships it, else the family of
 * its style or class, else none (a named venue, so no venue rule applies).
 */
export function presetFor(
  slot: Pick<Slot, "series" | "year">,
  p: Preamble,
  style: string | undefined,
  shipped: ReadonlySet<string>,
): PresetChoice {
  const edition = `${ALIAS[slug(slot.series)] ?? slug(slot.series)}-${String(slot.year)}`;
  if (shipped.has(edition))
    return {
      preset: `paperlint:${edition}`,
      why: `the shipped edition preset ${edition}`,
    };
  const family = FAMILIES.find(([re]) => re.test(style ?? ""));
  if (family !== undefined)
    return { preset: `paperlint:${family[1]}`, why: family[2] + NONE };
  return (
    classFamily(p) ?? {
      preset: null,
      why: "no preset ships for this edition and no template family matches the class: no `extends`, as arxiv-papers does for such papers, but with the accepted cycle",
    }
  );
}

const pair = (r: string): string => {
  const [from, to] = r.split(" to ");
  return `\`${String(from)}\` to \`${String(to)}\``;
};

/** Everything the collector writes for one kept paper. */
export type KeptPaper = Readonly<{
  id: string;
  /** Path inside the paper's directory, to its bytes or text. */
  files: ReadonlyMap<string, Uint8Array | string>;
  entry: Readonly<Record<string, unknown>> & Readonly<{ arxiv_id: string }>;
  note: Readonly<Record<string, unknown>>;
}>;

/** What the collector learned about a paper that passed rules 1 to 4. */
export type Kept = Readonly<{
  c: Candidate;
  slot: Slot;
  track: string | null;
  licence: Readonly<{ key: string; name: string; url: string }>;
  plan: StagingPlan;
  preamble: Preamble;
  style?: string;
  styleOpts?: string;
  sourceSha: string;
  shipped: ReadonlySet<string>;
}>;

const absUrl = (c: Candidate): string => `https://arxiv.org/abs/${c.id}`;
const venueOf = (k: Kept): string =>
  `${k.slot.series} ${String(k.slot.year)}${k.track === null ? "" : ` (${k.track})`}`;

/** The acceptance evidence quoted in the manifest: the comment, or the listing. */
const quoteOf = ({ c, slot }: Kept): string =>
  c.s2 === undefined
    ? [c.comment, c.journal_ref && `journal-ref: ${c.journal_ref}`]
        .filter(Boolean)
        .join(" | ")
    : `Semantic Scholar venue listing: venue "${c.s2.venue}", year ${String(slot.year)}, publication date ${c.s2.publicationDate ?? "not given"}${c.comment ? `; arXiv comment: ${c.comment}` : ""}`;

const changesOf = (plan: StagingPlan): string => {
  const head = `${plan.renames.length > 0 ? "Renamed" : "Nothing renamed"}${plan.edits.length > 0 ? ", one thing changed inside" : ", nothing inside changed"}`;
  const list = [
    plan.renames.length > 0
      ? plan.renames.map(pair).join(", ")
      : "the main file was already paper.tex",
    ...plan.edits.map(pair),
  ].join("; ");
  return `**${head}:** ${list}.`;
};

const readmeOf = (k: Kept, choice: PresetChoice): string => {
  const { c, preamble: p } = k;
  const style =
    k.style === undefined
      ? ""
      : `, **style package:** \`${k.style}${k.styleOpts ? `[${k.styleOpts}]` : ""}\``;
  const evidence =
    c.s2 === undefined
      ? `The arXiv comment of [${c.id}](${absUrl(c)}) says: «${quoteOf(k)}»`
      : `Semantic Scholar's venue listing (the proceedings) holds [${c.id}](${absUrl(c)}) — acceptance evidence without comment wording — query \`${c.query}\`: «${quoteOf(k)}»`;
  const linted =
    choice.preset === null
      ? "no preset (`extends` left out)"
      : `\`${choice.preset}\``;
  return `# ${c.title}

- **Authors:** ${c.authors.join(", ")}
- **Source:** arXiv [${c.id}](${absUrl(c)}), e-print \`https://arxiv.org/src/${c.id}\` (sha256 \`${k.sourceSha}\`)
- **Category:** ${c.category}; **document class:** \`[${p.clsOpts}]{${String(p.cls)}}\`${style}
- **Licence:** [${k.licence.name}](${k.licence.url}), as the arXiv abstract page states. The files are redistributed under it.
- **Accepted at:** ${venueOf(k)}. ${evidence}
- **Linted as:** ${linted}, the camera-ready of an accepted attempt (${choice.why})
- **Text sources only, figures omitted.** Kept: \`.tex\`, \`.bib\`, \`.bbl\`, \`.cls\`, \`.sty\`, \`.bst\`, \`.cfg\`, \`.def\`, each at its path from the archive's root, where arXiv compiles. Dropped: images, PDFs, data.
- ${changesOf(k.plan)}
- **Ours:** \`paperlint.json\`, \`PIPELINE-STATUS.md\`, \`record-by-hand.json\`, \`baseline.json\`, \`README.md\`.

\`paperlint.json\` records one attempt, accepted, whose evidence is this file. Its dates are those of the arXiv version that states the acceptance: the real decision day is earlier and not known here. \`record-by-hand.json\` is NOT TeX's answer: it lists \`paper.tex\`, the class and style files at the root, then the \`\\input\`/\`\\include\` files in the order the source names them, hashed over the bytes here. See [\`../README.md\`](../README.md).
`;
};

const cycleOf = (k: Kept, choice: PresetChoice) => ({
  id: `${slug(k.slot.series)}-${String(k.slot.year)}${k.track === null ? "" : "-findings"}`,
  venue:
    choice.preset === null
      ? { kind: "named", name: venueOf(k), url: absUrl(k.c) }
      : { kind: "preset", extends: choice.preset },
  opened: k.c.updated,
  outcome: { kind: "accepted", date: k.c.updated, evidence: "README.md" },
});

const entryOf = (k: Kept, choice: PresetChoice): KeptPaper["entry"] => ({
  arxiv_id: k.c.id,
  license: k.licence.key,
  source_sha256: k.sourceSha,
  main_tex: `./${k.plan.main}`,
  class: k.preamble.cls,
  category: k.c.category,
  size_bytes: k.plan.size,
  dir: k.c.id,
  accepted: { quote: quoteOf(k), url: absUrl(k.c), venue: venueOf(k) },
  preset: choice.preset,
  kind: null,
  field: k.slot.field,
  series: k.slot.series,
  year: k.slot.year,
  ...(k.track === null ? {} : { track: k.track }),
  source: k.c.s2 === undefined ? "arxiv-comment" : "semantic-scholar",
  acceptance: k.c.s2 === undefined ? "arxiv-comment" : "s2-venue-listing",
});

/** For a listed paper: whether the arXiv version kept predates the venue's date. */
const versionNote = (
  updated: string,
  s2: NonNullable<Candidate["s2"]>,
): string =>
  s2.publicationDate !== null && updated < s2.publicationDate
    ? `latest arXiv version (${updated}) predates the venue date (${s2.publicationDate}); kept the latest version`
    : `latest arXiv version ${updated}; venue date ${s2.publicationDate ?? "not given"}`;

const noteOf = (k: Kept, choice: PresetChoice) => ({
  clsOpts: k.preamble.clsOpts,
  style: k.style ?? null,
  styleOpts: k.styleOpts ?? null,
  mainCandidates: k.plan.mainCandidates,
  presetWhy: choice.why,
  edits: k.plan.edits,
  renames: k.plan.renames,
  title: k.c.title,
  ...(k.c.s2 === undefined
    ? {}
    : { versionNote: versionNote(k.c.updated, k.c.s2) }),
});

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

export function keptPaper(k: Kept): KeptPaper {
  const choice = presetFor(k.slot, k.preamble, k.style, k.shipped);
  return {
    id: k.c.id,
    files: new Map<string, Uint8Array | string>([
      ...k.plan.staged.map((f) => [f.path, f.bytes] as const),
      ["record-by-hand.json", json(recordOf(k.plan.staged))],
      ["PIPELINE-STATUS.md", "---\nstages: []\n---\n# PIPELINE-STATUS\n"],
      ["paperlint.json", json({ cycles: [cycleOf(k, choice)] })],
      ["README.md", readmeOf(k, choice)],
    ]),
    entry: entryOf(k, choice),
    note: noteOf(k, choice),
  };
}
