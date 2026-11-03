/**
 * What a linter rule does, in the linter's own words, for the card of an item that names one
 * ("read as ruff `TID253`" means nothing to a labeller who has not met the code). Never invented: a
 * rule the linter cannot describe has no description, and the build refuses it.
 *
 * - ruff: `ruff rule <code> --output-format json`, the paragraph under "## What it does".
 * - ESLint: the rule's `meta.docs.description`, from the ESLint (and the plugin) installed where
 *   items.json is: a study's own install, found by Node's resolution from that folder upwards.
 *   A plugin rule is found by ESLint's naming convention (`@scope/rule` → `@scope/eslint-plugin`,
 *   `@scope/p/rule` → `@scope/eslint-plugin-p`, `p/rule` → `eslint-plugin-p`).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { z } from "zod";

export interface RuleRef {
  readonly linter: "eslint" | "ruff";
  readonly id: string;
}
/** A process run to its end: the exit status and what it printed. */
export type RunProcess = (
  cmd: string,
  args: readonly string[],
) => { readonly status: number | null; readonly stdout: string };

export const runProcess: RunProcess = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout };
};

const RuffRule = z.object({ explanation: z.string() });
/** The paragraph under "## What it does", its lines joined. */
function ruffDescription(id: string, run: RunProcess): string | undefined {
  const r = run("ruff", ["rule", id, "--output-format", "json"]);
  if (r.status !== 0) return undefined;
  const { explanation } = RuffRule.parse(JSON.parse(r.stdout));
  const what = /## What it does\n([\s\S]*?)(?:\n\n|$)/.exec(explanation)?.[1];
  return what?.split("\n").join(" ").trim();
}

const RuleModule = z.object({
  meta: z.object({ docs: z.object({ description: z.string() }) }),
});
const Plugin = z.object({ rules: z.record(z.string(), z.unknown()) });
const Builtins = z.object({
  builtinRules: z.map(z.string(), z.unknown()),
});
/** The package and the rule name a namespaced ESLint rule id points at. */
function pluginOf(id: string): readonly [string, string] {
  const parts = id.split("/");
  const name = id.slice(id.lastIndexOf("/") + 1);
  const [scope, plugin] = parts;
  if (id.startsWith("@"))
    return [
      parts.length === 2
        ? `${String(scope)}/eslint-plugin`
        : `${String(scope)}/eslint-plugin-${String(plugin)}`,
      name,
    ];
  return [`eslint-plugin-${String(scope)}`, name];
}
const description = (rule: unknown): string | undefined => {
  const r = RuleModule.safeParse(rule);
  return r.success ? r.data.meta.docs.description : undefined;
};
function eslintDescription(id: string, fromDir: string): string | undefined {
  // createRequire takes an absolute path only; items.json is often named relative to the study folder.
  const load = createRequire(resolve(fromDir, "items.json"));
  try {
    if (!id.includes("/")) {
      const core = Builtins.parse(load("eslint/use-at-your-own-risk"));
      return description(core.builtinRules.get(id));
    }
    const [pkg, name] = pluginOf(id);
    return description(Plugin.parse(load(pkg)).rules[name]);
  } catch {
    // ESLint or the plugin is not installed where items.json is: the linter cannot answer.
    return undefined;
  }
}

/** The linter's own one-line description of `ref`, or undefined when it has none. */
export function describeRule(
  ref: RuleRef,
  fromDir: string,
  run: RunProcess = runProcess,
): string | undefined {
  return ref.linter === "ruff"
    ? ruffDescription(ref.id, run)
    : eslintDescription(ref.id, fromDir);
}
