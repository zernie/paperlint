/**
 * A TERM AGAINST ITS DEFINITION — two rules of the `tex` plugin over the body, off by default:
 *
 *   tex/term-before-definition  a term the body defines (an `\emph` phrase, by default) is used
 *                               before that definition: reported once, at the first earlier use
 *   tex/term-defined-twice      a term is set as a definition again: reported at each later one
 *
 * Two rules, not one: an author may keep an introduction's gloss and a Method paragraph that both
 * define a word, and still want to know where a word comes before its meaning. What a definition
 * and a use are is `src/domain/term-definitions.ts`.
 *
 * ── OFF BY DEFAULT ───────────────────────────────────────────────────────────────
 * The rules are right only for a paper that marks its definitions with the commands they read.
 * On 113 papers by other authors, most italic phrases stress a word or label an item, and the rules
 * report something in 52 of them; the measurement is on the rules' pages. A project that follows
 * the convention turns them on.
 *
 * ── WHAT THEY READ ───────────────────────────────────────────────────────────────
 * `paper.tex` with its includes spliced (`readPaper`), through the `LatexReader` port: the phrases
 * emphasised in the body (`bodyEmphasis`), its sentences (`bodyProse`), and where the abstract is.
 */
import { hasAtLeast, isNumber, isString } from "remeda";
import type { BodySentence } from "./domain/register.ts";
import { bodySentences } from "./domain/register.ts";
import { fieldOf } from "./domain/record.ts";
import {
  DEFAULT_TERM_OPTIONS,
  definedAgain,
  definitionsOf,
  EMPHASIS_COMMANDS,
  usedBefore,
  type Definition,
  type TermOptions,
} from "./domain/term-definitions.ts";
import type { PaperSource } from "./domain/paper-source.ts";
import type { Span } from "./domain/tex-document.ts";
import { startOf } from "./register.ts";
import {
  readPaper,
  reportInPaper,
  whereIn,
  type ProseDeps,
} from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleContext,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

export type TermRuleName = "term-before-definition" | "term-defined-twice";

const MESSAGES = {
  before:
    "«{{term}}» is used here before its definition (\\{{command}} at {{where}}; {{count}} earlier use(s) outside the abstract). Move the definition to this first use, or say here in plain words what it means.",
  again:
    "«{{term}}» is set as a definition again; it was first defined at {{where}}. Keep one definition and set later mentions in roman, or point back to the first one.",
  none: "this rule is on, and no term in the body is set with {{commands}}: it checks nothing in this paper. Mark each definition with \\{{first}}, or turn the rule off.",
};

const SCHEMA = [
  {
    type: "object",
    properties: {
      commands: {
        type: "array",
        items: { enum: EMPHASIS_COMMANDS },
        minItems: 1,
        uniqueItems: true,
      },
      maxWords: { type: "integer", minimum: 1 },
    },
    additionalProperties: false,
  },
];

/** The options the config sets, the defaults for the rest: ESLint has validated them against the schema. */
export function termOptionsOf(
  options: readonly unknown[] | undefined,
): TermOptions {
  const o = options?.[0];
  const listed = fieldOf(o, "commands");
  const commands = Array.isArray(listed) ? listed.filter(isString) : [];
  const maxWords = fieldOf(o, "maxWords");
  return {
    commands: hasAtLeast(commands, 1)
      ? commands
      : DEFAULT_TERM_OPTIONS.commands,
    maxWords: isNumber(maxWords) ? maxWords : DEFAULT_TERM_OPTIONS.maxWords,
  };
}

/** The body as both rules read it: its definitions, its sentences, the abstract, where it starts. */
interface Read {
  readonly paper: PaperSource;
  readonly opts: TermOptions;
  readonly defs: readonly Definition[];
  readonly sentences: readonly BodySentence[];
  readonly abstract: Span | null;
  readonly start: Span | null;
}

function readBody(context: TexRuleContext, deps: ProseDeps): Read {
  const sc = context.sourceCode;
  const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
  const opts = termOptionsOf(context.options);
  const abstract = deps.latex.abstractSpan(paper.text);
  const passages = deps.latex.bodyProse(paper.text);
  const [first] = passages;
  return {
    paper,
    opts,
    defs: definitionsOf(deps.latex.bodyEmphasis(paper.text), opts, abstract),
    sentences: bodySentences(passages),
    abstract,
    start: first === undefined ? null : startOf(first),
  };
}

/** `tex/term-before-definition`'s findings: each term at its first earlier use, or that it checks nothing. */
export function judgeBefore(r: Read): readonly Located[] {
  if (r.defs.length === 0)
    return [
      {
        messageId: "none",
        data: {
          commands: r.opts.commands.map((c) => `\\${c}`).join(", "),
          first: r.opts.commands[0],
        },
        at: r.start,
      },
    ];
  return usedBefore(r.defs, r.sentences, r.abstract).map((u) => ({
    messageId: "before",
    data: {
      term: u.term,
      command: u.definition.command,
      where: whereIn(r.paper, u.definition.span),
      count: u.count,
    },
    at: u.firstUse,
  }));
}

/** `tex/term-defined-twice`'s findings: each later definition, against the first. */
export const judgeAgain = (r: Read): readonly Located[] =>
  definedAgain(r.defs).map((d) => ({
    messageId: "again",
    data: { term: d.again.text, where: whereIn(r.paper, d.first.span) },
    at: d.again.span,
  }));

const DESCRIPTIONS: Readonly<Record<TermRuleName, string>> = {
  "term-before-definition":
    "a term the body defines (an \\emph phrase, by default) is not used before that definition. Off until a project turns it on",
  "term-defined-twice":
    "a term the body defines is set as a definition once. Off until a project turns it on",
};

const JUDGES: Readonly<Record<TermRuleName, (r: Read) => readonly Located[]>> =
  {
    "term-before-definition": judgeBefore,
    "term-defined-twice": judgeAgain,
  };

const rule = (name: TermRuleName, deps: ProseDeps): TexRuleModule => ({
  meta: {
    type: "suggestion",
    docs: { description: DESCRIPTIONS[name], url: ruleDocsUrl(name) },
    schema: SCHEMA,
    messages: MESSAGES,
  },
  create(context) {
    return {
      root() {
        const r = readBody(context, deps);
        reportInPaper(context, MESSAGES, r.paper, JUDGES[name](r));
      },
    };
  },
});

/** The two rules, as rules of the `tex` plugin. Not on in any default config. */
export const termDefinitionRules = (
  deps: ProseDeps,
): Readonly<Record<TermRuleName, TexRuleModule>> => ({
  "term-before-definition": rule("term-before-definition", deps),
  "term-defined-twice": rule("term-defined-twice", deps),
});
