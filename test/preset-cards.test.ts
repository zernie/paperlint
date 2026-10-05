/**
 * EVERY PRESET HAS A CARD: the repository's own `presetCards` blocks (eslint.config.mjs), re-rooted at
 * a copy of the presets, the rule pages beside them. Both halves of the pairing check —
 * `project-structure/folder-structure` with `enforceExistence` — and the card rule beside it.
 */
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { presetCards } from "../eslint.config.mjs";
import { useTempDir } from "./support.ts";

const REPO = join(import.meta.dirname, "..");
const root = useTempDir("paperlint-preset-cards-");
cpSync(join(REPO, "presets"), join(root, "presets"), { recursive: true });
cpSync(join(REPO, "docs", "rules"), join(root, "docs", "rules"), {
  recursive: true,
});
cpSync(join(REPO, "docs", "rules.md"), join(root, "docs", "rules.md"));

/** Every finding on the presets directory, as `<file>: <rule>: <first line of the message>`. */
async function lintPresets(): Promise<string[]> {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: presetCards(root),
  });
  const results = await eslint.lintFiles(["presets"]);
  // Guards: the pairing rule must SEE the presets — a block that matches no .jsonc reports clean.
  expect(results.filter((r) => r.filePath.endsWith(".jsonc"))).toHaveLength(7);
  return results.flatMap((r) =>
    r.messages.map(
      (m) =>
        `${r.filePath.slice(root.length + 1)}: ${String(m.ruleId)}: ${m.message.split("\n")[0] ?? ""}`,
    ),
  );
}

describe("every preset has a card beside it", () => {
  it("the shipped presets, each with its card: silent", async () => {
    expect(await lintPresets()).toEqual([]);
  });

  it("a preset whose card is gone: an error on the preset, naming the missing card", async () => {
    rmSync(join(root, "presets", "aidc.md"));
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: presetCards(root),
    });
    const [r] = await eslint.lintFiles(["presets/aidc.jsonc"]);
    expect(r?.messages.map((m) => [m.ruleId, m.message])).toEqual([
      [
        "project-structure/folder-structure",
        "🔥 File 'aidc.jsonc' enforces the existence of other folders/files. 🔥\n\nEnforce existence = ./presets/aidc.md\nError location = ./presets/aidc.jsonc\n\n",
      ],
    ]);
    cpSync(join(REPO, "presets", "aidc.md"), join(root, "presets", "aidc.md"));
    expect(await lintPresets()).toEqual([]);
  });
});
