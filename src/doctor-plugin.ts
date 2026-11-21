/**
 * `paperlint doctor`'s plugin section. Once the Claude Code plugin is on it carries the skills and the
 * hooks, so a project without init's links and hook commands is complete — and one that has BOTH lists
 * every skill twice and runs every hook twice, which is the first thing this section warns about. The
 * second is a plugin whose version is not the installed package's: the plugin's skills and hooks then
 * describe a different paperlint than the one `npx paperlint` runs.
 */
import type { PluginState } from "./ports/claude-code.ts";

export const PLUGIN_UPDATE =
  "claude plugin update paperlint@paperlint --scope project";

/** -1, 0 or 1 by the dotted numbers of two versions; a pre-release tag is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): readonly number[] =>
    v
      .split("-", 1)
      .join("")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  const i = [0, 1, 2].find((k) => (x[k] ?? 0) !== (y[k] ?? 0));
  return i === undefined ? 0 : Math.sign((x[i] ?? 0) - (y[i] ?? 0));
}

export interface PluginFacts {
  readonly state: PluginState;
  /** The paperlint this doctor is, as installed in the project; null when unknown. */
  readonly installed: string | null;
  /** init's skill links still in `.claude/skills/`. */
  readonly oldLinks: readonly string[];
  /** The hooks init's own commands still run from `.claude/settings.json`. */
  readonly oldHooks: readonly string[];
}

const versionLine = (
  plugin: string | null,
  installed: string | null,
): readonly string[] => {
  if (plugin === null || installed === null) return [];
  const order = compareVersions(plugin, installed);
  if (order === 0) return [];
  return [
    `  ⚠ the plugin is ${plugin}, the installed paperlint is ${installed} — its skills and hooks describe another version`,
    order < 0
      ? `      \`${PLUGIN_UPDATE}\` brings the plugin to the newest release`
      : `      the package is behind: install paperlint@${plugin} in this project`,
  ];
};

const doubled = (f: PluginFacts): readonly string[] => {
  const what = [
    f.oldLinks.length > 0 ? `skill links (${f.oldLinks.join(", ")})` : null,
    f.oldHooks.length > 0 ? `hook commands (${f.oldHooks.join(", ")})` : null,
  ].filter((w): w is string => w !== null);
  return what.length === 0
    ? []
    : [
        `  ⚠ init's own ${what.join(" and ")} are still here beside the plugin — each such skill is listed twice, each such hook runs twice`,
        `      \`npx paperlint init --plugin\` removes the old ones and keeps the plugin`,
      ];
};

/** The section: a header and its lines. */
export function pluginLines(f: PluginFacts): readonly string[] {
  const head = "Claude Code plugin (carries the skills and the hooks)";
  if (!f.state.enabled)
    return [
      head,
      "  · not on for this project — the skills and hooks below are init's links and commands. `npx paperlint init --plugin` turns it on",
    ];
  return [
    head,
    `  ✓ on for this project${f.state.version === null ? "" : `, version ${f.state.version}`}`,
    ...doubled(f),
    ...versionLine(f.state.version, f.installed),
  ];
}
