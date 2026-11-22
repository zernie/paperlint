import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncSkills } from "./sync-skills.ts";

describe("repository skill sync", () => {
  it("detects a missing or stale Codex skill, and regenerates it from the Claude skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "paperlint-skill-test-"));
    try {
      const claudeDir = join(root, ".claude", "skills", "add-venue");
      const claudeFile = join(claudeDir, "SKILL.md");
      const codexFile = join(
        root,
        ".agents",
        "skills",
        "add-venue",
        "SKILL.md",
      );
      const skill = [
        "---",
        "name: add-venue",
        "description: Update a workshop.",
        "---",
        "",
        "<!-- vigiles:sha256:abc compiled from .claude/skills/add-venue/SKILL.md.spec.ts -->",
        "",
        "# Check each deadline.",
        "",
      ].join("\n");

      await mkdir(claudeDir, { recursive: true });
      await writeFile(claudeFile, skill);
      await expect(syncSkills(root, true)).rejects.toThrow(
        "npm run sync:skills",
      );
      await expect(readFile(codexFile, "utf8")).rejects.toThrow();

      await syncSkills(root, false);
      const generated = await readFile(codexFile, "utf8");
      expect(generated).toContain("name: add-venue");
      expect(generated).toContain("# Check each deadline.");
      expect(generated).not.toContain("vigiles:sha256");
      expect(await readFile(claudeFile, "utf8")).toBe(skill);
      await syncSkills(root, true);

      await writeFile(claudeFile, skill.replace("each deadline", "the portal"));
      await expect(syncSkills(root, true)).rejects.toThrow(
        "npm run sync:skills",
      );
      expect(await readFile(codexFile, "utf8")).toBe(generated);
      await syncSkills(root, false);
      expect(await readFile(codexFile, "utf8")).toContain(
        "# Check the portal.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("the published CLI can check the tracked skill from a different directory", () => {
    execFileSync(
      process.execPath,
      [join(import.meta.dirname, "sync-skills.ts"), "--check"],
      { cwd: tmpdir(), stdio: "pipe" },
    );
  });
});
