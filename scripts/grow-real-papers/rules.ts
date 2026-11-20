/**
 * The selection rules of the accepted set (fixtures/real-papers/accepted/README.md, «How the papers
 * were chosen»), each a pure decision over text the collector already fetched: rule 1 the
 * acceptance wording, rule 2 the licence, rule 3 the class and style, rule 4 the size. No I/O.
 * `fixtures/real-papers/balance.ts` reads `LICENCES` and `PER_EDITION` from here, so the collector
 * and the balance test cannot disagree on them.
 */
import { z } from "zod";

/** At most this many papers per venue edition (series and year), over every manifest entry. */
export const PER_EDITION = 5;

/** At most this many bytes of text sources per paper. */
export const MAX_BYTES = 300_000;

/** The extensions kept from a source archive; everything else (figures, PDFs, data) is dropped. */
export const TEXT_EXT: ReadonlySet<string> = new Set([
  "tex",
  "bib",
  "bbl",
  "cls",
  "sty",
  "bst",
  "cfg",
  "def",
]);

const cc = (path: string, name: string) => ({
  name,
  url: `https://creativecommons.org/${path}`,
});

/** The licences a paper may be redistributed under, keyed as arXiv's metadata spells them. */
export const LICENCES: ReadonlyMap<
  string,
  Readonly<{ name: string; url: string }>
> = new Map([
  [
    "http://creativecommons.org/licenses/by/4.0/",
    cc("licenses/by/4.0/", "CC BY 4.0"),
  ],
  [
    "http://creativecommons.org/licenses/by-sa/4.0/",
    cc("licenses/by-sa/4.0/", "CC BY-SA 4.0"),
  ],
  [
    "http://creativecommons.org/publicdomain/zero/1.0/",
    cc("publicdomain/zero/1.0/", "CC0 1.0"),
  ],
]);

/** One venue edition of `queries.json`. */
export const SlotSchema = z.object({
  field: z.string(),
  series: z.string(),
  year: z.number(),
  cap: z.number(),
  queries: z.array(z.string()),
  max_results: z.number(),
  venue: z.string(),
  classSpec: z.string(),
  allowPoster: z.boolean().optional(),
  source: z.literal("semantic-scholar").optional(),
  s2Venue: z.string().optional(),
});
export type Slot = Readonly<z.infer<typeof SlotSchema>>;

/** What a rule says: kept, with what it learned, or rejected, with the reason the log records. */
export type Verdict<T extends object = object> =
  Readonly<{ ok: true } & T> | Readonly<{ ok: false; reason: string }>;

const no = (reason: string) => ({ ok: false, reason }) as const;

const POSITIVE =
  /accepted|to appear|will appear|appears? in|published (in|at)|camera[- ]?ready|to be presented|will be presented|spotlight|\boral\b|proceedings of/i;
const NEGATIVE =
  /submitted|under review|to be accepted|extended version|full version|long version|journal version|technical report|supplementary version|pending|extended abstract|late[- ]breaking|doctoral|student research|demo(nstration)? (track|paper)|tutorial|companion|workshop|\bSRW\b|demonstrations?|\bdemo\b|\bposter/gi;
const FINDINGS_SERIES = new Set(["ACL", "EMNLP", "NAACL", "EACL"]);

/** The first negative word of a comment (a poster is not one where the slot allows posters), or an «@ venue». */
const negativeWord = (
  text: string,
  slot: Pick<Slot, "venue" | "allowPoster">,
): string | undefined =>
  [...text.matchAll(NEGATIVE)]
    .map((m) => m[0])
    .find((n) => !(/^poster/i.test(n) && slot.allowPoster === true)) ??
  new RegExp(`@\\s*(?:${slot.venue})`, "i").exec(text)?.[0];

/**
 * Rule 1 on an arXiv comment and journal-ref: the slot's venue and year stand together, no
 * negative word (a poster passes where the slot allows posters), no workshop title naming the
 * venue, and a positive acceptance word. `track` is "Findings" for an ACL-family Findings paper.
 */
export function judgeComment(
  c: Readonly<{ comment: string; journal_ref: string }>,
  slot: Pick<Slot, "venue" | "series" | "year" | "allowPoster">,
): Verdict<{ track: string | null }> {
  const text = `${c.comment} | ${c.journal_ref}`;
  const yy = String(slot.year).slice(2);
  const near = new RegExp(
    `(?:${slot.venue})[^0-9]{0,14}(?:20)?${yy}(?![0-9])`,
    "i",
  );
  if (!near.test(text))
    return no(`comment does not state ${slot.series} ${String(slot.year)}`);
  const workshop = new RegExp(
    `[:–-]\\s*[^.]{5,}\\bat\\s+(?:${slot.venue})|proceedings of (?:the )?(?![^.]*(?:conference|symposium|meeting|annual))[^.]{8,}\\bat\\s*(?:${slot.venue})`,
    "i",
  ).exec(text);
  if (workshop !== null)
    return no(
      `not accepted wording: reads as a workshop title ("${workshop[0].slice(0, 60)}")`,
    );
  const said = negativeWord(text, slot);
  if (said !== undefined)
    return no(`not accepted wording: comment says "${said}"`);
  if (!POSITIVE.test(text))
    return no("not accepted wording: no acceptance statement");
  const findings = /findings/i.test(text) && FINDINGS_SERIES.has(slot.series);
  return { ok: true, track: findings ? "Findings" : null };
}

/** Rule 1 on a Semantic Scholar listing: the venue string names the main proceedings. */
export const judgeListedVenue = (venue: string): Verdict<{ track: null }> =>
  /workshop|companion|poster|demo|tutorial|doctoral/i.test(venue)
    ? no(`S2 venue string is not the main proceedings: "${venue}"`)
    : { ok: true, track: null };

/** Rule 2: the `<license>` of arXiv's OAI record, exactly one of `LICENCES`. */
export function judgeLicence(
  url: string | undefined,
): Verdict<{ key: string; name: string; url: string }> {
  const lic = url === undefined ? undefined : LICENCES.get(url);
  if (url !== undefined && lic !== undefined)
    return { ok: true, key: url, ...lic };
  return no(
    `licence ${url === undefined ? "arXiv default (none)" : url.replace(/^https?:\/\/(creativecommons|arxiv)\.org\//, "")}`,
  );
}

/** A LaTeX source with its `%` comments removed (an escaped `\%` stays). */
export const stripComments = (t: string): string =>
  t.replace(/(^|[^\\])%.*$/gm, "$1");

/** The first `\documentclass` of a main file, its options, and every package it loads. */
export type Preamble = Readonly<{
  cls: string | null;
  clsOpts: string;
  pkgs: readonly Readonly<{ name: string; opts: string }>[];
}>;

export function preambleOf(main: string): Preamble {
  const t = stripComments(main);
  const dc = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(t);
  const pkgs = [
    ...t.matchAll(
      /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g,
    ),
  ].flatMap((m) =>
    String(m[2])
      .split(",")
      .map((n) => ({ name: n.trim(), opts: m[1] ?? "" })),
  );
  const cls =
    dc === null
      ? null
      : String(dc[2])
          .trim()
          .replace(/^.*\//, "")
          .replace(/\.cls$/, "");
  return { cls, clsOpts: dc?.[1] ?? "", pkgs };
}

type ClassVerdict = Verdict<{ style?: string; styleOpts?: string }>;
type ClassSpec = (p: Preamble) => ClassVerdict;

const withStyle =
  (classes: readonly string[], style: RegExp, reviewOpts?: RegExp): ClassSpec =>
  (p) => {
    if (!classes.includes(p.cls ?? ""))
      return no(`class ${String(p.cls)}, not ${classes.join("/")}`);
    const hit = p.pkgs.find((x) => style.test(x.name));
    if (hit === undefined)
      return no(
        `class ${String(p.cls)} without the venue style package (${String(style)})`,
      );
    if (reviewOpts?.test(hit.opts) === true)
      return no(`style ${hit.name} in review/submission mode [${hit.opts}]`);
    return { ok: true, style: hit.name, styleOpts: hit.opts };
  };

const ofClass =
  (classes: readonly string[], reviewOpts?: RegExp): ClassSpec =>
  (p) => {
    if (!classes.includes(p.cls ?? ""))
      return no(`class ${String(p.cls)}, not ${classes.join("/")}`);
    if (reviewOpts?.test(p.clsOpts) === true)
      return no(`class ${String(p.cls)} in review mode [${p.clsOpts}]`);
    return { ok: true };
  };

/** The first spec that keeps the paper, or the first one's reason. */
const either =
  (first: ClassSpec, second: ClassSpec): ClassSpec =>
  (p) => {
    const a = first(p);
    const b = second(p);
    return a.ok ? a : b.ok ? b : a;
  };

/** Rule 3, per `classSpec` of `queries.json`: the class, and for ML/NLP/AI the style package. */
export const CLASS_SPECS: Readonly<Record<string, ClassSpec>> = {
  neurips: withStyle(["article"], /^(neurips|nips)_20\d\d$/),
  icml: withStyle(["article"], /^icml20\d\d$/),
  iclr: withStyle(["article"], /^iclr20\d\d_conference$/),
  acl: withStyle(
    ["article"],
    /^(acl|acl_natbib|emnlp(_?20\d\d)?|naacl(_?20\d\d)?|eacl(_?20\d\d)?|acl20\d\d)$/,
    /\breview\b/,
  ),
  aaai: withStyle(["article"], /^aaai\d{2,4}$/, /submission/),
  ijcai: withStyle(["article"], /^ijcai\d\d$/, /review|submission/),
  usenix: either(withStyle(["article"], /^usenix/), ofClass(["usenix"])),
  ieee: ofClass(["IEEEtran"]),
  ndss: ofClass(["IEEEtran"]),
  icra: ofClass(["IEEEtran", "ieeeconf"]),
  acm: ofClass(["acmart"], /\breview\b/),
  acm_or_ieee: either(ofClass(["acmart"], /\breview\b/), ofClass(["IEEEtran"])),
  vldb: either(
    withStyle(["article", "acmart"], /^vldb/),
    ofClass(["acmart"], /\breview\b/),
  ),
  cvpr: withStyle(["article"], /^(cvpr|iccv|eccv)(_?20\d\d)?$/, /review/),
};

/** Rule 3 for one slot; a `classSpec` this file does not know is a broken `queries.json`. */
export function judgeClass(spec: string, p: Preamble): ClassVerdict {
  const check = CLASS_SPECS[spec];
  if (check === undefined)
    throw new Error(`queries.json: unknown classSpec ${spec}`);
  const v = check(p);
  return v.ok ? v : no(`template: ${v.reason}`);
}

/** Rule 4: the text sources kept, summed. */
export const judgeSize = (bytes: number): Verdict =>
  bytes > MAX_BYTES
    ? no(`>300KB of text sources (${String(bytes)} bytes)`)
    : { ok: true };
