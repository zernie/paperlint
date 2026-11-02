/**
 * candidate_page.ts and novelty_reader_brief.ts, the edges the other tests do not reach: the fallbacks for a
 * missing field, a missing file, a wrong argument count. Each case runs the script as a process on a fixture copy.
 * Run: npx vitest run skills/assess-novelty/scripts/script_edges.test.ts
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "novelty");
const PAGE = join(here, "candidate_page.ts");
const BRIEF = join(here, "novelty_reader_brief.ts");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const SENTENCE = "A sentence of at least eight words, quoted from the text.";

const node = (script: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const withDir = (body: (dir: string) => void) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "script-edges-")));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const paperWith = (dir: string, ids: string[]) => {
  cpSync(FIXTURE, dir, { recursive: true });
  const siblings = join(dir, "siblings");
  for (const d of ["candidates", "data/crops"])
    mkdirSync(join(siblings, d), { recursive: true });
  for (const id of ids) {
    writeFileSync(
      join(siblings, "candidates", `${id}.json`),
      JSON.stringify({
        id,
        title: "A title",
        url: `https://example.org/${id}`,
        text: `siblings/data/${id}.txt`,
        found_by: [{ source: "paper.tex ref1" }],
        summary: "What it does.",
        abstract: { page: 1, text: SENTENCE },
        conclusion: { page: 2, text: SENTENCE },
        passages: [
          {
            claim: "P5-1",
            page: 1,
            quote: SENTENCE,
            crop: `siblings/data/crops/${id}-1.png`,
            meaning: "It matters.",
          },
        ],
        suggestion: "cite",
        suggestion_why: "Because.",
      }),
    );
    writeFileSync(join(siblings, "data", `${id}.txt`), `${SENTENCE}\n`);
    writeFileSync(join(siblings, "data", "crops", `${id}-1.png`), PNG);
  }
};

const setJson = (dir: string, file: string, change: (j: any) => any) => {
  const p = join(dir, "siblings", file);
  writeFileSync(p, JSON.stringify(change(JSON.parse(readFileSync(p, "utf8")))));
};

test("candidate_page: usage, no candidates, a broken candidate file", () => {
  assert.equal(node(PAGE).code, 2, "no arguments is a usage error");
  assert.match(node(PAGE).err, /usage: node candidate_page.ts/);
  withDir((dir) => {
    cpSync(FIXTURE, dir, { recursive: true });
    const r = node(PAGE, "build", dir, join(dir, "out.html"));
    assert.equal(r.code, 1);
    assert.match(r.err, /no candidates in/);
  });
  withDir((dir) => {
    paperWith(dir, ["a1"]);
    writeFileSync(join(dir, "siblings", "candidates", "a1.json"), "{not json");
    const r = node(PAGE, "build", dir, join(dir, "out.html"));
    assert.equal(r.code, 1, "a candidate file that is not JSON is refused");
  });
});

test("candidate_page build: a page config without session or pdfs, claims without sentences or absent", () => {
  withDir((dir) => {
    paperWith(dir, ["a1"]);
    writeFileSync(join(dir, "siblings", "candidate-page.json"), "{}");
    setJson(dir, "novelty.json", (j) => {
      delete j.claims[0].sentence;
      return j;
    });
    const out = join(dir, "out.html");
    const r = node(PAGE, "build", dir, out);
    assert.equal(r.code, 0, r.err);
    assert.match(readFileSync(out, "utf8"), /"session":""/);
    setJson(dir, "novelty.json", (j) => {
      delete j.claims;
      return j;
    });
    assert.equal(node(PAGE, "build", dir, out).code, 0);
    assert.match(readFileSync(out, "utf8"), /"claims":\{\}/);
  });
});

test("candidate_page export: a flat folder, a wrapped document, no reason, an already decided and an undecided candidate", () => {
  withDir((dir) => {
    paperWith(dir, ["a1", "a2", "a3"]);
    setJson(dir, "candidates/a2.json", (j) => ({
      ...j,
      decision: {
        choice: "skip",
        reason: "r",
        at: "2026-01-01T00:00:00Z",
        source: "chat",
      },
    }));
    const flat = join(dir, "dump");
    mkdirSync(flat);
    writeFileSync(
      join(flat, "a1.json"),
      JSON.stringify({ data: { choice: "cite" } }),
    );
    const r = node(PAGE, "export", dir, flat);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^a1: cite$/m, "no reason, no dash");
    assert.match(r.out, /^still undecided: a3$/m, "a2 decided already, a3 not");
  });
});

test("novelty_reader_brief: a missing novelty.json, no neighbours, a neighbour without title or url", () => {
  withDir((dir) => {
    const check = node(BRIEF, "check", dir, "n1");
    assert.equal(check.code, 1);
    assert.match(check.err, /cannot read .*novelty\.json/);
    mkdirSync(join(dir, "siblings"));
    writeFileSync(join(dir, "siblings", "novelty.json"), "{}");
    const none = node(BRIEF, dir, "n1");
    assert.equal(none.code, 1);
    assert.match(none.err, /no neighbour n1 in novelty\.json \(have: \)/);
    assert.equal(node(BRIEF, "check", dir, "n1").code, 1);
    writeFileSync(
      join(dir, "siblings", "novelty.json"),
      JSON.stringify({ neighbours: [{ id: "n1", text: "t.txt" }] }),
    );
    const missing = node(BRIEF, dir, "n1");
    assert.equal(missing.code, 2);
    assert.match(missing.err, /arxiv\.org\/pdf\/<id>/);
    writeFileSync(join(dir, "t.txt"), "");
    const brief = node(BRIEF, dir, "n1");
    assert.equal(brief.code, 0, brief.err);
    assert.match(brief.out, /Neighbour: n1 — {2}\n/);
  });
});
