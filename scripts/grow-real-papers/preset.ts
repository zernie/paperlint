/**
 * The preset a kept paper is linted against: the shipped edition preset, else the template family
 * of its style or class, else none. Pure.
 */
import type { Preamble, Slot } from "./rules.ts";

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
 * Shipped edition presets that cover one track only, and what the acceptance evidence must say to
 * name it: `presets/ase-2026.jsonc` is the Research Track's call, with its Data Availability
 * Statement; every other ASE 2026 track falls back to the family (`accepted/README.md`).
 */
const ONE_TRACK: Readonly<
  Record<string, Readonly<{ track: string; named: RegExp }>>
> = {
  "ase-2026": {
    track: "Research Track",
    named: /\bresearch\s+(?:track|papers?)\b/i,
  },
};

export type PresetChoice = Readonly<{ preset: string | null; why: string }>;
const ALIAS: Readonly<Record<string, string>> = {
  "acm-ccs": "ccs",
  "ieee-s-p": "sp",
};

/** The template family of an acmart or IEEEtran class, or null; `why` ends with `because`. */
const classFamily = (p: Preamble, because: string): PresetChoice | null => {
  if (p.cls === "IEEEtran" && p.clsOpts.includes("conference"))
    return {
      preset: "paperlint:ieee-conference",
      why: `the IEEE conference family${because}`,
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

/**
 * The preset a paper is linted against: the edition's when paperlint ships it and, for an edition
 * preset of one track, `evidence` (the acceptance quote) names that track; else the family of its
 * style or class; else none (a named venue, so no venue rule applies).
 */
export function presetFor(
  {
    slot,
    preamble: p,
    style,
    shipped,
  }: Readonly<{
    slot: Pick<Slot, "series" | "year">;
    preamble: Preamble;
    style?: string;
    shipped: ReadonlySet<string>;
  }>,
  evidence: string,
): PresetChoice {
  const edition = `${ALIAS[slug(slot.series)] ?? slug(slot.series)}-${String(slot.year)}`;
  const only = ONE_TRACK[edition];
  const onOtherTrack = only !== undefined && !only.named.test(evidence);
  if (shipped.has(edition) && !onOtherTrack)
    return {
      preset: `paperlint:${edition}`,
      why: `the shipped edition preset ${edition}`,
    };
  const because =
    shipped.has(edition) && only !== undefined
      ? `, as the shipped edition preset ${edition} covers the ${only.track} only and the acceptance evidence does not name it`
      : NONE;
  return familyOf(p, style, because);
}
