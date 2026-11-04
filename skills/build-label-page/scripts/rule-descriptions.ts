/**
 * What a linter rule does, in the linter's own words, for the card of an item that names one
 * ("read as ruff `TID253`" means nothing to a labeller who has not met the code). Never invented: a
 * rule the linter cannot describe has no description, and the build refuses it.
 *
 * - ruff: `ruff rule <code> --output-format json`, the paragraph under "## What it does", and the
 *   family it names (`linter`: flake8-print for T201).
 * - ESLint: the rule's `meta.docs.description`, from the ESLint (and the plugin) installed where
 *   items.json is: a study's own install, found by Node's resolution from that folder upwards.
 *   A plugin rule is found by ESLint's naming convention (`@scope/rule` → `@scope/eslint-plugin`,
 *   `@scope/p/rule` → `@scope/eslint-plugin-p`, `p/rule` → `eslint-plugin-p`); the rule's own name
 *   may hold a slash (`n/no-unsupported-features/node-builtins`).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { z } from "zod";

export interface RuleRef {
  readonly linter: "eslint" | "ruff";
  readonly id: string;
}
/** What the linter says a rule does; a ruff rule also names the family it comes from. */
export interface Described {
  readonly description: string;
  readonly family?: string;
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

const RuffRule = z.object({ explanation: z.string(), linter: z.string() });
/** The paragraph under "## What it does", its lines joined, and the rule's family. */
function ruffDescription(id: string, run: RunProcess): Described | undefined {
  const r = run("ruff", ["rule", id, "--output-format", "json"]);
  if (r.status !== 0) return undefined;
  const { explanation, linter } = RuffRule.parse(JSON.parse(r.stdout));
  const what = /## What it does\n([\s\S]*?)(?:\n\n|$)/.exec(explanation)?.[1];
  return what === undefined
    ? undefined
    : { description: what.split("\n").join(" ").trim(), family: linter };
}

const RuleModule = z.object({
  meta: z.object({ docs: z.object({ description: z.string() }) }),
});
const Plugin = z.object({ rules: z.record(z.string(), z.unknown()) });
const Builtins = z.object({
  builtinRules: z.map(z.string(), z.unknown()),
});
/**
 * The packages and rule names a namespaced ESLint rule id may point at, likeliest first. The rule's
 * own name may hold a slash, so `@scope/a/b` is `a/b` of `@scope/eslint-plugin` or `b` of
 * `@scope/eslint-plugin-a`; an unscoped id's plugin is everything before its first slash.
 */
function pluginsOf(id: string): readonly (readonly [string, string])[] {
  const [first = "", second = "", ...rest] = id.split("/");
  const after = (n: number): string => id.split("/").slice(n).join("/");
  return id.startsWith("@")
    ? [
        ...(rest.length
          ? [[`${first}/eslint-plugin-${second}`, after(2)] as const]
          : []),
        [`${first}/eslint-plugin`, after(1)] as const,
      ]
    : [[`eslint-plugin-${first}`, after(1)] as const];
}
// `require` of an ES-module plugin returns its namespace: the plugin object is then its `default`.
const EsmPlugin = z.object({ default: Plugin });
const pluginRules = (mod: unknown): Readonly<Record<string, unknown>> => {
  const esm = EsmPlugin.safeParse(mod);
  return esm.success ? esm.data.default.rules : Plugin.parse(mod).rules;
};
const description = (rule: unknown): Described | undefined => {
  const r = RuleModule.safeParse(rule);
  return r.success ? { description: r.data.meta.docs.description } : undefined;
};
/** `load(pkg)`, or undefined when it is not installed where items.json is. */
const tryLoad = (load: NodeJS.Require, pkg: string): unknown => {
  try {
    return load(pkg);
  } catch {
    return undefined;
  }
};
function eslintDescription(id: string, fromDir: string): Described | undefined {
  // createRequire takes an absolute path only; items.json is often named relative to the study folder.
  const load = createRequire(resolve(fromDir, "items.json"));
  if (!id.includes("/")) {
    const core = tryLoad(load, "eslint/use-at-your-own-risk");
    return core === undefined
      ? undefined
      : description(Builtins.parse(core).builtinRules.get(id));
  }
  return pluginsOf(id)
    .map(([pkg, name]) => {
      const mod = tryLoad(load, pkg);
      return mod === undefined
        ? undefined
        : description(pluginRules(mod)[name]);
    })
    .find((d) => d !== undefined);
}

/** The linter's own one-line description of `ref`, or undefined when it has none. */
export function describeRule(
  ref: RuleRef,
  fromDir: string,
  run: RunProcess = runProcess,
): Described | undefined {
  return ref.linter === "ruff"
    ? ruffDescription(ref.id, run)
    : eslintDescription(ref.id, fromDir);
}
