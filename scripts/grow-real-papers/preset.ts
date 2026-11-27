/**
 * The preset a kept paper is linted against: the shipped edition preset, else the template family
 * of its style or class, else none. Pure.
 */
import { optionList, type Preamble, type Slot } from "./rules.ts";

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
 * Shipped edition presets that cover one track only, and where the paper names that track. ASE
 * 2026's preset is the Research Track's call, with its Data Availability Statement, and only the
 * acceptance evidence names an ASE track. NeurIPS 2026's preset is the Main Track's call; the paper's
 * own style line names its track (`\usepackage[main]{neurips_2026}`, `[eandd]` for Evaluations &
 * Datasets, `[position]`), so the comment is not read. Every other track falls back to the family
 * (`accepted/README.md`).
 */
type OneTrack = Readonly<
  | { track: string; namedBy: "evidence"; named: RegExp }
  | { track: string; namedBy: "style option"; option: string }
>;
const ONE_TRACK: Readonly<Record<string, OneTrack>> = {
  "ase-2026": {
    track: "Research Track",
    namedBy: "evidence",
    named: /\bresearch\s+(?:track|papers?)\b/i,
  },
  "neurips-2026": {
    track: "Main Track",
    namedBy: "style option",
    option: "main",
  },
};

/** Whether the paper names the one track the edition preset covers. */
const namesTrack = (
  only: OneTrack,
  evidence: string,
  styleOptions: readonly string[],
): boolean => {
  switch (only.namedBy) {
    case "evidence":
      return only.named.test(evidence);
    case "style option":
      return styleOptions.includes(only.option);
  }
};

/** What was read and did not name the track, for the README. */
const unnamedBy = (only: OneTrack, styleOptions: readonly string[]): string => {
  switch (only.namedBy) {
    case "evidence":
      return "the acceptance evidence does not name it";
    case "style option":
      return `the style options [${optionList(styleOptions)}] do not name it`;
  }
};

export type PresetChoice = Readonly<{ preset: string | null; why: string }>;
const ALIAS: Readonly<Record<string, string>> = {
  "acm-ccs": "ccs",
  "ieee-s-p": "sp",
};

/** The template family of an acmart or IEEEtran class, or null; `why` ends with `because`. */
const classFamily = (p: Preamble, because: string): PresetChoice | null => {
  if (p.cls === "IEEEtran" && p.clsOptions.includes("conference"))
    return {
      preset: "paperlint:ieee-conference",
      why: `the IEEE conference family${because}`,
    };
  if (p.cls !== "acmart") return null;
  const fmt = p.clsOptions.find((o) => o === "acmsmall" || o === "sigconf");
  return fmt === undefined
    ? {
        preset: null,
        why: `no preset: the class is acmart with format [${optionList(p.clsOptions)}], which is neither the sigconf nor the acmsmall family, and no preset ships for this edition`,
      }
    : {
        preset: `paperlint:acm-${fmt}`,
        why: `the acmart ${fmt} family${because}`,
      };
};

/** The family of the style, else of the class, else none; each `why` ends with `because`. */
const familyOf = (
  p: Preamble,
  style: string | undefined,
  because: string,
): PresetChoice => {
  const family = FAMILIES.find(([re]) => re.test(style ?? ""));
  if (family !== undefined)
    return { preset: `paperlint:${family[1]}`, why: family[2] + because };
  return (
    classFamily(p, because) ?? {
      preset: null,
      why: "no preset ships for this edition and no template family matches the class: no `extends`, as arxiv-papers does for such papers, but with the accepted cycle",
    }
  );
};

/** What a preset is chosen from: the edition, the preamble, and rule 3's style and its options. */
export type PresetInput = Readonly<{
  slot: Pick<Slot, "series" | "year">;
  preamble: Preamble;
  style?: string | undefined;
  styleOptions?: readonly string[] | undefined;
  shipped: ReadonlySet<string>;
}>;

/**
 * The preset a paper is linted against: the edition's when paperlint ships it and, for an edition
 * preset of one track, the paper names that track (in `evidence`, the acceptance quote, or in
 * `styleOptions`, per `ONE_TRACK`); else the family of its
 * style or class; else none (a named venue, so no venue rule applies).
 */
export function presetFor(
  { slot, preamble: p, style, styleOptions = [], shipped }: PresetInput,
  evidence: string,
): PresetChoice {
  const edition = `${ALIAS[slug(slot.series)] ?? slug(slot.series)}-${String(slot.year)}`;
  const only = ONE_TRACK[edition];
  const onOtherTrack =
    only !== undefined && !namesTrack(only, evidence, styleOptions);
  if (shipped.has(edition) && !onOtherTrack)
    return {
      preset: `paperlint:${edition}`,
      why: `the shipped edition preset ${edition}`,
    };
  const because =
    shipped.has(edition) && only !== undefined
      ? `, as the shipped edition preset ${edition} covers the ${only.track} only and ${unnamedBy(only, styleOptions)}`
      : NONE;
  return familyOf(p, style, because);
}
