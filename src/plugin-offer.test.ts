import { describe, expect, it } from "vitest";
import { scriptedPrompts, type Reply } from "../test/support.ts";
import { absolutePath } from "./domain/paths.ts";
import {
  offerPlugin,
  PLUGIN_QUESTION,
  pluginOn,
  reportPlugin,
  STILL_OFF,
  type PluginAsking,
  type PluginOutcome,
} from "./plugin-offer.ts";
import type {
  ClaudeCode,
  EnableResult,
  PluginState,
} from "./ports/claude-code.ts";

const ROOT = absolutePath("/project");
const RAN: EnableResult = { ok: true, ran: ["claude a", "claude b"] };

/** A Claude Code that records every `enable`, with the state and answer a test gives it. */
/** Installed, as Claude Code reads it once both commands ran. */
const INSTALLED: PluginState = { enabled: true, version: "1.0.0" };

/**
 * A Claude Code whose state is `state` until `enable` runs, then `after` (installed, unless the
 * test says what Claude Code reads instead, such as a local setting that keeps it off).
 */
function fakeClaude({
  present = true,
  state = { enabled: false, version: null },
  enables = RAN,
  after = INSTALLED,
}: {
  readonly present?: boolean;
  readonly state?: PluginState;
  readonly enables?: EnableResult;
  readonly after?: PluginState;
} = {}): ClaudeCode & { readonly enabled: string[] } {
  const enabled: string[] = [];
  return {
    enabled,
    present: () => present,
    plugin: () => (enabled.length > 0 ? after : state),
    enable: (root) => (enabled.push(root), enables),
  };
}

const asking = (
  over: Partial<PluginAsking> & { readonly reply?: Reply } = {},
): PluginAsking & { readonly asked: string[] } => {
  const prompts = scriptedPrompts(() => over.reply);
  return {
    flag: null,
    interactive: true,
    why: "a terminal on both ends",
    prompts,
    asked: prompts.asked,
    ...over,
  };
};

describe("offerPlugin — the four paths the author named", () => {
  it("a human, Yes (Enter takes the preselected Yes): asked once, turned on", async () => {
    const claude = fakeClaude();
    const a = asking();
    expect([
      await offerPlugin(ROOT, claude, a),
      a.asked,
      claude.enabled,
    ]).toEqual([{ kind: "enabled", how: RAN }, [PLUGIN_QUESTION], [ROOT]]);
  });

  it("both commands ran, yet a more specific setting keeps it off: not turned on, and said why", async () => {
    // `--scope project` writes .claude/settings.json; .claude/settings.local.json outranks it.
    const claude = fakeClaude({ after: { enabled: false, version: "1.0.0" } });
    const out = await offerPlugin(ROOT, claude, asking({ flag: "plugin" }));
    expect([out, pluginOn(out), claude.enabled]).toEqual([
      { kind: "failed", reason: STILL_OFF },
      false,
      [ROOT],
    ]);
  });

  it("a human, No: asked once, nothing turned on", async () => {
    const claude = fakeClaude();
    const a = asking({ reply: false });
    expect([
      await offerPlugin(ROOT, claude, a),
      a.asked,
      claude.enabled,
    ]).toEqual([{ kind: "declined" }, [PLUGIN_QUESTION], []]);
  });

  it("no human, --plugin: nothing asked, turned on", async () => {
    const claude = fakeClaude();
    const a = asking({ interactive: false, flag: "plugin" });
    expect([
      await offerPlugin(ROOT, claude, a),
      a.asked,
      claude.enabled,
    ]).toEqual([{ kind: "enabled", how: RAN }, [], [ROOT]]);
  });

  it("no human, no flag: nothing asked, nothing turned on, the reason kept", async () => {
    const claude = fakeClaude();
    const a = asking({ interactive: false, why: "stdout is not a terminal" });
    expect([
      await offerPlugin(ROOT, claude, a),
      a.asked,
      claude.enabled,
    ]).toEqual([
      { kind: "not-asked", why: "stdout is not a terminal" },
      [],
      [],
    ]);
  });
});

describe("offerPlugin — --no-plugin", () => {
  it("--no-plugin: nothing asked, nothing turned on; an installed plugin stays on", async () => {
    const off = fakeClaude();
    const installed = fakeClaude({
      state: { enabled: true, version: "1.2.3" },
    });
    const a = asking({ flag: "no-plugin" });
    // Skipping the offer is not turning the plugin off: init must not re-create links beside it.
    expect([
      await offerPlugin(ROOT, off, a),
      await offerPlugin(ROOT, installed, a),
      a.asked,
      off.enabled,
      installed.enabled,
    ]).toEqual([
      { kind: "no-plugin-flag" },
      { kind: "already", version: "1.2.3" },
      [],
      [],
      [],
    ]);
  });
});

describe("offerPlugin — the other ways it ends", () => {
  it("no Claude Code: silence; --plugin turns it on all the same", async () => {
    const absent = fakeClaude({ present: false });
    expect([
      await offerPlugin(ROOT, absent, asking()),
      await offerPlugin(ROOT, undefined, asking({ flag: "plugin" })),
      await offerPlugin(ROOT, absent, asking({ flag: "plugin" })),
    ]).toEqual([
      { kind: "no-claude" },
      { kind: "no-claude" },
      { kind: "enabled", how: RAN },
    ]);
  });

  it("already on: nothing asked, its version kept", async () => {
    const claude = fakeClaude({ state: { enabled: true, version: "1.2.3" } });
    const a = asking();
    expect([
      await offerPlugin(ROOT, claude, a),
      a.asked,
      claude.enabled,
    ]).toEqual([{ kind: "already", version: "1.2.3" }, [], []]);
  });

  it("Ctrl+C at the question, a prompt that fails, a missing prompts port, an enable that fails", async () => {
    const failing = fakeClaude({ enables: { ok: false, reason: "boom" } });
    expect([
      await offerPlugin(ROOT, fakeClaude(), asking({ reply: "cancel" })),
      await offerPlugin(
        ROOT,
        fakeClaude(),
        asking({ reply: new Error("tty") }),
      ),
      await offerPlugin(ROOT, fakeClaude(), asking({ prompts: undefined })),
      await offerPlugin(ROOT, failing, asking({ flag: "plugin" })),
    ]).toEqual([
      { kind: "cancelled" },
      { kind: "enabled", how: RAN },
      { kind: "not-asked", why: "a terminal on both ends" },
      { kind: "failed", reason: "boom" },
    ]);
  });
});

describe("offerPlugin — declared, not installed", () => {
  it("declared in settings but not installed: nothing asked, the install runs again", async () => {
    // The keys say yes, but Claude Code has no install on record: the settings alone load nothing.
    const declared = { enabled: true, version: null } as const;
    const human = fakeClaude({ state: declared });
    const noHuman = fakeClaude({ state: declared });
    const a = asking({ reply: false });
    expect([
      await offerPlugin(ROOT, human, a),
      a.asked,
      human.enabled,
      await offerPlugin(ROOT, noHuman, asking({ interactive: false })),
      noHuman.enabled,
    ]).toEqual([
      { kind: "enabled", how: RAN },
      [],
      ["/project"],
      { kind: "enabled", how: RAN },
      ["/project"],
    ]);
  });
});

const HEAD = [
  "",
  "Claude Code plugin (the skills and hooks, updated with paperlint)",
];
const outcomes: readonly PluginOutcome[] = [
  { kind: "no-claude" },
  { kind: "cancelled" },
  { kind: "not-asked", why: "CI is set" },
  { kind: "no-plugin-flag" },
  { kind: "declined" },
  { kind: "failed", reason: "boom" },
  { kind: "already", version: "1.2.3" },
  { kind: "enabled", how: RAN },
  {
    kind: "enabled",
    how: {
      ok: true,
      wrote: "/project/.claude/settings.json",
      owed: ["c1", "c2"],
    },
  },
];

describe("pluginOn and reportPlugin", () => {
  it("on only once installed: already on, or turned on by running claude — written keys are not on", () => {
    expect(outcomes.map(pluginOn)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
    ]);
  });

  it("each outcome's lines; without a human, exactly one line after the blank", () => {
    expect(outcomes.map(reportPlugin)).toEqual([
      [],
      [],
      [
        "",
        "Claude Code plugin: not turned on — CI is set, so nothing was asked. To turn it on: npx paperlint init --plugin",
      ],
      [...HEAD, "  · --no-plugin — nothing asked, nothing turned on"],
      [
        ...HEAD,
        "  · declined — `npx paperlint init --plugin` turns it on later",
      ],
      [
        ...HEAD,
        "  ✗ not turned on — boom. `npx paperlint init --plugin` tries again",
      ],
      [...HEAD, "  ✓ already on for this project, version 1.2.3"],
      [...HEAD, "  ✓ ran claude a", "  ✓ ran claude b"],
      [
        ...HEAD,
        "  ✓ declared in /project/.claude/settings.json — `claude` is not on PATH, and these keys alone load nothing.",
        "      once, where `claude` runs: c1 && c2",
      ],
    ]);
  });
});
