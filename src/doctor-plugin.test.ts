import { describe, expect, it } from "vitest";
import {
  compareVersions,
  PLUGIN_UPDATE,
  pluginLines,
  type PluginFacts,
} from "./doctor-plugin.ts";

const HEAD = "Claude Code plugin (carries the skills and the hooks)";
const facts = (over: Partial<PluginFacts> = {}): PluginFacts => ({
  state: { enabled: true, version: "1.2.0" },
  installed: "1.2.0",
  oldLinks: [],
  oldHooks: [],
  ...over,
});

describe("compareVersions", () => {
  it("orders by the dotted numbers, missing parts as 0, a pre-release tag ignored", () => {
    expect([
      compareVersions("1.2.0", "1.2.0"),
      compareVersions("1.2.0", "1.10.0"),
      compareVersions("2.0", "1.9.9"),
      compareVersions("1.2.0-beta.1", "1.2"),
      compareVersions("x", "0.0.0"),
    ]).toEqual([0, -1, 1, 0, 0]);
  });
});

describe("pluginLines", () => {
  it("on and matching, with nothing of init's left: one line", () => {
    expect([
      pluginLines(facts()),
      pluginLines(facts({ state: { enabled: true, version: null } })),
    ]).toEqual([
      [HEAD, "  ✓ on for this project, version 1.2.0"],
      [HEAD, "  ✓ on for this project"],
    ]);
  });

  it("off: one line naming --plugin", () => {
    expect(
      pluginLines(
        facts({ state: { enabled: false, version: null }, oldLinks: ["a"] }),
      ),
    ).toEqual([
      HEAD,
      "  · not on for this project — the skills and hooks below are init's links and commands. `npx paperlint init --plugin` turns it on",
    ]);
  });

  it("init's links or hooks beside it: named, with the one command that removes them", () => {
    const remedy =
      "      `npx paperlint init --plugin` removes the old ones and keeps the plugin";
    expect([
      pluginLines(facts({ oldLinks: ["a", "b"] })).slice(2),
      pluginLines(facts({ oldHooks: ["h"] })).slice(2),
    ]).toEqual([
      [
        "  ⚠ init's own skill links (a, b) are still here beside the plugin — each such skill is listed twice, each such hook runs twice",
        remedy,
      ],
      [
        "  ⚠ init's own hook commands (h) are still here beside the plugin — each such skill is listed twice, each such hook runs twice",
        remedy,
      ],
    ]);
  });

  it("a version that is not the installed one: which side is behind, and its command; unknown, nothing", () => {
    const behind = pluginLines(facts({ installed: "1.3.0" })).slice(2);
    const ahead = pluginLines(facts({ installed: "1.1.0" })).slice(2);
    expect([
      behind,
      ahead,
      pluginLines(facts({ installed: null })).slice(2),
    ]).toEqual([
      [
        "  ⚠ the plugin is 1.2.0, the installed paperlint is 1.3.0 — its skills and hooks describe another version",
        `      \`${PLUGIN_UPDATE}\` brings the plugin to the newest release`,
      ],
      [
        "  ⚠ the plugin is 1.2.0, the installed paperlint is 1.1.0 — its skills and hooks describe another version",
        "      the package is behind: install paperlint@1.2.0 in this project",
      ],
      [],
    ]);
  });
});
