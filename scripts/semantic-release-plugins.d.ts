// The two semantic-release plugins ship no types. Only what scripts/release-config.test.ts calls
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
