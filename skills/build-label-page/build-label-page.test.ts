/**
 * build-label-page — the free tier: the skill passes the shared per-skill checks, its checklist has
 * the seven rules the skill names, and the example generator does what the checklist says it does.
 * No model, no network, no browser. Needs `python3`, the language of the template.
 *
 * 🔴 WHAT IS RUN, NOT READ: the generator is executed on a small items file and its output is
 * inspected. A checklist that says "the build refuses a field outside the allow-list" is a claim
 * about the code, and the only check that holds is to hand the code such a field.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { afterAll, test } from "vitest";
import { z } from "zod";
import { checkSkill } from "../../lib/skill-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATOR = join(HERE, "references", "example-generator.py");
const WORK = realpathSync(mkdtempSync(join(tmpdir(), "label-page-")));
afterAll(() => {
  rmSync(WORK, { recursive: true, force: true });
});

interface Item {
  readonly source_id: string;
  readonly group: string;
  readonly body: string;
  readonly [field: string]: string;
}

const QUESTIONS = [
  {
    id: "label",
    text: "Is this correct?",
    short: "correct?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "boundary",
    text: "Clear-cut or a real boundary case?",
    short: "boundary",
    options: [
      { value: "clear", label: "Clear-cut" },
      { value: "boundary", label: "Boundary" },
    ],
  },
];

const ITEMS: readonly Item[] = Array.from({ length: 12 }, (_, n) => ({
  source_id: `case-${String(1000 + n)}`,
  group: n % 3 === 0 ? "rust" : n % 2 === 0 ? "go" : "python",
  body: `Item number ${String(n)} </script> & text`,
}));

const config = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  study: "demo-gold",
  title: "Label these",
  seed: 7,
  groups: { python: "Python", go: "Go", rust: "Rust" },
  questions: QUESTIONS,
  items: ITEMS,
  ...over,
});

/** A fresh directory with `items.json` written into it. */
function setup(name: string, cfg: Record<string, unknown>): string {
  const dir = join(WORK, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "items.json"), JSON.stringify(cfg));
  return dir;
}

/** Run the generator; the exit status and both streams, never a throw. */
function run(args: readonly string[]): {
  status: number | null;
  out: string;
} {
  const r = spawnSync("python3", [GENERATOR, ...args], { encoding: "utf8" });
  assert.equal(r.error, undefined, `python3 is needed to run the generator`);
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function build(dir: string): { page: string; key: KeyFile } {
  const r = run(["build", join(dir, "items.json"), join(dir, "out")]);
  assert.equal(r.status, 0, r.out);
  return {
    page: readFileSync(join(dir, "out", "page.html"), "utf8"),
    key: Key.parse(
      JSON.parse(readFileSync(join(dir, "out", "key.json"), "utf8")),
    ),
  };
}

const Allowed = z.object({
  questions: z.record(z.string(), z.array(z.string())),
  familiarity: z.array(z.string()),
});
const Key = z.object({
  seed: z.number(),
  questions: z.array(z.string()),
  allowed: Allowed,
  ids: z.record(
    z.string(),
    z.object({
      source_id: z.string(),
      group: z.string(),
      on_page: z.boolean(),
    }),
  ),
});
type KeyFile = z.infer<typeof Key>;

const Exported = z.object({
  complete_items: z.number(),
  total_items: z.number(),
  groups: z.record(
    z.string(),
    z.object({
      familiarity: z.string().nullable(),
      invalid_familiarity: z.unknown(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.string(),
      source: z.string().nullable(),
      complete: z.boolean(),
      source_id: z.string(),
      answers: z.record(z.string(), z.string().nullable()),
      invalid_answers: z.record(z.string(), z.unknown()),
    }),
  ),
});

test("the shared per-skill checks pass", async () => {
  await checkSkill("build-label-page");
});

test("the checklist has the seven rules, numbered, and the skill names seven", () => {
  const checklist = readFileSync(
    join(HERE, "references", "checklist.md"),
    "utf8",
  );
  const numbers = [...checklist.matchAll(/^## (\d+)\. /gm)].map((m) => m[1]);
  assert.deepEqual(numbers, ["1", "2", "3", "4", "5", "6", "7"]);
  const skill = readFileSync(join(HERE, "SKILL.md"), "utf8");
  const listed = [...skill.matchAll(/^(\d)\. \*\*/gm)].map((m) => m[1]);
  assert.deepEqual(listed.slice(0, 7), numbers);
});

test("the page: neutral ids, the source ids nowhere, and the order is fixed by the seed", () => {
  const dir = setup("order", config());
  const { page, key } = build(dir);
  assert.deepEqual(Object.keys(key.ids).slice(0, 3), ["G001", "G002", "G003"]);
  for (const item of ITEMS) {
    assert.ok(
      !page.includes(item.source_id),
      `${item.source_id} is on the page`,
    );
  }
  const again = build(dir);
  assert.equal(again.page, page, "the same input must give the same page");
  const order = (k: KeyFile): string =>
    Object.values(k.ids)
      .map((v) => v.source_id)
      .join(",");
  const reseeded = build(setup("order-seed", config({ seed: 8 })));
  assert.notEqual(
    order(reseeded.key),
    order(key),
    "the seed must change the order",
  );
  assert.notEqual(
    order(key),
    ITEMS.map((i) => i.source_id).join(","),
    "the order must not be the input order",
  );
});

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

/** A node of the declared config schema, as `example-generator.py schema` prints it. */
const Node: z.ZodType<SchemaNode> = z.lazy(() =>
  z.object({
    kind: z.enum(["string", "integer", "map", "array", "object"]),
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
  readonly kind: "string" | "integer" | "map" | "array" | "object";
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

/** A config with EVERY optional field present, so every schema path has a value to spoil. */
const FULL: DocObject = (() => {
  const doc = Doc.parse(
    config({
      intro: "Label these.",
      labeller_knows: ["python", "go", "rust"],
      familiarity_question: "How well do you know {group}?",
      items: ITEMS.map((i, n) =>
        n === 0 ? { ...i, title: "T", code: "c = 1", context: "ctx" } : i,
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
  integer: [null, "7", true, 7.5, []],
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
    ...(node.pattern === undefined ? [] : [bad("bad id!", "bad id!")]),
    ...(node.kind === "array" && node.min ? [bad("[]", [])] : []),
    ...(node.kind === "map" && node.min ? [bad("{}", {})] : []),
    ...(node.required && !member ? [bad("(missing)", undefined)] : []),
  ];
  return [...wrongType, ...extra];
}

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
    const r = tryBuild(
      `schema-${leaf.path.replace(/\W/g, "_")}-absent`,
      spoil(leaf.path, undefined),
    );
    assert.equal(r.status, 0, `${leaf.path} is optional: ${r.out}`);
  }
}

const DOCUMENTED_FIELDS = [
  "study",
  "title",
  "intro",
  "seed",
  "groups",
  "labeller_knows",
  "familiarity_question",
  "questions",
  "items",
];

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

/** A DOM just big enough for the page script: nodes with children and text. */
class FakeNode {
  children: FakeNode[] = [];
  className = "";
  disabled = false;
  type = "";
  style: Record<string, string> = {};
  private own = "";
  get textContent(): string {
    return this.own + this.children.map((c) => c.textContent).join("\n");
  }
  set textContent(v: string) {
    this.own = v;
    this.children = [];
  }
  appendChild(c: FakeNode): FakeNode {
    this.children.push(c);
    return c;
  }
  setAttribute(): void {}
  addEventListener(): void {}
}

/** Open the built page against a fake store holding `answers` and `groups`; return what it shows. */
async function showPage(
  page: string,
  answers: Record<string, unknown>,
  groups: Record<string, unknown>,
): Promise<string> {
  const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]?.[1];
  const json =
    /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(
      page,
    )?.[1];
  assert.ok(script !== undefined && json !== undefined);
  const app = new FakeNode();
  const data = new FakeNode();
  data.textContent = json.replace(/<\\\//g, "</");
  const docsOf = (m: Record<string, unknown>) => ({
    docs: Object.entries(m).map(([id, d]) => ({ id, data: () => d })),
  });
  const store = {
    collection: (name: string) => ({
      onSnapshot: (cb: (snap: unknown) => void) => {
        cb(docsOf(name === "answers" ? answers : groups));
      },
      doc: () => ({ set: () => Promise.resolve() }),
    }),
  };
  runInNewContext(script, {
    document: {
      getElementById: (id: string) => (id === "data" ? data : app),
      createElement: () => new FakeNode(),
    },
    window: { claude: { use: () => Promise.resolve(store) } },
    localStorage: { getItem: () => "next", setItem: () => undefined },
    Promise,
    JSON,
    Date,
    Object,
    String,
    isNaN,
  });
  await new Promise((r) => setTimeout(r, 0));
  return app.textContent;
}

test("🔴 the page and the export share one definition of a valid answer: a stored value outside the options is unanswered in both", async () => {
  const dir = setup("stale", config());
  const { page, key } = build(dir);
  const [a, b, c] = Object.keys(key.ids);
  assert.ok(a !== undefined && b !== undefined && c !== undefined);
  const answers = {
    [a]: { answers: { label: "yes", boundary: "clear" }, source: "page" },
    // options changed between builds: neither value is offered any more
    [b]: { answers: { label: "yes", boundary: "maybe" }, source: "page" },
    [c]: { answers: { label: "yse", boundary: "clear" }, source: "chat" },
  };
  const groups = {
    python: { familiarity: "somewhatt", source: "chat" },
    go: { familiarity: "well", source: "page" },
  };
  const shown = await showPage(page, answers, groups);
  assert.match(shown, /1 of 12 items complete/, shown);
  assert.match(shown, new RegExp(`${b} needs boundary`), shown);
  assert.match(shown, new RegExp(`${c} needs correct\\?`), shown);
  assert.match(shown, /Python: how well you know it/, shown);
  assert.doesNotMatch(shown, /Go: how well you know it/, shown);

  writeFileSync(join(dir, "dump.json"), JSON.stringify({ answers, groups }));
  const r = run([
    "export",
    join(dir, "dump.json"),
    join(dir, "out", "key.json"),
    join(dir, "data"),
    "--date",
    "2026-01-02",
  ]);
  assert.equal(r.status, 0, r.out);
  const file = Exported.parse(
    JSON.parse(
      readFileSync(
        join(dir, "data", "demo-gold-labels-2026-01-02.json"),
        "utf8",
      ),
    ),
  );
  assert.equal(
    file.complete_items,
    1,
    "the export counts what the page counts",
  );
  assert.match(r.out, /invalid group python: familiarity='somewhatt'/, r.out);
  const { python, go } = file.groups;
  assert.ok(python !== undefined && go !== undefined);
  assert.equal(python.familiarity, null);
  assert.equal(python.invalid_familiarity, "somewhatt");
  assert.equal(go.familiarity, "well");
});

test("the page's allowed values are the key's: both are written from the same definition", () => {
  const { page, key } = build(setup("one-source", config()));
  const json =
    /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(
      page,
    )?.[1];
  assert.ok(json !== undefined);
  const data = z
    .object({ allowed: Allowed })
    .parse(JSON.parse(json.replace(/<\\\//g, "</")));
  assert.deepEqual(data.allowed, key.allowed);
  assert.deepEqual(key.allowed.familiarity, ["well", "somewhat", "not_really"]);
});

test("the page script parses, saves on click, and has nothing that needs scrolling or a toast", () => {
  const { page } = build(setup("page", config()));
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1] ?? "",
  );
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() =>
    runInNewContext(`(function(){${scripts[0] ?? ""}\n})`),
  );
  assert.match(page, /claude\.use\("db"\)/);
  assert.match(page, /\.set\(/, "an answer is saved by a write");
  assert.doesNotMatch(page, /scrollIntoView|position: *fixed|100vh|alert\(/);
  assert.doesNotMatch(
    page,
    /type="submit"|>Submit</i,
    "there is no submit button",
  );
  assert.match(page, /Next unanswered/);
  assert.match(page, /cannot be saved in this view/);
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
      python: { familiarity: "well", savedAt: "2026-01-02T03:04:00Z" },
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
});
