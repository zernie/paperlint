/**
 * VENUE PRESETS — what `"extends"` in a paper's `paperlint.json` resolves to.
 *
 * A venue is a preset, the way an ESLint config is a shareable config: a file with the venue's
 * format (page size, columns, fonts, font sizes, page limits per kind), the TeX packages its
 * template needs, and the rules it implies. A preset may build on another with its own `extends`:
 * `agenticdev-2026` extends the family `acm-sigconf`, which holds everything the ACM template decides.
 *
 * ── TWO SPEC FORMS, AND ONLY TWO ─────────────────────────────────────────────────
 *   paperlint:<name>   a preset shipped in the package's venues directory
 *   ./x.jsonc, ../x    a file of the project's own, relative to the file that names it
 * Anything else — an npm package name, a bare name — is refused by name. npm presets are not
 * supported yet; a bare name is almost always a shipped name missing its prefix, and the message says so.
 *
 * ── WHAT EACH FILE IS ─────────────────────────────────────────────────────────────
 * Every preset declares its `type` (`venue-profile.schema.json`): a `venue` names itself and links
 * its call for papers, a template `family` names no venue, and the TeX `base` set is extended by
 * nothing. A chain must read top-down as template → venue: a family extends only a family, and
 * nothing extends the base set. A chain that does not is refused naming both files.
 *
 * ── THE CHAIN ─────────────────────────────────────────────────────────────────────
 * At most `MAX_PRESET_DEPTH` files, root to leaf. A cycle (relative paths can form one) is refused
 * naming the chain. The chain is merged block by block, by `src/preset-merge.ts`.
 *
 * ── ONE PRESET PER EDITION ────────────────────────────────────────────────────────
 * A venue preset is one edition, `paperlint:<series>-<year>` (`src/domain/edition.ts`); a family's id
 * ends in no year. A bare series (`paperlint:icse`) is refused wherever a spec is resolved — an
 * `extends`, a `parent`, `paperlint new --venue` — naming the shipped editions: it is never the
 * latest edition, so no upgrade changes a paper's rules without its settings changing.
 *
 * ── THE PARENT CONFERENCE ─────────────────────────────────────────────────────────
 * A workshop names the edition it is held at (`"parent": "paperlint:ccs-2026"` in aisec-2026.jsonc).
 * The parent is resolved like any spec and must be a venue of the workshop's own year; its names,
 * and its own parent's, are `parentNames`: names a paper of this venue may use as its own. A parent
 * that does not resolve to a venue, a parent of another year, or parents that name each other, are
 * refused naming the file that says it.
 *
 * ── THE ID AND THE LABEL ──────────────────────────────────────────────────────────
 * The facts file and the build plan carry the preset's `id`: the spec's file name without its
 * extension, a stable key consumers match against preset ids. Messages say the `label`: the most
 * derived venue's `name` when the chain has a venue, else the id
 * (`paperlint:agenticdev-2026` → `AgenticDev`, `./venues/usenix-sec.jsonc` → `usenix-sec`). Display
 * only: nothing is ever resolved by it. The edition's `year` is the id's, never the name's.
 */
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  parsePreset,
  profileFileOf,
  venueNames,
  type PresetFile,
  type PresetIdentity,
  type RequiredSection,
  type TexRequirements,
  type VenueFormat,
} from "./tex-requirements.ts";
import { mergeOne, NOTHING_MERGED, type ParentLink } from "./preset-merge.ts";
import { callerPath } from "./caller-path.ts";
import { err, isOk, ok, type Result } from "./domain/result.ts";
import type { Files } from "./ports/files.ts";
import {
  readPaperSettings,
  type PaperSettings,
  type SettingsProblem,
} from "./paper-settings.ts";
import { CONFIG_FILE } from "#lib/paper-config";
import { messageOf } from "./domain/text.ts";
import { hasAtLeast } from "remeda";
import { editionLabel, editionOf, editionsOf } from "./domain/edition.ts";
import type { NamedVenue } from "./domain/venue-name.ts";
import { setMembers } from "./rule-sets.ts";
import type { RegisterAnchor } from "./domain/register.ts";
import type { VenueTalk } from "./domain/talk.ts";
import type { VenuePortal } from "./domain/submission.ts";
import type { VenueFields } from "./domain/submission-fields.ts";
import type { Reading } from "./domain/deadline.ts";
import type { VenueScope } from "./domain/venue-scope.ts";

/** The prefix of a shipped preset's spec. */
export const SHIPPED_PREFIX = "paperlint:";
/** The longest chain of presets, the paper's own target included. */
export const MAX_PRESET_DEPTH = 4;

export interface PresetDeps {
  readonly files: Files;
  /** The package's venues directory: the shipped presets and the schema every preset is checked against. */
  readonly venuesDir: string;
}

/** A preset's `template`, as its file spells it, and the class options that file forbids. */
export interface PresetTemplate {
  readonly text: string;
  readonly file: string;
  /** `template_forbids` of the same file: options the paper's class line must not carry. */
  readonly forbids: readonly string[];
}

/** A preset's `template_style`, as its file spells it. */
export interface PresetStyle {
  readonly text: string;
  readonly file: string;
}

/** A resolved chain, merged. */
export interface Preset {
  /**
   * The preset's id: the spec's file name without its extension (`agenticdev-2026`, `usenix-sec`). The
   * stable key a machine reads — the facts file and the build plan carry it — whatever `name` says.
   */
  readonly id: string;
  /** The word for this venue in messages: the venue's `name`, else the id. */
  readonly label: string;
  /** Every file of the chain, root first. */
  readonly chain: readonly string[];
  /** What the spec names — the leaf file of the chain: a venue (with its call), or a family. */
  readonly identity: PresetIdentity;
  /**
   * The `\\documentclass` the venue's template uses, as the preset spells it, and the file that
   * spells it; null when no file of the chain names one. Read by the rules and `paperlint new`,
   * through the LaTeX reader.
   */
  readonly template: PresetTemplate | null;
  /**
   * The style package the template loads into its class (`template_style`, a `\\usepackage` line),
   * as the preset spells it, and the file that spells it; null when no file of the chain names one.
   */
  readonly templateStyle: PresetStyle | null;
  /** Every `name` and `aliases` along the chain: what this venue is called in a paper's text. */
  readonly aliases: readonly string[];
  /** The `aliases` the chain's files declare, without any `name`: what a folder name is matched against beside the edition. */
  readonly declaredAliases: readonly string[];
  /** The edition's year, from the id (`icse-2028` → 2028); null when the id ends in no year. */
  readonly year: number | null;
  /**
   * Every name of the conference this venue is held at (`parent`), and of that one's parent: names a
   * paper of this venue may use as its own. Empty when no file of the chain names a parent.
   */
  readonly parentNames: readonly string[];
  /** The id of the conference this venue is held at (`parent`): `ase-2026`; null when no file of the chain names one. */
  readonly parentId: string | null;
  /** Whether the venue reviews double-blind (`anonymity/identity`); false when no file of the chain says. */
  readonly blind: boolean;
  readonly requiredSections: readonly RequiredSection[];
  readonly tex: TexRequirements;
  readonly format: VenueFormat;
  readonly rules: Readonly<Record<string, unknown>>;
  /** Rule id → the file of the chain that set its entry in `rules` (the last one to name it). */
  readonly ruleOrigins: Readonly<Record<string, string>>;
  /** The accepted papers the register rules measure a body against; empty when no file names any. */
  readonly registerAnchors: readonly RegisterAnchor[];
  /** What the venue asks a presenter to send (`talk/*`); null when no file of the chain says. */
  readonly talk: VenueTalk | null;
  /** Where the venue takes submissions (`paperlint submission`); null when no file of the chain says. */
  readonly portal: VenuePortal | null;
  /**
   * The edition's deadlines as they were read (the portal's, refreshed by paperlint's scheduled
   * workflow); empty when no file of the chain names any. A paper's current cycle derives them.
   */
  readonly deadlines: readonly Reading[];
  /** The fields the edition's submission form asks (`paperlint submission`); null when no file of the chain records any. */
  readonly submissionFields: VenueFields | null;
  /** What the call says the venue is for (`scope`), verbatim; null when no file of the chain records it. */
  readonly scope: VenueScope | null;
}

/** Why a spec does not resolve. */
export type PresetProblem =
  | { readonly kind: "unsupported"; readonly spec: string }
  /** `paperlint:<series>` with no year, where `editions` of that series ship, oldest first. */
  | {
      readonly kind: "bare-series";
      readonly spec: string;
      readonly editions: readonly [string, ...string[]];
    }
  | {
      readonly kind: "not-found";
      readonly spec: string;
      readonly file: string;
      readonly shipped: readonly string[];
    }
  | { readonly kind: "cycle"; readonly chain: readonly string[] }
  | { readonly kind: "too-deep"; readonly chain: readonly string[] }
  /** `file` extends `parent`, which a preset of its type may not extend. */
  | {
      readonly kind: "wrong-parent";
      readonly file: string;
      readonly parent: string;
      /** A family extending a venue, or anything extending the base set. */
      readonly parentType: "venue" | "base";
    }
  | { readonly kind: "broken"; readonly file: string; readonly why: string }
  /** `file` names a parent conference that does not resolve to a venue preset: `why`. */
  | { readonly kind: "bad-parent"; readonly file: string; readonly why: string }
  /** Venues that name each other as `parent`, in the order they were followed. */
  | { readonly kind: "parent-cycle"; readonly chain: readonly string[] };

/** The display label of a spec: the file name without its extension. Pure. */
export function labelOf(spec: string): string {
  const name = spec.startsWith(SHIPPED_PREFIX)
    ? spec.slice(SHIPPED_PREFIX.length)
    : basename(spec);
  return name.slice(0, name.length - extname(name).length) || name;
}

const isRelative = (spec: string): boolean =>
  spec.startsWith("./") || spec.startsWith("../");

/** A spec → the file it names, or why it names none. Pure. */
function fileOf(
  spec: string,
  from: string,
  venuesDir: string,
): Result<string, PresetProblem> {
  if (isRelative(spec)) return ok(resolve(dirname(from), spec));
  if (!spec.startsWith(SHIPPED_PREFIX))
    return err({ kind: "unsupported", spec });
  const file = profileFileOf(spec.slice(SHIPPED_PREFIX.length));
  return file === null
    ? err({ kind: "not-found", spec, file: spec, shipped: [] })
    : ok(join(venuesDir, file));
}

/** One file of the chain: read and parsed, or why not. */
function readPreset(
  spec: string,
  from: string,
  deps: PresetDeps,
): Result<{ file: string; preset: PresetFile }, PresetProblem> {
  const where = fileOf(spec, from, deps.venuesDir);
  if (!where.ok) return where;
  const bytes = deps.files.readBytes(callerPath(where.value));
  if (bytes === null)
    return err({ kind: "not-found", spec, file: where.value, shipped: [] });
  try {
    const text = new TextDecoder().decode(bytes);
    return ok({
      file: where.value,
      preset: parsePreset(text, where.value, deps.venuesDir),
    });
  } catch (e) {
    return err({
      kind: "broken",
      file: where.value,
      why: messageOf(e).split("\n").join(" "),
    });
  }
}

/** One file of a chain: where it is, and what it says. */
interface Link {
  readonly file: string;
  readonly preset: PresetFile;
}

/**
 * The chain from `child` up, leaf first: `below` is every file read so far, `child` the last of them.
 * Each parent is refused when it closes a cycle, makes the chain too long, or is of a type `child`
 * may not extend.
 */
function chainUp(
  below: readonly Link[],
  child: Link,
  deps: PresetDeps,
): Result<readonly Link[], PresetProblem> {
  const up = child.preset.extends;
  if (up === null) return ok(below);
  const r = readPreset(up, child.file, deps);
  if (!r.ok) return r;
  const files = below.map((x) => x.file);
  if (files.includes(r.value.file))
    return err({ kind: "cycle", chain: [...files, r.value.file] });
  if (below.length === MAX_PRESET_DEPTH)
    return err({ kind: "too-deep", chain: [...files, r.value.file] });
  const parentType = r.value.preset.identity.type;
  if (parentType === "venue" && child.preset.identity.type === "family")
    return err({
      kind: "wrong-parent",
      file: child.file,
      parent: r.value.file,
      parentType,
    });
  if (parentType === "base")
    return err({
      kind: "wrong-parent",
      file: child.file,
      parent: r.value.file,
      parentType,
    });
  return chainUp([...below, r.value], r.value, deps);
}

/** The chain, root first, merged into one preset, and the parent it names. Pure. */
function merged(
  spec: string,
  rootFirst: readonly { readonly preset: PresetFile; readonly file: string }[],
  leaf: { readonly preset: PresetFile },
): Omit<Preset, "parentNames" | "parentId"> & { readonly parent: ParentLink | null } {
  const { name, ...rest } = rootFirst.reduce(mergeOne, NOTHING_MERGED);
  return {
    id: labelOf(spec),
    label: name ?? labelOf(spec),
    year: editionOf(labelOf(spec))?.year ?? null,
    chain: rootFirst.map((x) => x.file),
    identity: leaf.preset.identity,
    ...rest,
  };
}

/**
 * A problem as a caller reads it: a missing file lists the shipped presets, and a shipped spec that
 * names a series of shipped editions (`paperlint:icse`) is refused as a bare series.
 */
function refusal(p: PresetProblem, venuesDir: string): PresetProblem {
  if (p.kind !== "not-found") return p;
  const shipped = shippedPresets(venuesDir);
  const editions = p.spec.startsWith(SHIPPED_PREFIX)
    ? editionsOf(p.spec.slice(SHIPPED_PREFIX.length), shipped)
    : [];
  return hasAtLeast(editions, 1)
    ? { kind: "bare-series", spec: p.spec, editions }
    : { ...p, shipped };
}

/**
 * The names `parent` brings, resolved from the file that names it: the parent venue's names and its
 * own `parentNames`. `below` is every venue whose parent led here, so a cycle is refused. A problem
 * of a parent further up is passed on as it is: it names the file that says the bad parent.
 */
function parentNamesOf(
  parent: ParentLink,
  below: readonly string[],
  deps: PresetDeps,
): Result<readonly string[], PresetProblem> {
  const up = resolveFrom(parent.spec, parent.file, deps, below);
  const bad = (why: string): Result<readonly string[], PresetProblem> =>
    err({ kind: "bad-parent", file: parent.file, why });
  const named = `"parent": "${parent.spec}"`;
  if (!up.ok) {
    const p = up.error;
    if (p.kind === "bad-parent" || p.kind === "parent-cycle") return up;
    // The parent's own file is missing or misspelt: say it of `parent`, not of an `extends`.
    return "spec" in p && p.spec === parent.spec
      ? bad(presetProblemText(p, "parent"))
      : bad(`${named} does not resolve: ${presetProblemText(p)}`);
  }
  const why = parentProblem(named, parent.file, up.value);
  return why === null
    ? ok([...new Set([...up.value.aliases, ...up.value.parentNames])])
    : bad(why);
}

/**
 * Why a resolved parent cannot be the one `file` names, or null: it must be a venue, and an edition
 * of the year `file`'s id carries, when both ids carry one. Pure.
 */
function parentProblem(
  named: string,
  file: string,
  up: Pick<Preset, "identity" | "year">,
): string | null {
  if (up.identity.type !== "venue")
    return `${named} is a ${up.identity.type}, and a workshop's parent is the venue it is held at`;
  const year = editionOf(labelOf(file))?.year ?? null;
  return year === null || up.year === null || up.year === year
    ? null
    : `${named} is the ${String(up.year)} edition, and this workshop is of ${String(year)} — a workshop's parent is the edition it is held at, of the same year`;
}

/** `resolvePreset`, inside the venues `below` whose `parent` led here. */
function resolveFrom(
  spec: string,
  fromFile: string,
  deps: PresetDeps,
  below: readonly string[],
): Result<Preset, PresetProblem> {
  const leaf = readPreset(spec, fromFile, deps);
  if (!leaf.ok) return err(refusal(leaf.error, deps.venuesDir));
  const here = [...below, leaf.value.file];
  if (below.includes(leaf.value.file))
    return err({ kind: "parent-cycle", chain: here });
  const chain = chainUp([leaf.value], leaf.value, deps);
  if (!chain.ok) return err(refusal(chain.error, deps.venuesDir));
  const { parent, ...preset } = merged(
    spec,
    [...chain.value].reverse(),
    leaf.value,
  );
  const names = parent === null ? ok([]) : parentNamesOf(parent, here, deps);
  return names.ok
    ? ok({
        ...preset,
        parentId: parent === null ? null : labelOf(parent.spec),
        parentNames: names.value,
      })
    : names;
}

/**
 * `spec`, as written in `fromFile` (a paper's `paperlint.json`), → the merged preset, or why it
 * does not resolve. Reads through `deps.files` only; never throws.
 */
export function resolvePreset(
  spec: string,
  fromFile: string,
  deps: PresetDeps,
): Result<Preset, PresetProblem> {
  return resolveFrom(spec, fromFile, deps, []);
}

/** The shipped presets' names (each is spelled `paperlint:<name>`). */
export function shippedPresets(venuesDir: string): string[] {
  return venueNames(venuesDir);
}

/** The spec a paper writes in `extends` for the shipped preset `name`: `paperlint:<name>`. */
export const shippedSpec = (name: string): string => `${SHIPPED_PREFIX}${name}`;

/**
 * Every shipped preset that resolves, each read the way a paper extending it would read it. The one
 * piece that reads the presets directory. One that does not resolve is left out: `pdf/profile`
 * owns that.
 */
export function resolveShipped(deps: PresetDeps): readonly Preset[] {
  const from = join(deps.venuesDir, CONFIG_FILE);
  return shippedPresets(deps.venuesDir)
    .map((name) => resolvePreset(shippedSpec(name), from, deps))
    .filter(isOk)
    .map((r) => r.value);
}

/**
 * The `template_style` of every shipped preset that resolves and names one, with its chain: the
 * styles a paper of another venue may have loaded instead of its own (`tex/template`).
 */
export const shippedStyles = (
  deps: PresetDeps,
): readonly (PresetStyle & Pick<Preset, "chain">)[] =>
  resolveShipped(deps).flatMap((p) =>
    p.templateStyle === null ? [] : [{ ...p.templateStyle, chain: p.chain }],
  );

/** A shipped venue as a name knows it, and the files of its chain: what tells it from a paper's own. */
export type ShippedVenue = Pick<
  Preset,
  "id" | "label" | "aliases" | "declaredAliases" | "year" | "chain"
>;

/**
 * A resolved preset as a name knows it: its label, its aliases, its chain. Pure.
 */
export const venueOf = ({
  id,
  label,
  aliases,
  declaredAliases,
  year,
  chain,
}: Preset): ShippedVenue => ({
  id,
  label,
  aliases,
  declaredAliases,
  year,
  chain,
});

/**
 * THE ONE SOURCE OF VENUE NAMES: every shipped venue's label and `aliases` (with each `name` along
 * its chain). Read by `paperlint new`, which refuses a folder name naming one, and through
 * `otherVenues` by `tex/venue-leftover` and `paper/folder-venue-leftover`.
 */
export const shippedVenueNames = (deps: PresetDeps): readonly ShippedVenue[] =>
  resolveShipped(deps).map(venueOf);

/**
 * A venue as a FOLDER name names it: its edition (`AGENT 2027`, the name and the id's year) and the
 * `aliases` its files declare — never its bare `name`, which may be an ordinary word (`AGENT`) or
 * the series of every edition (`ICSE`). Read by `paper/folder-venue-leftover` and `paperlint new`. Pure.
 */
export const folderNamesOf = (
  v: Pick<ShippedVenue, "label" | "year" | "declaredAliases">,
): NamedVenue => ({
  label: editionLabel(v.label, v.year),
  aliases: v.declaredAliases,
});

/** Every shipped venue as a folder name names it (`folderNamesOf`): what `paperlint new` refuses. */
export const shippedFolderNames = (deps: PresetDeps): readonly NamedVenue[] =>
  shippedVenueNames(deps).map(folderNamesOf);

/** For a rule set named where a venue belongs, where the set goes instead; "" otherwise. Pure. */
const ruleSetHint = (spec: string): string =>
  setMembers(spec) === null
    ? ""
    : `. ${spec} is a rule set, not a venue: turn it on in "rules": { "${spec}": "warn" }`;

/**
 * One line for a problem, naming what to change. `key` is the setting that named the spec of an
 * `unsupported` or `not-found` problem. Pure.
 */
export function presetProblemText(
  p: PresetProblem,
  key: "extends" | "parent" = "extends",
): string {
  if (isSpecProblem(p)) return specProblemText(p, key);
  switch (p.kind) {
    case "cycle":
      return `the presets extend each other in a cycle: ${p.chain.join(" → ")}`;
    case "too-deep":
      return `the preset chain is longer than ${String(MAX_PRESET_DEPTH)}: ${p.chain.join(" → ")}`;
    case "broken":
      return `the preset ${p.file} does not parse: ${p.why}`;
    case "bad-parent":
      return `the preset ${p.file} names a parent conference that does not resolve to a venue: ${p.why}`;
    case "parent-cycle":
      return `the presets name each other as "parent" in a cycle: ${p.chain.join(" → ")}`;
    case "wrong-parent":
      return wrongParentText(p);
  }
}

/** A problem of the spec itself, which names no file: what a line for it says depends on `key`. */
type SpecProblem = Extract<
  PresetProblem,
  { readonly kind: "bare-series" | "unsupported" | "not-found" }
>;

const isSpecProblem = (p: PresetProblem): p is SpecProblem =>
  ["bare-series", "unsupported", "not-found"].includes(p.kind);

/** The line for a spec that names no file: what it should look like, or what ships. Pure. */
function specProblemText(p: SpecProblem, key: "extends" | "parent"): string {
  if (p.kind === "bare-series") return bareSeriesText(p, key);
  return p.kind === "unsupported"
    ? `"${key}": "${p.spec}" — a preset is \`paperlint:<name>\` (shipped) or a path starting with ./ or ../ (your own); npm presets: not yet supported. Did you mean "${shippedSpec(p.spec)}"?`
    : `"${key}": "${p.spec}" names no preset (${p.file}); shipped presets (${SHIPPED_PREFIX}<name>): ${p.shipped.join(", ")}${ruleSetHint(p.spec)}`;
}

/** The line for a bare series: the editions that ship, the latest offered. Pure. */
export const bareSeriesText = (
  p: Extract<PresetProblem, { readonly kind: "bare-series" }>,
  key: "extends" | "parent" | "--venue",
): string => {
  const latest = p.editions.reduce((_, id) => id);
  const said =
    key === "--venue" ? `--venue ${p.spec}` : `"${key}": "${p.spec}"`;
  return `${said} names a series, not an edition: a venue preset is one edition, so a new edition never changes a paper's rules unasked. Shipped editions: ${p.editions.map(shippedSpec).join(", ")} — did you mean ${shippedSpec(latest)}?`;
};

/** The line for a chain whose file extends a preset of a type it may not extend. Pure. */
const wrongParentText = (
  p: Extract<PresetProblem, { readonly kind: "wrong-parent" }>,
): string =>
  p.parentType === "base"
    ? `the preset ${p.file} extends ${p.parent}, the TeX base set — every paper gets that set already, and no preset extends it`
    : `the preset ${p.file} is a template family and extends ${p.parent}, a venue — a family builds only on a family; a venue extends a family or another venue`;

// ── a paper's preset ────────────────────────────────────────────────────────────────────

/** What one paper declares and the preset it resolves to — one answer for every reader. */
export type PaperPreset =
  /** No `paperlint.json`, or one without `extends`: no venue checks, the base TeX set. */
  | { readonly kind: "none"; readonly settings: PaperSettings | null }
  | {
      readonly kind: "resolved";
      readonly settings: PaperSettings;
      readonly preset: Preset;
    }
  /** `paperlint.json` does not parse. */
  | { readonly kind: "settings-problem"; readonly problem: SettingsProblem }
  /** `extends` does not resolve. */
  | {
      readonly kind: "preset-problem";
      readonly settings: PaperSettings;
      readonly problem: PresetProblem;
    };

/** A paper directory → its settings and its resolved preset. Reads through `deps.files`; never throws. */
export function paperPreset(paperDir: string, deps: PresetDeps): PaperPreset {
  const read = readPaperSettings(deps.files, paperDir);
  if (!read.ok) return { kind: "settings-problem", problem: read.error };
  const settings = read.value;
  if (settings?.extends == null) return { kind: "none", settings };
  const r = resolvePreset(settings.extends, join(paperDir, CONFIG_FILE), deps);
  return r.ok
    ? { kind: "resolved", settings, preset: r.value }
    : { kind: "preset-problem", settings, problem: r.error };
}

/** A paper's settings or preset that cannot be used. */
export type UnusablePreset = Extract<
  PaperPreset,
  { readonly kind: "settings-problem" | "preset-problem" }
>;

/** The one-line reason a paper's settings or preset cannot be used. */
export const unusablePresetLine = (
  paperDir: string,
  p: UnusablePreset,
): string =>
  p.kind === "preset-problem"
    ? `${join(paperDir, CONFIG_FILE)}: ${presetProblemText(p.problem)}`
    : settingsProblemLine(paperDir, p.problem);

/** The one-line reason a paper's settings or preset cannot be used, or null when they can. */
export function paperPresetProblem(
  paperDir: string,
  p: PaperPreset,
): string | null {
  return p.kind === "preset-problem" || p.kind === "settings-problem"
    ? unusablePresetLine(paperDir, p)
    : null;
}

/** The one line naming a paper's `paperlint.json` that does not parse, and why. */
export const settingsProblemLine = (
  paperDir: string,
  problem: SettingsProblem,
): string => `${join(paperDir, CONFIG_FILE)}: ${problem.why}`;
