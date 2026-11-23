/**
 * A hook an earlier paperlint shipped and this one removed, still wired by an old `init`: both halves.
 * It runs nothing and says nothing on each call, while an unknown name still fails; the once-per-version
 * notice and `paperlint doctor` name it with the remedy; a project without one hears neither.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import { useTempDir, writeTree } from "../test/support.ts";
import { runHook } from "./cli.ts";
import { doctor } from "./doctor.ts";
import { WIRING_FILE } from "./hooks-settings.ts";
import type { ClaudeCode } from "./ports/claude-code.ts";
import { RETIRED_HOOKS, retiredWired } from "./retired-hooks.ts";

const root = useTempDir("retired-hooks-");

const Command = z.looseObject({ command: z.string() });
const Wiring = z.object({
  hooks: z.record(
    z.string(),
    z.array(z.looseObject({ hooks: z.array(Command) })),
  ),
});
const shipped = Wiring.parse(JSON.parse(readFileSync(WIRING_FILE, "utf8")));

/** The shipped wiring, plus one entry for `retired` in the spelling `init` wrote, when given. */
const settings = (retired?: string): string => {
  const command = shipped.hooks["PostToolUse"]?.[0]?.hooks[0]?.command ?? "";
  const stale = command.replace(/hook \S+$/, `hook ${retired ?? ""}`);
  const pre = shipped.hooks["PreToolUse"] ?? [];
  return JSON.stringify({
    hooks: {
      ...shipped.hooks,
      PreToolUse:
        retired === undefined
          ? pre
          : [
              ...pre,
              { matcher: "Bash", hooks: [{ type: "command", command: stale }] },
            ],
    },
  });
};

const project = (name: string, retired?: string): string => {
  const dir = join(root, name);
  writeTree(dir, {
    "package.json": "{}\n",
    "papers/p/PIPELINE-STATUS.md": "# status\n",
    "papers/p/paper.tex":
      "\\documentclass{article}\n\\begin{document}\nFine.\n\\end{document}\n",
    ".claude/settings.json": settings(retired),
  });
  return dir;
};

const PLUGIN_OFF: ClaudeCode = {
  present: () => true,
  plugin: () => ({ enabled: false, version: null }),
  enable: () => ({ ok: false, reason: "not in this test" }),
};

/** `paperlint hook <name>` in-process on an Edit of the paper's file. */
async function hook(name: string, dir: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runHook(name, {
    stdin: () =>
      JSON.stringify({
        tool_name: "Edit",
        tool_input: {
          file_path: join(dir, "papers/p/paper.tex"),
          new_string: "Fine.",
        },
      }),
    out: (t) => void out.push(t),
    err: (m: string) => void err.push(m),
    projectDir: dir,
    claude: PLUGIN_OFF,
    version: "9.9.9",
  });
  return { code, out: out.join(""), err };
}

/** `paperlint doctor` on `dir`: its exit code, and whether it named `name`. */
const checked = (dir: string, name: string) => {
  const lines: string[] = [];
  const code = doctor({
    log: (l: string) => void lines.push(l),
    cwd: dir,
    run: () => ({ status: 0 }),
  });
  return { code, named: lines.join("\n").includes(name) };
};

test("a retired hook still wired runs nothing and says nothing; an unknown name still fails", async () => {
  const dir = project("run");
  const quiet = { code: 0, out: "", err: [] };
  assert.ok(RETIRED_HOOKS.length > 0);
  assert.deepEqual(
    await Promise.all(RETIRED_HOOKS.map((name) => hook(name, dir))),
    RETIRED_HOOKS.map(() => quiet),
  );
  const unknown = await hook("no-such-hook", dir);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err.join("\n"), /unknown hook `no-such-hook`/);
});

test("a retired hook left in the settings: the notice names it with the init remedy and doctor fails on it; without one, both stay quiet", async () => {
  const retired = RETIRED_HOOKS[0] ?? "";
  const stale = project("stale", retired);
  const said = await hook("lint-edited", stale);
  assert.ok(said.out.includes(retired), said.out);
  assert.match(said.out, /npx paperlint init/);
  assert.deepEqual(checked(stale, retired), { code: 2, named: true });

  const clean = project("clean");
  assert.deepEqual(
    [await hook("lint-edited", clean), checked(clean, retired)],
    [
      { code: 0, out: "", err: [] },
      { code: 0, named: false },
    ],
  );
});

test("retiredWired reads only paperlint's own runs: another command is not one, a file that does not parse names none", () => {
  const retired = RETIRED_HOOKS[0] ?? "";
  const at = (name: string, text: string): string => {
    const dir = join(root, name);
    writeTree(dir, { ".claude/settings.json": text });
    return dir;
  };
  const other = JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: `echo hook ${retired}` }],
        },
      ],
    },
  });
  assert.deepEqual(
    [
      retiredWired(project("listed", retired)),
      retiredWired(at("other", other)),
      retiredWired(at("broken", "{")),
    ],
    [[retired], [], []],
  );
});
