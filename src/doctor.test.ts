/**
 * `doctor.ts` — the edges the harness does not stage: an unreadable directory during paper
 * discovery, a settings file that names no papers directory, an occupied skill entry with no
 * reason, and a hooks section that cannot be read at all.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { detectPapers, doctor } from "./doctor.ts";
import { shippedWiring } from "./hooks-settings.ts";

const project = (): string =>
  realpathSync(mkdtempSync(join(tmpdir(), "doctor-")));

test("detectPapers: a directory that does not exist has no papers", () => {
  assert.deepEqual(detectPapers(join(project(), "gone")), []);
});

test("detectPapers: a child that cannot be listed is skipped, its siblings are still found", () => {
  const root = project();
  mkdirSync(join(root, "locked"));
  mkdirSync(join(root, "papers", "p1"), { recursive: true });
  writeFileSync(join(root, "papers", "p1", "paper.tex"), "");
  const readdir = (dir: string) => {
    if (dir === join(root, "locked")) throw new Error("EACCES");
    return readdirSync(dir, { withFileTypes: true });
  };
  assert.deepEqual(detectPapers(root, 2, readdir), ["papers"]);
});

test("doctor: a settings file silent on papersDir, an occupied entry, an unreadable hooks file", () => {
  const root = project();
  writeFileSync(join(root, "paperlint.json"), "{}\n");
  // `.claude/settings.json` as a DIRECTORY: it exists, and reading it throws EISDIR.
  mkdirSync(join(root, ".claude", "settings.json"), { recursive: true });
  const lines: string[] = [];
  const code = doctor({
    cwd: root,
    log: (s: string) => lines.push(s),
    run: () => ({ status: 0 }),
    cliPapers: join(root, "papers"),
    skillLinks: () => ({
      ok: true,
      home: join(root, ".claude", "skills"),
      example: null,
      links: [{ name: "paper-pipeline", status: "foreign" }],
    }),
  });
  const out = lines.join("\n");
  assert.match(
    out,
    /✓ paperlint\.json names no papersDir — the default "papers"/,
  );
  assert.match(out, /paper-pipeline — occupied, not the shipped skill/);
  assert.match(out, /\nhooks\n {2}⚠ not checked — EISDIR/);
  assert.equal(typeof code, "number");
});

/** Doctor's exit code for a project whose `.claude/settings.json` carries the given commands. */
const exitWithHooks = (commands: readonly string[]): number => {
  const root = project();
  writeFileSync(join(root, "paperlint.json"), "{}\n");
  mkdirSync(join(root, ".claude"), { recursive: true });
  const entries = commands.map((command) => ({
    matcher: "Bash",
    hooks: [{ type: "command", command }],
  }));
  writeFileSync(
    join(root, ".claude", "settings.json"),
    JSON.stringify({ hooks: { PreToolUse: entries } }),
  );
  return doctor({
    cwd: root,
    log: () => undefined,
    run: () => ({ status: 0 }),
    cliPapers: join(root, "papers"),
    skillLinks: () => ({
      ok: true,
      home: join(root, ".claude", "skills"),
      example: null,
      links: [],
    }),
  });
};

const hookCommand = (name: string): string => `npx paperlint hook ${name}`;
const allHooks = shippedWiring().names;

test("doctor exits 0 when every hook is wired once, or none is (--no-hooks is a choice)", () => {
  assert.equal(exitWithHooks(allHooks.map(hookCommand)), 0);
  assert.equal(exitWithHooks([]), 0);
});

test("doctor exits non-zero when the hooks are only partly wired", () => {
  assert.equal(exitWithHooks(allHooks.slice(1).map(hookCommand)), 2);
  assert.equal(exitWithHooks([hookCommand("paper-edit-guard")]), 2);
});

test("doctor exits non-zero when a hook is wired twice", () => {
  const commands = [
    ...allHooks.map(hookCommand),
    hookCommand(allHooks[0] ?? ""),
  ];
  assert.equal(exitWithHooks(commands), 2);
});
