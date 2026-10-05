/**
 * VENUE PRESETS — what `"extends"` in a paper's `paperlint.json` resolves to.
 *
 * A venue is a preset, the way an ESLint config is a shareable config: a file with the venue's
 * format (page size, columns, fonts, font sizes, page limits per kind), the TeX packages its
 * template needs, and the rules it implies. A preset may build on another with its own `extends`:
 * `agenticdev` extends the family `acm-sigconf`, which holds everything the ACM template decides.
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
 * naming the chain. The chain is merged block by block:
 *
 *   tex        union — a child never removes a package its parent needs
 *   format     per key, the child wins; `kinds` by kind name, a child's kind replaces that kind
 *   rules      per rule id, the child wins; `ruleOrigins` keeps which file set each
 *   template   the child wins; so does `name`, and `required_sections`, `register`, `talk` and
 *              `portal` (each whole)
 *   aliases    union, with every `name` — what the venue is called along the chain
 *
 * ── THE ID AND THE LABEL ──────────────────────────────────────────────────────────
 * The facts file and the build plan carry the preset's `id`: the spec's file name without its
 * extension, a stable key consumers match against preset ids. Messages say the `label`: the most
 * derived venue's `name` when the chain has a venue, else the id
 * (`paperlint:agenticdev` → `agenticdev`, `./venues/usenix-sec.jsonc` → `usenix-sec`). Display
 * only: nothing is ever resolved by it.
 */
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  mergeRequirements,
  NO_FORMAT,
  NO_REQUIREMENTS,
  parsePreset,
  profileFileOf,
  venueNames,
  type PresetFile,
  type PresetIdentity,
  type RequiredSection,
  type TexRequirements,
  type VenueFormat,
} from "./tex-requirements.ts";
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
import type { RegisterAnchor } from "./domain/register.ts";
import type { VenueTalk } from "./domain/talk.ts";
import type { VenuePortal } from "./domain/submission.ts";

/** The prefix of a shipped preset's spec. */
export const SHIPPED_PREFIX = "paperlint:";
/** The longest chain of presets, the paper's own target included. */
export const MAX_PRESET_DEPTH = 4;

export interface PresetDeps {
  readonly files: Files;
  /** The package's venues directory: the shipped presets and the schema every preset is checked against. */
  readonly venuesDir: string;
}

/** A preset's `template`, as its file spells it. */
export interface PresetTemplate {
  readonly text: string;
  readonly file: string;
}

/** A resolved chain, merged. */
export interface Preset {
  /**
   * The preset's id: the spec's file name without its extension (`agenticdev`, `usenix-sec`). The
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
  /** Every `name` and `aliases` along the chain: what this venue is called in a paper's text. */
  readonly aliases: readonly string[];
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
}

/** Why a spec does not resolve. */
export type PresetProblem =
  | { readonly kind: "unsupported"; readonly spec: string }
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
  | { readonly kind: "broken"; readonly file: string; readonly why: string };

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
type Merging = Omit<Preset, "id" | "label" | "chain" | "identity"> & {
  readonly name: string | null;
};

const NOTHING_MERGED: Merging = {
  name: null,
  template: null,
  aliases: [],
  blind: false,
  requiredSections: [],
  tex: NO_REQUIREMENTS,
  format: NO_FORMAT,
  rules: {},
  ruleOrigins: {},
  registerAnchors: [],
  talk: null,
  portal: null,
};

/** One file of the chain, `file`, merged over what its parents gave. Pure. */
const mergeOne = (
  acc: Merging,
  { preset: p, file }: { readonly preset: PresetFile; readonly file: string },
): Merging => ({
  name: nameOf(p.identity) ?? acc.name,
  template: p.template === null ? acc.template : { text: p.template, file },
  aliases: [...new Set([...acc.aliases, ...namesOf(p.identity), ...p.aliases])],
  blind: p.blind ?? acc.blind,
  requiredSections: p.requiredSections ?? acc.requiredSections,
  tex: p.tex ? mergeRequirements(acc.tex, p.tex) : acc.tex,
  format: mergeFormat(acc.format, p.format),
  rules: { ...acc.rules, ...p.rules },
  ruleOrigins: {
    ...acc.ruleOrigins,
    ...Object.fromEntries(Object.keys(p.rules).map((id) => [id, file])),
  },
  registerAnchors: p.registerAnchors ?? acc.registerAnchors,
  talk: p.talk ?? acc.talk,
  portal: p.portal ?? acc.portal,
});

/** The chain, root first, merged into one preset. Pure. */
function merged(
  spec: string,
  rootFirst: readonly { readonly preset: PresetFile; readonly file: string }[],
  leaf: { readonly preset: PresetFile },
): Preset {
  const { name, ...rest } = rootFirst.reduce(mergeOne, NOTHING_MERGED);
  return {
    id: labelOf(spec),
    label: name ?? labelOf(spec),
    chain: rootFirst.map((x) => x.file),
    identity: leaf.preset.identity,
    ...rest,
  };
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
  const refused = (p: PresetProblem): Result<Preset, PresetProblem> =>
    err(
      p.kind === "not-found"
        ? { ...p, shipped: shippedPresets(deps.venuesDir) }
        : p,
    );
  const leaf = readPreset(spec, fromFile, deps);
  if (!leaf.ok) return refused(leaf.error);
  const chain = chainUp([leaf.value], leaf.value, deps);
  if (!chain.ok) return refused(chain.error);
  return ok(merged(spec, [...chain.value].reverse(), leaf.value));
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

/** A shipped venue as a name knows it, and the files of its chain: what tells it from a paper's own. */
export type ShippedVenue = Pick<Preset, "label" | "aliases" | "chain">;

/**
 * A resolved preset as a name knows it: its label, its aliases, its chain. Pure. (Not Remeda's
 * `pick`: the app layer may not import it — `boundaries/dependencies`, `APP_EXTERNALS`.)
 */
export const venueOf = ({ label, aliases, chain }: Preset): ShippedVenue => ({
  label,
  aliases,
  chain,
});

/**
 * THE ONE SOURCE OF VENUE NAMES: every shipped venue's label and `aliases` (with each `name` along
 * its chain). Read by `paperlint new`, which refuses a folder name naming one, and through
 * `otherVenues` by `tex/venue-leftover` and `paper/folder-venue-leftover`.
 */
export const shippedVenueNames = (deps: PresetDeps): readonly ShippedVenue[] =>
  resolveShipped(deps).map(venueOf);

/** One line for a problem, naming what to change. Pure. */
export function presetProblemText(p: PresetProblem): string {
  switch (p.kind) {
    case "unsupported":
      return `"extends": "${p.spec}" — a preset is \`paperlint:<name>\` (shipped) or a path starting with ./ or ../ (your own); npm presets: not yet supported. Did you mean "${shippedSpec(p.spec)}"?`;
    case "not-found":
      return `"extends": "${p.spec}" names no preset (${p.file}); shipped presets (${SHIPPED_PREFIX}<name>): ${p.shipped.join(", ")}`;
    case "cycle":
      return `the presets extend each other in a cycle: ${p.chain.join(" → ")}`;
    case "too-deep":
      return `the preset chain is longer than ${String(MAX_PRESET_DEPTH)}: ${p.chain.join(" → ")}`;
    case "broken":
      return `the preset ${p.file} does not parse: ${p.why}`;
    case "wrong-parent":
      return p.parentType === "base"
        ? `the preset ${p.file} extends ${p.parent}, the TeX base set — every paper gets that set already, and no preset extends it`
        : `the preset ${p.file} is a template family and extends ${p.parent}, a venue — a family builds only on a family; a venue extends a family or another venue`;
  }
}

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

/** The one-line reason a paper's settings or preset cannot be used, or null when they can. */
export function paperPresetProblem(
  paperDir: string,
  p: PaperPreset,
): string | null {
  if (p.kind === "preset-problem")
    return `${join(paperDir, CONFIG_FILE)}: ${presetProblemText(p.problem)}`;
  if (p.kind !== "settings-problem") return null;
  return settingsProblemLine(paperDir, p.problem);
}

/** The one line naming a paper's `paperlint.json` that does not parse, and why. */
export const settingsProblemLine = (
  paperDir: string,
  problem: SettingsProblem,
): string => `${join(paperDir, CONFIG_FILE)}: ${problem.why}`;
