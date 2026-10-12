// Compiled to plugin/CLAUDE.md by `npx vigiles compile`. Edit THIS file, never the markdown.
import { file, instructionFile, prose } from "vigiles/spec";

export default instructionFile({
  sections: {
    "`plugin/`": prose`Not a plugin any more. ${file("plugin/hooks/hooks.json")} is the hook wiring that \`paperlint init\` merges
into the consumer's \`.claude/settings.json\`, and it is the only source of that wiring.`,

    "Why there is no Claude Code plugin": prose`There is no Claude Code plugin or marketplace entry; it was removed in the release after 1.0.0
(#82). Do not bring it back without answering each of these, measured (${file("docs/install.md")},
"Why it is shaped this way"):

- **A plugin cannot carry the code.** Claude Code installs a plugin's dependencies with a 60-second
  timeout, and a failed install never blocks the plugin: the hooks load and fail with
  \`cannot find module vigiles\`, silently.
- **The skills need the npm package anyway.** 23 of 24 skills ran scripts that resolve only through
  \`node_modules/paperlint/\`.
- **Its manifests carried versions nothing updated**, and Claude Code decides plugin updates from
  that number.`,
  },
  rules: {},
});
