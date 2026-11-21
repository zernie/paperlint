/**
 * `paperlint init` offers the Claude Code plugin, which carries the skills and the hooks and is
 * updated with paperlint (decided 2026-11-22; replaces "link no skills unless asked", #510).
 *
 * ── THE DECISIONS ─────────────────────────────────────────────────────────────
 *   who is offered     only a project where Claude Code is: a `.claude/` folder, or `claude` on PATH.
 *                      Anywhere else, silence.
 *   a human            asked once, Yes preselected; No is respected.
 *   no human           (--yes, CI, stdin or stdout not a terminal — Claude Code running init is this
 *                      case) nothing is turned on, and ONE line names why and `--plugin`, so an
 *                      agent can ask its user.
 *   --plugin           on, without asking, with or without a terminal.
 *   --no-plugin        never asked, never on.
 *   once it is on      init removes the skill links and hook entries IT made: kept beside the
 *                      plugin, every skill would be listed twice and every hook would run twice.
 */
import type { AbsolutePath } from "./domain/paths.ts";
import type { ClaudeCode, EnableResult } from "./ports/claude-code.ts";
import type { Answer, Prompts } from "./ports/prompts.ts";

/** `--plugin`, `--no-plugin`, or neither. */
export type PluginFlag = "plugin" | "no-plugin" | null;

export type PluginOutcome =
  | { readonly kind: "no-claude" }
  | { readonly kind: "no-plugin-flag" }
  | { readonly kind: "already"; readonly version: string | null }
  | {
      readonly kind: "enabled";
      readonly how: Exclude<EnableResult, { readonly ok: false }>;
    }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "declined" }
  | { readonly kind: "not-asked"; readonly why: string }
  | { readonly kind: "cancelled" };

export interface PluginAsking {
  readonly flag: PluginFlag;
  readonly interactive: boolean;
  /** Why nothing is asked, as `interactivity()` says it. */
  readonly why: string;
  readonly prompts?: Prompts | undefined;
}

export const PLUGIN_QUESTION =
  "Turn on the paperlint plugin for Claude Code? (the skills and hooks, updated with paperlint)";

const ask = async (prompts: Prompts): Promise<Answer<boolean>> => {
  try {
    return await prompts.confirm({ message: PLUGIN_QUESTION, initial: true });
  } catch {
    return { kind: "answer", value: true };
  }
};

/** Whether to go ahead: the flag, else a human's answer; an outcome when it stops here. */
async function decided(asking: PluginAsking): Promise<PluginOutcome | null> {
  if (asking.flag === "plugin") return null;
  if (!asking.interactive || !asking.prompts)
    return { kind: "not-asked", why: asking.why };
  const answer = await ask(asking.prompts);
  if (answer.kind === "cancel") return { kind: "cancelled" };
  return answer.value ? null : { kind: "declined" };
}

export async function offerPlugin(
  root: AbsolutePath,
  claude: ClaudeCode | undefined,
  asking: PluginAsking,
): Promise<PluginOutcome> {
  if (asking.flag === "no-plugin") return { kind: "no-plugin-flag" };
  if (!claude || (!claude.present(root) && asking.flag !== "plugin"))
    return { kind: "no-claude" };
  const state = claude.plugin(root);
  if (state.enabled) return { kind: "already", version: state.version };
  const stop = await decided(asking);
  if (stop !== null) return stop;
  const how = claude.enable(root);
  return how.ok
    ? { kind: "enabled", how }
    : { kind: "failed", reason: how.reason };
}

/** The plugin is on once init is done: the old links and hook entries then go. */
export const pluginOn = (o: PluginOutcome): boolean =>
  o.kind === "already" || o.kind === "enabled";

const AGAIN = "`npx paperlint init --plugin`";

/** The plugin section of init's report: a header and its lines, or nothing at all. */
export function reportPlugin(o: PluginOutcome): readonly string[] {
  if (o.kind === "no-claude" || o.kind === "cancelled") return [];
  // ONE line without a human: an agent that ran init reads it and can ask its user.
  if (o.kind === "not-asked")
    return [
      ``,
      `Claude Code plugin: not turned on — ${o.why}, so nothing was asked. To turn it on: npx paperlint init --plugin`,
    ];
  const head = [
    ``,
    `Claude Code plugin (the skills and hooks, updated with paperlint)`,
  ];
  if (o.kind === "no-plugin-flag")
    return [...head, `  · --no-plugin — nothing asked, nothing turned on`];
  if (o.kind === "declined")
    return [...head, `  · declined — ${AGAIN} turns it on later`];
  if (o.kind === "failed")
    return [...head, `  ✗ not turned on — ${o.reason}. ${AGAIN} tries again`];
  if (o.kind === "already")
    return [
      ...head,
      `  ✓ already on for this project${o.version === null ? "" : `, version ${o.version}`}`,
    ];
  return "ran" in o.how
    ? [...head, ...o.how.ran.map((c) => `  ✓ ran ${c}`)]
    : [
        ...head,
        `  ✓ declared in ${o.how.wrote} — \`claude\` is not on PATH, and these keys alone load nothing.`,
        `      once, where \`claude\` runs: ${o.how.owed.join(" && ")}`,
      ];
}
