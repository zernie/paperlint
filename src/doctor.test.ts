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
import { detectPapers, doctor, type DoctorOptions } from "./doctor.ts";
import { MANAGED_BY, shippedWiring } from "./hooks-settings.ts";

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
const shipped = shippedWiring();
/** Each shipped hook as many times as the wiring runs it: `lint-edited` after an Edit and a Bash. */
const allHooks = shipped.names.flatMap((n) =>
  Array.from({ length: shipped.times[n] ?? 1 }, () => n),
);

test("doctor exits 0 when every hook is wired as shipped, or none is (--no-hooks is a choice)", () => {
  assert.equal(exitWithHooks(allHooks.map(hookCommand)), 0);
  assert.equal(exitWithHooks([]), 0);
});

test("doctor exits non-zero when the hooks are only partly wired", () => {
  assert.equal(exitWithHooks(allHooks.slice(1).map(hookCommand)), 2);
  assert.equal(exitWithHooks([hookCommand("submission-confirm")]), 2);
  // Wired by an older init: every hook once, so lint-edited has one of its two commands.
  assert.equal(exitWithHooks(shipped.names.map(hookCommand)), 2);
});

/** Doctor's output for a project with one of init's hook commands and one present skill link. */
const withPlugin = (plugin: NonNullable<DoctorOptions["plugin"]> | null) => {
  const root = project();
  writeFileSync(join(root, "paperlint.json"), "{}\n");
  mkdirSync(join(root, ".claude"), { recursive: true });
  const ours = `node ${MANAGED_BY} hook ${allHooks[0] ?? ""}`;
  writeFileSync(
    join(root, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: ours }] },
        ],
      },
    }),
  );
  const lines: string[] = [];
  const code = doctor({
    cwd: root,
    log: (s: string) => lines.push(s),
    run: () => ({ status: 0 }),
    cliPapers: join(root, "papers"),
    plugin,
    installed: "1.0.0",
    skillLinks: () => ({
      ok: true,
      home: join(root, ".claude", "skills"),
      example: null,
      links: [{ name: "paper-pipeline", status: "present" }],
    }),
  });
  return { code, out: lines.join("\n").split("\n") };
};

test("doctor and the plugin: on, it carries the skills and hooks and names init's leftovers; off, it says so; no Claude Code, no section", () => {
  const on = withPlugin({ enabled: true, version: "1.0.0" });
  const off = withPlugin({ enabled: false, version: null });
  const none = withPlugin(null);
  const head = "Claude Code plugin (carries the skills and the hooks)";
  // A partly wired set fails the run without the plugin, and not with it: the plugin carries the hooks.
  assert.deepEqual([on.code, off.code, none.code], [0, 2, 2]);
  assert.deepEqual(
    on.out.slice(on.out.indexOf(head), on.out.indexOf(head) + 4),
    [
      head,
      "  ✓ on for this project, version 1.0.0",
      `  ⚠ init's own skill links (paper-pipeline) and hook commands (${allHooks[0] ?? ""}) are still here beside the plugin — each such skill is listed twice, each such hook runs twice`,
      "      `npx paperlint init --plugin` removes the old ones and keeps the plugin",
    ],
  );
  assert.equal(
    on.out.filter((l) => l === "  ✓ carried by the plugin").length,
    2,
  );
  assert.deepEqual(
    [off.out.includes(head), none.out.includes(head)],
    [true, false],
  );
});

test("doctor with the plugin declared but not installed: the hooks are checked as without it", () => {
  const declared = withPlugin({ enabled: true, version: null });
  const off = withPlugin({ enabled: false, version: null });
  // The keys alone load nothing: a partly wired set fails the run, and nothing is "carried".
  assert.deepEqual(
    [
      declared.code,
      declared.out.filter((l) => l === "  ✓ carried by the plugin").length,
    ],
    [off.code, 0],
  );
});

test("doctor with the plugin on and settings that do not parse, or cannot be read: no leftovers named, the run not failed", () => {
  const onWith = (settings: (root: string) => void) => {
    const root = project();
    writeFileSync(join(root, "paperlint.json"), "{}\n");
    mkdirSync(join(root, ".claude"), { recursive: true });
    settings(root);
    const lines: string[] = [];
    const code = doctor({
      cwd: root,
      log: (s: string) => lines.push(s),
      run: () => ({ status: 0 }),
      cliPapers: join(root, "papers"),
      plugin: { enabled: true, version: "1.0.0" },
      skillLinks: () => ({ ok: false, error: "not resolved" }),
    });
    const out = lines.join("\n").split("\n");
    const at = out.indexOf(
      "Claude Code plugin (carries the skills and the hooks)",
    );
    return [code, out.slice(at + 1, at + 3)];
  };
  const quiet = [0, ["  ✓ on for this project, version 1.0.0", ""]];
  assert.deepEqual(
    [
      onWith((root) => {
        writeFileSync(join(root, ".claude", "settings.json"), "{ nope");
      }),
      // A DIRECTORY where the file should be: reading it throws EISDIR.
      onWith((root) => {
        mkdirSync(join(root, ".claude", "settings.json"));
      }),
    ],
    [quiet, quiet],
  );
});

test("doctor exits non-zero when a hook is wired twice", () => {
  const commands = [
    ...allHooks.map(hookCommand),
    hookCommand(allHooks[0] ?? ""),
  ];
  assert.equal(exitWithHooks(commands), 2);
});
