/**
 * `paperlint init` with the Claude Code plugin: the offer's place in the run, and what init does to
 * the skill links and hook commands it made before the plugin carried them. The offer's own
 * branches are `plugin-offer.test.ts`'s.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptedPrompts, useTempDir, writeTree } from "../test/support.ts";
import {
  readSettings,
  shippedWiring,
  wiredCounts,
  type Settings,
} from "./hooks-settings.ts";
import { CANCELLED_CODE, init } from "./init.ts";
import { PLUGIN_QUESTION } from "./plugin-offer.ts";
import type { ClaudeCode } from "./ports/claude-code.ts";

const dir = useTempDir("paperlint-init-plugin-");

/** A Claude Code that is present, off (or installed at 1.0.0), and turns on by running two commands. */
const claude = (enabled = false): ClaudeCode & { readonly on: string[] } => {
  const on: string[] = [];
  return {
    on,
    present: () => true,
    // Installed once both commands ran, as Claude Code then reads it.
    plugin: (root) =>
      enabled || on.includes(root)
        ? { enabled: true, version: "1.0.0" }
        : { enabled: false, version: null },
    enable: (root) => (on.push(root), { ok: true, ran: ["claude x"] }),
  };
};

async function initRun(
  root: string,
  opts: Parameters<typeof init>[1] = {},
): Promise<{ readonly code: number; readonly out: readonly string[] }> {
  const out: string[] = [];
  const code = await init(root, {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => out.push(s),
    interactive: false,
    hooks: true,
    run: () => ({ status: 0 }),
    link: () => ({ ok: false, error: "not linked in this test" }),
    unlink: () => ({ ok: true, removed: [] }),
    ...opts,
  });
  return { code, out };
}

const settingsOf = (root: string): Settings => {
  const read = readSettings(root);
  return read.status === "unparsable" ? {} : read.settings;
};
/** How many commands the shipped wiring has: a hook may hang off two events. */
const shippedCommands = Object.values(shippedWiring().times).reduce(
  (a, b) => a + b,
  0,
);

const oursWired = (root: string): number =>
  wiredCounts(settingsOf(root), shippedWiring().names).reduce(
    (n, c) => n + c.ours,
    0,
  );

describe("init and the plugin", () => {
  it("no plugin (no human, no flag): the one line, and the hooks wired as before", async () => {
    const root = join(dir, "a");
    writeTree(root, { "x.txt": "" });
    const r = await initRun(root, { claude: claude() });
    expect(r.out).toContain(
      "Claude Code plugin: not turned on — stdin is not a terminal, so nothing was asked. To turn it on: npx paperlint init --plugin",
    );
    expect(oursWired(root)).toBe(shippedCommands);
  });

  it("an existing project, re-run with --plugin: init's hook commands and links go, the project's own settings stay", async () => {
    const root = join(dir, "b");
    writeTree(root, {
      ".claude/settings.json": '{ "permissions": { "allow": ["Bash(ls)"] } }',
    });
    await initRun(root);
    expect(oursWired(root)).toBe(shippedCommands);
    const cc = claude();
    const r = await initRun(root, {
      claude: cc,
      pluginFlag: "plugin",
      unlink: () => ({ ok: true, removed: ["paper-pipeline"] }),
    });
    expect([
      r.code,
      cc.on,
      oursWired(root),
      settingsOf(root)["permissions"],
    ]).toEqual([0, [root], 0, { allow: ["Bash(ls)"] }]);
    expect(r.out).toEqual(
      expect.arrayContaining([
        "skills and hooks (the plugin carries them now)",
        "  ✓ removed the skill links init made: paper-pipeline",
        `  ✓ removed the hook commands init wrote into ${join(".claude", "settings.json")}: ${shippedWiring().names.join(", ")}`,
      ]),
    );
  });
});

describe("init's own doctor check sees the plugin", () => {
  it("plugin on: the closing doctor says the plugin carries the skills and hooks, and passes", async () => {
    const root = join(dir, "doctor-on");
    writeTree(root, { "x.txt": "" });
    const r = await initRun(root, { claude: claude(true) });
    // The same project checked by `paperlint doctor` reads the plugin; init's own check must too.
    expect([
      r.code,
      r.out
        .flatMap((l) => l.split("\n"))
        .filter((l) => l === "  ✓ carried by the plugin").length,
    ]).toEqual([0, 2]);
  });
});

describe("init and the plugin — the edges", () => {
  it("already on, nothing of init's left: both said; a links check that cannot run is named", async () => {
    const root = join(dir, "c");
    writeTree(root, { "x.txt": "" });
    const r = await initRun(root, {
      claude: claude(true),
      unlink: () => ({ ok: false, error: "paperlint does not resolve" }),
    });
    expect(r.out).toEqual(
      expect.arrayContaining([
        "  ✓ already on for this project, version 1.0.0",
        "  ⚠ skill links not checked — paperlint does not resolve",
        "  ✓ no hook commands of init's to remove",
      ]),
    );
  });

  it("a settings file that does not parse, or a merge that throws: the hooks are named not checked", async () => {
    const root = join(dir, "d");
    writeTree(root, { ".claude/settings.json": "{ nope" });
    const bad = await initRun(root, { claude: claude(true) });
    const wired = join(dir, "e");
    writeTree(wired, { "x.txt": "" });
    await initRun(wired);
    const thrown = await initRun(wired, {
      claude: claude(true),
      merge: () => {
        throw new Error("merge exploded");
      },
    });
    expect([
      bad.out.find((l) => l.startsWith("  ⚠ hook commands")),
      thrown.out.find((l) => l.startsWith("  ⚠ hook commands")),
      readFileSync(join(root, ".claude", "settings.json"), "utf8"),
    ]).toEqual([
      expect.stringContaining("  ⚠ hook commands not checked — "),
      "  ⚠ hook commands not checked — merge exploded",
      "{ nope",
    ]);
  });

  it("a human: asked once; Ctrl+C at the question stops init with its code", async () => {
    const root = join(dir, "f");
    writeTree(root, { "x.txt": "" });
    const prompts = scriptedPrompts((m) =>
      m === PLUGIN_QUESTION ? "cancel" : undefined,
    );
    const r = await initRun(root, {
      claude: claude(),
      interactive: true,
      prompts,
    });
    expect([
      r.code,
      prompts.asked.filter((m) => m === PLUGIN_QUESTION),
    ]).toEqual([CANCELLED_CODE, [PLUGIN_QUESTION]]);
  });
});
