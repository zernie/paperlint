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
 * ── THE CHAIN ─────────────────────────────────────────────────────────────────────
 * At most `MAX_PRESET_DEPTH` files, root to leaf. A cycle (relative paths can form one) is refused
 * naming the chain. The chain is merged block by block:
 *
 *   tex        union — a child never removes a package its parent needs
 *   format     per key, the child wins; `kinds` by kind name, a child's kind replaces that kind
 *   rules      per rule id, the child wins
 *   template   the child wins; so does `name`
 *
 * ── THE LABEL ─────────────────────────────────────────────────────────────────────
 * Messages, the facts file and the build plan need a word for the venue. It is the most derived
 * preset's `name` when one sets it, else the spec's file name without its extension
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
  type TexRequirements,
  type VenueFormat,
} from "./tex-requirements.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import { err, ok, type Result } from "./domain/result.ts";
import type { Files } from "./ports/files.ts";
import {
  readPaperSettings,
  type PaperSettings,
  type SettingsProblem,
} from "./paper-settings.ts";
import { CONFIG_FILE } from "../lib/paper-config.mjs";

/** The prefix of a shipped preset's spec. */
export const SHIPPED_PREFIX = "paperlint:";
/** The longest chain of presets, the paper's own target included. */
export const MAX_PRESET_DEPTH = 4;

export interface PresetDeps {
  readonly files: Files;
  /** The package's venues directory: the shipped presets and the schema every preset is checked against. */
  readonly venuesDir: string;
}

/** A resolved chain, merged. */
export interface Preset {
  /** The word for this venue in messages. */
  readonly label: string;
  /** Every file of the chain, root first. */
  readonly chain: readonly string[];
  readonly template: string | null;
  readonly tex: TexRequirements;
  readonly format: VenueFormat;
  readonly rules: Readonly<Record<string, unknown>>;
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
  const bytes = deps.files.readBytes(where.value as AbsolutePath);
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
      why: (e as Error).message.split("\n").join(" "),
    });
  }
}

/** The chain's files, leaf first, each parsed. */
function chainOf(
  spec: string,
  from: string,
  deps: PresetDeps,
): Result<{ file: string; preset: PresetFile }[], PresetProblem> {
  const out: { file: string; preset: PresetFile }[] = [];
  let next: { spec: string; from: string } | null = { spec, from };
  while (next !== null) {
    const r = readPreset(next.spec, next.from, deps);
    if (!r.ok) return r;
    const files = out.map((x) => x.file);
    if (files.includes(r.value.file))
      return err({ kind: "cycle", chain: [...files, r.value.file] });
    if (out.length === MAX_PRESET_DEPTH)
      return err({ kind: "too-deep", chain: [...files, r.value.file] });
    out.push(r.value);
    const up: string | null = r.value.preset.extends;
    next = up === null ? null : { spec: up, from: r.value.file };
  }
  return ok(out);
}

/** A child's format over its parent's: per key the child wins, kinds by name. Pure. */
export function mergeFormat(
  parent: VenueFormat,
  child: VenueFormat,
): VenueFormat {
  const keys = Object.keys(NO_FORMAT).filter((k) => k !== "kinds") as Exclude<
    keyof VenueFormat,
    "kinds"
  >[];
  const scalars = Object.fromEntries(
    keys.map((k) => [k, child[k] ?? parent[k]]),
  ) as Omit<VenueFormat, "kinds">;
  return { ...scalars, kinds: new Map([...parent.kinds, ...child.kinds]) };
}

/** The chain, root first, merged into one preset. Pure. */
function merged(
  spec: string,
  rootFirst: readonly PresetFile[],
  files: readonly string[],
): Preset {
  const base = {
    name: null as string | null,
    template: null as string | null,
    tex: NO_REQUIREMENTS,
    format: NO_FORMAT,
    rules: {} as Readonly<Record<string, unknown>>,
  };
  const m = rootFirst.reduce(
    (acc, p) => ({
      name: p.name ?? acc.name,
      template: p.template ?? acc.template,
      tex: p.tex ? mergeRequirements(acc.tex, p.tex) : acc.tex,
      format: mergeFormat(acc.format, p.format),
      rules: { ...acc.rules, ...p.rules },
    }),
    base,
  );
  return {
    label: m.name ?? labelOf(spec),
    chain: files,
    template: m.template,
    tex: m.tex,
    format: m.format,
    rules: m.rules,
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
  const chain = chainOf(spec, fromFile, deps);
  if (!chain.ok)
    return chain.error.kind === "not-found"
      ? err({ ...chain.error, shipped: shippedPresets(deps.venuesDir) })
      : chain;
  const rootFirst = [...chain.value].reverse();
  return ok(
    merged(
      spec,
      rootFirst.map((x) => x.preset),
      rootFirst.map((x) => x.file),
    ),
  );
}

/** The shipped presets' names (each is spelled `paperlint:<name>`). */
export function shippedPresets(venuesDir: string): string[] {
  return venueNames(venuesDir);
}

/** One line for a problem, naming what to change. Pure. */
export function presetProblemText(p: PresetProblem): string {
  switch (p.kind) {
    case "unsupported":
      return `"extends": "${p.spec}" — a preset is \`paperlint:<name>\` (shipped) or a path starting with ./ or ../ (your own); npm presets: not yet supported. Did you mean "${SHIPPED_PREFIX}${p.spec}"?`;
    case "not-found":
      return `"extends": "${p.spec}" names no preset (${p.file}); shipped presets (${SHIPPED_PREFIX}<name>): ${p.shipped.join(", ")}`;
    case "cycle":
      return `the presets extend each other in a cycle: ${p.chain.join(" → ")}`;
    case "too-deep":
      return `the preset chain is longer than ${String(MAX_PRESET_DEPTH)}: ${p.chain.join(" → ")}`;
    case "broken":
      return `the preset ${p.file} does not parse: ${p.why}`;
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
  return `${join(paperDir, CONFIG_FILE)}: ${p.problem.why}`;
}
