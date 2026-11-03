/**
 * The fixtures and helpers the build-label-page generator's tests share: the items, the questions and
 * the practice of a small study, a fresh folder per test, the generator's command line run in this
 * process, and a DOM just big enough for the page script. Test support, not shipped.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterAll } from "vitest";
import { z } from "zod";
import { cli } from "../skills/build-label-page/scripts/label-page-cli.ts";
import { build as buildPage } from "../skills/build-label-page/scripts/label-page-html.ts";

export const WORK = realpathSync(mkdtempSync(join(tmpdir(), "label-page-")));
// A study's items.json sits in a repository with its linters installed; here, this repository's
// own node_modules, so a rule an item names is described by a real ESLint (rule-descriptions.ts).
symlinkSync(
  join(import.meta.dirname, "..", "node_modules"),
  join(WORK, "node_modules"),
);

afterAll(() => {
  rmSync(WORK, { recursive: true, force: true });
});

export interface Item {
  readonly source_id: string;
  readonly group: string;
  readonly body: string;
  readonly [field: string]: string;
}

export const QUESTIONS = [
  {
    id: "label",
    text: "Is this correct?",
    short: "correct?",
    options: [
      { value: "yes", label: "Yes", example: "A sort that returns 1, 2, 3." },
      { value: "no", label: "No", example: "A sort that returns 3, 1, 2." },
    ],
  },
  {
    id: "boundary",
    text: "Clear-cut or a real boundary case?",
    short: "boundary",
    options: [
      { value: "clear", label: "Clear-cut", example: "An empty list sorted." },
      {
        value: "boundary",
        label: "Boundary",
        example: "Two equal keys whose order changed.",
      },
    ],
  },
];

export const ITEMS: readonly Item[] = Array.from({ length: 12 }, (_, n) => ({
  source_id: `case-${String(1000 + n)}`,
  group: n % 3 === 0 ? "rust" : n % 2 === 0 ? "go" : "python",
  body: `Item number ${String(n)} </script> & text`,
}));

/** Three practice items whose answers are known: shown before the real ones, never exported as labels. */
export const PRACTICE = [
  {
    body: "sorted([3, 1, 2]) gives [1, 2, 3]",
    expected: { label: "yes", boundary: "clear" },
    why: "The output is in order and nothing is unusual about the input.",
  },
  {
    body: "sorted([3, 1, 2]) gives [3, 1, 2]",
    expected: { label: "no", boundary: "clear" },
    why: "The output is the input unchanged.",
  },
  {
    body: "sorted([(1, 'b'), (1, 'a')], key=first) gives [(1, 'a'), (1, 'b')]",
    expected: { label: "no", boundary: "boundary" },
    why: "A stable sort keeps equal keys in input order; whether that matters is a judgement.",
  },
];

export const config = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  study: "demo-gold",
  title: "Label these",
  seed: 7,
  groups: { python: "Python", go: "Go", rust: "Rust" },
  questions: QUESTIONS,
  practice: PRACTICE,
  items: ITEMS,
  ...over,
});

/** A fresh directory with `items.json` written into it. */
export function setup(name: string, cfg: Record<string, unknown>): string {
  const dir = join(WORK, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "items.json"), JSON.stringify(cfg));
  return dir;
}

export const Allowed = z.object({
  questions: z.record(z.string(), z.array(z.string())),
  familiarity: z.array(z.string()),
});

export const Key = z.object({
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

export type KeyFile = z.infer<typeof Key>;

export const Exported = z.object({
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

/** The practice of round 1, all answered: the real items are open. */
export const DONE_PRACTICE: Record<string, unknown> = Object.fromEntries(
  PRACTICE.map((p, n) => [
    `r1-P${String(n + 1)}`,
    { answers: p.expected, source: "page" },
  ]),
);

/** A DOM just big enough for the page script: nodes with children and text. */
export class FakeNode {
  readonly tag: string;
  constructor(tag = "") {
    this.tag = tag;
  }
  children: FakeNode[] = [];
  value = "";
  private readonly listeners: Record<string, (() => void)[]> = {};
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
  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  /** What a person's action does: every listener of `type`. */
  fire(type: string): void {
    (this.listeners[type] ?? []).forEach((fn) => {
      fn();
    });
  }
  /** Every node under this one, itself first. */
  all(): FakeNode[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

/** Open the built page against a fake store holding `answers` and `groups`; return what it shows. */
export async function showPage(
  page: string,
  answers: Record<string, unknown>,
  groups: Record<string, unknown>,
  practice: Record<string, unknown> = DONE_PRACTICE,
): Promise<string> {
  return openPage(page, { answers, groups, practice, withStore: true });
}

/** Open the built page where the store does not run (rule 7: read-only); return what it shows. */
export async function showPageWithoutStore(page: string): Promise<string> {
  return openPage(page, {
    answers: {},
    groups: {},
    practice: {},
    withStore: false,
  });
}

interface Stored {
  readonly answers: Record<string, unknown>;
  readonly groups: Record<string, unknown>;
  readonly practice: Record<string, unknown>;
  readonly withStore: boolean;
}

async function openPage(
  page: string,
  { answers, groups, practice, withStore }: Stored,
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
        cb(
          docsOf(
            name === "answers"
              ? answers
              : name === "practice"
                ? practice
                : groups,
          ),
        );
      },
      doc: () => ({ set: () => Promise.resolve() }),
    }),
  };
  runInNewContext(script, {
    document: {
      getElementById: (id: string) => (id === "data" ? data : app),
      createElement: (tag: string) => new FakeNode(tag),
    },
    // Without the store: the viewer opened the page where it cannot save (rule 7).
    window: withStore ? { claude: { use: () => Promise.resolve(store) } } : {},
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

export const labelsFile = (dir: string): string =>
  readFileSync(join(dir, "data", "demo-gold-labels-2026-01-02.json"), "utf8");

export const exportAt = (dir: string): { status: number | null; out: string } =>
  run([
    "export",
    join(dir, "dump.json"),
    join(dir, "out", "key.json"),
    join(dir, "data"),
    "--date",
    "2026-01-02",
  ]);

export const occurrences = (text: string, needle: string): number =>
  text.split(needle).length - 1;

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const APPROVAL_Q = [
  {
    id: "keep",
    text: "Is this what you meet in practice?",
    short: "keep?",
    options: [
      {
        value: "keep",
        label: "Keep",
        icon: "👍",
        example: "`Use 2-space indent.`",
      },
      {
        value: "drop",
        label: "Drop",
        icon: "🗑️",
        example: "`Be nice to reviewers.`",
        ask_why: "Why drop it? (not a rule, a process rule, a misreading…)",
      },
    ],
  },
];

export const APPROVAL_PRACTICE = [
  {
    body: "`Run tests before every commit.`",
    expected: { keep: "keep" },
    why: "A rule a repository states.",
  },
  {
    body: "`Be nice.`",
    expected: { keep: "drop" },
    why: "Not a rule anyone can check.",
  },
  {
    body: "`Max line length 100.`",
    expected: { keep: "keep" },
    why: "A rule a linter can check.",
  },
];

export const approval = (
  over: Record<string, unknown> = {},
): Record<string, unknown> =>
  config({ questions: APPROVAL_Q, practice: APPROVAL_PRACTICE, ...over });

/**
 * The built page against a stand-in store holding `docs` (collection → id → document); `resend` sends
 * every collection's snapshot again, as the store does after any write.
 */
export async function openLive(
  page: string,
  docs: Record<string, Record<string, unknown>>,
): Promise<{ readonly app: FakeNode; readonly resend: () => void }> {
  const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]?.[1];
  const json =
    /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(
      page,
    )?.[1];
  assert.ok(script !== undefined && json !== undefined);
  const app = new FakeNode();
  const data = new FakeNode();
  data.textContent = json.replace(/<\\\//g, "</");
  const listeners: (() => void)[] = [];
  const store = {
    collection: (name: string) => ({
      onSnapshot: (cb: (snap: unknown) => void) => {
        const send = () => {
          cb({
            docs: Object.entries(docs[name] ?? {}).map(([id, d]) => ({
              id,
              data: () => d,
            })),
          });
        };
        listeners.push(send);
        send();
      },
      doc: () => ({ set: () => Promise.resolve() }),
    }),
  };
  runInNewContext(script, {
    document: {
      getElementById: (id: string) => (id === "data" ? data : app),
      createElement: (tag: string) => new FakeNode(tag),
    },
    window: { claude: { use: () => Promise.resolve(store) } },
    localStorage: { getItem: () => "all", setItem: () => undefined },
    Promise,
    JSON,
    Date,
    Object,
    String,
    isNaN,
  });
  await new Promise((r) => setTimeout(r, 0));
  const resend = () => {
    listeners.forEach((send) => {
      send();
    });
  };
  return { app, resend };
}

/** Run one command line of the generator in this process; the exit status and both streams. */
export function run(args: readonly string[]): { status: number; out: string } {
  const r = cli(args);
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** Build `dir/items.json` into `dir/out` by calling the generator's `build`; the page and the key. */
export function build(dir: string): { page: string; key: KeyFile } {
  buildPage(join(dir, "items.json"), join(dir, "out"));
  return {
    page: readFileSync(join(dir, "out", "page.html"), "utf8"),
    key: Key.parse(
      JSON.parse(readFileSync(join(dir, "out", "key.json"), "utf8")),
    ),
  };
}
