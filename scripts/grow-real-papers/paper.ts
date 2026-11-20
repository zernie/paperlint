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

/**
 * The preset a paper is linted against: the edition's when paperlint ships it, else the family of
 * its style or class, else none (a named venue, so no venue rule applies).
 */
export function presetFor(
  slot: Pick<Slot, "series" | "year">,
  p: Preamble,
  style: string | undefined,
  shipped: ReadonlySet<string>,
): Readonly<{ preset: string | null; why: string }> {
  const alias: Readonly<Record<string, string>> = {
    "acm-ccs": "ccs",
    "ieee-s-p": "sp",
  };
  const edition = `${alias[slug(slot.series)] ?? slug(slot.series)}-${String(slot.year)}`;
  if (shipped.has(edition))
    return {
      preset: `paperlint:${edition}`,
      why: `the shipped edition preset ${edition}`,
    };
  const family = FAMILIES.find(([re]) => re.test(style ?? ""));
  if (family !== undefined)
    return { preset: `paperlint:${family[1]}`, why: family[2] + NONE };
  if (p.cls === "acmart") {
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
  }
  if (p.cls === "IEEEtran" && p.clsOpts.includes("conference"))
    return {
      preset: "paperlint:ieee-conference",
      why: `the IEEE conference family${NONE}`,
    };
  return {
    preset: null,
    why: "no preset ships for this edition and no template family matches the class: no `extends`, as arxiv-papers does for such papers, but with the accepted cycle",
  };
}

const pair = (r: string): string => {
  const [from, to] = r.split(" to ");
  return `\`${String(from)}\` to \`${String(to)}\``;
};

/** Everything the collector writes for one kept paper. */
export type KeptPaper = Readonly<{
  id: string;
  /** Path inside the paper's directory → its bytes or text. */
  files: ReadonlyMap<string, Uint8Array | string>;
  entry: Readonly<Record<string, unknown>>;
  note: Readonly<Record<string, unknown>>;
}>;

export function keptPaper(k: {
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
}): KeptPaper {
  const { c, slot, plan, preamble: p } = k;
  const { preset, why } = presetFor(slot, p, k.style, k.shipped);
  const absUrl = `https://arxiv.org/abs/${c.id}`;
  const venue = `${slot.series} ${String(slot.year)}${k.track === null ? "" : ` (${k.track})`}`;
  const cycle = {
    id: `${slug(slot.series)}-${String(slot.year)}${k.track === null ? "" : "-findings"}`,
    venue:
      preset === null
        ? { kind: "named", name: venue, url: absUrl }
        : { kind: "preset", extends: preset },
    opened: c.updated,
    outcome: { kind: "accepted", date: c.updated, evidence: "README.md" },
  };
  const quote =
    c.s2 === undefined
      ? [c.comment, c.journal_ref && `journal-ref: ${c.journal_ref}`]
          .filter(Boolean)
          .join(" | ")
      : `Semantic Scholar venue listing: venue "${c.s2.venue}", year ${String(slot.year)}, publication date ${c.s2.publicationDate ?? "not given"}${c.comment ? `; arXiv comment: ${c.comment}` : ""}`;
  const style =
    k.style === undefined
      ? ""
      : `, **style package:** \`${k.style}${k.styleOpts ? `[${k.styleOpts}]` : ""}\``;
  const evidence =
    c.s2 === undefined
      ? `The arXiv comment of [${c.id}](${absUrl}) says: «${quote}»`
      : `Semantic Scholar's venue listing (the proceedings) holds [${c.id}](${absUrl}) — acceptance evidence without comment wording — query \`${c.query}\`: «${quote}»`;
  const changed = [
    plan.renames.length > 0 ? "Renamed" : "Nothing renamed",
    plan.edits.length > 0
      ? ", one thing changed inside"
      : ", nothing inside changed",
  ].join("");
  const changes = [
    plan.renames.length > 0
      ? plan.renames.map(pair).join(", ")
      : "the main file was already paper.tex",
    ...plan.edits.map(pair),
  ].join("; ");
  const readme = `# ${c.title}

- **Authors:** ${c.authors.join(", ")}
- **Source:** arXiv [${c.id}](${absUrl}), e-print \`https://arxiv.org/src/${c.id}\` (sha256 \`${k.sourceSha}\`)
- **Category:** ${c.category}; **document class:** \`[${p.clsOpts}]{${String(p.cls)}}\`${style}
- **Licence:** [${k.licence.name}](${k.licence.url}), as the arXiv abstract page states. The files are redistributed under it.
- **Accepted at:** ${venue}. ${evidence}
- **Linted as:** ${preset === null ? "no preset (`extends` left out)" : `\`${preset}\``}, the camera-ready of an accepted attempt (${why})
- **Text sources only, figures omitted.** Kept: \`.tex\`, \`.bib\`, \`.bbl\`, \`.cls\`, \`.sty\`, \`.bst\`, \`.cfg\`, \`.def\`, each at its path from the archive's root, where arXiv compiles. Dropped: images, PDFs, data.
- **${changed}:** ${changes}.
- **Ours:** \`paperlint.json\`, \`PIPELINE-STATUS.md\`, \`record-by-hand.json\`, \`baseline.json\`, \`README.md\`.

\`paperlint.json\` records one attempt, accepted, whose evidence is this file. Its dates are those of the arXiv version that states the acceptance: the real decision day is earlier and not known here. \`record-by-hand.json\` is NOT TeX's answer: it lists \`paper.tex\`, the class and style files at the root, then the \`\\input\`/\`\\include\` files in the order the source names them, hashed over the bytes here. See [\`../README.md\`](../README.md).
`;
  const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
  const source = c.s2 === undefined ? "arxiv-comment" : "semantic-scholar";
  return {
    id: c.id,
    files: new Map<string, Uint8Array | string>([
      ...plan.staged.map((f) => [f.path, f.bytes] as const),
      ["record-by-hand.json", json(recordOf(plan.staged))],
      ["PIPELINE-STATUS.md", "---\nstages: []\n---\n# PIPELINE-STATUS\n"],
      ["paperlint.json", json({ cycles: [cycle] })],
      ["README.md", readme],
    ]),
    entry: {
      arxiv_id: c.id,
      license: k.licence.key,
      source_sha256: k.sourceSha,
      main_tex: `./${plan.main}`,
      class: p.cls,
      category: c.category,
      size_bytes: plan.size,
      dir: c.id,
      accepted: { quote, url: absUrl, venue },
      preset,
      kind: null,
      field: slot.field,
      series: slot.series,
      year: slot.year,
      ...(k.track === null ? {} : { track: k.track }),
      source,
      acceptance: c.s2 === undefined ? "arxiv-comment" : "s2-venue-listing",
    },
    note: {
      clsOpts: p.clsOpts,
      style: k.style ?? null,
      styleOpts: k.styleOpts ?? null,
      mainCandidates: plan.mainCandidates,
      presetWhy: why,
      edits: plan.edits,
      renames: plan.renames,
      title: c.title,
      ...(c.s2 === undefined
        ? {}
        : {
            versionNote:
              c.s2.publicationDate !== null && c.updated < c.s2.publicationDate
                ? `latest arXiv version (${c.updated}) predates the venue date (${c.s2.publicationDate}); kept the latest version`
                : `latest arXiv version ${c.updated}; venue date ${c.s2.publicationDate ?? "not given"}`,
          }),
    },
  };
}
