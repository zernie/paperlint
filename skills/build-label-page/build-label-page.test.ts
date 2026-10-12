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

const Key = z.object({
  seed: z.number(),
  questions: z.array(z.string()),
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
  items: z.array(
    z.object({
      id: z.string(),
      source: z.string().nullable(),
      complete: z.boolean(),
      source_id: z.string(),
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
