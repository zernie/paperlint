import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { useTempDir, writeTree } from "../../../test/support.ts";
import {
  ENABLE_COMMANDS,
  PLUGIN_ID,
  claudeCode,
  configDirOf,
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

const setup = (tree: Record<string, string>, hasClaude: boolean) => {
  const dir = useTempDir("paperlint-claude-");
  writeTree(dir, tree);
  const ran: string[] = [];
  const cc = claudeCode({
    configDir: join(dir, "home", ".claude"),
    hasClaude: () => hasClaude,
    run: (argv, cwd) => (ran.push(`${cwd}: ${argv.join(" ")}`), 0),
  });
  return { root: absolutePath(join(dir, "p")), cc, ran };
};

describe("claudeCode — reading the disk", () => {
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
});

describe("where Claude Code keeps the user's settings and plugins", () => {
  it("CLAUDE_CONFIG_DIR when it is set, else ~/.claude", () => {
    expect([
      configDirOf({ CLAUDE_CONFIG_DIR: "/profiles/work" }, "/home/a"),
      configDirOf({}, "/home/a"),
      configDirOf({ CLAUDE_CONFIG_DIR: "" }, "/home/a"),
    ]).toEqual([
      "/profiles/work",
      join("/home/a", ".claude"),
      join("/home/a", ".claude"),
    ]);
  });

  it("a profile in its own folder: the user's settings and the install record are read from it", () => {
    const dir = useTempDir("paperlint-claude-");
    const root = join(dir, "p");
    writeTree(dir, {
      "p/x": "",
      "profile/settings.json": JSON.stringify(on),
      "profile/plugins/installed_plugins.json": JSON.stringify({
        plugins: {
          [PLUGIN_ID]: [
            { scope: "project", projectPath: root, version: "2.0.0" },
          ],
        },
      }),
    });
    const cc = claudeCode({
      configDir: join(dir, "profile"),
      hasClaude: () => false,
      run: () => 0,
    });
    expect(cc.plugin(absolutePath(root))).toEqual({
      enabled: true,
      version: "2.0.0",
    });
  });
});

describe("claudeCode — turning the plugin on", () => {
  it("claude on PATH: its two commands run in the project, in order", () => {
    const s = setup({ "p/x": "" }, true);
    expect([s.cc.enable(s.root), s.ran]).toEqual([
      { ok: true, ran: ENABLE_COMMANDS.map((c) => c.join(" ")) },
      ENABLE_COMMANDS.map((c) => `${s.root}: ${c.join(" ")}`),
    ]);
  });

  it("a command that fails stops there, named", () => {
    const dir = useTempDir("paperlint-claude-");
    const cc = claudeCode({
      configDir: join(dir, ".claude"),
      hasClaude: () => true,
      run: () => 1,
    });
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
      { ok: true, wrote: path, owed: ENABLE_COMMANDS.map((c) => c.join(" ")) },
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
      owed: ENABLE_COMMANDS.map((c) => c.join(" ")),
    });
  });
});

describe("claudeCode — the keys, without claude", () => {
  it("no claude: another plugin and marketplace already declared are kept", () => {
    const s = setup(
      {
        "p/.claude/settings.json": JSON.stringify({
          enabledPlugins: { "other@x": false },
          extraKnownMarketplaces: { x: { source: { source: "git" } } },
        }),
      },
      false,
    );
    s.cc.enable(s.root);
    expect(
      JSON.parse(
        readFileSync(join(s.root, ".claude", "settings.json"), "utf8"),
      ),
    ).toEqual({
      enabledPlugins: { "other@x": false, "paperlint@paperlint": true },
      extraKnownMarketplaces: {
        x: { source: { source: "git" } },
        paperlint: { source: { source: "github", repo: "zernie/paperlint" } },
      },
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
});

describe("claudeCode — its defaults", () => {
  it("the real defaults: claudeCode() answers, onPath and runInherit run programs", () => {
    const dir = useTempDir("paperlint-claude-");
    writeTree(dir, { ".claude/x": "" });
    const bare = useTempDir("paperlint-claude-bare-");
    expect([
      claudeCode().present(absolutePath(dir)),
      // No `.claude/` here: the answer is whether `claude` runs on this machine.
      claudeCode().present(absolutePath(bare)) === onPath("claude"),
      onPath(process.execPath),
      onPath("paperlint-no-such-program"),
      runInherit([process.execPath, "-e", "process.exit(4)"], dir),
    ]).toEqual([true, true, true, false, 4]);
  });
});
