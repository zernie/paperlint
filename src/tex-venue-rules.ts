/**
 * THE VENUE-CONFORMANCE RULES OVER THE SOURCE — `paper.tex` judged against what its venue preset
 * requires of the LaTeX itself, before any build:
 *
 *   tex/template          error  the `\documentclass` is the preset's class, with every option it names
 *   tex/required-section  error  each section the preset requires is there, titled exactly, and
 *                                where the preset says (`last`: after every section of the body)
 *
 * ── WHY THEY LIVE HERE AND NOT IN `eslint-rules/` ────────────────────────────────
 * Like the `pdf/*` venue rules (`venue-rules.ts`), they need the paper's resolved preset —
 * `paperPreset`, the one answer to "which venue is this paper judged against" — and read it through
 * the `Files` port. What they read of the source comes from `eslint-rules/latex-structure.ts`, over
 * the parse tree of `sourceCode.raw`, never by searching the text.
 *
 * ── WHO SPEAKS WHEN THERE IS NOTHING TO JUDGE ───────────────────────────────────
 * No `paperlint.json`, no `extends`, or a preset that does not resolve: silent. `pdf/measured` and
 * `pdf/profile` already say so, once. A preset that names no template: silent — there is nothing to
 * compare, and a template-family preset is where it is named.
 */
import { basename, dirname } from "node:path";
import {
  documentClassLine,
  collapse,
  documentClassOf,
  missingOptions,
  outlineOf,
  parseLatex,
  type Outline,
  type Span,
} from "#eslint-rules/latex-structure";
import type { TexRoot } from "#eslint-rules/latex-language";
import { paperPreset, type Preset } from "./presets.ts";
import type { RequiredSection } from "./tex-requirements.ts";
import type { Finding, VenueRuleDeps } from "./venue-rules.ts";

/** A finding and where it points; null points at the top of the file. */
export interface Located extends Finding {
  readonly at: Span | null;
}

/** The slice of ESLint's rule context these rules use. `raw` exists on the `.tex` language's. */
export interface TexRuleContext {
  readonly filename: string;
  readonly sourceCode: {
    readonly text: string;
    readonly raw?: string;
    getLocFromIndex(index: number): { line: number; column: number };
  };
  report(d: {
    readonly loc: {
      readonly start: { line: number; column: number };
      readonly end: { line: number; column: number };
    };
    readonly messageId: string;
    readonly data?: Readonly<Record<string, string | number>>;
  }): void;
}

export interface TexRuleModule {
  readonly meta: {
    readonly type: "problem" | "suggestion";
    readonly docs: { readonly description: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: TexRuleContext): { root?: () => void };
}

// ── the judges: a parsed source + a resolved preset → findings. Pure. ────────────────

/** The paper's class against the preset's template: the class equal, every named option present. */
export function judgeTemplate(root: TexRoot, preset: Preset): Located[] {
  const want = preset.template;
  if (want === null) return [];
  const data = { venue: preset.label, template: documentClassLine(want) };
  const got = documentClassOf(root);
  if (got === null) return [{ messageId: "noClass", data, at: null }];
  if (got.cls !== want.cls)
    return [
      {
        messageId: "wrongClass",
        data: { ...data, got: got.cls },
        at: got.span,
      },
    ];
  return missingOptions(got, want).map((option) => ({
    messageId: "missingOption",
    data: { ...data, option },
    at: got.span,
  }));
}

/**
 * One required section against the outline: missing (reported where the document ends, where it
 * would go), or — for `last` — standing before a section of the body. The body is every section
 * before the appendix and the bibliography, so the required one may follow the bibliography.
 */
function judgeSection(
  outline: Outline,
  want: RequiredSection,
  venue: string,
): Located[] {
  const title = collapse(want.title);
  const found = outline.sections.filter((h) => h.title === title);
  const last = found.at(-1);
  const data = { venue, title };
  if (last === undefined) {
    const end = outline.end;
    return [
      {
        messageId: "missing",
        data,
        at: end === null ? null : { start: end, end },
      },
    ];
  }
  if (want.position !== "last") return [];
  const backMatter = outline.backMatter ?? Number.POSITIVE_INFINITY;
  const after = outline.sections.find(
    (h) => h.start > last.start && h.start < backMatter && h.title !== title,
  );
  return after === undefined
    ? []
    : [
        {
          messageId: "notLast",
          data: { ...data, after: after.title },
          at: last,
        },
      ];
}

/** Every section the preset requires, against the paper's outline. */
export function judgeRequiredSections(
  root: TexRoot,
  preset: Preset,
): Located[] {
  if (preset.requiredSections.length === 0) return [];
  const outline = outlineOf(root);
  return preset.requiredSections.flatMap((r) =>
    judgeSection(outline, r, preset.label),
  );
}

type Judge = (root: TexRoot, preset: Preset) => Located[];

export type TexVenueRuleName = "template" | "required-section";

const RULES: Readonly<
  Record<
    TexVenueRuleName,
    { readonly judge: Judge; readonly meta: TexRuleModule["meta"] }
  >
> = {
  template: {
    judge: judgeTemplate,
    meta: {
      type: "problem",
      docs: {
        description:
          "the \\documentclass is the venue preset's class, with every option the preset names",
      },
      schema: [],
      messages: {
        noClass:
          "paper.tex has no \\documentclass; {{venue}} requires `{{template}}`",
        wrongClass:
          "the class is `{{got}}`, and {{venue}} requires `{{template}}` — the page size, fonts and layout the venue checks come from the class",
        missingOption:
          "the class option `{{option}}` is missing: {{venue}} requires `{{template}}`",
      },
    },
  },
  "required-section": {
    judge: judgeRequiredSections,
    meta: {
      type: "problem",
      docs: {
        description:
          "every section the venue preset requires is there, titled exactly, and where the preset says",
      },
      schema: [],
      messages: {
        missing:
          "{{venue}} requires a section titled «{{title}}» and there is none — add `\\section*{{{title}}}` (the title exactly; a bold paragraph does not count)",
        notLast:
          "«{{title}}» must close the paper at {{venue}}, and the section «{{after}}» comes after it — move it after the last section of the body (after the bibliography is fine)",
      },
    },
  },
};

/** The level each rule is on at in paperlint's own config, for every `paper.tex`. */
export const TEX_VENUE_RULE_LEVELS: Readonly<
  Record<`tex/${TexVenueRuleName}`, "error" | "warn">
> = {
  "tex/template": "error",
  "tex/required-section": "error",
};

/** The last source parsed and its tree: the rules of one file share one parse. */
let last: { readonly raw: string; readonly root: TexRoot } | null = null;
function treeOf(raw: string): TexRoot {
  if (last?.raw !== raw) last = { raw, root: parseLatex(raw) };
  return last.root;
}

function rule(name: TexVenueRuleName, deps: VenueRuleDeps): TexRuleModule {
  const { judge, meta } = RULES[name];
  return {
    meta,
    create(context) {
      // Judged once per paper, on its paper.tex: the paper directory is the file's directory.
      if (basename(context.filename) !== "paper.tex") return {};
      return {
        root() {
          const p = paperPreset(dirname(context.filename), deps);
          if (p.kind !== "resolved") return;
          const sc = context.sourceCode;
          const at = (i: number) => sc.getLocFromIndex(i);
          for (const f of judge(treeOf(sc.raw ?? sc.text), p.preset))
            context.report({
              loc: {
                start: at(f.at?.start ?? 0),
                end: at(f.at?.end ?? 0),
              },
              messageId: f.messageId,
              data: f.data,
            });
        },
      };
    },
  };
}

/** The venue-conformance rules, as rules of the `tex` plugin (beside `tex/future-promise`). */
export function texVenueRules(
  deps: VenueRuleDeps,
): Record<TexVenueRuleName, TexRuleModule> {
  return {
    template: rule("template", deps),
    "required-section": rule("required-section", deps),
  };
}
