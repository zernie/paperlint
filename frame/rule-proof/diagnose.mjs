// Why an ESLint reading's config did not load, asked of the installed linter and plugin rather than read from the
// error text: is the plugin importable, is the rule id in its `rules` map (or ESLint's built-in rules), and are the
// options valid against the rule's own `meta.schema` (with the Ajv ESLint itself ships). Copied into the repository
// and run there as its own process, so a plugin resolves from the repository's node_modules as the config's import
// would; it imports the plugin, which is the repository's code, so it runs only where the runner runs.
//   node <repo>/.rule-proof-diagnose.mjs '<reading json>'   prints one JSON line
//   node <repo>/.rule-proof-diagnose.mjs --pair '{"scope":…,"bad":…,"good":…}'   why ESLint gave a planted file no
//     config: for each file, does the setting's `files` alone give it one (files_only), and does the whole setting,
//     its `ignores` as a global block the way vigiles writes it (full)? Asked of the repository's own ESLint
//     (calculateConfigForFile), whose answer is its own glob semantics, not ours.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(here, "noop.js"));

export function pluginPart(rule) {
  const parts = rule.split("/");
  if (parts.length === 1) return null;
  const prefix = parts.slice(0, -1).join("/");
  const name = parts.at(-1);
  if (!prefix.startsWith("@")) return { pkg: `eslint-plugin-${prefix}`, name };
  const [scope, sub] = prefix.split("/");
  return { pkg: sub === undefined ? `${scope}/eslint-plugin` : `${scope}/eslint-plugin-${sub}`, name };
}

// ESLint's own reading of `meta.schema`: an array is the positional options, an object the whole options array,
// false no validation; from ESLint 9 a rule with no schema takes no options.
export function optionsSchema(schema, eslintMajor) {
  if (schema === false) return null;
  if (schema === undefined) return eslintMajor >= 9 ? { type: "array", minItems: 0, maxItems: 0 } : null;
  if (Array.isArray(schema)) return schema.length ? { type: "array", items: schema, minItems: 0, maxItems: schema.length } : { type: "array", minItems: 0, maxItems: 0 };
  return schema;
}

async function main(reading) {
  const out = { plugin: null, plugin_loaded: null, rule_known: null, options_valid: null, schema: null, errors: [] };
  const note = (what, e) => out.errors.push(`${what}: ${String(e?.message ?? e).split("\n")[0].slice(0, 300)}`);
  let rule = null;
  let eslintVersion = null;
  try { eslintVersion = req("eslint/package.json").version; } catch (e) { note("eslint", e); }
  const p = pluginPart(reading.rule);
  if (p) {
    out.plugin = p.pkg;
    try {
      const mod = await import(p.pkg);
      const plugin = mod.default ?? mod;
      out.plugin_loaded = true;
      rule = plugin?.rules?.[p.name] ?? null;
      out.rule_known = rule !== null;
    } catch (e) {
      out.plugin_loaded = false;
      note("plugin", e);
    }
  } else {
    try {
      const { builtinRules } = req("eslint/use-at-your-own-risk");
      rule = builtinRules.get(reading.rule) ?? null;
      out.rule_known = rule !== null;
    } catch (e) { note("builtinRules", e); }
  }
  if (rule) {
    try {
      const schema = optionsSchema(rule.meta?.schema, Number(String(eslintVersion ?? "0").split(".")[0]));
      out.schema = schema === null ? "none" : "present";
      if (schema === null) out.options_valid = true;
      else {
        const ereq = createRequire(req.resolve("eslint"));
        const Ajv = ereq("ajv");
        const ajv = new Ajv({ meta: false, useDefaults: true, validateSchema: false, missingRefs: "ignore", verbose: true, schemaId: "auto" });
        const draft4 = ereq("ajv/lib/refs/json-schema-draft-04.json");
        ajv.addMetaSchema(draft4);
        ajv._opts.defaultMeta = draft4.id;
        const ok = ajv.validate(schema, JSON.parse(JSON.stringify(reading.options ?? [])));
        out.options_valid = Boolean(ok);
        if (!ok) out.errors.push(`options: ${ajv.errorsText(ajv.errors).slice(0, 300)}`);
      }
    } catch (e) { note("schema", e); }
  }
  console.log(JSON.stringify(out));
}

async function flatEslint() {
  const mod = req("eslint");
  if (typeof mod.loadESLint === "function") return mod.loadESLint({ useFlatConfig: true });
  return req("eslint/use-at-your-own-risk").FlatESLint;
}

export async function pairConfigs(ESLint, cwd, { scope, bad, good }) {
  const has = async (overrideConfig, file) =>
    (await new ESLint({ cwd, overrideConfigFile: true, overrideConfig }).calculateConfigForFile(path.join(cwd, file))) !== undefined;
  const one = async (file) => ({ files_only: await has([{ files: scope.files }], file), full: await has([{ ignores: scope.ignores }, { files: scope.files }], file) });
  return { bad: await one(bad), good: await one(good) };
}

async function pairMain(ask) {
  const out = { version: null, bad: null, good: null, errors: [] };
  try {
    out.version = req("eslint/package.json").version;
    Object.assign(out, await pairConfigs(await flatEslint(), process.cwd(), ask));
  } catch (e) { out.errors.push(`eslint: ${String(e?.message ?? e).split("\n")[0].slice(0, 300)}`); }
  console.log(JSON.stringify(out));
}

if (process.argv[2] === "--pair") await pairMain(JSON.parse(process.argv[3]));
else if (process.argv[2]) await main(JSON.parse(process.argv[2]));
