/**
 * THE VENUE RULES — a built PDF judged against the format its venue's call for papers sets.
 *
 *   pdf/fresh      error  the facts describe the PDF on disk (not an earlier build)
 *   pdf/profile    error  the preset the paper extends resolves, and the kind it names exists
 *   pdf/fonts      error  every font is embedded, none is Type 3, the venue's families are present
 *   pdf/geometry   error  page size and column count match the preset
 *   pdf/body-size  warn   body and reference font sizes within the preset's ranges
 *   pdf/measured   warn   the venue checks ran at all (a preset is named, facts exist, geometry measured)
 *
 * and, in plugins named for the requirement rather than the input (paperlint#151):
 *
 *   format/page-limit   error  body and reference pages within the limits of the paper's kind
 *   anonymity/identity  error  a blind venue: the paper declares `identity`, and the PDF says none of it
 *
 * ── WHAT THEY READ ───────────────────────────────────────────────────────────────
 * Like `pdf/last-page-balance`, they run on a paper's `paper.tex` and judge the files beside it:
 * `paperlint.json` (which preset, which kind), `_build/paper.facts.json` (what `paperlint build`
 * measured) and the PDF the facts name (hashed, never measured). The preset is resolved by
 * `paperPreset` in `src/presets.ts` — the same resolution the build, the toolchain and the lint
 * config use — so there is one answer to "which venue is this paper judged against".
 *
 * The venue is taken from `paperlint.json`, not from the facts: the facts are venue-independent
 * measurements, and a paper whose `paperlint.json` changed after the build is judged against the venue
 * it names now.
 *
 * ── WHO SPEAKS WHEN THE INPUT CANNOT BE JUDGED ───────────────────────────────────
 * One rule per reason, and the others are silent — so a paper gets one finding that says what to
 * do, not six that say the same thing:
 *
 *   no paperlint.json       every rule silent (`paperlint new` writes one)
 *   extends null / absent   pdf/measured (warn) — no venue chosen yet; it names the file to set
 *   preset does not resolve pdf/profile (error) — a typo would otherwise switch every check off
 *   not built / no facts    pdf/measured (warn) — lint often runs before or without a build (the
 *                           CI action only lints); a warning is printed and does not fail
 *   facts about another PDF pdf/fresh (error) — judging them would judge an earlier build
 *   no geometry (no banal)  pdf/measured (warn); geometry and body-size silent, page-limit judges
 *                           only a body counted before the references; fonts still judge
 *   kind does not resolve   pdf/profile (error); page-limit silent; everything else still judges
 */
import { dirname, isAbsolute, join, basename, relative } from "node:path";
import {
  FACTS_DIR,
  FACTS_FILE,
  FACTS_SCHEMA,
  factsPath,
  parseFactsText,
  type FontEntry,
  type ReadFacts,
} from "./facts-file.ts";
import type { KindLimits, VenueFormat } from "./tex-requirements.ts";
import { paperPreset, presetProblemText, type Preset } from "./presets.ts";
import type { PaperSettings } from "./paper-settings.ts";
import type { FlatGeometry } from "./domain/geometry.ts";
import { callerPath } from "./caller-path.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { fieldOf } from "./domain/record.ts";
import type { Files } from "./ports/files.ts";
import { CONFIG_FILE } from "#lib/paper-config";
import { findLeaks, type Leak, type Searchable } from "./domain/anonymity.ts";
import { bodyEnd, type BodyEnd } from "./domain/body-pages.ts";
import type { TextFacts } from "./facts-file.ts";

// ── the verdict's vocabulary ─────────────────────────────────────────────────────────

/** One finding: the message it prints and the values it fills in. */
export interface Finding {
  readonly messageId: string;
  readonly data: Readonly<Record<string, string | number>>;
}

const finding = (
  messageId: string,
  data: Readonly<Record<string, string | number>> = {},
): Finding => ({ messageId, data });

/** A venue that resolved to a profile: its name, its format, and the kind's limits or why not. */
export interface Resolved {
  readonly venue: string;
  readonly format: VenueFormat;
  readonly kind: { readonly name: string; readonly limits: KindLimits } | null;
  /** Why the kind did not resolve — `pdf/profile` reports it — or null. */
  readonly kindProblem: Finding | null;
  /** Whether the venue reviews double-blind (the preset's `blind`). */
  readonly blind: boolean;
  /** What identifies the authors (`identity` in paperlint.json), or null when undeclared. */
  readonly identity: readonly string[] | null;
}

/** Everything the rules need to know about one paper, decided once. */
export type Assessment =
  | { readonly kind: "no-venue" }
  /** A `paperlint.json` that extends no preset yet — `pdf/measured` names the file to set. */
  | { readonly kind: "no-preset"; readonly file: string }
  | { readonly kind: "unresolved"; readonly finding: Finding }
  | { readonly kind: "unbuilt"; readonly venue: Resolved }
  | { readonly kind: "stale"; readonly finding: Finding }
  | {
      readonly kind: "ready";
      readonly venue: Resolved;
      readonly facts: ReadFacts;
    };

export interface VenueRuleDeps {
  readonly files: Files;
  /** The package's presets directory (`presetsDir()`): the shipped presets and their schema. */
  readonly venuesDir: string;
}

const text = (files: Files, p: string): string | null => {
  const b = files.readBytes(callerPath(p));
  return b === null ? null : new TextDecoder().decode(b);
};

// ── resolving the declaration ────────────────────────────────────────────────────────

function kindOf(
  venue: string,
  format: VenueFormat,
  kind: string | null,
): Pick<Resolved, "kind" | "kindProblem"> {
  const known = [...format.kinds.keys()].join(", ") || "(none)";
  // A preset with no kinds (`acm-sigconf`, a family a paper for an unprofiled venue extends
  // directly) has no page limit to pick, so naming no kind is the only valid declaration. A kind
  // named against it is still `kindUnknown`, whose "its kinds: (none)" says why.
  if (kind === null && format.kinds.size === 0)
    return { kind: null, kindProblem: null };
  if (kind === null)
    return {
      kind: null,
      kindProblem: finding("kindMissing", { venue, known }),
    };
  const limits = format.kinds.get(kind);
  return limits
    ? { kind: { name: kind, limits }, kindProblem: null }
    : {
        kind: null,
        kindProblem: finding("kindUnknown", { venue, kind, known }),
      };
}

/** How the venue reviews, and who the paper says wrote it: what `anonymity/*` judges by. */
const reviewOf = (
  preset: Pick<Preset, "blind">,
  settings: Pick<PaperSettings, "identity">,
): Pick<Resolved, "blind" | "identity"> => ({
  blind: preset.blind,
  identity: settings.identity,
});

/** The facts about the PDF on disk, or the `pdf/fresh` finding that says why they are not. */
function freshFacts(
  files: Files,
  paperDir: string,
  body: string,
): ReadFacts | Finding {
  const parsed = parseFactsText(body);
  if (!parsed.ok)
    return parsed.error.kind === "schema"
      ? finding("schema", { got: parsed.error.got, want: FACTS_SCHEMA })
      : finding("factsBroken", { why: parsed.error.why });
  const f = parsed.value;
  const pdf = files.readBytes(
    callerPath(isAbsolute(f.pdf) ? f.pdf : join(paperDir, f.pdf)),
  );
  if (pdf === null) return finding("pdfMissing", { pdf: f.pdf });
  return sha256Hex(pdf) === f.sha ? f : finding("stale", { pdf: f.pdf });
}

const isFinding = (v: object): v is Finding => "messageId" in v;

/** One paper, assessed. Reads through `deps.files` only; never throws on a paper's files. */
export function assessPaper(paperDir: string, deps: VenueRuleDeps): Assessment {
  const p = paperPreset(paperDir, deps);
  if (p.kind === "none")
    return p.settings === null
      ? { kind: "no-venue" }
      : { kind: "no-preset", file: join(paperDir, CONFIG_FILE) };
  if (p.kind === "settings-problem")
    return {
      kind: "unresolved",
      finding: finding("settingsBroken", { why: p.problem.why }),
    };
  if (p.kind === "preset-problem")
    return {
      kind: "unresolved",
      finding: finding("preset", { why: presetProblemText(p.problem) }),
    };
  const label = p.preset.label;
  const venue: Resolved = {
    venue: label,
    format: p.preset.format,
    ...kindOf(label, p.preset.format, p.settings.kind),
    ...reviewOf(p.preset, p.settings),
  };
  const factsText = text(deps.files, factsPath(paperDir));
  if (factsText === null) return { kind: "unbuilt", venue };
  const facts = freshFacts(deps.files, paperDir, factsText);
  return isFinding(facts)
    ? { kind: "stale", finding: facts }
    : { kind: "ready", venue, facts };
}

// ── the judges: typed facts + typed format → findings. Pure. ─────────────────────────

/** Type 3, not embedded, and each family the venue names missing from every font. */
export function judgeFonts(
  fonts: readonly FontEntry[],
  format: VenueFormat,
  venue: string,
): Finding[] {
  const out: Finding[] = [];
  for (const f of fonts) {
    if (f.program === "Type3") out.push(finding("type3", { name: f.name }));
    if (!f.embedded) out.push(finding("notEmbedded", { name: f.name }));
  }
  const names = [...new Set(fonts.map((f) => f.name))];
  const families: [string | null, string][] = [
    [format.fontsText, "body text"],
    [format.fontsTitle, "headings"],
  ];
  for (const [prefix, what] of families)
    if (prefix !== null && !names.some((n) => n.startsWith(prefix)))
      out.push(
        finding("noFamily", {
          prefix,
          what,
          venue,
          have: names.slice(0, 8).join(", ") || "(no fonts)",
        }),
      );
  return out;
}

/** Page width and height within `dimTol` inches, and the column count, against the preset. */
export function judgeGeometry(
  g: FlatGeometry,
  format: VenueFormat,
  venue: string,
  dimTol: number,
): Finding[] {
  const out: Finding[] = [];
  const dims: [number | null, number | null, string, string][] = [
    [format.pageWidthIn, g.page_w_in, "page width", "page_w_in"],
    [format.pageHeightIn, g.page_h_in, "page height", "page_h_in"],
  ];
  for (const [want, got, what, key] of dims) {
    if (want === null) continue;
    if (got === null) out.push(finding("dimMissing", { key, venue, want }));
    else if (Math.abs(got - want) > dimTol)
      out.push(finding("dim", { what, got, want, tol: dimTol, venue }));
  }
  if (
    format.columns !== null &&
    g.columns !== null &&
    g.columns !== format.columns
  )
    out.push(
      finding("columns", { got: g.columns, want: format.columns, venue }),
    );
  return out;
}

/**
 * Body and reference pages, as banal classifies them, against the kind's limits. A venue that counts
 * the body before the references is judged on its body by `judgeBodyEnd` instead.
 */
export function judgePages(g: FlatGeometry, resolved: Resolved): Finding[] {
  const kind = resolved.kind;
  if (kind === null) return [];
  const pages: [number | null, number, string][] = [
    [kind.limits.bodyPagesMax, g.body_pages, "body pages"],
    [kind.limits.refPagesMax, g.ref_pages, "reference pages"],
  ];
  const from = resolved.format.bodyEndsAt === "references" ? 1 : 0;
  return pages.slice(from).flatMap(([max, got, what]) =>
    max !== null && got > max
      ? [
          finding("pages", {
            what,
            got,
            max,
            venue: resolved.venue,
            kind: kind.name,
          }),
        ]
      : [],
  );
}

/**
 * The body counted up to where it ends (`body_ends_at: references`) — the references or the
 * appendix, whichever comes first — against the kind's limit: the page it ends on counts when body
 * text stands above the heading there (`bodyEnd`). A limit to check and no end found, or a
 * structural signal the text does not bear out, is said, not passed: the count has nothing to
 * stand on.
 */
export function judgeBodyEnd(
  text: Pick<TextFacts, "pages" | "bibAnchorPage" | "appendixAnchorPage">,
  resolved: Resolved,
): readonly Finding[] {
  const kind = resolved.kind;
  const max = kind?.limits.bodyPagesMax ?? null;
  if (
    resolved.format.bodyEndsAt !== "references" ||
    kind === null ||
    max === null
  )
    return [];
  const end = endOfBody(text);
  const venue = resolved.venue;
  switch (end.kind) {
    case "missing":
      return [finding("noReferences", { venue })];
    case "disagree":
      return [finding("unclear", { venue, why: disagreement(end) })];
    case "found": {
      const what = `body pages (up to the ${end.by} on page ${String(end.page)})`;
      const got = end.bodyPages;
      return got > max
        ? [finding("pages", { what, got, max, venue, kind: kind.name })]
        : [];
    }
  }
}

/** Where the body ends in what the PDF says, and where hyperref anchored the two ends. */
const endOfBody = (
  t: Pick<TextFacts, "pages" | "bibAnchorPage" | "appendixAnchorPage">,
): BodyEnd =>
  bodyEnd(t.pages, { bib: t.bibAnchorPage, appendix: t.appendixAnchorPage });

/** What the `unclear` message says about a structural signal the text does not bear out. */
function disagreement(
  d: Extract<BodyEnd, { readonly kind: "disagree" }>,
): string {
  const page = String(d.anchor);
  if (d.what === "appendix")
    return `hyperref anchors the appendix on page ${page}, and no line on page ${page} reads «Appendix»`;
  return d.heading === null
    ? `the first bibliography entry is on page ${page} (hyperref's destination), and no line on page ${page} reads «References»`
    : `the first bibliography entry is on page ${page} (hyperref's destination), and the «References» heading followed by [1] is on page ${String(d.heading)}`;
}

/** Everything the PDF says, as places to search: each page, each metadata field, each link. */
export const searchable = (t: TextFacts): readonly Searchable[] => [
  ...t.pages.map((text, i) => ({
    place: { kind: "page" as const, page: i + 1 },
    text,
  })),
  ...Object.entries(t.metadata).map(([field, text]) => ({
    place: { kind: "metadata" as const, field },
    text,
  })),
  ...t.links.map(({ page, uri }) => ({
    place: { kind: "link" as const, page, uri },
    text: uri,
  })),
];

/** Where a leak is, in words. */
function whereOf(l: Leak): string {
  switch (l.place.kind) {
    case "page":
      return `PDF, page ${String(l.place.page)}`;
    case "metadata":
      return `PDF metadata: ${l.place.field}`;
    case "link":
      return `link target on page ${String(l.place.page)} (${l.place.uri})`;
  }
}

/** A blind venue's paper: `identity` declared, and none of it in the PDF. */
export function judgeAnonymity(
  resolved: Resolved,
  text: TextFacts | null,
): readonly Finding[] {
  if (!resolved.blind) return [];
  const identity = resolved.identity ?? [];
  if (identity.length === 0)
    return [finding("noIdentity", { venue: resolved.venue })];
  return text === null
    ? []
    : findLeaks(identity, searchable(text)).map((l) =>
        finding("leak", {
          found: l.found.replace(/\s+/gu, " "),
          token: l.token,
          where: whereOf(l),
          venue: resolved.venue,
        }),
      );
}

/** The body font size against `body_pt ± body_pt_tol`, and the reference font size against its range. */
export function judgeBodySize(
  g: FlatGeometry,
  format: VenueFormat,
  venue: string,
): Finding[] {
  return [...judgeBodyPt(g, format, venue), ...judgeRefPt(g, format, venue)];
}

function judgeBodyPt(
  g: FlatGeometry,
  format: VenueFormat,
  venue: string,
): Finding[] {
  const want = format.bodyPt;
  const tol = format.bodyPtTol;
  if (want === null || tol === null) return [];
  if (g.body_pt === null) return [finding("bodyMissing")];
  return Math.abs(g.body_pt - want) > tol
    ? [finding("body", { got: g.body_pt, want, tol, venue })]
    : [];
}

/**
 * The reference font size against the profile's range. The range is about the DECLARED size and
 * banal measures the rendered mode, so it is widened by `body_pt_tol` — the drift the preset itself
 * names — or a correct paper fails.
 */
function judgeRefPt(
  g: FlatGeometry,
  format: VenueFormat,
  venue: string,
): Finding[] {
  const slop = format.bodyPtTol ?? 0;
  if (format.refPtMin === null || format.refPtMax === null || g.ref_pt === null)
    return [];
  return g.ref_pt < format.refPtMin - slop || g.ref_pt > format.refPtMax + slop
    ? [
        finding("refPt", {
          got: g.ref_pt,
          min: format.refPtMin,
          max: format.refPtMax,
          slop,
          venue,
        }),
      ]
    : [];
}

// ── the ESLint rules ────────────────────────────────────────────────────────────────

/** The slice of ESLint's rule context these rules use. */
export interface VenueRuleContext {
  readonly filename: string;
  /** ESLint's working directory; file names in messages are shown relative to it. */
  readonly cwd?: string;
  readonly sourceCode: { readonly text: string };
  readonly options: readonly unknown[];
  report(d: {
    readonly loc: {
      readonly start: { line: number; column: number };
      readonly end: { line: number; column: number };
    };
    readonly messageId: string;
    readonly data?: Readonly<Record<string, string | number>>;
  }): void;
}

export interface VenueRuleModule {
  readonly meta: {
    readonly type: "problem" | "suggestion";
    readonly docs: { readonly description: string; readonly url?: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: VenueRuleContext): { root?: () => void };
}

/** What a judge may take from its rule context: the rule's options and how to show a path. */
interface JudgeContext {
  readonly options: readonly unknown[];
  readonly shown: (path: string) => string;
}
type Judge = (a: Assessment, ctx: JudgeContext) => Finding[];

const REBUILD = "rebuild the paper (`paperlint build`) to rewrite it";

/** Where a rule's page lives: `docs/rules/<plugin>/<name>.md` on the default branch. */
export const rulePageUrl = (id: string): string =>
  `https://github.com/zernie/paperlint/blob/main/docs/rules/${id}.md`;

/** Which rule reports what: each takes the assessment and returns its own findings. */
const JUDGES: Readonly<Record<VenueRuleName, Judge>> = {
  profile: (a) =>
    a.kind === "unresolved"
      ? [a.finding]
      : a.kind === "ready" && a.venue.kindProblem
        ? [a.venue.kindProblem]
        : a.kind === "unbuilt" && a.venue.kindProblem
          ? [a.venue.kindProblem]
          : [],
  fresh: (a) => (a.kind === "stale" ? [a.finding] : []),
  measured: (a, { shown }) =>
    a.kind === "no-preset"
      ? [finding("noPreset", { file: shown(a.file) })]
      : a.kind === "unbuilt"
        ? [
            finding("unbuilt", {
              file: `${FACTS_DIR}/${FACTS_FILE}`,
              venue: a.venue.venue,
            }),
          ]
        : a.kind === "ready" && a.facts.geometry === null
          ? [finding("noGeometry")]
          : [],
  fonts: (a) =>
    a.kind === "ready"
      ? judgeFonts(a.facts.fonts, a.venue.format, a.venue.venue)
      : [],
  geometry: (a, { options }) =>
    a.kind === "ready" && a.facts.geometry
      ? judgeGeometry(
          a.facts.geometry,
          a.venue.format,
          a.venue.venue,
          dimTolOf(options[0]),
        )
      : [],
  "page-limit": (a) =>
    a.kind === "ready"
      ? [
          ...judgeBodyEnd(a.facts.text, a.venue),
          ...(a.facts.geometry ? judgePages(a.facts.geometry, a.venue) : []),
        ]
      : [],
  anonymity: (a) =>
    a.kind === "ready"
      ? [...judgeAnonymity(a.venue, a.facts.text)]
      : a.kind === "unbuilt"
        ? [...judgeAnonymity(a.venue, null)]
        : [],
  "body-size": (a) =>
    a.kind === "ready" && a.facts.geometry
      ? judgeBodySize(a.facts.geometry, a.venue.format, a.venue.venue)
      : [],
};

/** How far, in inches, a measured page dimension may be from the preset's. */
export const DEFAULT_DIM_TOL_IN = 0.05;

/** `geometry`'s `dimTol` option in inches, or the default when the rule was given none. */
function dimTolOf(options: unknown): number {
  const tol = fieldOf(options, "dimTol");
  return typeof tol === "number" ? tol : DEFAULT_DIM_TOL_IN;
}

type Meta = Pick<VenueRuleModule["meta"], "docs" | "messages"> & {
  readonly type?: "suggestion";
  readonly schema?: readonly object[];
};

const META: Readonly<Record<VenueRuleName, Meta>> = {
  fresh: {
    docs: {
      description:
        "the build facts describe the PDF on disk, not an earlier build",
    },
    messages: {
      factsBroken: `_build/paper.facts.json cannot be read: {{why}} — ${REBUILD}`,
      schema: `_build/paper.facts.json has schema {{got}}; the venue rules read schema {{want}} — ${REBUILD}`,
      pdfMissing:
        "_build/paper.facts.json describes {{pdf}}, which is not on disk (a failed build removes it) — rebuild the paper",
      stale:
        "_build/paper.facts.json describes a DIFFERENT {{pdf}} than the one on disk (its SHA-256 differs), so the venue checks would judge an earlier build — rebuild the paper",
    },
  },
  profile: {
    docs: {
      description:
        "the venue preset a paper's paperlint.json extends resolves, and the kind it names exists",
    },
    messages: {
      settingsBroken: `${CONFIG_FILE} cannot be read: {{why}}`,
      preset:
        "{{why}} — so this paper's page limit, fonts and format are not checked. Fix `extends` in its paperlint.json, or turn pdf/profile off for this paper",
      kindMissing: `${CONFIG_FILE} names no \`kind\`, so the page limit of \`{{venue}}\` is not checked; its kinds: {{known}}`,
      kindUnknown:
        "`{{venue}}` has no kind `{{kind}}`, so the page limit is not checked; its kinds: {{known}}",
    },
  },
  measured: {
    type: "suggestion",
    docs: {
      description:
        "the venue checks ran: the paper names a venue preset, and it was built and measured",
    },
    messages: {
      unbuilt:
        "not built yet, so `{{venue}}`'s page limit, fonts and format are not checked — run `paperlint build`",
      noPreset:
        'this paper names no venue preset yet, so its page limit, fonts and format are not checked — set "extends" in {{file}} (e.g. "paperlint:agenticdev"; see docs/rules.md)',
      noGeometry:
        "the build measured no page geometry (banal was not found or failed), so page size, columns, page limits and font sizes were NOT checked — run `paperlint toolchain`, then `paperlint build`",
    },
  },
  fonts: {
    docs: {
      description:
        "every font is embedded and none is Type 3, and the venue's font families are present",
    },
    messages: {
      type3:
        "the font {{name}} is Type 3 (a bitmap or procedure font); ACM and ACL reject such a PDF",
      notEmbedded:
        "the font {{name}} is not embedded, so the reader's viewer substitutes another",
      noFamily:
        "no font starts with `{{prefix}}` ({{what}} of {{venue}}); the PDF has: {{have}}. Usually a font package is missing and the class silently fell back to Computer Modern — run `paperlint toolchain`",
    },
  },
  geometry: {
    schema: [
      {
        type: "object",
        properties: { dimTol: { type: "number", minimum: 0 } },
        additionalProperties: false,
      },
    ],
    docs: {
      description: "page size and column count match the venue's profile",
    },
    messages: {
      dim: "{{what}} is {{got}} in, {{venue}} requires {{want}} in (tolerance {{tol}}) — the template sets the wrong paper size",
      dimMissing:
        "{{venue}} sets `{{key}}` = {{want}}, and the build did not measure it — rebuild the paper",
      columns:
        "{{got}} column(s), {{venue}} requires {{want}} — the wrong document class or class option",
    },
  },
  "page-limit": {
    docs: {
      description:
        "body and reference pages within the limits of the paper's kind at its venue",
      url: rulePageUrl("format/page-limit"),
    },
    messages: {
      pages:
        "{{what}}: {{got}}, over the limit {{max}} for {{venue}}/{{kind}} — a desk reject; cut the text",
      noReferences:
        "{{venue}} limits the body as the pages up to the references, and no page of the PDF has a line reading «References» or «Bibliography» — so the body was NOT counted. Give the bibliography its heading",
      unclear:
        "could not tell where the body ends, so it was NOT counted against {{venue}}'s limit: {{why}}. Check the headings of the bibliography and the appendix, and that nothing before them reads «References» above a [1]",
    },
  },
  anonymity: {
    docs: {
      description:
        "a double-blind venue's PDF names none of the authors' declared identity — in its text, its metadata or its links",
      url: rulePageUrl("anonymity/identity"),
    },
    messages: {
      noIdentity: `{{venue}} reviews double-blind, and this paper declares no \`identity\`, so nothing in the PDF can be checked against the authors. Declare it in ${CONFIG_FILE} (the root's for every paper, or this paper's): "identity": ["Your Name", "your-handle", "you@example.org", "Your University", "your-project"]`,
      leak: "{{where}}: «{{found}}» matches «{{token}}» in `identity`, and {{venue}} reviews double-blind — remove it, or refer to your own work in the third person",
    },
  },
  "body-size": {
    type: "suggestion",
    docs: {
      description:
        "body and reference font sizes within the venue preset's ranges (a measured mode, so a warning)",
    },
    messages: {
      refPt:
        "the reference font size is {{got}} pt, outside {{min}}–{{max}} pt for {{venue}} (allowing ±{{slop}} pt for the measuring drift) — fix the bibliography's font size",
      body: "the body font size measures {{got}} pt against {{want}} ± {{tol}} pt for {{venue}}. The measurement is the mode of the rendered text, not the declared size — check \\documentclass and its options",
      bodyMissing:
        "the build did not measure a body font size — rebuild the paper",
    },
  },
};

export type VenueRuleName =
  | "fresh"
  | "profile"
  | "measured"
  | "fonts"
  | "geometry"
  | "page-limit"
  | "body-size"
  | "anonymity";

/** The venue rules of the `pdf` plugin; `page-limit` and `anonymity` live in their own. */
export type PdfRuleName = Exclude<VenueRuleName, "page-limit" | "anonymity">;

/**
 * The level each venue rule is on at in paperlint's own config, for every `paper.tex`. One owner:
 * the config reads it, the docs describe it, a consumer overrides it in `rules`.
 */
export const VENUE_RULE_LEVELS: Readonly<
  Record<`pdf/${PdfRuleName}`, "error" | "warn">
> = {
  "pdf/fresh": "error",
  "pdf/profile": "error",
  "pdf/fonts": "error",
  "pdf/geometry": "error",
  "pdf/body-size": "warn",
  "pdf/measured": "warn",
};

/** The `anonymity` plugin's rule and its level, on for every `paper.tex` like the venue rules. */
export const ANONYMITY_RULE_LEVELS: Readonly<
  Record<"anonymity/identity", "error">
> = {
  "anonymity/identity": "error",
};

/** The `format` plugin's rule over the built PDF and its level, on for every `paper.tex`. */
export const PAGE_LIMIT_RULE_LEVELS: Readonly<
  Record<"format/page-limit", "error">
> = {
  "format/page-limit": "error",
};

/** The line of `\documentclass`, where the class and its options — most of the fixes — live. */
function reportLine(source: string): number {
  const i = source
    .split("\n")
    .findIndex((l) => l.trimStart().startsWith("\\documentclass"));
  return i >= 0 ? i + 1 : 1;
}

function rule(name: VenueRuleName, deps: VenueRuleDeps): VenueRuleModule {
  const meta = META[name];
  return {
    meta: {
      type: meta.type ?? "problem",
      docs: meta.docs,
      schema: meta.schema ?? [],
      messages: meta.messages,
    },
    create(context) {
      // Judged once per paper, on its paper.tex: the paper directory is the file's directory.
      if (basename(context.filename) !== "paper.tex") return {};
      return {
        root() {
          const a = assessPaper(dirname(context.filename), deps);
          const line = reportLine(context.sourceCode.text);
          const loc = {
            start: { line, column: 1 },
            end: { line, column: 2 },
          };
          const cwd = context.cwd;
          const shown = (p: string) => (cwd ? relative(cwd, p) || p : p);
          for (const f of JUDGES[name](a, { options: context.options, shown }))
            context.report({ loc, messageId: f.messageId, data: f.data });
        },
      };
    },
  };
}

/** The venue rules, as the rules of the `pdf` plugin (beside `last-page-balance`). */
export function venueRules(
  deps: VenueRuleDeps,
): Record<PdfRuleName, VenueRuleModule> {
  // Every name listed: a record missing one is a compile error.
  return {
    fresh: rule("fresh", deps),
    profile: rule("profile", deps),
    measured: rule("measured", deps),
    fonts: rule("fonts", deps),
    geometry: rule("geometry", deps),
    "body-size": rule("body-size", deps),
  };
}

/** The rule of the `anonymity` plugin: `identity`. */
export function anonymityRules(
  deps: VenueRuleDeps,
): Readonly<Record<"identity", VenueRuleModule>> {
  return { identity: rule("anonymity", deps) };
}

/** The `format` plugin's rule over the built PDF: `page-limit` (beside the source's in `tex-venue-rules.ts`). */
export function pageLimitRules(
  deps: VenueRuleDeps,
): Readonly<Record<"page-limit", VenueRuleModule>> {
  return { "page-limit": rule("page-limit", deps) };
}
