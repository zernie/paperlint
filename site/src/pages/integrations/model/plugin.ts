// The two commands that add paperlint's Claude Code plugin from inside Claude Code. The marketplace is
// the repository itself (`.claude-plugin/marketplace.json`), and both the marketplace and its one
// plugin carry the package's name, so the commands are built from the repository's URL and the
// package's `name`, read at build time. The syntax is Claude Code's: `/plugin marketplace add
// owner/repo`, then `/plugin install <plugin>@<marketplace>`.

export interface PluginStep {
  readonly command: string;
  readonly caption: string;
}

/** `https://github.com/owner/repo` → `owner/repo`; throws on any other address. */
export const githubSlug = (url: string): string => {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter((p) => p !== "");
  return u.hostname === "github.com" && parts.length === 2
    ? parts.join("/")
    : ((): never => {
        throw new Error(`site: not a GitHub repository address — «${url}»`);
      })();
};

/** The commands, typed inside Claude Code, that add the marketplace and install the plugin from it. */
export const pluginSteps = (
  repository: string,
  name: string,
): readonly PluginStep[] => [
  {
    command: `/plugin marketplace add ${githubSlug(repository)}`,
    caption:
      "Tells Claude Code where paperlint's plugin is published: this repository on GitHub. Type it inside Claude Code, not in a terminal.",
  },
  {
    command: `/plugin install ${name}@${name}`,
    caption: "Installs the plugin, its skills and its hooks.",
  },
];
