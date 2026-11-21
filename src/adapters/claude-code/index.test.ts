import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir, writeTree } from "../../../test/support.ts";
import {
  ENABLE_COMMANDS,
  claudeCode,
  enabledBy,
  installedVersion,
  onPath,
  runInherit,
} from "./index.ts";

const on = { enabledPlugins: { "paperlint@paperlint": true } };
const off = { enabledPlugins: { "paperlint@paperlint": false } };

describe("what Claude Code's files say about the plugin", () => {
  it("the most specific file that names it decides; none is off", () => {
    expect([
      enabledBy([undefined, on, off]),
      enabledBy([off, on]),
      enabledBy([{ enabledPlugins: { other: true } }, undefined]),
      enabledBy([]),
    ]).toEqual([true, false, false, false]);
  });

  it("the installed version: this project's entry, else a user one, else none", () => {
    const json = (entries: unknown) => ({
      plugins: { "paperlint@paperlint": entries },
    });
    expect([
      installedVersion(
        json([
          { scope: "user", version: "1.0.0" },
          { scope: "project", projectPath: "/p", version: "2.0.0" },
        ]),
        "/p",
      ),
      installedVersion(json([{ scope: "user", version: "1.0.0" }]), "/p"),
      installedVersion(json([{ scope: "project", projectPath: "/q" }]), "/p"),
      installedVersion(json("not a list"), "/p"),
      installedVersion(undefined, "/p"),
    ]).toEqual(["2.0.0", "1.0.0", null, null, null]);
  });
});

describe("claudeCode — the disk and the claude program", () => {
  const setup = (tree: Record<string, string>, hasClaude: boolean) => {
    const dir = useTempDir("paperlint-claude-");
    writeTree(dir, tree);
    const ran: string[] = [];
    const cc = claudeCode({
      home: join(dir, "home"),
      hasClaude: () => hasClaude,
      run: (argv, cwd) => (ran.push(`${cwd}: ${argv.join(" ")}`), 0),
    });
    return { root: absolutePath(join(dir, "p")), cc, ran };
  };

  it("present: a .claude folder, or claude on PATH", () => {
    const a = setup({ "p/.claude/x": "" }, false);
    const b = setup({ "p/x": "" }, true);
    const c = setup({ "p/x": "" }, false);
    expect([
      a.cc.present(a.root),
      b.cc.present(b.root),
      c.cc.present(c.root),
    ]).toEqual([true, true, false]);
  });

  it("the plugin's state, from the project, the local file, the user's settings and the install record", () => {
    const s = setup(
      {
        "p/.claude/settings.json": JSON.stringify(on),
        "home/.claude/plugins/installed_plugins.json": "{ not json",
      },
      false,
    );
    expect(s.cc.plugin(s.root)).toEqual({ enabled: true, version: null });
    const u = setup(
      {
        "p/.claude/settings.local.json": JSON.stringify(off),
        "home/.claude/settings.json": JSON.stringify(on),
      },
      false,
    );
    expect(u.cc.plugin(u.root)).toEqual({ enabled: false, version: null });
  });

  it("claude on PATH: its two commands run in the project, in order", () => {
    const s = setup({ "p/x": "" }, true);
    expect([s.cc.enable(s.root), s.ran]).toEqual([
      { ok: true, ran: ENABLE_COMMANDS.map((c) => c.join(" ")) },
      ENABLE_COMMANDS.map((c) => `${s.root}: ${c.join(" ")}`),
    ]);
  });

  it("a command that fails stops there, named", () => {
    const dir = useTempDir("paperlint-claude-");
    const cc = claudeCode({ home: dir, hasClaude: () => true, run: () => 1 });
    expect(cc.enable(absolutePath(dir))).toEqual({
      ok: false,
      reason:
        "`claude plugin marketplace add zernie/paperlint --scope project` failed",
    });
  });

  it("no claude: the keys are written beside the project's own settings", () => {
    const s = setup(
      { "p/.claude/settings.json": '{"permissions":{"allow":["Bash(ls)"]}}' },
      false,
    );
    const path = join(s.root, ".claude", "settings.json");
    expect([
      s.cc.enable(s.root),
      JSON.parse(readFileSync(path, "utf8")),
    ]).toEqual([
      { ok: true, wrote: path },
      {
        permissions: { allow: ["Bash(ls)"] },
        extraKnownMarketplaces: {
          paperlint: { source: { source: "github", repo: "zernie/paperlint" } },
        },
        enabledPlugins: { "paperlint@paperlint": true },
      },
    ]);
    const fresh = setup({ "p/x": "" }, false);
    expect(fresh.cc.enable(fresh.root)).toEqual({
      ok: true,
      wrote: join(fresh.root, ".claude", "settings.json"),
    });
  });

  it("no claude, and a settings file that is not an object: nothing written, the reason", () => {
    const s = setup({ "p/.claude/settings.json": "[1]" }, false);
    const path = join(s.root, ".claude", "settings.json");
    expect([s.cc.enable(s.root), readFileSync(path, "utf8")]).toEqual([
      { ok: false, reason: `${path} is not a JSON object` },
      "[1]",
    ]);
  });

  it("the real defaults: claudeCode() answers, onPath and runInherit run programs", () => {
    const dir = useTempDir("paperlint-claude-");
    writeTree(dir, { ".claude/x": "" });
    expect([
      claudeCode().present(absolutePath(dir)),
      onPath(process.execPath),
      onPath("paperlint-no-such-program"),
      runInherit([process.execPath, "-e", "process.exit(4)"], dir),
    ]).toEqual([true, true, false, 4]);
  });
});
