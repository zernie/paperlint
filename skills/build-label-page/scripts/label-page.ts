#!/usr/bin/env node
/**
 * label-page — the generator of the build-label-page skill: items.json → a blind, single-page
 * labelling app (HTML) and its key, and the answers back out of the store.
 *
 *   build  <items.json> <out-dir>                          → out/page.html, out/key.json
 *   export <dump.json> <key.json> <data-dir> [--date D]    → data/<study>-labels-<D>.json
 *                                                            (+ data/<study>-practice-<D>.json)
 *   schema                                                 → the declared items.json schema
 *
 * Run from the skill, never copied into a study: a fix reaches every page built after it.
 *
 * `build` makes a page that stores each answer in the artifact's `db` store (publish page.html with
 * `capabilities: {db: {}}`). `export` turns what the store holds into one JSON file for the study's
 * data/ folder. Answers and familiarity values outside the offered options are not counted (page and
 * export read the same `allowed` lists): the item or group is marked incomplete and reported
 * (`invalid_answers`, `invalid_familiarity`). `dump.json` is the store's three collections:
 *
 *   {"answers":  {"G001": {"answers": {"q": "v"}, "reasons": {"q": "why"}, "savedAt": "…", "source": "page"}, …},
 *    "groups":   {"python": {"familiarity": "well", "savedAt": "…", "source": "page"}, …},
 *    "practice": {"r1-P1": {"answers": {"q": "v"}, "savedAt": "…", "source": "page"}, …}}
 *
 * THE COMPREHENSION STEP (rule 8). The first screen shows every question with one real example per
 * answer (`example`, required on every option). Then the practice items: their answers are known
 * (`expected`, one per question), and after each one the page shows the expected answer and `why`.
 * The real items open once every practice item of the current `practice_round` is answered; a miss
 * does not lock them, it tells the labeller to tell the agent, who rewords the question, raises
 * `practice_round` and rebuilds. The page stores the FIRST practice answer only, in its own
 * collection (`practice`, documents `r<round>-P<n>`), so `export` keeps it out of the labels and
 * writes it to `<study>-practice-<date>.json`. An item card asks one question at a time.
 *
 * items.json is checked once against the declared CONFIG_SCHEMA (`schema` prints it): every field's
 * type, required or optional, non-empty strings, ids as strings of letters, digits, - and _. A bad
 * field stops the build and is named by its path, e.g. `questions[0].options[1].label`.
 *
 *   {
 *     "study": "demo-gold",                 file-name stem
 *     "title": "Label these",               2-4 words; the page title
 *     "intro": "One or two sentences.",     optional
 *     "seed": 7,                            fixes the order; change it and every id changes
 *     "groups": {"python": "Python"},
 *     "labeller_knows": ["python"],         optional: items of other groups are not put on the page
 *     "familiarity_question": "How well do you know {group}?",          optional
 *     "questions": [{"id": "label", "text": "Is this correct?", "short": "correct?",
 *                    "options": [{"value": "yes", "label": "Yes", "example": "one real case",
 *                                 "icon": "✅"},                      icon: optional
 *                                {"value": "no", "label": "No", "example": "another real case",
 *                                 "icon": "❌", "ask_why": "What is wrong with it?"}]}],
 *                                           ask_why: optional; the answer is incomplete until a
 *                                           reason is given. In any shown text, backticks render
 *                                           as code.
 *     "practice": [{"body": "…", "expected": {"label": "yes"}, "why": "one line"}, …],   3 or more
 *     "practice_round": 1,                  optional; raise it after rewording, the practice reopens
 *     "items": [{"source_id": "case-0412-b", "group": "python", "body": "…", "code": "…",
 *                "context": "…"}]
 *   }
 *
 * TypeScript, compiled beside itself to `label-page.js` by `npm run build`: a consumer runs the skill
 * from `node_modules`, where Node does not strip types. The skill names the `.js`. The page itself
 * (its style and script) is `page-template.html` beside this file, kept as exact bytes.
 *
 * EXIT CODES: 0 built / exported / printed · 1 refused (`REFUSED: <path>: …`) · 2 usage.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { COMMANDS } from "./label-page-commands.ts";

// ── refusals and output ───────────────────────────────────────────────────────────────────────
class Refusal extends Error {
  readonly exitCode: number;
  constructor(exitCode: number, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}
const fail = (message: string): never => {
  throw new Refusal(1, `REFUSED: ${message}`);
};
const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
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
/** JSON as the page always carried it: `", "` and `": "` between entries, Unicode kept. */
const compactJson = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(compactJson).join(", ")}]`;
  if (typeof v !== "object" || v === null) return JSON.stringify(v);
  return `{${Object.entries(v)
    .map(([k, x]) => `${JSON.stringify(k)}: ${compactJson(x)}`)
    .join(", ")}}`;
};
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
const PAGE_FIELDS = ["group", "title", "body", "code", "context"] as const;
const PRIVATE_FIELDS = ["source_id"] as const;
const ALLOWED_FIELDS: readonly string[] = [...PAGE_FIELDS, ...PRIVATE_FIELDS];

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
// The leak guard on items (ALLOWED_FIELDS) stays separate and stays closed.
type SchemaNode =
  | { kind: "string"; required: boolean; pattern?: string }
  | { kind: "integer"; required: boolean }
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
    };

const string = (required = true, pattern?: string): SchemaNode =>
  pattern === undefined
    ? { kind: "string", required }
    : { kind: "string", required, pattern };
const integer = (required = true): SchemaNode => ({
  kind: "integer",
  required,
});
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
): SchemaNode => ({ kind: "object", required: true, closed, fields });

const ITEM_SCHEMA = obj(
  {
    source_id: string(),
    ...Object.fromEntries(
      PAGE_FIELDS.map((f) => [f, string(f === "group" || f === "body")]),
    ),
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
const PRACTICE_SCHEMA = obj({
  ...Object.fromEntries(
    PAGE_FIELDS.filter((f) => f !== "group").map((f) => [
      f,
      string(f === "body"),
    ]),
  ),
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
const CONFIG_SCHEMA = obj({
  study: string(true, NAME_PATTERN), // becomes a file name
  title: string(),
  intro: string(false),
  seed: integer(),
  groups: mapping(string(), NAME_PATTERN, 1), // ids become store document ids
  labeller_knows: array(string(true, NAME_PATTERN), false),
  familiarity_question: string(false),
  questions: array(QUESTION_SCHEMA, true, 1),
  practice: array(PRACTICE_SCHEMA, true, MIN_PRACTICE),
  practice_round: integer(false),
  items: array(ITEM_SCHEMA, true, 1),
});

// ── checking a value against the schema ──────────────────────────────────────────────────────
const at = (path: string, name: string): string =>
  path ? `${path}.${name}` : name;
const fullMatch = (pattern: string, s: string): boolean =>
  new RegExp(`^(?:${pattern})$`, "u").test(s);
const ID_RULE = "letters, digits, - and _ only";

function checkString(
  value: Json,
  node: { pattern?: string },
  where: string,
): void {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${where}: must be a non-empty string, got ${repr(value)}`);
  } else if (node.pattern !== undefined && !fullMatch(node.pattern, value)) {
    fail(`${where}: ${repr(value)} must be ${ID_RULE}`);
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
    else if (sub.required) fail(`${at(path, name)}: is required and missing`);
  }
  const unknown = Object.keys(value).find((name) => !has(node.fields, name));
  if (node.closed && unknown !== undefined) {
    fail(
      `${at(path, unknown)}: not a known field (known: ${Object.keys(node.fields).join(", ")})`,
    );
  }
}
/** Refuse the first place `value` departs from `node`; the message starts with the field's path. */
function checkValue(value: Json, node: SchemaNode, path: string): void {
  const where = path || "items.json";
  switch (node.kind) {
    case "string":
      checkString(value, node, where);
      break;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        fail(`${where}: must be an integer, got ${repr(value)}`);
      }
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
type Item = Readonly<Record<string, string>> & {
  readonly source_id: string;
  readonly group: string;
};
interface Practice {
  readonly title?: string;
  readonly body: string;
  readonly code?: string;
  readonly context?: string;
  readonly expected: Readonly<Record<string, string>>;
  readonly why: string;
}
interface Config {
  readonly study: string;
  readonly title: string;
  readonly intro?: string;
  readonly seed: number;
  readonly groups: Readonly<Record<string, string>>;
  readonly labeller_knows?: readonly string[];
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
const allowedValues = (questions: readonly Question[]): JsonObject => ({
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
  familiarity: FAMILIARITY.map((o) => o.value),
});

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
      const field = PAGE_FIELDS.find((f) => word.test(item[f] ?? ""));
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

// ── build ─────────────────────────────────────────────────────────────────────────────────────
const TEMPLATE = readFileSync(
  join(import.meta.dirname, "page-template.html"),
  "utf8",
);
const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const shownFields = (item: Item): Readonly<Record<string, string>> =>
  Object.fromEntries(
    PAGE_FIELDS.flatMap((f) => {
      const v = item[f];
      return v === undefined ? [] : [[f, v]];
    }),
  );

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

function pageOf(
  cfg: Config,
  items: readonly Item[],
  idOf: (i: Item) => string,
): string {
  const used = Object.keys(cfg.groups).filter((g) =>
    items.some((i) => i.group === g),
  );
  const payload = {
    title: cfg.title,
    intro: cfg.intro ?? "",
    groups: used.map((g) => ({ id: g, label: String(cfg.groups[g]) })),
    familiarity_question:
      cfg.familiarity_question ?? "How well do you know {group}?",
    familiarity: FAMILIARITY,
    allowed: allowedValues(cfg.questions),
    questions: cfg.questions,
    practice: { round: practiceRound(cfg), items: practiceOf(cfg) },
    items: items.map((i) => ({ id: idOf(i), ...shownFields(i) })),
  };
  // `</` inside JSON inside a <script> would end the script early.
  const data = compactJson(payload).replaceAll("</", "<\\/");
  return TEMPLATE.replaceAll("__TITLE__", () =>
    escapeHtml(cfg.title),
  ).replaceAll("__DATA__", () => data);
}
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
function keyOf(cfg: Config, page: ReturnType<typeof itemsOnPage>): JsonObject {
  return {
    study: cfg.study,
    seed: cfg.seed,
    questions: cfg.questions.map((q) => q.id),
    // What counts as an answer: the same lists the page was given (`allowedValues`). `export`
    // checks every stored answer and familiarity against them, so the build's options decide.
    allowed: allowedValues(cfg.questions),
    // The practice is scored against this at export; its answers never go into the labels.
    practice: {
      round: practiceRound(cfg),
      expected: Object.fromEntries(
        practiceOf(cfg).map((p) => [p.id, p.expected]),
      ),
    },
    ids: idsOf(cfg, page),
  };
}
function build(configPath: string, outDir: string): void {
  const cfg = readJson(configPath);
  assertConfig(cfg);
  checkConfig(cfg);
  checkItemFields(cfg);
  checkNoSourceShown(cfg);
  mkdirSync(outDir, { recursive: true });
  const page = itemsOnPage(cfg, join(outDir, "key.json"));
  const dropped = cfg.items.length - page.items.length;
  writeFileSync(
    join(outDir, "page.html"),
    pageOf(cfg, page.items, page.idOf),
    "utf8",
  );
  writeJson(join(outDir, "key.json"), keyOf(cfg, page));
  const groups = Object.keys(cfg.groups).filter((g) =>
    page.items.some((i) => i.group === g),
  ).length;
  say(
    `built ${join(outDir, "page.html")}: ${String(page.items.length)} items, ${String(groups)} groups${dropped ? `, ${String(dropped)} left out (labeller does not know their group)` : ""}`,
  );
  say(
    `wrote ${join(outDir, "key.json")}: the only link from G-ids to source ids; it is NOT part of the page`,
  );
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
const practiceDocs = (key: Key): readonly string[] => {
  const p = key.practice ?? { round: 0, expected: {} };
  return Array.from({ length: p.round }, (_, r) =>
    Object.keys(p.expected).map((pid) => `r${String(r + 1)}-${pid}`),
  ).flat();
};
/** For each collection: the names the key knows, the names still on the page, a document's fields. */
function knownNames(key: Key): Readonly<
  Record<
    Collection,
    {
      known: readonly string[];
      onPage: readonly string[];
      fields: readonly string[];
    }
  >
> {
  const entries = Object.entries(key.ids);
  const shown = entries.filter(([, m]) => m.on_page);
  const practice = practiceDocs(key);
  return {
    answers: {
      known: entries.map(([nid]) => nid),
      onPage: shown.map(([nid]) => nid),
      fields: ANSWER_DOC_FIELDS,
    },
    groups: {
      known: entries.map(([, m]) => m.group),
      onPage: shown.map(([, m]) => m.group),
      fields: GROUP_DOC_FIELDS,
    },
    practice: { known: practice, onPage: practice, fields: ANSWER_DOC_FIELDS },
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
  names: ReturnType<typeof knownNames>[Collection],
): void {
  if (!names.known.includes(name)) {
    fail(
      `${where}: the key does not know this ${NOUN[kind]} (${[...new Set(names.known)].sort().join(", ")})`,
    );
  }
  if (!names.onPage.includes(name)) {
    fail(
      `${where}: stored, but no longer on the page (a rebuild left it out), so the export would drop it; rebuild with it on the page, or take it out of the dump on purpose`,
    );
  }
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
      checkDocName(where, name, kind, names[kind]);
      checkDocFields(where, doc, kind, names[kind].fields);
      checkDocAnswers(where, doc, key.questions);
    }
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
function scorePractice(dump: JsonObject, p: NonNullable<Key["practice"]>) {
  return Object.entries(p.expected).map(([pid, expected]) => {
    const doc = docOf(dump["practice"], `r${String(p.round)}-${pid}`);
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
/** The practice of the key's round, scored, into its own file; never into the labels. */
function exportPractice(
  dump: JsonObject,
  key: Key,
  target: string,
  day: string,
): void {
  const p = key.practice;
  if (p === undefined) return;
  const items = scorePractice(dump, p);
  if (!items.some((i) => Object.keys(i.answers).length)) {
    say(`practice round ${String(p.round)}: not answered`);
    return;
  }
  const missed = items.filter((i) => !i.matched).map((i) => i.id);
  const matched = items.length - missed.length;
  const path = join(target, `${key.study}-practice-${day}.json`);
  writeJson(path, {
    study: key.study,
    round: p.round,
    exported: day,
    matched,
    total: items.length,
    items,
  });
  say(
    `practice round ${String(p.round)}: ${String(matched)} of ${String(items.length)} matched${missed.length ? `; missed ${missed.join(", ")}` : ""} -> ${path}`,
  );
}
/** The labels file: every item on the page with its answers, the groups, and the counts. */
function labelsOf(dump: JsonObject, ctx: Ctx, day: string) {
  const onPage = Object.entries(ctx.key.ids).filter(([, m]) => m.on_page);
  const items = onPage.map(([nid, meta]) =>
    labelOf(nid, meta, docOf(dump["answers"], nid), ctx),
  );
  const groups = groupsOf(
    [...new Set(onPage.map(([, m]) => m.group))],
    dump["groups"],
    ctx.allowed,
  );
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
function exportLabels(
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

// ── command line ──────────────────────────────────────────────────────────────────────────────
const USAGE =
  "usage: label-page.js build <items.json> <out-dir> | export <dump.json> <key.json> <data-dir> [--date YYYY-MM-DD] | schema";
const usage = (): never => {
  throw new Refusal(2, USAGE);
};
const today = (): string => {
  const d = new Date();
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
/** How many paths each subcommand takes, and whether it takes `--date`. */
const ARITY: Readonly<
  Record<string, { readonly paths: number; readonly dated: boolean }>
> = {
  [COMMANDS.schema]: { paths: 0, dated: false },
  [COMMANDS.build]: { paths: 2, dated: false },
  [COMMANDS.export]: { paths: 3, dated: true },
};
const parsedArgs = () => {
  try {
    return parseArgs({
      options: { date: { type: "string" } },
      allowPositionals: true,
    });
  } catch {
    return usage();
  }
};
function exportCommand(
  paths: readonly string[],
  date: string | undefined,
): void {
  const [dump = "", key = "", out = ""] = paths;
  const day = date ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("--date must be YYYY-MM-DD");
  exportLabels(dump, key, out, day);
}
function main(): void {
  const { values, positionals } = parsedArgs();
  const [cmd = "", ...paths] = positionals;
  const arity = ARITY[cmd];
  const fits =
    arity !== undefined &&
    arity.paths === paths.length &&
    (arity.dated || values.date === undefined);
  if (!fits) usage();
  if (cmd === COMMANDS.schema) say(JSON.stringify(CONFIG_SCHEMA, null, 2));
  else if (cmd === COMMANDS.build) build(String(paths[0]), String(paths[1]));
  else exportCommand(paths, values.date);
}

try {
  main();
} catch (e) {
  // An unexpected error (a file that cannot be written) prints its message, not a stack.
  process.stderr.write(`${String(Reflect.get(Object(e), "message"))}\n`);
  process.exitCode = e instanceof Refusal ? e.exitCode : 1;
}
