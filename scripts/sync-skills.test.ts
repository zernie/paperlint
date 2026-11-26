import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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

describe("which skills are synced", () => {
  it("copies every real folder under .claude/skills, and no symlinked shipped skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "paperlint-skill-test-"));
    const skill = (name: string) =>
      `---\nname: ${name}\ndescription: A skill.\n---\n\n# Body.\n`;
    const copy = (name: string) =>
      readFile(join(root, ".agents", "skills", name, "SKILL.md"), "utf8");
    try {
      for (const name of ["one", "two"]) {
        await mkdir(join(root, ".claude", "skills", name), { recursive: true });
        await writeFile(
          join(root, ".claude", "skills", name, "SKILL.md"),
          skill(name),
        );
      }
      await mkdir(join(root, "skills", "shipped"), { recursive: true });
      await writeFile(
        join(root, "skills", "shipped", "SKILL.md"),
        skill("shipped"),
      );
      await symlink(
        join(root, "skills", "shipped"),
        join(root, ".claude", "skills", "shipped"),
      );
      await syncSkills(root, false);
      // Guards: both real folders copied; the symlink, a shipped skill, left out.
      expect([
        (await copy("one")).includes("name: one"),
        (await copy("two")).includes("name: two"),
      ]).toEqual([true, true]);
      await expect(copy("shipped")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
