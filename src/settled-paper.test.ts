/**
 * A paper's stage, read from its `cycles` and `versions/lock.json`, adds rule blocks after its venue
 * preset's (#583, #553): the rules stay what they are, the config decides where they run.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.ts";
import { paperRuleBlocks, run } from "./cli.ts";
import { currentCycle, parseCycles } from "./domain/cycle.ts";
import { paperStage } from "./domain/paper-stage.ts";
import { lockText } from "./domain/versions.ts";

const root = useTempDir("settled-paper-");

const CYCLE = {
  id: "alpha-2026",
  venue: { kind: "named", name: "Alpha 2026", url: "https://alpha.example" },
  opened: "2026-07-01",
  submission: { id: 3 },
};
const OPEN = { ...CYCLE, outcome: { kind: "open" } };
const ACCEPTED = {
  ...CYCLE,
  outcome: { kind: "accepted", date: "2026-08-21", evidence: "m.eml" },
};
const REJECTED = {
  ...CYCLE,
  outcome: {
    kind: "rejected",
    date: "2026-08-21",
    evidence: "m.eml",
    desk: true,
  },
};
const FROZEN = {
  kind: "file" as const,
  bytes: 4,
  sha256: "0".repeat(64),
  frozen: "2026-08-29",
};

/** One paper: its cycles, and the lock entries of its frozen files. */
function paper(
  name: string,
  cycles: readonly object[],
  frozen: readonly string[],
): string {
  const dir = writeTree(join(root, name), {
    "p/paper.tex": "% p\n",
    "p/PIPELINE-STATUS.md": "# status\n",
    "p/paperlint.json": JSON.stringify({ cycles }),
    "p/versions/lock.json": lockText(
      Object.fromEntries(frozen.map((k) => [k, FROZEN])),
    ),
  });
  return join(dir, "p");
}

/** The blocks the paper's stage adds. */
function stageBlocks(dir: string) {
  const r = paperRuleBlocks([dir]);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.value.stage;
}

const off = (b: { readonly rules: Readonly<Record<string, unknown>> }) =>
  Object.entries(b.rules).filter(([, v]) => v === "off");

test("a final paper — accepted, camera-ready frozen — turns its text and build rules off, keeps its record rules, and edition-over goes", () => {
  const dir = paper("final", [ACCEPTED], ["alpha-2026/camera-ready.pdf"]);
  const blocks = stageBlocks(dir);
  const tex = blocks.find((b) => b.files?.includes("**/*.tex"));
  assert.ok(tex, JSON.stringify(blocks));
  assert.equal(tex.basePath, dir);
  const texOff = new Set(off(tex).map(([id]) => id));
  for (const id of ["pdf/fresh", "pdf/last-page-balance", "pdf/measured"])
    assert.ok(texOff.has(id), id);
  // The record of attempts is what a final paper is judged on: whether its camera-ready came from
  // what was accepted.
  for (const id of ["tex/max-sentence-words", "bib/reachable-entry"])
    assert.ok(texOff.has(id), id);
  // What is still delivered after the camera-ready (the talk, the public artifact) and the records
  // (attempts, the lock, the study) keep their rules: freezing the PDF says nothing about them.
  for (const id of [
    "cycle/camera-ready-source",
    "cycle/draft-drift",
    "talk/required-files",
    "artifact/upload-current",
    "versions/layout",
    "repro/study-result",
  ])
    assert.ok(!texOff.has(id), id);
  assert.deepEqual(
    blocks.filter((b) => b.files === undefined).map((b) => b.rules),
    [{ "paper/edition-over": "off" }],
  );
});

test("an accepted paper whose camera-ready is not frozen keeps its build rules; only edition-over goes", () => {
  const dir = paper("camera-ready", [ACCEPTED], []);
  assert.deepEqual(stageBlocks(dir), [
    { basePath: dir, rules: { "paper/edition-over": "off" } },
  ]);
});

test("an open or rejected paper — still being written — adds no block", () => {
  assert.deepEqual(stageBlocks(paper("open", [OPEN], [])), []);
  assert.deepEqual(
    stageBlocks(paper("rejected", [REJECTED], ["alpha-2026/camera-ready.pdf"])),
    [],
  );
});

test("no cycles, or a lock that is missing or not JSON, is not a final paper", () => {
  const dir = writeTree(join(root, "unlocked"), {
    "none/paper.tex": "% p\n",
    "missing/paper.tex": "% p\n",
    "missing/paperlint.json": JSON.stringify({ cycles: [ACCEPTED] }),
    "broken/paper.tex": "% p\n",
    "broken/paperlint.json": JSON.stringify({ cycles: [ACCEPTED] }),
    "broken/versions/lock.json": "{ not json",
  });
  assert.deepEqual(stageBlocks(join(dir, "none")), []);
  for (const name of ["missing", "broken"])
    assert.deepEqual(stageBlocks(join(dir, name)), [
      { basePath: join(dir, name), rules: { "paper/edition-over": "off" } },
    ]);
});

test("the paper's own rules come after, so an author can turn one back on", () => {
  const dir = writeTree(join(root, "own"), {
    "p/paper.tex": "% p\n",
    "p/paperlint.json": JSON.stringify({
      cycles: [ACCEPTED],
      rules: { "pdf/fresh": "error" },
    }),
    "p/versions/lock.json": lockText({
      "alpha-2026/camera-ready.pdf": FROZEN,
    }),
  });
  const r = paperRuleBlocks([join(dir, "p")]);
  assert.ok(r.ok);
  assert.deepEqual(
    r.value.own.map((b) => b.rules),
    [{ "pdf/fresh": "error" }],
  );
});

test("paperStage: working, accepted, final", () => {
  const parsed = parseCycles([ACCEPTED]);
  assert.ok(parsed.ok && parsed.value !== null);
  const current = currentCycle(parsed.value);
  assert.ok(current.ok);
  const frozen = { "alpha-2026/camera-ready.pdf": FROZEN };
  const lost = {
    "alpha-2026/camera-ready.pdf": { kind: "lost" as const, frozen: null },
  };
  assert.equal(paperStage(current.value, frozen), "final");
  assert.equal(paperStage(current.value, {}), "accepted");
  assert.equal(paperStage(current.value, lost), "accepted");
  assert.equal(paperStage({ kind: "none" }, frozen), "working");
});

/** `paperlint lint papers/p` in `cwd`: its exit code and what it printed. */
async function lint(cwd: string) {
  const out: string[] = [];
  const code = await run(["lint", "papers/p"], {
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: (...a: unknown[]) => out.push(a.join(" ")),
    cwd,
    now: () => 0,
    install: {
      command: (_r, spec) => ["npm", spec],
      run: () => ({ ok: true }),
    },
    claude: {
      present: () => false,
      plugin: () => ({ enabled: false, version: null }),
      enable: () => assert.fail("lint does not touch the plugin"),
    },
  });
  return { code, out: out.join("\n") };
}

/** A project whose ROOT paperlint.json turns a writing rule on for every paper by glob. */
function project(name: string, cycles: readonly object[]): string {
  const long = Array.from({ length: 70 }, () => "word").join(" ");
  return writeTree(join(root, name), {
    "package.json": "{}",
    "paperlint.json": JSON.stringify({
      papersDir: "papers",
      rules: [
        {
          files: ["papers/*/paper.tex"],
          rules: { "tex/max-sentence-words": "warn" },
        },
      ],
    }),
    "papers/p/PIPELINE-STATUS.md": "# status\n",
    "papers/p/paper.tex": `\\documentclass{article}\n\\begin{document}\n${long}.\n\\end{document}\n`,
    "papers/p/paperlint.json": JSON.stringify({ cycles }),
    "papers/p/versions/lock.json": lockText({
      "alpha-2026/camera-ready.pdf": FROZEN,
    }),
  });
}

test("lint: the root's glob reaches a paper being written, and not a final one — the stage comes after the root", async () => {
  const open = await lint(project("lint-open", [OPEN]));
  assert.match(open.out, /tex\/max-sentence-words/);
  const final = await lint(project("lint-final", [ACCEPTED]));
  assert.doesNotMatch(final.out, /max-sentence-words/);
});
