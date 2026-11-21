/**
 * What Claude Code's own files say about the paperlint plugin, read without touching them. Measured
 * 2026-11-22 with Claude Code 2.1.330 (docs/prior-art/plugin-bundle-measurements.md):
 * `claude plugin marketplace add <source> --scope project` writes `extraKnownMarketplaces.paperlint`
 * into `.claude/settings.json`; `claude plugin install paperlint@paperlint --scope project` adds
 * `enabledPlugins["paperlint@paperlint"]: true` there, and records the install in
 * `~/.claude/plugins/installed_plugins.json` with its `scope`, `version` and `projectPath`.
 */
import { fieldOf, isRecord } from "../../domain/record.ts";

/** `<plugin>@<marketplace>`: both are named `paperlint`. */
export const PLUGIN_ID = "paperlint@paperlint";

/** The marketplace is this repository: `.claude-plugin/marketplace.json`. */
export const MARKETPLACE_REPO = "zernie/paperlint";

/** The two commands that turn the plugin on for a project, in order. */
export const ENABLE_COMMANDS: readonly (readonly [string, ...string[]])[] = [
  [
    "claude",
    "plugin",
    "marketplace",
    "add",
    MARKETPLACE_REPO,
    "--scope",
    "project",
  ],
  ["claude", "plugin", "install", PLUGIN_ID, "--scope", "project"],
];

/** What one settings file says: on, off, or nothing. */
const says = (settings: unknown): boolean | undefined => {
  const v = fieldOf(fieldOf(settings, "enabledPlugins"), PLUGIN_ID);
  return typeof v === "boolean" ? v : undefined;
};

/** The most specific file that names the plugin decides; `files` are ordered most specific first. */
export const enabledBy = (files: readonly unknown[]): boolean =>
  files.map(says).find((v) => v !== undefined) ?? false;

/** The version installed for `root`: an entry for this project, else a user-scope one. */
export function installedVersion(json: unknown, root: string): string | null {
  const entries = fieldOf(fieldOf(json, "plugins"), PLUGIN_ID);
  const list: readonly unknown[] = Array.isArray(entries) ? entries : [];
  const entry =
    list.find((e) => fieldOf(e, "projectPath") === root) ??
    list.find((e) => fieldOf(e, "scope") === "user");
  const version = fieldOf(entry, "version");
  return typeof version === "string" ? version : null;
}

const recordOf = (v: unknown): Readonly<Record<string, unknown>> =>
  isRecord(v) ? v : {};

/** The settings with the marketplace declared and the plugin turned on; everything else kept. */
export const withPlugin = (
  settings: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
  ...settings,
  extraKnownMarketplaces: {
    ...recordOf(settings["extraKnownMarketplaces"]),
    paperlint: { source: { source: "github", repo: MARKETPLACE_REPO } },
  },
  enabledPlugins: {
    ...recordOf(settings["enabledPlugins"]),
    [PLUGIN_ID]: true,
  },
});
