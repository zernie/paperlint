// The three semantic-release plugins ship no types. Only what scripts/release-config.test.ts calls
// is declared: the plugin step functions, taking the plugin's options and semantic-release's
// context, as their READMEs document them.
declare module "@semantic-release/commit-analyzer" {
  export function analyzeCommits(
    pluginConfig: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<"major" | "minor" | "patch" | null>;
}

declare module "@semantic-release/release-notes-generator" {
  export function generateNotes(
    pluginConfig: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<string>;
}

declare module "@semantic-release/exec" {
  export function analyzeCommits(
    pluginConfig: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<string | undefined>;
}

// semantic-release's own step definitions: how it merges what several analyzers return.
declare module "semantic-release/lib/definitions/plugins.js" {
  const definitions: {
    readonly analyzeCommits: {
      readonly postprocess: (
        results: readonly (string | undefined | null)[],
      ) => string | undefined;
    };
  };
  export default definitions;
}
