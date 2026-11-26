/**
 * THE MERGE OF A PRESET CHAIN, one file at a time, root first (`src/presets.ts` resolves the chain).
 * Block by block:
 *   tex        union — a child never removes a package its parent needs
 *   format     per key, the child wins; `kinds` by kind name, a child's kind replaces that kind
 *   rules      per rule id, the child wins; `ruleOrigins` keeps which file set each
 *   template   the child wins, with its `template_forbids`; so does `name`, and `required_sections`, `register`, `talk`,
 *              `portal`, `deadlines`, `submission_fields` and `scope` (each whole)
 *   aliases    union, with every `name` — what the venue is called along the chain
 *   parent     the child wins: the conference a workshop is held at, a spec resolved from the
 *              file that names it
 */
import {
  mergeRequirements,
  NO_FORMAT,
  NO_REQUIREMENTS,
  type PresetFile,
  type PresetIdentity,
  type VenueFormat,
} from "./tex-requirements.ts";
import type { Preset } from "./presets.ts";

/** A child's format over its parent's: per key the child wins, kinds by name. Pure. */
export function mergeFormat(
  parent: VenueFormat,
  child: VenueFormat,
): VenueFormat {
  // Every field listed: a VenueFormat literal missing one is a compile error.
  const pick = <K extends Exclude<keyof VenueFormat, "kinds">>(
    k: K,
  ): VenueFormat[K] => child[k] ?? parent[k];
  return {
    pageWidthIn: pick("pageWidthIn"),
    pageHeightIn: pick("pageHeightIn"),
    columns: pick("columns"),
    bodyPt: pick("bodyPt"),
    bodyPtTol: pick("bodyPtTol"),
    refPtMin: pick("refPtMin"),
    refPtMax: pick("refPtMax"),
    fontsText: pick("fontsText"),
    fontsTitle: pick("fontsTitle"),
    bodyEndsAt: pick("bodyEndsAt"),
    appendixInBody: pick("appendixInBody"),
    kinds: new Map([...parent.kinds, ...child.kinds]),
  };
}

/** A venue's name; a family and the base set have none. Pure. */
const nameOf = (i: PresetIdentity): string | null =>
  i.type === "venue" ? i.name : null;

/** A venue's name as a list, empty for a family and the base set. Pure. */
const namesOf = (i: PresetIdentity): readonly string[] =>
  i.type === "venue" ? [i.name] : [];

/** What the merge carries from file to file: the preset without what only the whole chain knows. */
type Merging = Omit<
  Preset,
  "id" | "label" | "chain" | "identity" | "parentNames" | "parentId" | "year"
> & {
  readonly name: string | null;
  readonly parent: ParentLink | null;
};

/** A `parent` as a file of the chain names it: the spec, and the file it is resolved from. */
export interface ParentLink {
  readonly spec: string;
  readonly file: string;
}

export const NOTHING_MERGED: Merging = {
  name: null,
  parent: null,
  template: null,
  templateStyle: null,
  aliases: [],
  declaredAliases: [],
  blind: false,
  requiredSections: [],
  tex: NO_REQUIREMENTS,
  format: NO_FORMAT,
  rules: {},
  ruleOrigins: {},
  registerAnchors: [],
  talk: null,
  portal: null,
  deadlines: [],
  submissionFields: null,
  scope: null,
};

/** The blocks a child replaces whole: the child's when it names one, else its parents'. Pure. */
const wholeBlocks = (
  acc: Merging,
  p: PresetFile,
): Pick<
  Merging,
  | "requiredSections"
  | "registerAnchors"
  | "talk"
  | "portal"
  | "deadlines"
  | "submissionFields"
  | "scope"
> => ({
  requiredSections: p.requiredSections ?? acc.requiredSections,
  registerAnchors: p.registerAnchors ?? acc.registerAnchors,
  talk: p.talk ?? acc.talk,
  portal: p.portal ?? acc.portal,
  deadlines: p.deadlines ?? acc.deadlines,
  submissionFields: p.submissionFields ?? acc.submissionFields,
  scope: p.scope ?? acc.scope,
});

/** One file of the chain, `file`, merged over what its parents gave. Pure. */
export const mergeOne = (
  acc: Merging,
  { preset: p, file }: { readonly preset: PresetFile; readonly file: string },
): Merging => ({
  name: nameOf(p.identity) ?? acc.name,
  parent: p.parent === null ? acc.parent : { spec: p.parent, file },
  template:
    p.template === null
      ? acc.template
      : { text: p.template, file, forbids: p.templateForbids },
  templateStyle:
    p.templateStyle === null
      ? acc.templateStyle
      : { text: p.templateStyle, file },
  aliases: [...new Set([...acc.aliases, ...namesOf(p.identity), ...p.aliases])],
  declaredAliases: [...new Set([...acc.declaredAliases, ...p.aliases])],
  blind: p.blind ?? acc.blind,
  tex: p.tex ? mergeRequirements(acc.tex, p.tex) : acc.tex,
  format: mergeFormat(acc.format, p.format),
  rules: { ...acc.rules, ...p.rules },
  ruleOrigins: {
    ...acc.ruleOrigins,
    ...Object.fromEntries(Object.keys(p.rules).map((id) => [id, file])),
  },
  ...wholeBlocks(acc, p),
});
