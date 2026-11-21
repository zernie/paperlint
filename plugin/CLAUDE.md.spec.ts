// Compiled to plugin/CLAUDE.md by `npx vigiles compile`. Edit THIS file, never the markdown.
import { file, instructionFile, prose } from "vigiles/spec";

export default instructionFile({
  sections: {
    "`plugin/`": prose`${file("plugin/hooks/hooks.json")} is the one hook wiring. The Claude Code plugin
(${file(".claude-plugin/plugin.json")}) ships it as its hooks, and \`paperlint init --no-plugin\` merges the
same file into the consumer's \`.claude/settings.json\`. Every command in it runs the project's installed
\`node_modules/paperlint/bin/paperlint.mjs\`: the plugin carries the skills and the hooks, the npm package
carries the code, and \`paperlint lint\` works without the plugin.`,

    "Why the plugin came back": prose`The plugin was removed after 1.0.0 (#82) on three objections. Each now has a measured answer
(2026-11-22); bring none of them back as a reason without measuring again:

- **"A plugin cannot carry the code."** It does not have to. The skill scripts are bundled
  (\`scripts/bundle-skills.ts\`, #624) and run from a copy of the package with no \`node_modules\`; the
  hooks call the project's installed paperlint. Installing the plugin from the marketplace took 16.7 s.
- **"The skills need the npm package anyway."** Only the hooks do, and they find it in the project.
- **"Its manifests carried versions nothing updated."** The marketplace installs from the npm package,
  and \`npm pack\` stamps the package's version into the packed \`plugin.json\`
  (${file("scripts/plugin-version.ts")}); the tracked file keeps the placeholder. Without a version there,
  Claude Code lists the plugin's version as "unknown".

Turning it on is \`claude\`'s own two commands (\`src/adapters/claude-code/claude.io.ts\`): writing
\`enabledPlugins\` and \`extraKnownMarketplaces\` by hand left \`claude plugin list\` empty. Repository
settings alone download nothing in a cloud session either: the user adds the marketplace once in
their claude.ai settings.`,
  },
  rules: {},
});
