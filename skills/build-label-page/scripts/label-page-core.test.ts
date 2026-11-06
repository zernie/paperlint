/**
 * The generator's CORE, called in this process: the items.json schema and its checks, the leak
 * guard, ids and the key, the dump check and the export. No DOM here; the page is
 * label-page-html.test.ts. Each check both ways: quiet on a good input, refusing a bad one by path.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as R from "remeda";
import { test } from "vitest";
import { z } from "zod";
import {
  APPROVAL_PRACTICE,
  DONE_PRACTICE,
  Exported,
  approvalCard,
  ITEMS,
  PRACTICE,
  QUESTIONS,
  WORK,
  approval,
  build,
  config,
  exportAt,
  labelsFile,
  run,
  setup,
} from "../../../test/label-page-kit.ts";

/** A node of the declared config schema, as `example-generator.py schema` prints it. */
const Node: z.ZodType<SchemaNode> = z.lazy(() =>
  z.object({
    kind: z.enum([
      "string",
      "text",
      "integer",
      "boolean",
      "map",
      "array",
      "object",
    ]),
    required: z.boolean(),
    pattern: z.string().optional(),
    key_pattern: z.string().optional(),
    min: z.number().optional(),
    closed: z.boolean().optional(),
    items: Node.optional(),
    values: Node.optional(),
    fields: z.record(z.string(), Node).optional(),
  }),
);

interface SchemaNode {
  readonly kind:
    "string" | "text" | "integer" | "boolean" | "map" | "array" | "object";
  readonly required: boolean;
  readonly pattern?: string | undefined;
  readonly key_pattern?: string | undefined;
  readonly min?: number | undefined;
  readonly closed?: boolean | undefined;
  readonly items?: SchemaNode | undefined;
  readonly values?: SchemaNode | undefined;
  readonly fields?: Readonly<Record<string, SchemaNode>> | undefined;
}

const Doc = z.json();

type Doc = z.infer<typeof Doc>;

interface DocObject {
  readonly [key: string]: Doc;
}

const isObject = (v: Doc | undefined): v is DocObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Every optional field of a card, for an item and a practice item alike. */
const CARD = {
  title: "T",
  code: "c = 1",
  context: "ctx",
  file: "`src/a.ts`",
  rules: [{ linter: "eslint", id: "no-console" }],
  unit: { id: "L0", text: "One line.", mark: "One", part: 1, of: 1 },
  readings: { a: "on", b: "off" },
  situation: { summary: "S", question: "Q?" },
  excerpt: {
    file: "src/a.ts",
    lang: "TypeScript",
    url: "https://example.com/a.ts",
    gutter_header: "depth",
    lines: [{ n: 1, text: "", mark: true, gutter: "1", context: false }],
    annotation: "a `Term` here",
    caption: "C",
    mark_label: "M",
  },
  quote: { text: "Q with Term", source: "`R.md`, line 1" },
  terms: [
    {
      term: "Term",
      note: [
        {
          title: "T",
          says: "S",
          quote: "Q",
          code: "x = 1",
          example: "E",
          url: "https://example.com/t",
          url_label: "U",
        },
      ],
    },
  ],
  answer_notes: { label: { yes: "like A" } },
  references: {
    summary: "S",
    entries: [
      {
        label: "L",
        title: "T",
        fields: [{ label: "F", text: "X", style: "code" }],
        url: "https://example.com/r",
        url_label: "U",
      },
    ],
  },
  more: { summary: "S", items: ["`src/b.ts`"], rest: "R" },
  table: {
    summary: "S",
    note: "N",
    rows: [
      {
        label: "L",
        value: "V",
        plain: "P",
        mark: { tone: "yes", text: "Y" },
      },
    ],
  },
  repeat: { group: "g", index: 1, of: 1 },
};
/** A config with EVERY optional field present, so every schema path has a value to spoil. */
const FULL: DocObject = (() => {
  const doc = Doc.parse(
    config({
      intro: "Label these.",
      questions: [
        {
          ...QUESTIONS[0],
          options: [
            QUESTIONS[0]?.options[0],
            { ...QUESTIONS[0]?.options[1], ask_why: "What is wrong with it?" },
          ],
        },
        QUESTIONS[1],
      ],
      labeller_knows: ["python", "go", "rust"],
      answerers: ["author", "second"],
      min_seconds: 30,
      familiarity: true,
      familiarity_question: "How well do you know {group}?",
      labels: {
        place: "C",
        body: "B",
        line: "L",
        line_part: "{line} {part}/{of}",
        repeat: "R",
        practice_example: "P",
        hidden: "H {from}-{to}",
        hidden_one: "H {from}",
        wait: "W {s}",
      },
      practice: PRACTICE.map((p, n) => (n === 0 ? { ...p, ...CARD } : p)),
      items: ITEMS.map((i, n) =>
        n === 0 ? { ...i, ...CARD, answerers: ["author"] } : i,
      ),
    }),
  );
  assert.ok(isObject(doc));
  return doc;
})();

interface Leaf {
  readonly path: string;
  readonly node: SchemaNode;
  /** An array entry or a map value: it is not "a field", so it cannot be missing. */
  readonly member: boolean;
}

/** The leaves one level down from `node`, whose value in the config is `value`. */
function children(
  node: SchemaNode,
  value: Doc | undefined,
  path: string,
): readonly Leaf[] {
  if (isObject(value)) {
    return node.kind === "object"
      ? Object.entries(node.fields ?? {}).flatMap(([name, sub]) =>
          leaves(
            sub,
            value[name],
            path === "" ? name : `${path}.${name}`,
            false,
          ),
        )
      : mapChildren(node, value, path);
  }
  if (Array.isArray(value) && node.kind === "array" && node.items) {
    return leaves(node.items, value[0], `${path}[0]`, true);
  }
  return [];
}

function mapChildren(
  node: SchemaNode,
  value: DocObject,
  path: string,
): readonly Leaf[] {
  if (node.kind !== "map" || !node.values) return [];
  const [k, v] = Object.entries(value)[0] ?? ["", undefined];
  return leaves(node.values, v, `${path}.${k}`, true);
}

/** Every concrete path of `value` under `node`, with the node that governs it. */
function leaves(
  node: SchemaNode,
  value: Doc | undefined,
  path: string,
  member: boolean,
): readonly Leaf[] {
  return [{ path, node, member }, ...children(node, value, path)];
}

/** `doc` with the value at `steps` replaced, or removed when `bad` is `undefined`. */
function put(
  doc: Doc,
  steps: readonly (string | number)[],
  bad: Doc | undefined,
): Doc {
  const [head, ...rest] = steps;
  if (head === undefined) return bad ?? null;
  if (Array.isArray(doc) && typeof head === "number") {
    return doc.map((v, i) => (i === head ? put(v, rest, bad) : v));
  }
  if (isObject(doc) && typeof head === "string") {
    if (rest.length === 0 && bad === undefined) {
      return Object.fromEntries(
        Object.entries(doc).filter(([k]) => k !== head),
      );
    }
    return { ...doc, [head]: put(doc[head] ?? null, rest, bad) };
  }
  return doc;
}

const stepsOf = (path: string): readonly (string | number)[] =>
  [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) =>
    m[2] !== undefined ? Number(m[2]) : (m[1] ?? ""),
  );

/** The config with the value at `path` replaced (or removed when `bad` is `undefined`). */
function spoil(path: string, bad: Doc | undefined): DocObject {
  const doc = put(FULL, stepsOf(path), bad);
  assert.ok(isObject(doc));
  return doc;
}

const WRONG_TYPES: Readonly<Record<SchemaNode["kind"], readonly Doc[]>> = {
  string: [null, 1, true, ["x"], {}, "", "   "],
  text: [null, 1, true, ["x"], {}],
  integer: [null, "7", true, 7.5, []],
  boolean: [null, "false", 0, [], {}],
  map: [null, "x", ["x"], 1],
  array: [null, "x", {}, 1],
  object: [null, "x", ["x"], 1],
};

/** Build `doc`; the exit status and output. */
function tryBuild(name: string, doc: DocObject): ReturnType<typeof run> {
  const dir = setup(name, doc);
  return run(["build", join(dir, "items.json"), join(dir, "out")]);
}

type BadCase = readonly [label: string, value: Doc | undefined];

const bad = (label: string, value: Doc | undefined): BadCase => [label, value];

/** The values that must be refused at `leaf`: wrong type, null, empty, a malformed id, missing. */
function badCases({ node, member }: Leaf): readonly BadCase[] {
  const wrongType = WRONG_TYPES[node.kind]
    // an empty list is a legal value where nothing is required of it
    .filter((v) => !(Array.isArray(v) && node.kind === "array"))
    .map((v) => bad(JSON.stringify(v), v));
  const extra: readonly BadCase[] = [
    // `__proto__` matches the id pattern, but the page stores answers in plain JavaScript objects,
    // where assigning it sets the prototype instead of an answer: every tap would save nothing.
    ...(node.pattern === undefined
      ? []
      : [bad("bad id!", "bad id!"), bad("__proto__", "__proto__")]),
    ...(node.kind === "array" && node.min ? [bad("[]", [])] : []),
    ...(node.kind === "map" && node.min ? [bad("{}", {})] : []),
    ...(node.required && !member ? [bad("(missing)", undefined)] : []),
  ];
  return [...wrongType, ...extra];
}

/** `doc` with its first item's own answerers taken out. */
function withoutItemAnswerers(doc: DocObject): DocObject {
  const out = put(doc, ["items", 0, "answerers"], undefined);
  assert.ok(isObject(out));
  return out;
}
/**
 * A field whose absence takes another with it: familiarity_question asks nothing unless familiarity
 * is on, and an item's answerers name the page's.
 */
const RELAX: Partial<Record<string, (doc: DocObject) => DocObject>> = {
  familiarity: (doc) => R.omit(doc, ["familiarity_question"]),
  answerers: withoutItemAnswerers,
};

/** Spoil `leaf` each way in `badCases`; every one must stop the build and name the path. */
function expectRefused(leaf: Leaf): void {
  badCases(leaf).forEach(([label, value], i) => {
    const name = `schema-${leaf.path.replace(/\W/g, "_")}-${String(i)}`;
    const r = tryBuild(name, spoil(leaf.path, value));
    const what = `${leaf.path} = ${label}`;
    assert.notEqual(r.status, 0, `${what} must stop the build`);
    assert.ok(
      r.out.includes(`REFUSED: ${leaf.path}`),
      `${what}: the refusal must name the path\n${r.out}`,
    );
    assert.doesNotMatch(r.out, /Traceback/, `${what}\n${r.out}`);
  });
  if (!leaf.node.required && !leaf.member) {
    const absent = spoil(leaf.path, undefined);
    const r = tryBuild(
      `schema-${leaf.path.replace(/\W/g, "_")}-absent`,
      (RELAX[leaf.path] ?? R.identity())(absent),
    );
    assert.equal(r.status, 0, `${leaf.path} is optional: ${r.out}`);
  }
}

const DOCUMENTED_FIELDS = [
  "study",
  "kind",
  "title",
  "intro",
  "seed",
  "groups",
  "labeller_knows",
  "answerers",
  "min_seconds",
  "familiarity",
  "familiarity_question",
  "questions",
  "items",
];

/** Configs only the cross-field checks refuse, each with the refusal that names it. */
function moreRefusals(): readonly (readonly [
  string,
  Record<string, unknown>,
  string,
])[] {
  const [q] = QUESTIONS;
  assert.ok(q !== undefined);
  const [yes, no] = q.options;
  assert.ok(yes !== undefined && no !== undefined);
  const [first] = ITEMS;
  assert.ok(first !== undefined);
  return [
    [
      "group-key",
      { groups: { "bad id!": "Python" } },
      "groups.bad id!: key must be letters, digits, - and _ only",
    ],
    [
      "knows-unknown",
      { labeller_knows: ["nope"] },
      "labeller_knows[0]: 'nope' is not in `groups`",
    ],
    [
      "knows-none",
      { labeller_knows: [] },
      "no item is left after `labeller_knows`",
    ],
    [
      "question-twice",
      { questions: [q, q] },
      "questions[1].id: 'label' is repeated",
    ],
    [
      "value-twice",
      { questions: [{ ...q, options: [yes, { ...yes, label: "Y2" }] }] },
      "questions[0].options: values must be distinct, got ['yes', 'yes']",
    ],
    [
      "label-twice",
      { questions: [{ ...q, options: [yes, { ...no, label: " yes " }] }] },
      "questions[0].options[1].label: ' yes ' reads the same as options[0].label",
    ],
    ["round-0", { practice_round: 0 }, "practice_round: 0 — must be 1 or more"],
    [
      "source-twice",
      { items: [first, first] },
      "items[1].source_id: 'case-1000' is repeated",
    ],
    [
      "group-unknown",
      { items: [{ ...first, group: "cobol" }] },
      "items[0].group: 'cobol' is not in `groups`",
    ],
    ["quote", { study: "it's" }, `study: "it's" must be letters`],
    ["quotes", { study: `a'b"c` }, `study: 'a\\'b"c' must be letters`],
    ["true", { seed: true }, "seed: must be an integer, got True"],
    ["false", { seed: false }, "seed: must be an integer, got False"],
  ];
}

test("🔴 the leak guard: a field outside the allow-list stops the build and is named", () => {
  for (const field of ["model_answer", "verdict", "source", "difficulty"]) {
    const items = [{ ...ITEMS[0], [field]: "x" }, ...ITEMS.slice(1)];
    const dir = setup(`leak-${field}`, config({ items }));
    const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
    assert.notEqual(r.status, 0, field);
    assert.match(r.out, new RegExp(`REFUSED.*${field}`), r.out);
  }
});

test("🔴 the leak guard: a source id typed into a visible text stops the build", () => {
  const items = [
    { ...ITEMS[0], body: `see case-1005 for the same` },
    ...ITEMS.slice(1),
  ];
  const dir = setup("leak-text", config({ items }));
  const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /case-1005/);
});

test("only the groups the labeller knows reach the page, and only they get ids", () => {
  const { page, key } = build(
    setup("knows", config({ labeller_knows: ["python", "go"] })),
  );
  const onPage = Object.values(key.ids).filter((v) => v.on_page);
  assert.ok(onPage.length > 0 && onPage.length < ITEMS.length);
  assert.ok(onPage.every((v) => v.group !== "rust"));
  assert.equal(Object.keys(key.ids).length, onPage.length);
  assert.ok(!page.includes('"id":"Rust"') && !page.includes('"label":"Rust"'));
});

test("rebuilding keeps every id; a new item takes the next one", () => {
  const dir = setup("stable", config());
  const first = build(dir).key;
  const more = [
    ...ITEMS,
    { source_id: "case-2000", group: "go", body: "late addition" },
  ];
  writeFileSync(
    join(dir, "items.json"),
    JSON.stringify(config({ items: more })),
  );
  const second = build(dir).key;
  for (const [id, v] of Object.entries(first.ids)) {
    assert.equal(second.ids[id]?.source_id, v.source_id, id);
  }
  assert.equal(second.ids["G013"]?.source_id, "case-2000");
  const wrongSeed = setup("stable", config({ seed: 99, items: more }));
  assert.notEqual(
    run(["build", join(wrongSeed, "items.json"), join(wrongSeed, "out")])
      .status,
    0,
  );
});

test("🔴 build refuses an option without a usable value or label, and names the question and the option", () => {
  const bad: readonly (readonly [string, unknown])[] = [
    ["no-value", { label: "Maybe" }],
    ["null-value", { value: null, label: "Maybe" }],
    ["empty-value", { value: "", label: "Maybe" }],
    ["no-label", { value: "maybe" }],
    ["empty-label", { value: "maybe", label: "  " }],
    ["not-an-object", "maybe"],
    // a different value behind a button that reads the same: the answer cannot be interpreted
    [
      "same-label",
      { value: "maybe", label: ` ${QUESTIONS[1]?.options[0]?.label ?? ""} ` },
    ],
  ];
  for (const [name, option] of bad) {
    const questions = [
      QUESTIONS[0],
      {
        ...QUESTIONS[1],
        options: [...(QUESTIONS[1]?.options ?? []), option],
      },
    ];
    const dir = setup(`option-${name}`, config({ questions }));
    const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
    assert.notEqual(r.status, 0, `${name} must stop the build`);
    assert.match(r.out, /REFUSED.*questions\[1\]\.options\[2\]/s, r.out);
  }
});

test("🔴 export does not count an answer outside the question's allowed values; it marks the item incomplete and names it", () => {
  const dir = setup("export-typo", config());
  const { key } = build(dir);
  const [a, b, c] = Object.keys(key.ids);
  assert.ok(a !== undefined && b !== undefined && c !== undefined);
  const dump = {
    answers: {
      [a]: { answers: { label: "yes", boundary: "clear" }, source: "page" },
      // a typo from a chat answer: "yse" is not one of yes/no
      [b]: { answers: { label: "yse", boundary: "clear" }, source: "chat" },
      // options changed between builds: "maybe" is not offered any more
      [c]: { answers: { label: "no", boundary: "maybe" }, source: "page" },
    },
  };
  writeFileSync(join(dir, "dump.json"), JSON.stringify(dump));
  const r = run([
    "export",
    join(dir, "dump.json"),
    join(dir, "out", "key.json"),
    join(dir, "data"),
    "--date",
    "2026-01-02",
  ]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, new RegExp(`invalid ${b}: label='yse'`), r.out);
  assert.match(r.out, new RegExp(`invalid ${c}: boundary='maybe'`), r.out);
  const file = Exported.parse(
    JSON.parse(
      readFileSync(
        join(dir, "data", "demo-gold-labels-2026-01-02.json"),
        "utf8",
      ),
    ),
  );
  assert.equal(file.complete_items, 1, "only the valid item is complete");
  assert.equal(file.items.find((i) => i.id === b)?.complete, false);
  assert.equal(file.items.find((i) => i.id === c)?.complete, false);
  assert.deepEqual(file.items.find((i) => i.id === b)?.invalid_answers, {
    label: "yse",
  });
  assert.equal(file.items.find((i) => i.id === b)?.answers["label"], null);
  assert.equal(file.items.find((i) => i.id === b)?.source, "chat");
});

test("🔴 the config is checked against one declared schema: every field, with a wrong type, null or empty, is refused and named by its path", () => {
  const printed = run(["schema"]);
  assert.equal(printed.status, 0, printed.out);
  const schema = Node.parse(JSON.parse(printed.out));
  assert.equal(
    tryBuild("schema-ok", FULL).status,
    0,
    "the full config must build before it is spoiled",
  );
  const all = leaves(schema, FULL, "", false).filter((l) => l.path !== "");
  assert.ok(
    all.length > 25,
    `the schema walk found ${String(all.length)} fields`,
  );
  all.forEach(expectRefused);
  // A key the schema does not know, in each closed object, is refused by path.
  const closed = [{ path: "", node: schema, member: false }, ...all].filter(
    (l) => l.node.kind === "object" && l.node.closed !== false,
  );
  assert.ok(
    closed.length >= 3,
    "the root, a question and an option are closed",
  );
  closed.forEach(({ path }, i) => {
    const where = path === "" ? "zzz" : `${path}.zzz`;
    const r = tryBuild(`schema-unknown-${String(i)}`, spoil(where, 1));
    assert.notEqual(r.status, 0, `${where} must stop the build`);
    assert.ok(r.out.includes(`REFUSED: ${where}`), `${where}\n${r.out}`);
  });
  // Every field the docstring documents has a line in the schema.
  const paths = new Set(all.map((l) => l.path));
  for (const f of DOCUMENTED_FIELDS) {
    assert.ok(paths.has(f), `${f} is in the schema`);
  }
}, 120_000);

test("🔴 a numeric question id is refused at build: JSON keys are strings, so it would be stored under one name and keyed under another", () => {
  const questions = [{ ...QUESTIONS[0], id: 1 }, QUESTIONS[1]];
  const dir = setup("numeric-id", config({ questions }));
  const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /REFUSED: questions\[0\]\.id/, r.out);
});

test("🔴 a familiarity_question that is not a string is refused at build, not a page that throws when it renders", () => {
  for (const bad of [null, 5, ["x"]]) {
    const dir = setup("fam-q", config({ familiarity_question: bad }));
    const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
    assert.notEqual(r.status, 0, JSON.stringify(bad));
    assert.match(r.out, /REFUSED: familiarity_question/, r.out);
  }
});

test("export: one file named by the date, chat answers kept, incomplete items named", () => {
  const dir = setup("export", config());
  const { key } = build(dir);
  const ids = Object.keys(key.ids);
  const [a, b] = ids;
  assert.ok(a !== undefined && b !== undefined);
  const dump = {
    answers: {
      [a]: {
        answers: { label: "yes", boundary: "clear" },
        savedAt: "2026-01-02T03:04:05Z",
        source: "page",
      },
      [b]: {
        answers: { label: "no" },
        savedAt: "2026-01-02T03:05:00Z",
        source: "chat",
      },
    },
    groups: {
      python: {
        familiarity: "well",
        savedAt: "2026-01-02T03:04:00Z",
        source: "page",
      },
    },
  };
  writeFileSync(join(dir, "dump.json"), JSON.stringify(dump));
  const r = run([
    "export",
    join(dir, "dump.json"),
    join(dir, "out", "key.json"),
    join(dir, "data"),
    "--date",
    "2026-01-02",
  ]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, new RegExp(`incomplete ${b}: missing boundary`));
  const file = Exported.parse(
    JSON.parse(
      readFileSync(
        join(dir, "data", "demo-gold-labels-2026-01-02.json"),
        "utf8",
      ),
    ),
  );
  assert.equal(file.complete_items, 1);
  assert.equal(file.total_items, ids.length);
  assert.equal(file.items.find((i) => i.id === a)?.source, "page");
  assert.equal(file.items.find((i) => i.id === b)?.source, "chat");
  assert.equal(
    file.items.find((i) => i.id === a)?.source_id,
    key.ids[a]?.source_id,
  );
});

test("export refuses a source it does not know, and an id the key does not know", () => {
  const dir = setup("export-bad", config());
  build(dir);
  const keyPath = join(dir, "out", "key.json");
  writeFileSync(
    join(dir, "d1.json"),
    JSON.stringify({ answers: { G001: { answers: {}, source: "guess" } } }),
  );
  assert.notEqual(
    run(["export", join(dir, "d1.json"), keyPath, join(dir, "data")]).status,
    0,
  );
  writeFileSync(
    join(dir, "d2.json"),
    JSON.stringify({ answers: { G999: { answers: {} } } }),
  );
  assert.notEqual(
    run(["export", join(dir, "d2.json"), keyPath, join(dir, "data")]).status,
    0,
  );
  // A familiarity merged under a misspelled group would be dropped, and its group exported unrated.
  writeFileSync(
    join(dir, "d3.json"),
    JSON.stringify({
      groups: { pyhton: { familiarity: "well", source: "chat" } },
    }),
  );
  const r3 = run(["export", join(dir, "d3.json"), keyPath, join(dir, "data")]);
  assert.notEqual(r3.status, 0, r3.out);
  assert.match(
    r3.out,
    /groups\/pyhton: the key does not know this group/,
    r3.out,
  );
});

test("🔴 export checks every name in the store against the key: a stray one is refused by its path, never dropped", () => {
  const dir = setup("export-stray", config());
  build(dir);
  const keyPath = join(dir, "out", "key.json");
  const doc = { answers: { label: "yes" }, source: "chat" };
  const cases: readonly (readonly [string, unknown])[] = [
    [
      "answers/G001/answers/boundry",
      { answers: { G001: { ...doc, answers: { boundry: "clear" } } } },
    ],
    ["answers/G001/note", { answers: { G001: { ...doc, note: "x" } } }],
    [
      "groups/python/familarity",
      { groups: { python: { familarity: "well", source: "chat" } } },
    ],
    ["answer: the store has no such collection", { answer: {} }],
  ];
  cases.forEach(([path, dump], i) => {
    const file = join(dir, `stray-${String(i)}.json`);
    writeFileSync(file, JSON.stringify(dump));
    const r = run(["export", file, keyPath, join(dir, "data")]);
    assert.notEqual(r.status, 0, `${path}: ${r.out}`);
    assert.ok(r.out.includes(path), `${path} must be named\n${r.out}`);
  });
});

test("🔴 export refuses a stored answer or familiarity without a source, and names it: a missing one is not relabelled as the page's", () => {
  const dir = setup("export-no-source", config());
  build(dir);
  const keyPath = join(dir, "out", "key.json");
  const dumps = {
    "answers/G001": { answers: { G001: { answers: { label: "yes" } } } },
    "groups/python": { groups: { python: { familiarity: "well" } } },
  };
  for (const [path, dump] of Object.entries(dumps)) {
    const file = join(dir, `${path.replace("/", "-")}.json`);
    writeFileSync(file, JSON.stringify(dump));
    const r = run(["export", file, keyPath, join(dir, "data")]);
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, new RegExp(`${path}: no source`), r.out);
  }
});

test("🔴 build refuses two groups whose headings read the same: the labeller could not tell which one a familiarity is for", () => {
  const dir = setup(
    "group-labels",
    config({ groups: { python: "Python", python3: " python ", go: "Go" } }),
  );
  const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /groups\.python3/, r.out);
});

test("🔴 export refuses an answer kept for an item a rebuild took off the page, instead of dropping it", () => {
  const dir = setup("off-page", config());
  const before = build(dir).key;
  writeFileSync(
    join(dir, "items.json"),
    JSON.stringify(config({ labeller_knows: ["python"] })),
  );
  const after = build(dir).key;
  const gone = Object.keys(after.ids).find(
    (id) =>
      before.ids[id]?.on_page === true && after.ids[id]?.on_page === false,
  );
  assert.ok(gone !== undefined, "the rebuild must take an item off the page");
  const group = after.ids[gone]?.group ?? "";
  const cases = {
    [`answers/${gone}`]: {
      answers: { [gone]: { answers: { label: "yes" }, source: "page" } },
    },
    [`groups/${group}`]: {
      groups: { [group]: { familiarity: "well", source: "page" } },
    },
  };
  Object.entries(cases).forEach(([path, dump], i) => {
    const file = join(dir, `off-${String(i)}.json`);
    writeFileSync(file, JSON.stringify(dump));
    const r = run([
      "export",
      file,
      join(dir, "out", "key.json"),
      join(dir, "data"),
    ]);
    assert.notEqual(r.status, 0, `${path}: ${r.out}`);
    assert.ok(
      r.out.includes(`${path}: `) && r.out.includes("no longer on the page"),
      r.out,
    );
  });
});

test("🔴 export refuses a stored field of the wrong type by its path, never a Python traceback", () => {
  const dir = setup("export-types", config());
  build(dir);
  const keyPath = join(dir, "out", "key.json");
  const cases: readonly (readonly [string, unknown])[] = [
    [
      "answers/G001/answers",
      { answers: { G001: { answers: [], source: "chat" } } },
    ],
    [
      "answers/G001/answers/label",
      { answers: { G001: { answers: { label: 5 }, source: "chat" } } },
    ],
    [
      "answers/G001/savedAt",
      { answers: { G001: { answers: {}, savedAt: 1, source: "chat" } } },
    ],
    [
      "groups/python/familiarity",
      { groups: { python: { familiarity: 3, source: "chat" } } },
    ],
    [
      "answers/G001/source",
      { answers: { G001: { answers: {}, source: ["chat"] } } },
    ],
    ["answers", { answers: [], groups: {} }],
    ["groups", { groups: "python" }],
    ["store", []],
  ];
  cases.forEach(([path, dump], i) => {
    const file = join(dir, `type-${String(i)}.json`);
    writeFileSync(file, JSON.stringify(dump));
    const r = run(["export", file, keyPath, join(dir, "data")]);
    assert.notEqual(r.status, 0, `${path}: ${r.out}`);
    assert.doesNotMatch(r.out, /Traceback/, `${path}\n${r.out}`);
    assert.ok(r.out.includes(`${path}: `), `${path} must be named\n${r.out}`);
  });
});

test("🔴 build refuses an answer option without an example: every answer is shown on one real case", () => {
  const [first, ...rest] = QUESTIONS;
  assert.ok(first !== undefined);
  const bare = {
    ...first,
    options: first.options.map(({ value, label }) => ({ value, label })),
  };
  const dir = setup("no-example", config({ questions: [bare, ...rest] }));
  const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /questions\[0\]\.options\[0\]\.example: is required/);
});

test("🔴 build refuses fewer than three practice items, an expected answer that is not offered, and one that leaves a question out", () => {
  const cases: readonly [string, unknown, RegExp][] = [
    ["two", PRACTICE.slice(0, 2), /practice: needs 3 or more entries, has 2/],
    [
      "unoffered",
      [
        { ...PRACTICE[0], expected: { label: "maybe", boundary: "clear" } },
        ...PRACTICE.slice(1),
      ],
      /practice\[0\]\.expected\.label: 'maybe' is not one of yes, no/,
    ],
    [
      "partial",
      [{ ...PRACTICE[0], expected: { label: "yes" } }, ...PRACTICE.slice(1)],
      /practice\[0\]\.expected\.boundary: every question needs its expected answer/,
    ],
    [
      "stray",
      [
        { ...PRACTICE[0], expected: { ...PRACTICE[0]?.expected, extra: "x" } },
        ...PRACTICE.slice(1),
      ],
      /practice\[0\]\.expected\.extra: not a question of this page/,
    ],
  ];
  for (const [name, practice, message] of cases) {
    const dir = setup(`practice-${name}`, config({ practice }));
    const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
    assert.notEqual(r.status, 0, name);
    assert.match(r.out, message, name);
  }
});

test("🔴 export keeps the practice out of the labels and writes it to its own file, with what matched", () => {
  const dir = setup("practice-export", config());
  build(dir);
  const practice = {
    ...DONE_PRACTICE,
    "r1-P2": {
      answers: { label: "yes", boundary: "clear" },
      source: "page",
      savedAt: "2026-01-02T10:00:00Z",
    },
  };
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({ answers: {}, groups: {}, practice }),
  );
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  const labels = labelsFile(dir);
  assert.doesNotMatch(labels, /practice|r1-P/);
  const file = z
    .object({
      round: z.number(),
      matched: z.number(),
      total: z.number(),
      items: z.array(
        z.object({
          id: z.string(),
          matched: z.boolean(),
          answers: z.unknown(),
          expected: z.unknown(),
        }),
      ),
    })
    .parse(
      JSON.parse(
        readFileSync(
          join(dir, "data", "demo-gold-practice-r1-2026-01-02.json"),
          "utf8",
        ),
      ),
    );
  assert.equal(file.round, 1);
  assert.equal(file.matched, 2);
  assert.equal(file.total, 3);
  assert.deepEqual(
    file.items.map((i) => [i.id, i.matched]),
    [
      ["P1", true],
      ["P2", false],
      ["P3", true],
    ],
  );
  assert.match(r.out, /practice round 1: 2 of 3 matched; missed P2/);
});

test("🔴 export refuses a stored practice answer the key does not know, by its path", () => {
  const dir = setup("practice-stray", config());
  build(dir);
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({
      answers: {},
      groups: {},
      practice: { "r1-P9": { answers: {}, source: "page" } },
    }),
  );
  const r = exportAt(dir);
  assert.notEqual(r.status, 0);
  assert.match(
    r.out,
    /practice\/r1-P9: the key does not know this practice item/,
  );
});

test("🔴 approval: export keeps each reason with its answer, and a drop without one is incomplete and named", () => {
  const dir = setup("approval-export", approval());
  const { key } = build(dir);
  const [a, b] = Object.keys(key.ids);
  assert.ok(a !== undefined && b !== undefined);
  const answers = {
    [a]: {
      answers: { keep: "drop" },
      reasons: { keep: "a process rule" },
      source: "page",
    },
    [b]: { answers: { keep: "drop" }, source: "page" },
  };
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({ answers, groups: {} }),
  );
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  const file = z
    .object({
      items: z.array(
        z.object({
          id: z.string(),
          complete: z.boolean(),
          reasons: z.record(z.string(), z.string()),
        }),
      ),
    })
    .parse(JSON.parse(labelsFile(dir)));
  assert.deepEqual(file.items.find((i) => i.id === a)?.reasons, {
    keep: "a process rule",
  });
  assert.equal(file.items.find((i) => i.id === a)?.complete, true);
  assert.equal(file.items.find((i) => i.id === b)?.complete, false);
  assert.match(r.out, new RegExp(`${b}: keep=drop needs a reason`));
});

test("🔴 approval: a stored reason that is not text, or for a question the key does not know, is refused by path", () => {
  const dir = setup("approval-bad-reason", approval());
  const { key } = build(dir);
  const [a] = Object.keys(key.ids);
  assert.ok(a !== undefined);
  for (const [reasons, message] of [
    [{ keep: 3 }, new RegExp(`answers/${a}/reasons/keep: 3 — must be text`)],
    [
      { kept: "x" },
      new RegExp(`answers/${a}/reasons/kept: not a question of the key`),
    ],
  ] as const) {
    writeFileSync(
      join(dir, "dump.json"),
      JSON.stringify({
        answers: {
          [a]: { answers: { keep: "drop" }, reasons, source: "page" },
        },
        groups: {},
      }),
    );
    const r = exportAt(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.out, message);
  }
});

test("🔴 build refuses, by path, every config the schema alone cannot stop", () => {
  for (const [name, over, message] of moreRefusals()) {
    const dir = setup(`more-${name}`, config(over));
    const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
    assert.equal(r.status, 1, `${name}\n${r.out}`);
    assert.ok(r.out.includes(`REFUSED: ${message}`), `${name}\n${r.out}`);
  }
  const dir = setup("not-json", {});
  writeFileSync(join(dir, "items.json"), "not json");
  assert.match(
    run(["build", join(dir, "items.json"), join(dir, "out")]).out,
    /REFUSED: cannot read .*items\.json as JSON: /,
  );
}, 60_000);

test("🔴 a rebuild with another seed is refused: the stored answers are keyed by the old ids", () => {
  const dir = setup("reseed", config());
  build(dir);
  writeFileSync(join(dir, "items.json"), JSON.stringify(config({ seed: 8 })));
  const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
  assert.equal(r.status, 1);
  assert.match(r.out, /key\.json was made with seed 7; this config says 8\./);
});

test("🔴 export refuses a store, a collection or a document of the wrong kind, naming the type it got", () => {
  const dir = setup("dump-types", config());
  const { key } = build(dir);
  const [a] = Object.keys(key.ids);
  assert.ok(a !== undefined);
  const cases: readonly [unknown, string][] = [
    ["x", "store: str — must be an object"],
    [1, "store: int — must be an object"],
    [1.5, "store: float — must be an object"],
    [true, "store: bool — must be an object"],
    [null, "store: NoneType — must be an object"],
    [
      { answers: { [a]: 3 } },
      `answers/${a}: must be an object with answers, reasons, savedAt, source`,
    ],
  ];
  for (const [dump, message] of cases) {
    writeFileSync(join(dir, "dump.json"), JSON.stringify(dump));
    const r = exportAt(dir);
    assert.equal(r.status, 1, r.out);
    assert.ok(r.out.includes(`REFUSED: ${message}`), r.out);
  }
}, 60_000);

test("🔴 a key from an older build: no `allowed` is refused; no practice or reason lists still exports", () => {
  const dir = setup("old-key", config());
  build(dir);
  const keyPath = join(dir, "out", "key.json");
  const raw = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(readFileSync(keyPath, "utf8")));
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({ answers: {}, groups: {} }),
  );
  writeFileSync(keyPath, JSON.stringify({ ...raw, allowed: undefined }));
  assert.match(
    exportAt(dir).out,
    /has no `allowed` values for every question and for familiarity/,
  );
  const allowed = Object.fromEntries(
    Object.entries(
      z.record(z.string(), z.unknown()).parse(raw["allowed"]),
    ).filter(([k]) => k !== "needs_why"),
  );
  writeFileSync(
    keyPath,
    JSON.stringify({ ...raw, practice: undefined, allowed }),
  );
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /practice round/);
}, 60_000);

test("export: a practice answered as expected throughout is recorded with nothing missed", () => {
  const dir = setup("practice-all", config());
  build(dir);
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({ answers: {}, groups: {}, practice: DONE_PRACTICE }),
  );
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /practice round 1: 3 of 3 matched -> /);
});

test("🔴 a later practice round with fewer items keeps the earlier round's answers known: export does not refuse them", () => {
  const four = [
    ...PRACTICE,
    { ...PRACTICE[0], body: "a fourth practice item" },
  ];
  const dir = setup("practice-shrinks", config({ practice: four }));
  build(dir);
  setup("practice-shrinks", config({ practice: PRACTICE, practice_round: 2 }));
  build(dir);
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({
      answers: {},
      groups: {},
      practice: { "r1-P4": { answers: {}, source: "page" } },
    }),
  );
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
});

test("a key from an older build: without `rounds` its own round's ids are kept; without `practice` there is no earlier round", () => {
  const four = [
    ...PRACTICE,
    { ...PRACTICE[0], body: "a fourth practice item" },
  ];
  const dir = setup("practice-old-key", config({ practice: four }));
  build(dir);
  const keyPath = join(dir, "out", "key.json");
  const Rounds = z.object({
    practice: z.object({
      rounds: z.record(z.string(), z.record(z.string(), z.unknown())),
    }),
  });
  const read = (): Record<string, unknown> =>
    z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(readFileSync(keyPath, "utf8")));
  const withoutRounds = read();
  const practice = z
    .record(z.string(), z.unknown())
    .parse(withoutRounds["practice"]);
  writeFileSync(
    keyPath,
    JSON.stringify({
      ...withoutRounds,
      practice: Object.fromEntries(
        Object.entries(practice).filter(([k]) => k !== "rounds"),
      ),
    }),
  );
  setup("practice-old-key", config({ practice: PRACTICE, practice_round: 2 }));
  build(dir);
  const ids = (r: Record<string, Record<string, unknown>>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Object.keys(v)]));
  assert.deepEqual(ids(Rounds.parse(read()).practice.rounds), {
    "1": ["P1", "P2", "P3", "P4"],
    "2": ["P1", "P2", "P3"],
  });
  writeFileSync(
    keyPath,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(read()).filter(([k]) => k !== "practice"),
      ),
    ),
  );
  build(dir);
  assert.deepEqual(ids(Rounds.parse(read()).practice.rounds), {
    "2": ["P1", "P2", "P3"],
  });
});

test("🔴 a second practice round exported the same day does not overwrite the first: each round has its own file", () => {
  const dir = setup("practice-two-rounds", config());
  build(dir);
  const missed = {
    ...DONE_PRACTICE,
    "r1-P2": { answers: { label: "yes", boundary: "clear" }, source: "page" },
  };
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({ answers: {}, groups: {}, practice: missed }),
  );
  assert.equal(exportAt(dir).status, 0);
  setup("practice-two-rounds", config({ practice_round: 2 }));
  build(dir);
  const round2 = Object.fromEntries(
    PRACTICE.map((p, n) => [
      `r2-P${String(n + 1)}`,
      { answers: p.expected, source: "page" },
    ]),
  );
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({
      answers: {},
      groups: {},
      practice: { ...missed, ...round2 },
    }),
  );
  assert.equal(exportAt(dir).status, 0);
  const Round = z.object({ round: z.number(), matched: z.number() });
  const read = (r: number) =>
    Round.parse(
      JSON.parse(
        readFileSync(
          join(dir, "data", `demo-gold-practice-r${String(r)}-2026-01-02.json`),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(read(1), { round: 1, matched: 2 });
  assert.deepEqual(read(2), { round: 2, matched: 3 });
});

test("🔴 exported only after a retake, the earlier round's practice still gets its own file, scored against its own answers", () => {
  const dir = setup("practice-export-after-retake", config());
  build(dir);
  setup("practice-export-after-retake", config({ practice_round: 2 }));
  build(dir);
  const round1 = {
    ...DONE_PRACTICE,
    "r1-P2": { answers: { label: "yes", boundary: "clear" }, source: "page" },
  };
  const round2 = Object.fromEntries(
    PRACTICE.map((p, n) => [
      `r2-P${String(n + 1)}`,
      { answers: p.expected, source: "page" },
    ]),
  );
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({
      answers: {},
      groups: {},
      practice: { ...round1, ...round2 },
    }),
  );
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  const Round = z.object({ round: z.number(), matched: z.number() });
  const read = (n: number) =>
    Round.parse(
      JSON.parse(
        readFileSync(
          join(dir, "data", `demo-gold-practice-r${String(n)}-2026-01-02.json`),
          "utf8",
        ),
      ),
    );
  assert.deepEqual(read(1), { round: 1, matched: 2 });
  assert.deepEqual(read(2), { round: 2, matched: 3 });
  assert.match(r.out, /practice round 1: 2 of 3 matched; missed P2/);
});

test("🔴 a question dropped between practice rounds: the earlier round's answers are checked against that round's questions, not refused", () => {
  const dir = setup("practice-question-dropped", config());
  build(dir);
  const [first] = QUESTIONS;
  assert.ok(first !== undefined);
  const oneQuestion = PRACTICE.map((p) => ({
    ...p,
    expected: { label: p.expected.label },
  }));
  setup(
    "practice-question-dropped",
    config({ questions: [first], practice: oneQuestion, practice_round: 2 }),
  );
  build(dir);
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({ answers: {}, groups: {}, practice: DONE_PRACTICE }),
  );
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /practice round 1: 3 of 3 matched/);
});

test("🔴 an item that names a linter rule: the build takes the rule's description from the linter, and refuses one it cannot describe", () => {
  const named = (rules: readonly Record<string, string>[]) =>
    config({
      items: ITEMS.map((item, n) => (n === 0 ? { ...item, rules } : item)),
    });
  const { page } = build(
    setup("rules-ok", named([{ linter: "eslint", id: "no-console" }])),
  );
  assert.ok(
    page.includes(
      '"rules": [{"linter": "eslint", "id": "no-console", "description": "Disallow the use of `console`"}]',
    ),
    "the page carries the linter's own description",
  );
  const dir = setup(
    "rules-unknown",
    named([{ linter: "eslint", id: "no-such-rule" }]),
  );
  const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
  assert.equal(r.status, 1, r.out);
  assert.match(
    r.out,
    /REFUSED: items\[0\]\.rules\[0\]: eslint 'no-such-rule' has no description from the linter/,
  );
  // ruff answers the same whether it is missing or does not know the code: no description.
  const ruff = setup(
    "rules-ruff-unknown",
    named([{ linter: "ruff", id: "NOPE1" }]),
  );
  const r2 = run(["build", join(ruff, "items.json"), join(ruff, "out")]);
  assert.equal(r2.status, 1, r2.out);
  assert.match(
    r2.out,
    /ruff 'NOPE1' has no description from the linter \(`ruff rule` does not know it/,
  );
});

test("🔴 familiarity off: the key asks for none, the export reports no missing familiarity, and a stored one is refused", () => {
  const dir = setup("familiarity-off", approval({ familiarity: false }));
  const { key } = build(dir);
  assert.deepEqual(key.allowed.familiarity, []);
  const [a] = Object.keys(key.ids);
  assert.ok(a !== undefined);
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({
      answers: { [a]: { answers: { keep: "keep" }, source: "page" } },
      groups: {},
    }),
  );
  const r = exportAt(dir);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /no familiarity answer|invalid group/);
  assert.deepEqual(Exported.parse(JSON.parse(labelsFile(dir))).groups, {});
  writeFileSync(
    join(dir, "dump.json"),
    JSON.stringify({
      answers: {},
      groups: { python: { familiarity: "well", source: "chat" } },
    }),
  );
  const refused = exportAt(dir);
  assert.notEqual(refused.status, 0);
  assert.match(refused.out, /groups\/python: .*familiarity is off/);
});

test("🔴 familiarity off with a familiarity_question is a contradiction the build refuses", () => {
  const r = run([
    "build",
    join(
      setup(
        "familiarity-contradiction",
        approval({ familiarity: false, familiarity_question: "How well?" }),
      ),
      "items.json",
    ),
    join(WORK, "contradiction-out"),
  ]);
  assert.notEqual(r.status, 0);
  assert.match(
    r.out,
    /REFUSED: familiarity_question: .*`familiarity` is not true/,
  );
});

test('🔴 familiarity left out asks no group, approval page or not; a page asks it only with `"familiarity": true`', () => {
  // Guards: the default is off for every page (#373), so an approval page built the old way asks nothing.
  for (const [name, cfg] of [
    ["fam-default-approval", approval()],
    ["fam-default-gold", config({ familiarity: undefined })],
  ] as const) {
    assert.deepEqual(build(setup(name, cfg)).key.allowed.familiarity, []);
  }
  const asks = setup("fam-on", config());
  assert.deepEqual(build(asks).key.allowed.familiarity, [
    "well",
    "somewhat",
    "not_really",
  ]);
  writeFileSync(
    join(asks, "dump.json"),
    JSON.stringify({ answers: {}, groups: {} }),
  );
  assert.match(exportAt(asks).out, /group python: no familiarity answer/);
  const r = run([
    "build",
    join(
      setup(
        "fam-question-alone",
        config({ familiarity: undefined, familiarity_question: "How well?" }),
      ),
      "items.json",
    ),
    join(WORK, "fam-question-alone-out"),
  ]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /REFUSED: familiarity_question: .*is not true/);
});

/** Items 0 and 3 (both Rust) as the two requirements of one line. */
const LINE = "TypeScript only (no JavaScript); top-level await is allowed.";
const withUnit = (
  parts: readonly (readonly [n: number, unit: Record<string, unknown>])[],
): Record<string, unknown> =>
  config({
    items: ITEMS.map((item, n) => {
      const u = parts.find(([at]) => at === n);
      // the first word of the line is marked unless the case says otherwise
      return u === undefined
        ? item
        : {
            ...item,
            unit: { mark: String(u[1]["text"]).split(" ")[0], ...u[1] },
          };
    }),
  });

/** A line whose parts do not add up, and the refusal that names it. */
const UNIT_REFUSALS: readonly (readonly [
  string,
  Record<string, unknown>,
  string,
])[] = [
  [
    "unit-mark-not-in-line",
    withUnit([
      [0, { id: "L1", text: LINE, mark: "JavaScript only", part: 1, of: 2 }],
    ]),
    "items[0].unit.mark: 'JavaScript only' is not in the line 'TypeScript only (no JavaScript); top-level await is allowed.' — mark the requirement with the line's own words",
  ],
  [
    "unit-part-twice",
    withUnit([
      [0, { id: "L1", text: LINE, part: 1, of: 2 }],
      [3, { id: "L1", text: LINE, part: 1, of: 2 }],
    ]),
    "items[3].unit.part: 1 repeats items[0].unit.part",
  ],
  [
    "unit-of-differs",
    withUnit([
      [0, { id: "L1", text: LINE, part: 1, of: 2 }],
      [3, { id: "L1", text: LINE, part: 2, of: 3 }],
    ]),
    "items[3].unit.of: 3, but items[0].unit.of says 2 for the same line",
  ],
  [
    "unit-part-range",
    withUnit([[0, { id: "L1", text: LINE, part: 3, of: 2 }]]),
    "items[0].unit.part: 3 is not between 1 and 2",
  ],
  [
    "unit-groups-differ",
    withUnit([
      [0, { id: "L1", text: LINE, part: 1, of: 2 }],
      [1, { id: "L1", text: LINE, part: 2, of: 2 }],
    ]),
    "items[1].group: 'python', but items[0] of the same line is in 'rust'",
  ],
  [
    "unit-text-differs",
    withUnit([
      [0, { id: "L1", text: LINE, part: 1, of: 2 }],
      [3, { id: "L1", text: "Another line.", part: 2, of: 2 }],
    ]),
    "items[3].unit.text: 'Another line.', but items[0] of line 'L1' says",
  ],
  [
    "unit-leaks-source",
    withUnit([[0, { id: "L1", text: "as in case-1003", part: 1, of: 1 }]]),
    "the source id 'case-1003' appears in the visible `unit` of item case-1000",
  ],
];

test("🔴 a drawn sample holds one requirement of a line that has two: it builds, the drawn part marked", () => {
  // Guards: a unit with `of` above the parts present is a drawn part, not a lost one (#373, 5 of 9 cards).
  const { page } = build(
    setup(
      "unit-drawn-part",
      withUnit([
        [
          0,
          {
            id: "L1",
            text: LINE,
            mark: "top-level await is allowed",
            part: 2,
            of: 2,
          },
        ],
      ]),
    ),
  );
  assert.ok(
    page.includes(
      `"unit": {"text": "${LINE}", "mark": "top-level await is allowed", "part": 2, "of": 2}`,
    ),
  );
});

test("🔴 a line with several requirements: build refuses a unit whose parts do not add up, naming the item", () => {
  for (const [name, cfg, message] of UNIT_REFUSALS) {
    const dir = setup(name, cfg);
    const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
    assert.equal(r.status, 1, `${name}\n${r.out}`);
    assert.ok(r.out.includes(`REFUSED: ${message}`), `${name}\n${r.out}`);
  }
});

test("a line whose every requirement is an item builds, and each item carries its part and the whole line", () => {
  const dir = setup(
    "unit-ok",
    withUnit([
      [0, { id: "L1", text: LINE, part: 1, of: 2 }],
      [3, { id: "L1", text: LINE, part: 2, of: 2 }],
    ]),
  );
  const { page } = build(dir);
  const json =
    /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(
      page,
    )?.[1];
  assert.ok(json !== undefined);
  const units = z
    .object({
      items: z.array(
        z.object({
          unit: z
            .object({
              text: z.string(),
              mark: z.string(),
              part: z.number(),
              of: z.number(),
            })
            .optional(),
        }),
      ),
    })
    .parse(JSON.parse(json.replace(/<\\\//g, "</")))
    .items.flatMap((i) => (i.unit ? [i.unit] : []))
    .sort((a, b) => a.part - b.part);
  // what the page carries: the part and the line, never the line's private id
  assert.deepEqual(units, [
    { text: LINE, mark: "TypeScript", part: 1, of: 2 },
    { text: LINE, mark: "TypeScript", part: 2, of: 2 },
  ]);
});

test("🔴 the same line in two places is two lines: four items, two ids, it builds, and the id stays off the page", () => {
  const dir = setup(
    "unit-same-text",
    withUnit([
      [0, { id: "a.md:3", text: LINE, part: 1, of: 2 }],
      [3, { id: "a.md:3", text: LINE, part: 2, of: 2 }],
      [6, { id: "b.md:9", text: LINE, part: 1, of: 2 }],
      [9, { id: "b.md:9", text: LINE, part: 2, of: 2 }],
    ]),
  );
  const { page } = build(dir);
  assert.ok(!page.includes("a.md:3"), "the line's id is private");
});

/** A witness card: an approval card's line and rule, plus the two readings and the file. */
const witnessCard = <T extends { readonly body: string }>(c: T, n: number) => ({
  ...approvalCard(c, n),
  readings: { a: "on", b: "off" },
  file: "`src/a.ts`: B flags it",
});
const witnessPage = (
  items: readonly Record<string, unknown>[] = ITEMS.map(witnessCard),
) =>
  approval({
    kind: "witness",
    practice: APPROVAL_PRACTICE.map(witnessCard),
    items,
  });

/** Pages that miss their kind or a field it needs, each with its refusal. */
function kindRefusals(): readonly (readonly [
  string,
  Record<string, unknown>,
  string,
])[] {
  const plain = { items: ITEMS, practice: APPROVAL_PRACTICE };
  const rulesOnly = {
    items: ITEMS.map((c, n) => ({ ...c, rules: approvalCard(c, n).rules })),
    practice: APPROVAL_PRACTICE.map((c, n) => ({
      ...c,
      rules: approvalCard(c, n).rules,
    })),
  };
  return [
    // the shape pages were built in until now: no kind, the line and the rule in free text
    [
      "kind-missing",
      approval({ ...plain, kind: undefined }),
      "kind: is required and missing — one of approval, witness, labels",
    ],
    [
      "kind-unknown",
      approval({ kind: "audit" }),
      "kind: 'audit' must be one of approval, witness, labels",
    ],
    [
      "approval-no-rules",
      approval(plain),
      "practice[0].rules: is required and missing — an approval card shows the rule read for it, with the linter's own description",
    ],
    [
      "approval-no-unit",
      approval(rulesOnly),
      "practice[0].unit: is required and missing — an approval card shows the line its requirement was drawn from, the requirement marked",
    ],
    [
      "witness-no-readings",
      approval({ kind: "witness" }),
      "practice[0].readings: is required and missing — a witness card shows the two readings, one row each",
    ],
    [
      "witness-no-file",
      witnessPage(
        ITEMS.map((c, n) => ({ ...witnessCard(c, n), file: undefined })),
      ),
      "items[0].file: is required and missing — a witness card shows the file the readings disagree on, on its own row",
    ],
  ];
}

test("🔴 a page without its kind, or a card without its kind's fields, fails the schema naming the field", () => {
  const refused = kindRefusals();
  // Guards: the whole refusal, the field and why the page's kind needs it.
  assert.deepEqual(
    refused.map(([name, cfg]) => {
      const dir = setup(name, cfg);
      return run(["build", join(dir, "items.json"), join(dir, "out")]);
    }),
    refused.map(([, , message]) => ({
      status: 1,
      out: `REFUSED: ${message}\n`,
    })),
  );
});

test("a page of each kind with its fields builds; a practice card shows its rule like a real one", () => {
  const witness = build(setup("witness-ok", witnessPage()));
  assert.ok(witness.page.includes('"readings": {"a": "on", "b": "off"}'));
  assert.ok(
    build(setup("approval-ok", approval())).page.includes(
      '"rules": [{"linter": "eslint", "id": "no-console", "description": "Disallow the use of `console`"}]',
    ),
  );
  assert.equal(build(setup("labels-ok", config())).key.seed, 7);
});
