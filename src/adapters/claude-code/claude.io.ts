/**
 * `ClaudeCode` over the disk and the `claude` program.
 *
 * 🔴 TURNING THE PLUGIN ON IS `claude`'S OWN TWO COMMANDS WHEN `claude` IS ON PATH. Measured
 * 2026-11-22 (Claude Code 2.1.330, a throwaway HOME): the settings keys alone
 * (`extraKnownMarketplaces` + `enabledPlugins`, written by hand) leave `claude plugin list` empty, and
 * a later `claude plugin install paperlint@paperlint --scope project` then fails with "Plugin
 * \"paperlint\" not found in marketplace \"paperlint\"": the marketplace was never fetched. So with
 * `claude` on PATH the commands run (they write the same keys). Without it the keys are written, so
 * the project declares the plugin for every clone, and the report names the commands still owed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ClaudeCode } from "../../ports/claude-code.ts";
import { isRecord } from "../../domain/record.ts";
import {
  ENABLE_COMMANDS,
  enabledBy,
  installedVersion,
  withPlugin,
} from "./plugin.ts";

/** A JSON file's value; undefined when it is missing or does not parse. */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** Whether `file --version` runs and exits 0. */
export const onPath = (file: string): boolean =>
  spawnSync(file, ["--version"], { stdio: "ignore" }).status === 0;

/** Runs `argv` in `cwd` with the terminal's streams; its exit status, null when it did not run. */
export const runInherit = (
  [file, ...args]: readonly [string, ...string[]],
  cwd: string,
): number | null => spawnSync(file, args, { cwd, stdio: "inherit" }).status;

export interface ClaudeDeps {
  /** The user's home, where `~/.claude/` lives. */
  readonly home: string;
  readonly hasClaude: () => boolean;
  readonly run: typeof runInherit;
}

const settingsFile = (root: string) => join(root, ".claude", "settings.json");

/** Writes the plugin keys into the project's settings; the reason when the file is not JSON. */
function writeKeys(root: string): string | null {
  const path = settingsFile(root);
  const raw = existsSync(path) ? readJson(path) : {};
  if (!isRecord(raw)) return `${path} is not a JSON object`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(withPlugin(raw), null, 2)}\n`);
  return null;
}

export const claudeCode = ({
  home = homedir(),
  hasClaude = () => onPath("claude"),
  run = runInherit,
}: Partial<ClaudeDeps> = {}): ClaudeCode => ({
  present: (root) => existsSync(join(root, ".claude")) || hasClaude(),
  plugin: (root) => ({
    enabled: enabledBy(
      [
        join(root, ".claude", "settings.local.json"),
        settingsFile(root),
        join(home, ".claude", "settings.json"),
      ].map(readJson),
    ),
    version: installedVersion(
      readJson(join(home, ".claude", "plugins", "installed_plugins.json")),
      root,
    ),
  }),
  enable: (root) => {
    if (!hasClaude()) {
      const bad = writeKeys(root);
      return bad === null
        ? { ok: true, wrote: settingsFile(root) }
        : { ok: false, reason: bad };
    }
    const failed = ENABLE_COMMANDS.map((argv) => ({ argv })).find(
      ({ argv }) => run(argv, root) !== 0,
    );
    return failed === undefined
      ? { ok: true, ran: ENABLE_COMMANDS.map((c) => c.join(" ")) }
      : { ok: false, reason: `\`${failed.argv.join(" ")}\` failed` };
  },
});
