/**
 * The CORE of build-label-page's generator, with no page layout: the items.json schema and its
 * checks, the leak guard, neutral ids, the key with its `allowed` and `needs_why` lists, the check of
 * the store's dump against the key, and the export (labels and practice). The page is built from its
 * payload by `label-page-html.ts`; the command line is `label-page.ts`. No side effect on import.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  describeRule,
  type Described as RuleText,
  type RuleRef,
} from "./rule-descriptions.ts";

// ── refusals and output ───────────────────────────────────────────────────────────────────────
export class Refusal extends Error {
  readonly exitCode: number;
  constructor(exitCode: number, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}
export const fail = (message: string): never => {
  throw new Refusal(1, `REFUSED: ${message}`);
};
/** What a run printed, line by line; `cli` takes it out after each run. */
const printed: string[] = [];
/** The lines printed since the last call, each ending in a newline. */
export const takePrinted = (): string =>
  printed
    .splice(0)
    .map((l) => `${l}\n`)
    .join("");
export const say = (line: string): void => {
  printed.push(line);
};

type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };
type JsonObject = { readonly [key: string]: Json };
const isList = (v: Json): v is readonly Json[] => Array.isArray(v);
const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: JsonObject, key: string): boolean => Object.hasOwn(o, key);

// ── how a value is quoted in a message: as Python wrote it, so messages read as before ───────
const quoted = (s: string): string => {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t")
    .replaceAll("\r", "\\r");
  return `${q}${q === "'" ? body.replaceAll("'", "\\'") : body}${q}`;
};
const repr = (v: Json | undefined): string => {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return quoted(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(repr).join(", ")}]`;
  return `{${Object.entries(v)
    .map(([k, x]) => `${quoted(k)}: ${repr(x)}`)
    .join(", ")}}`;
};
/** The name Python gave the type of a value that is not an object, as the dump refusals print it. */
const typeName = (v: Json): string => {
  if (v === null) return "NoneType";
  if (Array.isArray(v)) return "list";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  return typeof v === "boolean" ? "bool" : "str";
};
/** Code-point order of two strings, as Python's `sorted` has it. */
const byText = (a: string, b: string): number => Number(a > b) - Number(a < b);
const writeJson = (path: string, value: unknown): void => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const JSON_VALUE = z.json();
const readJson = (path: string): Json => {
  try {
    return JSON_VALUE.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (e) {
    return fail(`cannot read ${path} as JSON: ${String(e)}`);
  }
};

// ── THE LEAK GUARD ───────────────────────────────────────────────────────────────────────────
// What an item may carry. `PAGE_FIELDS` reach the labeller; `PRIVATE_FIELDS` go to key.json only.
// Anything else on an item — a model answer, a checker verdict, a source label, a difficulty tag —
// stops the build: a blind page fails by what leaked in, and a field nobody listed is exactly the
// one nobody thought of. A NEW FIELD IS ADDED HERE ON PURPOSE, after asking "does this tell the
// labeller what the answer is, or where the item came from?" — never to make a build pass.
// prettier-ignore
const PAGE_FIELDS = ["group", "title", "body", "code", "context", "file"] as const;
const PRIVATE_FIELDS = ["source_id"] as const;
// The linter rules an item names ("read as ruff `TID253`"): the page shows each with the linter's
// own description, looked up at build time (rule-descriptions.ts), never typed into items.json.
const RULES_FIELD = "rules";
// The source line an item was drawn from, with its requirement marked (`mark`, words of the line)
// and which part of the line it is. Shown on the card; the line is text the labeller may read.
const UNIT_FIELD = "unit";
// Two readings of one requirement, shown as rows A and B (#374).
const READINGS_FIELD = "readings";
// The witness card (#380): one situation in code, the example file with the caught line marked, the
// files like it, the settings behind the card, and where the card sits among its requirement's cards.
const WITNESS_FIELDS = [
  "situation",
  "example",
  "more_like_this",
  "details",
  "repeat",
] as const;
const ALLOWED_FIELDS: readonly string[] = [
  ...PAGE_FIELDS,
  RULES_FIELD,
  UNIT_FIELD,
  READINGS_FIELD,
  ...WITNESS_FIELDS,
  ...PRIVATE_FIELDS,
];

const FAMILIARITY = [
  { value: "well", label: "Well" },
  { value: "somewhat", label: "Somewhat" },
  { value: "not_really", label: "Not really" },
];
// An id is a key of a plain JavaScript object on the page, so a name Object.prototype already has
// is refused: `answers["__proto__"] = v` sets the prototype and saves nothing, and an unanswered
// `answers["constructor"]` reads back a function instead of nothing.
const RESERVED_NAMES = [
  "__proto__",
  "constructor",
  "prototype",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
];
const NAME_PATTERN = `(?!(?:${RESERVED_NAMES.join("|")})$)[A-Za-z0-9_-]+`;
const SOURCES = ["page", "chat"];
const SOURCES_SHOWN = `(${SOURCES.map(quoted).join(", ")})`;

// ── THE CONFIG SCHEMA ────────────────────────────────────────────────────────────────────────
// items.json is checked ONCE, against this declaration, before anything is built. A refusal names
// the field's path (`questions[0].options[1].label`). A NEW FIELD IS A NEW LINE HERE; the
// build-label-page test walks this very table (`schema` prints it) with a wrong type, null and an
// empty value for each path, so a field without a line is a test failure, not a review finding.
// The leak guard on items (ALLOWED_FIELDS) stays separate and stays closed. `why` says, in a
// refusal, what a value must be (a pattern) or why a field is required (a page kind needs it).
type SchemaNode = (
  | { kind: "string"; required: boolean; pattern?: string }
  | { kind: "text"; required: boolean }
  | { kind: "integer"; required: boolean }
  | { kind: "boolean"; required: boolean; nullable?: boolean }
  | { kind: "array"; required: boolean; min: number; items: SchemaNode }
  | {
      kind: "map";
      required: boolean;
      min: number;
      key_pattern: string;
      values: SchemaNode;
    }
  | {
      kind: "object";
      required: boolean;
      closed: boolean;
      fields: Readonly<Record<string, SchemaNode>>;
    }
) & { why?: string };

const string = (required = true, pattern?: string, why?: string): SchemaNode =>
  pattern === undefined
    ? { kind: "string", required }
    : {
        kind: "string",
        required,
        pattern,
        ...(why === undefined ? {} : { why }),
      };
/** A string that may be empty: a blank line of code. */
const text = (): SchemaNode => ({ kind: "text", required: true });
const integer = (required = true): SchemaNode => ({
  kind: "integer",
  required,
});
const boolean = (required = true, nullable = false): SchemaNode =>
  nullable
    ? { kind: "boolean", required, nullable }
    : { kind: "boolean", required };
const array = (items: SchemaNode, required = true, min = 0): SchemaNode => ({
  kind: "array",
  required,
  min,
  items,
});
const mapping = (
  values: SchemaNode,
  keyPattern: string,
  min = 0,
): SchemaNode => ({
  kind: "map",
  required: true,
  min,
  key_pattern: keyPattern,
  values,
});
const obj = (
  fields: Readonly<Record<string, SchemaNode>>,
  closed = true,
  required = true,
): SchemaNode => ({ kind: "object", required, closed, fields });

// What an item and a practice item both may carry beyond text: a practice card looks like the real
// cards it rehearses. Each is optional here; a page's `kind` makes some of them required (KINDS).
const LINK = string(false, "https?://\\S+", "an http(s) link");
const optional = (fields: Readonly<Record<string, SchemaNode>>): SchemaNode =>
  obj(fields, true, false);
// A rule as the linter's own docs explain it, taken by the consumer from the source it names.
const EXPLANATION_SOURCES = [
  "ruff rule",
  "eslint docs",
  "plugin docs",
  "config message",
  "none",
];
const EXPLANATION = optional({
  source: string(
    true,
    EXPLANATION_SOURCES.join("|"),
    `one of ${EXPLANATION_SOURCES.join(", ")}`,
  ),
  what: string(false),
  why: string(false),
  example_bad: string(false),
  example_good: string(false),
  url: LINK,
});
// One glob or option of a reading: its raw value, a plain reading made by a fixed template, and
// whether it matches the example file (null: the row does not decide that).
const SETTING = obj({
  key: string(
    true,
    "files|ignores|rule|option:\\S+",
    "files, ignores, rule or option:<name>",
  ),
  raw: string(),
  plain: string(),
  matches_example: boolean(false, true),
});
const CARD_FIELDS: Readonly<Record<string, SchemaNode>> = {
  [RULES_FIELD]: array(
    obj({
      linter: string(true, "eslint|ruff", "eslint or ruff"),
      id: string(),
      explanation: EXPLANATION,
    }),
    false,
    1,
  ),
  [UNIT_FIELD]: obj(
    // `id` names one occurrence of the line (two files may hold the same words): never shown.
    {
      id: string(),
      text: string(),
      mark: string(),
      part: integer(),
      of: integer(),
    },
    true,
    false,
  ),
  [READINGS_FIELD]: obj({ a: string(), b: string() }, true, false),
  file: string(false),
  situation: optional({
    kind: string(true, "scope|construct", "scope or construct"),
    summary: string(),
    question: string(),
  }),
  example: optional({
    file: string(),
    url: LINK,
    lines: array(obj({ n: integer(), text: text(), mark: boolean() }), true, 1),
    message: string(),
    caught_by: string(true, "a|b", "a or b"),
  }),
  more_like_this: optional({ count: integer(), files: array(string()) }),
  details: optional({
    a: array(SETTING, true, 1),
    b: array(SETTING, true, 1),
  }),
  // `group` (the study's requirement id) is never shown: only the card's place among its cards.
  repeat: optional({ group: string(), index: integer(), of: integer() }),
};
/**
 * THE PAGE KINDS, and the card fields each requires on every item and practice card (#373). A fix to
 * a card is a field; a kind that needs it makes it required, so a page built without it fails the
 * schema with the field named instead of shipping the old card.
 */
type Kind = "approval" | "witness" | "labels";
const WITNESS_WHY =
  "a witness card asks about one situation in code (`situation`, `example`, `details`); items made for the earlier card, with only `readings` and `file`, are not built: make them again in this shape";
const KINDS: Readonly<Record<Kind, Readonly<Record<string, string>>>> = {
  // keep or drop a drawn requirement: the line it came from, marked, and the rule read for it
  approval: {
    [UNIT_FIELD]:
      "an approval card shows the line its requirement was drawn from, the requirement marked",
    [RULES_FIELD]:
      "an approval card shows the rule read for it, with the linter's own description",
  },
  // one situation in code where two readings of one requirement split (#380)
  witness: Object.fromEntries(
    ["situation", "example", "details"].map((f) => [f, WITNESS_WHY]),
  ),
  // gold labels, a blind review: the card is the item, nothing more is required
  labels: {},
};
const KIND_NAMES = Object.keys(KINDS).join(", ");
/** The card fields of a page of `kind`: those it needs, required and saying why. */
const cardFields = (kind: Kind): Readonly<Record<string, SchemaNode>> =>
  Object.fromEntries(
    Object.entries(CARD_FIELDS).map(([name, node]) => {
      const why = KINDS[kind][name];
      return [
        name,
        why === undefined ? node : { ...node, required: true, why },
      ];
    }),
  );
const itemSchema = (kind: Kind): SchemaNode =>
  obj(
    {
      source_id: string(),
      ...Object.fromEntries(
        PAGE_FIELDS.filter((f) => f !== "file").map((f) => [
          f,
          string(f === "group" || f === "body"),
        ]),
      ),
      ...cardFields(kind),
    },
    false, // an unlisted item field is the leak guard's refusal, with its own message
  );
// `icon` (an emoji) tells the buttons apart at a glance. No coloured side stripe on a button: it
// reads as decoration, not meaning (the build-label-page look test refuses one).
// `ask_why` (a prompt) makes the answer incomplete until the labeller says why: an approval page's "drop".
const OPTION_SCHEMA = obj({
  value: string(),
  label: string(),
  example: string(),
  icon: string(false),
  ask_why: string(false),
});
const practiceSchema = (kind: Kind): SchemaNode =>
  obj({
    ...Object.fromEntries(
      PAGE_FIELDS.filter((f) => f !== "group" && f !== "file").map((f) => [
        f,
        string(f === "body"),
      ]),
    ),
    ...cardFields(kind),
    expected: mapping(string(), NAME_PATTERN, 1),
    why: string(),
  });
const MIN_PRACTICE = 3;
const QUESTION_SCHEMA = obj({
  id: string(true, NAME_PATTERN),
  text: string(),
  short: string(false),
  options: array(OPTION_SCHEMA, true, 2),
});
const configSchema = (kind: Kind): SchemaNode =>
  obj({
    study: string(true, NAME_PATTERN), // becomes a file name
    kind: string(true, Object.keys(KINDS).join("|"), `one of ${KIND_NAMES}`),
    title: string(),
    intro: string(false),
    seed: integer(),
    groups: mapping(string(), NAME_PATTERN, 1), // ids become store document ids
    labeller_knows: array(string(true, NAME_PATTERN), false),
    // true: a "how well do you know {group}" question per group, for a study that filters on it
    // (rule 5). Left out, none is asked: an approval page's author has never seen the repositories.
    familiarity: boolean(false),
    familiarity_question: string(false),
    questions: array(QUESTION_SCHEMA, true, 1),
    practice: array(practiceSchema(kind), true, MIN_PRACTICE),
    practice_round: integer(false),
    items: array(itemSchema(kind), true, 1),
  });
/** The declared schema (`schema` prints it): every field, those a kind requires left optional. */
export const CONFIG_SCHEMA = configSchema("labels");

// ── checking a value against the schema ──────────────────────────────────────────────────────
const at = (path: string, name: string): string =>
  path ? `${path}.${name}` : name;
const fullMatch = (pattern: string, s: string): boolean =>
  new RegExp(`^(?:${pattern})$`, "u").test(s);
const ID_RULE = "letters, digits, - and _ only";

function checkString(
  value: Json,
  node: { pattern?: string; why?: string },
  where: string,
): void {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${where}: must be a non-empty string, got ${repr(value)}`);
  } else if (node.pattern !== undefined && !fullMatch(node.pattern, value)) {
    fail(`${where}: ${repr(value)} must be ${node.why ?? ID_RULE}`);
  }
}
const checkCount = (n: number, min: number, where: string): void => {
  if (n < min)
    fail(`${where}: needs ${String(min)} or more entries, has ${String(n)}`);
};
function checkArray(
  value: Json,
  node: { min: number; items: SchemaNode },
  path: string,
  where: string,
): void {
  if (!isList(value))
    return fail(`${where}: must be a list, got ${repr(value)}`);
  checkCount(value.length, node.min, where);
  value.forEach((entry, n) => {
    checkValue(entry, node.items, `${path}[${String(n)}]`);
  });
}
function checkMap(
  value: Json,
  node: { min: number; key_pattern: string; values: SchemaNode },
  path: string,
  where: string,
): void {
  if (!isObject(value))
    return fail(`${where}: must be an object, got ${repr(value)}`);
  checkCount(Object.keys(value).length, node.min, where);
  for (const [key, entry] of Object.entries(value)) {
    if (!fullMatch(node.key_pattern, key))
      fail(`${at(path, key)}: key must be ${ID_RULE}`);
    checkValue(entry, node.values, at(path, key));
  }
}
function checkObject(
  value: Json,
  node: { closed: boolean; fields: Readonly<Record<string, SchemaNode>> },
  path: string,
  where: string,
): void {
  if (!isObject(value))
    return fail(`${where}: must be an object, got ${repr(value)}`);
  for (const [name, sub] of Object.entries(node.fields)) {
    if (has(value, name)) checkValue(value[name] ?? null, sub, at(path, name));
    else if (sub.required)
      fail(
        `${at(path, name)}: is required and missing${sub.why === undefined ? "" : ` — ${sub.why}`}`,
      );
  }
  const unknown = Object.keys(value).find((name) => !has(node.fields, name));
  if (node.closed && unknown !== undefined) {
    fail(
      `${at(path, unknown)}: not a known field (known: ${Object.keys(node.fields).join(", ")})`,
    );
  }
}
/** A boolean, or null where the schema lets it say "unknown". */
function checkBoolean(value: Json, nullable: boolean, where: string): void {
  if (typeof value !== "boolean" && !(nullable && value === null))
    fail(`${where}: must be true or false, got ${repr(value)}`);
}
/** A string that may be empty (a blank line of code), or an integer. */
function checkScalar(
  value: Json,
  kind: "text" | "integer",
  where: string,
): void {
  if (kind === "text" && typeof value !== "string")
    fail(`${where}: must be a string, got ${repr(value)}`);
  if (
    kind === "integer" &&
    (typeof value !== "number" || !Number.isInteger(value))
  )
    fail(`${where}: must be an integer, got ${repr(value)}`);
}
/** Refuse the first place `value` departs from `node`; the message starts with the field's path. */
function checkValue(value: Json, node: SchemaNode, path: string): void {
  const where = path || "items.json";
  switch (node.kind) {
    case "string":
      checkString(value, node, where);
      break;
    case "text":
    case "integer":
      checkScalar(value, node.kind, where);
      break;
    case "boolean":
      checkBoolean(value, node.nullable === true, where);
      break;
    case "array":
      checkArray(value, node, path, where);
      break;
    case "map":
      checkMap(value, node, path, where);
      break;
    case "object":
      checkObject(value, node, path, where);
  }
}

// ── the config, once it passed the schema ─────────────────────────────────────────────────────
interface Option {
  readonly value: string;
  readonly label: string;
  readonly example: string;
  readonly icon?: string;
  readonly ask_why?: string;
}
interface Question {
  readonly id: string;
  readonly text: string;
  readonly short?: string;
  readonly options: readonly Option[];
}
interface Unit {
  readonly id: string;
  readonly text: string;
  readonly mark: string;
  readonly part: number;
  readonly of: number;
}
interface Explanation {
  readonly source: string;
  readonly what?: string;
  readonly why?: string;
  readonly example_bad?: string;
  readonly example_good?: string;
  readonly url?: string;
}
type CardRule = RuleRef & { readonly explanation?: Explanation };
interface Setting {
  readonly key: string;
  readonly raw: string;
  readonly plain: string;
  readonly matches_example?: boolean | null;
}
/** The witness card's own fields (#380), each optional unless the page's kind needs it. */
interface WitnessFields {
  readonly situation?: {
    readonly kind: string;
    readonly summary: string;
    readonly question: string;
  };
  readonly example?: {
    readonly file: string;
    readonly url?: string;
    readonly lines: readonly {
      readonly n: number;
      readonly text: string;
      readonly mark: boolean;
    }[];
    readonly message: string;
    readonly caught_by: string;
  };
  readonly more_like_this?: {
    readonly count: number;
    readonly files: readonly string[];
  };
  readonly details?: {
    readonly a: readonly Setting[];
    readonly b: readonly Setting[];
  };
  readonly repeat?: {
    readonly group: string;
    readonly index: number;
    readonly of: number;
  };
}
/** What a card shows, on an item and on a practice item alike. */
type Card = {
  readonly [F in (typeof PAGE_FIELDS)[number]]?: string;
} & WitnessFields & {
    readonly body: string;
    readonly rules?: readonly CardRule[];
    readonly unit?: Unit;
    readonly readings?: { readonly a: string; readonly b: string };
  };
type Item = Card & { readonly source_id: string; readonly group: string };
type Practice = Card & {
  readonly expected: Readonly<Record<string, string>>;
  readonly why: string;
};
interface Config {
  readonly study: string;
  readonly kind: Kind;
  readonly title: string;
  readonly intro?: string;
  readonly seed: number;
  readonly groups: Readonly<Record<string, string>>;
  readonly labeller_knows?: readonly string[];
  readonly familiarity?: boolean;
  readonly familiarity_question?: string;
  readonly questions: readonly Question[];
  readonly practice: readonly Practice[];
  readonly practice_round?: number;
  readonly items: readonly Item[];
}
/** The config is typed by passing CONFIG_SCHEMA: `checkValue` refuses (throws) on any departure. */
function assertConfig(value: Json): asserts value is Json & Config {
  checkValue(value, CONFIG_SCHEMA, "");
}

/**
 * THE definition of a valid answer: the values the build offers, per question and for familiarity.
 * The page script (`DATA.allowed`) and the exporter (`key.json`) both read this one result, so a
 * stored value counts as an answer on the page exactly when it counts in the export.
 */
const allowedValues = (
  questions: readonly Question[],
  asksFamiliarity: boolean,
): JsonObject => ({
  questions: Object.fromEntries(
    questions.map((q) => [q.id, q.options.map((o) => o.value)]),
  ),
  // The answers that need a reason, per question: the page and the export read the same list.
  needs_why: Object.fromEntries(
    questions.map((q) => [
      q.id,
      q.options.filter((o) => o.ask_why !== undefined).map((o) => o.value),
    ]),
  ),
  // Empty when the page asks no familiarity: the export then expects no group document at all.
  familiarity: asksFamiliarity ? FAMILIARITY.map((o) => o.value) : [],
});
const asksFamiliarity = (cfg: Config): boolean => cfg.familiarity === true;

/** Two values that read the same once case and surrounding space are gone. */
const readsAs = (s: string): string => s.trim().toLowerCase();

/** The first entry whose reading repeats an earlier one, with the index of that earlier one. */
const firstRepeat = (
  labels: readonly string[],
): { readonly at: number; readonly earlier: number } | undefined => {
  const seen = labels.map(readsAs);
  const at = seen.findIndex((x, i) => seen.indexOf(x) !== i);
  return at === -1
    ? undefined
    : { at, earlier: seen.findIndex((x) => x === seen[at]) };
};

// What a schema cannot say: references between fields, and values that must differ.
function checkGroups(cfg: Config): void {
  // The page heads each group with its label: two that read the same are two familiarity questions
  // the labeller cannot tell apart, exported under different group ids.
  const ids = Object.keys(cfg.groups);
  const labels = Object.values(cfg.groups);
  const twice = firstRepeat(labels);
  if (twice !== undefined) {
    fail(
      `groups.${String(ids[twice.at])}: ${repr(labels[twice.at])} reads the same as groups.${String(ids[twice.earlier])} — each group needs its own label`,
    );
  }
  (cfg.labeller_knows ?? []).forEach((gid, n) => {
    if (!has(cfg.groups, gid))
      fail(`labeller_knows[${String(n)}]: ${repr(gid)} is not in \`groups\``);
  });
}
function checkQuestion(
  q: Question,
  qn: number,
  earlierIds: readonly string[],
): void {
  if (earlierIds.includes(q.id))
    fail(`questions[${String(qn)}].id: ${repr(q.id)} is repeated`);
  const values = q.options.map((o) => o.value);
  if (new Set(values).size !== values.length) {
    fail(
      `questions[${String(qn)}].options: values must be distinct, got ${repr(values)}`,
    );
  }
  // Two buttons that read the same store different answers no one can tell apart afterwards.
  const twice = firstRepeat(q.options.map((o) => o.label));
  if (twice !== undefined) {
    fail(
      `questions[${String(qn)}].options[${String(twice.at)}].label: ${repr(q.options[twice.at]?.label)} reads the same as options[${String(twice.earlier)}].label — each button needs its own label`,
    );
  }
}
/**
 * Each practice item knows the answer to every question, and only offered answers: a practice the
 * page cannot score would let a misread question through unseen.
 */
function checkPractice(cfg: Config): void {
  const offered: Readonly<Record<string, readonly string[]>> =
    Object.fromEntries(
      cfg.questions.map((q) => [q.id, q.options.map((o) => o.value)]),
    );
  if ((cfg.practice_round ?? 1) < 1) {
    fail(`practice_round: ${repr(cfg.practice_round)} — must be 1 or more`);
  }
  cfg.practice.forEach((item, n) => {
    const where = `practice[${String(n)}].expected`;
    for (const [q, v] of Object.entries(item.expected)) {
      const values = offered[q];
      if (values === undefined)
        fail(
          `${where}.${q}: not a question of this page (${Object.keys(offered).join(", ")})`,
        );
      else if (!values.includes(v))
        fail(`${where}.${q}: ${repr(v)} is not one of ${values.join(", ")}`);
    }
    const missing = Object.keys(offered).find((q) => !has(item.expected, q));
    if (missing !== undefined)
      fail(`${where}.${missing}: every question needs its expected answer`);
  });
}
function checkConfig(cfg: Config): void {
  checkGroups(cfg);
  if (cfg.kind === "witness" && cfg.questions.length !== 1)
    fail(
      `questions: a witness page asks one question, each card's \`situation.question\` being its text; this one has ${String(cfg.questions.length)}`,
    );
  if (!asksFamiliarity(cfg) && cfg.familiarity_question !== undefined) {
    fail(
      `familiarity_question: ${repr(cfg.familiarity_question)} is never asked, because \`familiarity\` is not true — remove it, or set "familiarity": true`,
    );
  }
  cfg.questions.forEach((q, qn) => {
    checkQuestion(
      q,
      qn,
      cfg.questions.slice(0, qn).map((x) => x.id),
    );
  });
  checkPractice(cfg);
}

/** The practice as the page shows it and the key keeps it: neutral ids P1, P2 … in the given order. */
const practiceOf = (
  cfg: Config,
): readonly (Practice & { readonly id: string })[] =>
  cfg.practice.map((item, n) => ({ id: `P${String(n + 1)}`, ...item }));

// ── the items: the leak guard, and the references to the config ───────────────────────────────
/**
 * A line with several requirements is split upstream into one item per requirement, each carrying
 * `unit: {text, mark, part, of}`. A drawn sample may hold one part of a line and not the others; the
 * parts it holds agree on the line, are not repeated, and sit in one group (so `labeller_knows`
 * keeps or drops them together).
 */
interface Part {
  readonly item: Item;
  readonly unit: Unit;
  readonly n: number;
}
type Parts = readonly [Part, ...Part[]];
/** The items of each line, in items.json order; a line's list is never empty. */
const linesOf = (cfg: Config): ReadonlyMap<string, Parts> =>
  cfg.items.reduce((byLine, item, n) => {
    if (item.unit === undefined) return byLine;
    const part: Part = { item, unit: item.unit, n };
    const seen = byLine.get(item.unit.id);
    return byLine.set(
      item.unit.id,
      seen ? [seen[0], ...seen.slice(1), part] : [part],
    );
  }, new Map<string, Parts>());
/** One part against the first part of its line: same count, in range, not repeated, same group. */
function checkPart({ item, unit, n }: Part, parts: Parts): void {
  const [first] = parts;
  const at = `items[${String(n)}]`;
  if (unit.text !== first.unit.text)
    fail(
      `${at}.unit.text: ${repr(unit.text)}, but items[${String(first.n)}] of line ${repr(unit.id)} says ${repr(first.unit.text)}`,
    );
  if (unit.of !== first.unit.of)
    fail(
      `${at}.unit.of: ${String(unit.of)}, but items[${String(first.n)}].unit.of says ${String(first.unit.of)} for the same line`,
    );
  const earlier = parts.find((p) => p.n < n && p.unit.part === unit.part);
  if (earlier !== undefined)
    fail(
      `${at}.unit.part: ${String(unit.part)} repeats items[${String(earlier.n)}].unit.part`,
    );
  if (item.group !== first.item.group)
    fail(
      `${at}.group: ${repr(item.group)}, but items[${String(first.n)}] of the same line is in ${repr(first.item.group)}`,
    );
}
/** One unit on its own: its part in range, and its mark the requirement's words in the line. */
function checkUnit(unit: Unit | undefined, at: string): void {
  if (unit === undefined) return;
  if (unit.part < 1 || unit.part > unit.of)
    fail(
      `${at}.unit.part: ${String(unit.part)} is not between 1 and ${String(unit.of)}`,
    );
  if (!unit.text.includes(unit.mark))
    fail(
      `${at}.unit.mark: ${repr(unit.mark)} is not in the line ${repr(unit.text)} — mark the requirement with the line's own words`,
    );
}
function checkUnits(cfg: Config): void {
  cardsOf(cfg).forEach(([at, card]) => {
    checkUnit(card.unit, at);
  });
  for (const parts of linesOf(cfg).values()) {
    parts.forEach((p) => {
      checkPart(p, parts);
    });
  }
}
/**
 * A situation's sentence or question may name the marked line as `{line}`: the build writes «line N»
 * and the line's code there, so the question sits next to the code it is about (round-3 feedback).
 */
const LINE_TOKEN = "{line}";
const SITUATION_TEXTS = ["summary", "question"] as const;
/**
 * The line `{line}` stands for: the example's marked line, its number and its code without the indent
 * (checkCardShape: one exists when the token is used). The page writes «line N: » and the code as code
 * in place of the token, so a code line holding a backtick reads as it is.
 */
const lineOf = (card: Card) =>
  card.example?.lines
    .filter((l) => l.mark)
    .map((l) => ({ n: l.n, text: l.text.trim() }))[0];
/**
 * A card with a situation or settings is drawn as a witness card, around its example file; `{line}` in
 * a situation needs a marked line to stand for; «N more» counts at least the files it lists.
 */
function checkCardShape(at: string, card: Card): void {
  const needs = (["situation", "details"] as const).find(
    (f) => card[f] !== undefined,
  );
  if (needs !== undefined && card.example === undefined)
    fail(
      `${at}.example: is required with \`${needs}\` — the card shows its example file under the ${needs}; add the example, or remove \`${needs}\``,
    );
  const token = SITUATION_TEXTS.find((f) =>
    card.situation?.[f].includes(LINE_TOKEN),
  );
  if (token !== undefined && !card.example?.lines.some((l) => l.mark))
    fail(
      `${at}.situation.${token}: \`${LINE_TOKEN}\` names the marked line, and the example has no marked line — mark the line the linter caught (\`mark: true\`), or write the ${token} without \`${LINE_TOKEN}\``,
    );
  const more = card.more_like_this;
  if (more !== undefined && more.files.length > more.count)
    fail(
      `${at}.more_like_this.count: ${String(more.count)} is fewer than the ${String(more.files.length)} files it lists — the count is every file like it, the list may be shorter`,
    );
}
/**
 * What the witness schema cannot say: the caught line is marked, a rule's explanation says what the
 * rule does unless its source has none, a repeat sits inside its count, and on a witness page every
 * rule carries its explanation.
 */
function checkWitness(cfg: Config): void {
  cardsOf(cfg).forEach(([at, card]) => {
    checkCardShape(at, card);
    if (card.example !== undefined && !card.example.lines.some((l) => l.mark))
      fail(
        `${at}.example.lines: no line is marked — mark the line the linter caught (\`mark: true\`)`,
      );
    const r = card.repeat;
    if (r !== undefined && (r.index < 1 || r.index > r.of))
      fail(
        `${at}.repeat.index: ${String(r.index)} is not between 1 and ${String(r.of)}`,
      );
    (card.rules ?? []).forEach((rule, k) => {
      const where = `${at}.rules[${String(k)}].explanation`;
      const x = rule.explanation;
      if (x === undefined && cfg.kind === "witness")
        fail(
          `${where}: is required on a witness card — the linter's own explanation of the rule, or \`source: "none"\` when it has none`,
        );
      if (x !== undefined && x.source !== "none" && x.what === undefined)
        fail(
          `${where}.what: is required unless \`source\` is 'none' — what the rule does, in its source's words`,
        );
    });
  });
}
/** Every card of the config, items then practice, by path. */
const cardsOf = (cfg: Config) => [
  ...cfg.items.map((i, n) => [`items[${String(n)}]`, i] as const),
  ...cfg.practice.map((p, n) => [`practice[${String(n)}]`, p] as const),
];
function checkItemFields(cfg: Config): void {
  const sids: string[] = [];
  cfg.items.forEach((item, n) => {
    const extra = Object.keys(item)
      .filter((f) => !ALLOWED_FIELDS.includes(f))
      .sort();
    if (extra.length) {
      fail(
        `item #${String(n)} (${item.source_id}) carries ${extra.join(", ")}, which is not in the allow-list ${repr([...ALLOWED_FIELDS].sort())}. A blind page shows the labeller the item and nothing about the answer or the source. Remove the field from items.json; add it to PAGE_FIELDS only if it is safe for the labeller to see.`,
      );
    }
    if (sids.includes(item.source_id))
      fail(
        `items[${String(n)}].source_id: ${repr(item.source_id)} is repeated`,
      );
    sids.push(item.source_id);
    if (!has(cfg.groups, item.group))
      fail(
        `items[${String(n)}].group: ${repr(item.group)} is not in \`groups\``,
      );
  });
}
/** Every string inside a value: each is tested on its own, as the page renders it, never a serialisation. */
const stringsIn = (v: unknown): readonly string[] =>
  typeof v === "string"
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(stringsIn)
      : typeof v === "object" && v !== null
        ? Object.values(v).flatMap(stringsIn)
        : [];
/**
 * Every text of an item the labeller sees, by field: each string the page shows (the fields as
 * `shownFields` passes them, so a repeat without its group), and every rule with its explanation.
 */
const visibleTexts = (item: Item): readonly (readonly [string, string])[] =>
  Object.entries({
    ...shownFields(item),
    [RULES_FIELD]: item.rules ?? [],
  }).flatMap(([f, v]) => stringsIn(v).map((t) => [f, t] as const));
const escapeRegExp = (s: string): string =>
  s.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
/**
 * A source id typed into a visible field gives the source away as well as a field would. Short ids
 * ("7") would match ordinary text, so only ids of four characters or more are looked for.
 */
function checkNoSourceShown(cfg: Config): void {
  const long = cfg.items
    .map((i) => i.source_id)
    .filter((sid) => sid.length >= 4);
  for (const item of cfg.items) {
    for (const sid of long) {
      const word = new RegExp(
        `(?<![\\p{L}\\p{N}_-])${escapeRegExp(sid)}(?![\\p{L}\\p{N}_-])`,
        "u",
      );
      const field = visibleTexts(item).find(([, text]) => word.test(text))?.[0];
      if (field !== undefined) {
        fail(
          `the source id ${repr(sid)} appears in the visible \`${field}\` of item ${item.source_id}. Take it out of the text (or use source ids that are not natural words).`,
        );
      }
    }
  }
}

// ── ids: neutral, in an order fixed by the seed, kept across rebuilds ─────────────────────────
interface KeyEntry {
  readonly source_id: string;
  readonly group: string;
  readonly on_page: boolean;
}
interface OldKey {
  readonly seed: number;
  readonly ids: Readonly<Record<string, KeyEntry>>;
}
/** key.json is this script's own output, written by `build`; its shape is trusted, not re-checked. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- an assertion signature, no body to run
function assertOwnKey(_value: Json): asserts _value is Json & OldKey {}
const readOldKey = (keyPath: string, seed: number): OldKey | undefined => {
  if (!existsSync(keyPath)) return undefined;
  const old = readJson(keyPath);
  assertOwnKey(old);
  if (old.seed !== seed) {
    fail(
      `${keyPath} was made with seed ${String(old.seed)}; this config says ${String(seed)}. Answers are keyed by the old ids: restore the seed, or start a new study folder.`,
    );
  }
  return old;
};
/** Neutral ids G001… in an order fixed by the seed, and kept when a key file already exists. */
function assignIds(
  items: readonly Item[],
  seed: number,
  keyPath: string,
): {
  readonly ids: ReadonlyMap<string, string>;
  readonly entries: Readonly<Record<string, KeyEntry>>;
} {
  const old = readOldKey(keyPath, seed);
  const entries = old?.ids ?? {};
  const known = new Map(
    Object.entries(entries).map(([nid, v]) => [v.source_id, nid]),
  );
  const rank = (s: string): string =>
    createHash("sha256")
      .update(`${String(seed)}:${s}`)
      .digest("hex");
  const fresh = items
    .map((i) => i.source_id)
    .filter((sid) => !known.has(sid))
    .sort((a, b) => byText(rank(a), rank(b)));
  const ids = new Map([
    ...known,
    ...fresh.map((sid, k): [string, string] => [
      sid,
      `G${String(known.size + k + 1).padStart(3, "0")}`,
    ]),
  ]);
  return { ids, entries };
}

// ── a build, short of the page ──────────────────────────────────────────────────────────────────
/** A card's situation as the page shows it: `{line}` written out. */
const situationShown = (item: Card) =>
  item.situation === undefined
    ? {}
    : {
        situation: {
          kind: item.situation.kind,
          summary: item.situation.summary,
          question: item.situation.question,
          ...(SITUATION_TEXTS.some((f) =>
            item.situation?.[f].includes(LINE_TOKEN),
          )
            ? { line: lineOf(item) }
            : {}),
        },
      };
const shownFields = (item: Card): Readonly<Record<string, unknown>> => ({
  ...Object.fromEntries(
    PAGE_FIELDS.flatMap((f) => {
      const v = item[f];
      return v === undefined ? [] : [[f, v]];
    }),
  ),
  ...(item.unit === undefined
    ? {}
    : {
        [UNIT_FIELD]: {
          text: item.unit.text,
          mark: item.unit.mark,
          part: item.unit.part,
          of: item.unit.of,
        },
      }),
  ...(item.readings === undefined ? {} : { [READINGS_FIELD]: item.readings }),
  ...Object.fromEntries(
    WITNESS_FIELDS.filter((f) => f !== "repeat" && f !== "situation").flatMap(
      (f) => (item[f] === undefined ? [] : [[f, item[f]]]),
    ),
  ),
  ...situationShown(item),
  ...(item.repeat === undefined
    ? {}
    : { repeat: { index: item.repeat.index, of: item.repeat.of } }),
});
/** Rule → the linter's description (and a ruff rule's family), for every rule a card names. */
type Described = ReadonlyMap<string, RuleText>;
const ruleKey = (r: RuleRef): string => `${r.linter} ${r.id}`;
/** Ask the linter for every rule named; refuse, by path, a rule it cannot describe. */
function describeRules(cfg: Config, fromDir: string): Described {
  return new Map(
    cardsOf(cfg).flatMap(([at, card]) =>
      // A rule that carries its explanation was read from its source by the consumer.
      (card.rules ?? []).flatMap(
        (r, k): readonly (readonly [string, RuleText])[] => {
          if (r.explanation !== undefined) return [];
          const text = describeRule(r, fromDir);
          return text === undefined
            ? fail(
                `${at}.rules[${String(k)}]: ${r.linter} ${repr(r.id)} has no description from the linter (${r.linter === "ruff" ? "`ruff rule` does not know it, or ruff is not on PATH" : "not a rule of the ESLint, or of a plugin, installed where items.json is"}) — check the id`,
              )
            : [[ruleKey(r), text]];
        },
      ),
    ),
  );
}
const rulesShown = (card: Card, described: Described) =>
  card.rules === undefined
    ? {}
    : {
        [RULES_FIELD]: card.rules.map((r) => ({
          linter: r.linter,
          id: r.id,
          ...(r.explanation === undefined
            ? described.get(ruleKey(r))
            : { explanation: r.explanation }),
        })),
      };

/** Only what the labeller can answer goes on the page, and only that gets an id, in id order. */
function itemsOnPage(cfg: Config, keyPath: string) {
  const knows = cfg.labeller_knows;
  const items = cfg.items.filter(
    (i) => knows === undefined || knows.includes(i.group),
  );
  if (!items.length) fail("no item is left after `labeller_knows`");
  const { ids, entries } = assignIds(items, cfg.seed, keyPath);
  // Every item on the page was given an id by `assignIds` above.
  const idOf = (i: Item): string => String(ids.get(i.source_id));
  const sorted = [...items].sort((a, b) => byText(idOf(a), idOf(b)));
  return { items: sorted, ids, entries, idOf };
}
const practiceRound = (cfg: Config): number => cfg.practice_round ?? 1;

/** The practice as its cards show it, with the answers the page checks against. */
const practiceShown = (cfg: Config, described: Described) =>
  practiceOf(cfg).map((p) => ({
    id: p.id,
    expected: p.expected,
    why: p.why,
    ...shownFields(p),
    ...rulesShown(p, described),
  }));
/** What a page shows: the questions, the practice and the items, blind, with their neutral ids. */
function payloadOf(
  cfg: Config,
  page: ReturnType<typeof itemsOnPage>,
  described: Described,
) {
  const used = Object.keys(cfg.groups).filter((g) =>
    page.items.some((i) => i.group === g),
  );
  return {
    title: cfg.title,
    intro: cfg.intro ?? "",
    groups: used.map((g) => ({ id: g, label: String(cfg.groups[g]) })),
    familiarity_question: asksFamiliarity(cfg)
      ? (cfg.familiarity_question ?? "How well do you know {group}?")
      : "",
    familiarity: asksFamiliarity(cfg) ? FAMILIARITY : [],
    allowed: allowedValues(cfg.questions, asksFamiliarity(cfg)),
    questions: cfg.questions,
    practice: {
      round: practiceRound(cfg),
      items: practiceShown(cfg, described),
    },
    items: page.items.map((i) => ({
      id: page.idOf(i),
      ...shownFields(i),
      ...rulesShown(i, described),
    })),
  };
}
export type Payload = ReturnType<typeof payloadOf>;
/** Every id the key keeps (on the page now, or kept from an earlier build), with its source and group. */
function idsOf(cfg: Config, page: ReturnType<typeof itemsOnPage>): JsonObject {
  const shown = new Set(page.items.map(page.idOf));
  const groupOf = new Map([
    ...Object.values(page.entries).map((v): [string, string] => [
      v.source_id,
      v.group,
    ]),
    ...cfg.items.map((i): [string, string] => [i.source_id, i.group]),
  ]);
  const byId = [...page.ids].sort(([, a], [, b]) => byText(a, b));
  return Object.fromEntries(
    byId.map(([sid, nid]) => [
      nid,
      {
        source_id: sid,
        group: String(groupOf.get(sid)),
        on_page: shown.has(nid),
      },
    ]),
  );
}
/** Round → its practice items' expected answers. */
type Rounds = Readonly<Record<string, Expected>>;
type Expected = Readonly<Record<string, Readonly<Record<string, string>>>>;
/** Every round of a key's practice; a key from before `rounds` has only its own round. */
const roundsIn = (p: NonNullable<Key["practice"]>): Rounds =>
  p.rounds ?? { [String(p.round)]: p.expected };
/** The rounds an existing key holds, kept by the next build. */
const roundsOf = (keyPath: string): Rounds => {
  if (!existsSync(keyPath)) return {};
  const old = readJson(keyPath);
  assertKey(old);
  return old.practice === undefined ? {} : roundsIn(old.practice);
};
function keyOf(
  cfg: Config,
  page: ReturnType<typeof itemsOnPage>,
  earlier: Rounds,
): JsonObject {
  const practice = practiceOf(cfg);
  return {
    study: cfg.study,
    seed: cfg.seed,
    questions: cfg.questions.map((q) => q.id),
    // What counts as an answer: the same lists the page was given (`allowedValues`). `export`
    // checks every stored answer and familiarity against them, so the build's options decide.
    allowed: allowedValues(cfg.questions, asksFamiliarity(cfg)),
    // The practice is scored against this at export; its answers never go into the labels.
    practice: {
      round: practiceRound(cfg),
      expected: Object.fromEntries(practice.map((p) => [p.id, p.expected])),
      // Every round's items and expected answers, kept across rebuilds: an earlier round's stored
      // answers stay known to the export (a later round may have fewer items) and are scored too.
      rounds: {
        ...earlier,
        [String(practiceRound(cfg))]: Object.fromEntries(
          practice.map((p) => [p.id, p.expected]),
        ),
      },
    },
    ids: idsOf(cfg, page),
  };
}
/**
 * Everything a build does but lay out the page: reads and checks items.json (the schema, the
 * cross-field checks, the leak guard), gives the items their ids, writes key.json beside the page and
 * returns what the page shows. A page written by hand can take its blindness and its key from here.
 */
export function prepareBuild(configPath: string, outDir: string) {
  const cfg = readJson(configPath);
  assertConfig(cfg);
  // Once its `kind` is known to be one, the fields that kind needs on every card.
  checkValue(cfg, configSchema(cfg.kind), "");
  checkConfig(cfg);
  checkItemFields(cfg);
  checkUnits(cfg);
  checkWitness(cfg);
  checkNoSourceShown(cfg);
  const described = describeRules(cfg, dirname(configPath));
  mkdirSync(outDir, { recursive: true });
  const keyPath = join(outDir, "key.json");
  const earlier = roundsOf(keyPath);
  const page = itemsOnPage(cfg, keyPath);
  writeJson(keyPath, keyOf(cfg, page, earlier));
  return {
    payload: payloadOf(cfg, page, described),
    dropped: cfg.items.length - page.items.length,
  };
}

// ── the store's dump, checked against the key ─────────────────────────────────────────────────
interface Key {
  readonly study: string;
  readonly questions: readonly string[];
  readonly allowed?: Json;
  readonly practice?: {
    readonly round: number;
    readonly expected: Readonly<
      Record<string, Readonly<Record<string, string>>>
    >;
    /** Round → its items' expected answers; a key from before this field has only `round`. */
    readonly rounds?: Rounds;
  };
  readonly ids: Readonly<Record<string, KeyEntry>>;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- an assertion signature, no body to run
function assertKey(_value: Json): asserts _value is Json & Key {
  // key.json is this script's own output; what an older build left out is checked where it is read.
}

const ANSWER_DOC_FIELDS = ["answers", "reasons", "savedAt", "source"];
const GROUP_DOC_FIELDS = ["familiarity", "savedAt", "source"];
const DOC_FIELD_TYPES: readonly (readonly [
  string,
  (v: Json) => boolean,
  string,
])[] = [
  ["answers", isObject, "an object {question: value}"],
  ["reasons", isObject, "an object {question: text}"],
  [
    "familiarity",
    (v) => v === null || typeof v === "string",
    "a familiarity value (a string) or null",
  ],
  [
    "savedAt",
    (v) => v === null || typeof v === "string",
    "a timestamp string or null",
  ],
];
const COLLECTIONS = ["answers", "groups", "practice"] as const;
type Collection = (typeof COLLECTIONS)[number];
const COLLECTION_NAMES: readonly string[] = COLLECTIONS;
const NOUN: Readonly<Record<Collection, string>> = {
  answers: "answer",
  groups: "group",
  practice: "practice item",
};

/**
 * The store documents a practice of this key may have: every round up to the key's, so the answers
 * of an earlier round are known (and kept), not refused.
 */
const practiceDocs = (
  key: Key,
): readonly (readonly [string, readonly string[]])[] => {
  const p = key.practice;
  if (p === undefined) return [];
  // Each round's own questions: a later round may have dropped or renamed one.
  return Object.entries(roundsIn(p)).flatMap(([r, expected]) =>
    Object.entries(expected).map(
      ([pid, answers]) => [`r${r}-${pid}`, Object.keys(answers)] as const,
    ),
  );
};
/** For each collection: the names the key knows, the names still on the page, a document's fields. */
interface Names {
  /** Each name the key knows, with the questions a document of it may answer. */
  readonly known: readonly (readonly [string, readonly string[]])[];
  readonly onPage: readonly string[];
  readonly fields: readonly string[];
}
function knownNames(key: Key): Readonly<Record<Collection, Names>> {
  const entries = Object.entries(key.ids);
  const shown = entries.filter(([, m]) => m.on_page);
  const practice = practiceDocs(key);
  return {
    answers: {
      known: entries.map(([nid]) => [nid, key.questions] as const),
      onPage: shown.map(([nid]) => nid),
      fields: ANSWER_DOC_FIELDS,
    },
    groups: {
      known: entries.map(([, m]) => [m.group, key.questions] as const),
      onPage: shown.map(([, m]) => m.group),
      fields: GROUP_DOC_FIELDS,
    },
    practice: {
      known: practice,
      onPage: practice.map(([n]) => n),
      fields: ANSWER_DOC_FIELDS,
    },
  };
}
const sortedEntries = (o: JsonObject): readonly (readonly [string, Json])[] =>
  Object.entries(o).sort(([a], [b]) => byText(a, b));

function checkDumpShape(dump: Json): asserts dump is JsonObject {
  if (!isObject(dump))
    return fail(
      `store: ${typeName(dump)} — must be an object {answers, groups, practice}`,
    );
  for (const kind of COLLECTIONS) {
    const c = dump[kind];
    if (c !== undefined && !isObject(c))
      fail(`${kind}: ${typeName(c)} — must be an object {id: stored document}`);
  }
  const stray = Object.keys(dump)
    .sort()
    .find((top) => !COLLECTION_NAMES.includes(top));
  if (stray !== undefined)
    fail(
      `${stray}: the store has no such collection (expected ${COLLECTIONS.join(", ")})`,
    );
}
function checkDocName(
  where: string,
  name: string,
  kind: Collection,
  names: Names,
): readonly string[] {
  const hit = names.known.find(([n]) => n === name);
  if (hit === undefined) {
    return fail(
      `${where}: the key does not know this ${NOUN[kind]} (${[...new Set(names.known.map(([n]) => n))].sort().join(", ")})`,
    );
  }
  if (!names.onPage.includes(name)) {
    fail(
      `${where}: stored, but no longer on the page (a rebuild left it out), so the export would drop it; rebuild with it on the page, or take it out of the dump on purpose`,
    );
  }
  return hit[1];
}
function checkDocFields(
  where: string,
  doc: Json,
  kind: Collection,
  fields: readonly string[],
): asserts doc is JsonObject {
  if (!isObject(doc))
    return fail(`${where}: must be an object with ${fields.join(", ")}`);
  const stray = Object.keys(doc)
    .sort()
    .find((f) => !fields.includes(f));
  if (stray !== undefined)
    fail(
      `${where}/${stray}: not a field of a stored ${NOUN[kind]} (${fields.join(", ")})`,
    );
  if (!has(doc, "source"))
    fail(
      `${where}: no source; add "source": "chat" or "page" (one of ${SOURCES_SHOWN})`,
    );
  const source = doc["source"];
  if (typeof source !== "string" || !SOURCES.includes(source)) {
    fail(`${where}/source: ${repr(source)}; expected one of ${SOURCES_SHOWN}`);
  }
  // The types the export reads, so a hand merge is refused by path rather than crashing it.
  for (const [field, ok, what] of DOC_FIELD_TYPES) {
    const v = doc[field];
    if (v !== undefined && !ok(v))
      fail(`${where}/${field}: ${repr(v)} — must be ${what}`);
  }
}
function checkDocAnswers(
  where: string,
  doc: JsonObject,
  questions: readonly string[],
): void {
  const known = (part: string, q: string): void => {
    if (!questions.includes(q))
      fail(
        `${where}/${part}/${q}: not a question of the key (${questions.join(", ")})`,
      );
  };
  for (const [q, v] of sortedEntries(
    isObject(doc["answers"]) ? doc["answers"] : {},
  )) {
    known("answers", q);
    if (v !== null && typeof v !== "string")
      fail(
        `${where}/answers/${q}: ${repr(v)} — must be an option value (a string) or null`,
      );
  }
  for (const [q, v] of sortedEntries(
    isObject(doc["reasons"]) ? doc["reasons"] : {},
  )) {
    known("reasons", q);
    if (typeof v !== "string")
      fail(`${where}/reasons/${q}: ${repr(v)} — must be text`);
  }
}
/**
 * The whole store against the key, ONCE, before anything is read from it. Every name in it must be
 * one the key knows: an item id, a group, a question id, a field of the document; an item or group
 * must also still be on the page, or a rebuild that left it out would drop its stored answer. A
 * name the export does not read would otherwise be dropped without a word — a misspelled question
 * key in a chat merge (`boundry`), a misspelled group (`pyhton`) — and its answer lost from the
 * labels. Refuses, naming the path; the fix is one edit in the dump. Every document also says where
 * it came from: the page always writes `source: "page"`, so a document without one was merged by hand.
 */
function checkDump(dump: Json, key: Key): asserts dump is JsonObject {
  checkDumpShape(dump);
  const names = knownNames(key);
  for (const kind of COLLECTIONS) {
    const collection = dump[kind];
    for (const [name, doc] of sortedEntries(
      isObject(collection) ? collection : {},
    )) {
      const where = `${kind}/${name}`;
      const questions = checkDocName(where, name, kind, names[kind]);
      checkDocFields(where, doc, kind, names[kind].fields);
      checkDocAnswers(where, doc, questions);
    }
  }
}

/** A page built with `familiarity: false` asks no group anything: a group document came from elsewhere. */
function checkNoFamiliarity(dump: JsonObject, allowed: Allowed): void {
  const groups = isObject(dump["groups"]) ? dump["groups"] : {};
  const [first] = Object.keys(groups).sort(byText);
  if (allowed.familiarity.length === 0 && first !== undefined) {
    fail(
      `groups/${first}: familiarity is off for this page (items.json does not set \`"familiarity": true\`), so no group document is expected — take it out of the dump`,
    );
  }
}

// ── export ────────────────────────────────────────────────────────────────────────────────────
interface Allowed {
  readonly questions: Readonly<Record<string, readonly string[]>>;
  readonly needs_why?: Readonly<Record<string, readonly string[]>>;
  readonly familiarity: readonly string[];
}
/** The key's `allowed` lists, or a refusal naming a key made by an older build. */
function assertAllowed(
  a: Json | undefined,
  key: Key,
  keyPath: string,
): asserts a is Json & Allowed {
  const questions = isObject(a) ? a["questions"] : undefined;
  const complete =
    isObject(a) &&
    has(a, "familiarity") &&
    isObject(questions) &&
    key.questions.every((q) => has(questions, q));
  if (!complete) {
    fail(
      `${keyPath} has no \`allowed\` values for every question and for familiarity (made by an older build). Run \`build\` again with the same items.json and seed: ids are kept, the key gains them.`,
    );
  }
}
const docOf = (collection: Json | undefined, name: string): JsonObject => {
  const doc = isObject(collection) ? collection[name] : undefined;
  return isObject(doc) ? doc : {};
};
type Lists = Readonly<Record<string, readonly string[]>>;
/** The values a question offers (or needs a reason for); the key has a list for every question. */
const valuesOf = (lists: Lists, q: string): readonly string[] =>
  Object.entries(lists)
    .filter(([k]) => k === q)
    .flatMap(([, vs]) => vs);
const listed = (lists: Lists, q: string, v: string): boolean =>
  valuesOf(lists, q).includes(v);
const textOf = (v: Json | undefined): string | null =>
  typeof v === "string" ? v : null;
/** The text values of a stored object (answers, reasons): a null answer is no text. */
const textsOf = (o: Json | undefined): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(isObject(o) ? o : {}).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
interface Ctx {
  readonly key: Key;
  readonly allowed: Json & Allowed;
}

/**
 * An answer outside the question's allowed values (a typo in a chat answer, an option that was
 * removed or renamed between builds) is MARKED, not refused and not dropped: the item is
 * incomplete, the raw value is kept under `invalid_answers`, and the report names the item.
 * Refusing would hold every good label hostage to one typo at the moment the export must happen
 * (checklist rule 6); dropping it would lose what the labeller said.
 */
function answersOf(doc: JsonObject, ctx: Ctx) {
  const stored = textsOf(doc["answers"]);
  const raw = ctx.key.questions.map((q): [string, string | null] => [
    q,
    stored[q] ?? null,
  ]);
  const invalid = Object.fromEntries(
    raw.filter(([q, v]) => v !== null && !listed(ctx.allowed.questions, q, v)),
  );
  const given = Object.fromEntries(
    raw.map(([q, v]) => [q, has(invalid, q) ? null : v]),
  );
  return { given, invalid };
}
/** One item of the labels file: its answers, what is invalid, the reasons, and whether it is done. */
function labelOf(nid: string, meta: KeyEntry, doc: JsonObject, ctx: Ctx) {
  const { given, invalid } = answersOf(doc, ctx);
  const reasons = Object.fromEntries(
    Object.entries(textsOf(doc["reasons"])).filter(([, r]) => r.trim()),
  );
  const needsWhy = ctx.allowed.needs_why ?? {};
  const unexplained = Object.entries(given)
    .filter(
      ([q, v]) => v !== null && listed(needsWhy, q, v) && !has(reasons, q),
    )
    .map(([q]) => q);
  return {
    id: nid,
    source_id: meta.source_id,
    group: meta.group,
    answers: given,
    invalid_answers: invalid,
    reasons,
    unexplained,
    complete:
      Object.values(given).every((v) => v !== null) && !unexplained.length,
    source: textOf(doc["source"]),
    saved_at: doc["savedAt"] ?? null,
  };
}
type Label = ReturnType<typeof labelOf>;

/** Same rule as for item answers: a familiarity outside the options is marked, not counted as rated. */
function groupsOf(
  groupIds: readonly string[],
  groups: Json | undefined,
  allowed: Allowed,
) {
  return Object.fromEntries(
    groupIds.map((g) => {
      const doc = docOf(groups, g);
      const fam = textOf(doc["familiarity"]);
      const bad = fam !== null && !allowed.familiarity.includes(fam);
      return [
        g,
        {
          familiarity: bad ? null : fam,
          invalid_familiarity: bad ? fam : null,
          source: textOf(doc["source"]),
          saved_at: doc["savedAt"] ?? null,
        },
      ];
    }),
  );
}
function reportLabels(items: readonly Label[], allowed: Allowed): void {
  for (const i of items) {
    for (const [q, v] of Object.entries(i.invalid_answers)) {
      say(
        `  invalid ${i.id}: ${q}=${repr(v)} is not one of ${valuesOf(allowed.questions, q).join(", ")} (not counted)`,
      );
    }
    const missing = Object.entries(i.answers)
      .filter(([q, v]) => v === null && !has(i.invalid_answers, q))
      .map(([q]) => q);
    if (missing.length)
      say(`  incomplete ${i.id}: missing ${missing.join(", ")}`);
    for (const q of i.unexplained)
      say(`  incomplete ${i.id}: ${q}=${String(i.answers[q])} needs a reason`);
  }
}
function reportGroups(
  groups: ReturnType<typeof groupsOf>,
  allowed: Allowed,
): void {
  for (const [g, v] of Object.entries(groups)) {
    if (v.invalid_familiarity !== null) {
      say(
        `  invalid group ${g}: familiarity=${repr(v.invalid_familiarity)} is not one of ${allowed.familiarity.join(", ")} (not counted as rated)`,
      );
    } else if (v.familiarity === null)
      say(`  group ${g}: no familiarity answer`);
  }
}
/** Each practice item of the key's round: what was answered first, what was expected, whether they match. */
function scorePractice(dump: JsonObject, round: string, all: Expected) {
  return Object.entries(all).map(([pid, expected]) => {
    const doc = docOf(dump["practice"], `r${round}-${pid}`);
    const answers = isObject(doc["answers"]) ? doc["answers"] : {};
    const matched = Object.entries(expected).every(
      ([q, v]) => answers[q] === v,
    );
    return {
      id: pid,
      answers,
      expected,
      matched,
      savedAt: doc["savedAt"] ?? null,
    };
  });
}
/** One file per round: a second round exported the same day keeps the first. */
const practiceFile = (study: string, round: number, day: string): string =>
  `${study}-practice-r${String(round)}-${day}.json`;
/**
 * Every practice round the store holds answers for, each scored against its own expected answers
 * into its own file; never into the labels. The key's own round is reported even unanswered.
 */
function exportPractice(
  dump: JsonObject,
  key: Key,
  target: string,
  day: string,
): void {
  const p = key.practice;
  if (p === undefined) return;
  Object.entries(roundsIn(p))
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([round, expected]) => {
      exportRound(
        key.study,
        Number(round),
        scorePractice(dump, round, expected),
        {
          target,
          day,
          current: Number(round) === p.round,
        },
      );
    });
}
/** One round's scored practice to `<study>-practice-r<round>-<date>.json`, and one line about it. */
function exportRound(
  study: string,
  round: number,
  items: ReturnType<typeof scorePractice>,
  at: {
    readonly target: string;
    readonly day: string;
    readonly current: boolean;
  },
): void {
  if (!items.some((i) => Object.keys(i.answers).length)) {
    if (at.current) say(`practice round ${String(round)}: not answered`);
    return;
  }
  const missed = items.filter((i) => !i.matched).map((i) => i.id);
  const matched = items.length - missed.length;
  const path = join(at.target, practiceFile(study, round, at.day));
  writeJson(path, {
    study,
    round,
    exported: at.day,
    matched,
    total: items.length,
    items,
  });
  say(
    `practice round ${String(round)}: ${String(matched)} of ${String(items.length)} matched${missed.length ? `; missed ${missed.join(", ")}` : ""} -> ${path}`,
  );
}
/** The labels file: every item on the page with its answers, the groups, and the counts. */
function labelsOf(dump: JsonObject, ctx: Ctx, day: string) {
  const onPage = Object.entries(ctx.key.ids).filter(([, m]) => m.on_page);
  const items = onPage.map(([nid, meta]) =>
    labelOf(nid, meta, docOf(dump["answers"], nid), ctx),
  );
  const groups = ctx.allowed.familiarity.length
    ? groupsOf(
        [...new Set(onPage.map(([, m]) => m.group))],
        dump["groups"],
        ctx.allowed,
      )
    : {};
  return {
    study: ctx.key.study,
    exported: day,
    questions: ctx.key.questions,
    items,
    groups,
    complete_items: items.filter((i) => i.complete).length,
    invalid_items: items.filter((i) => Object.keys(i.invalid_answers).length)
      .length,
    invalid_groups: Object.values(groups).filter(
      (g) => g.invalid_familiarity !== null,
    ).length,
    total_items: items.length,
  };
}
export function exportLabels(
  dumpPath: string,
  keyPath: string,
  outDir: string,
  day: string,
): void {
  const dump = readJson(dumpPath);
  const key = readJson(keyPath);
  assertKey(key);
  const allowed = key.allowed;
  assertAllowed(allowed, key, keyPath);
  checkDump(dump, key);
  checkNoFamiliarity(dump, allowed);
  const out = labelsOf(dump, { key, allowed }, day);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${key.study}-labels-${day}.json`);
  writeJson(path, out);
  exportPractice(dump, key, outDir, day);
  say(
    `wrote ${path}: ${String(out.complete_items)} of ${String(out.total_items)} items complete`,
  );
  reportLabels(out.items, allowed);
  reportGroups(out.groups, allowed);
}
