// A plain caption for each command the README shows, keyed by how the command starts. The commands
// themselves are read from README.md at build time; a command with no caption here fails the build,
// so the page never shows a bare command (site/CLAUDE.md, "Not Scary For Non Programmers"). Each
// caption is checked against README.md and docs/install.md.

export const captions: readonly (readonly [prefix: string, caption: string])[] =
  [
    [
      "npm i -D paperlint",
      "Adds paperlint to this folder. Nothing runs while it installs.",
    ],
    [
      "npx paperlint init",
      "Sets up the project: finds or asks where your papers live, then offers TeX Live and an automatic check on GitHub. It installs no software you did not say yes to.",
    ],
    [
      "npx paperlint build",
      "Turns paper.tex into paper.pdf, measures its pages and fonts, and checks each reference online. Needs TeX Live.",
    ],
    [
      "npx paperlint lint",
      "Checks the paper against its venue and lists each problem with what to do. Works offline. An error fails the check; a warning is advice.",
    ],
  ];

/** The command with its caption; throws for a command no caption starts. */
export const withCaption = (
  command: string,
): { readonly command: string; readonly caption: string } => {
  const found = captions.find(([prefix]) => command.startsWith(prefix));
  return found === undefined
    ? ((): never => {
        throw new Error(
          `site: no caption for «${command}» — add one to site/src/pages/home/model/captions.ts`,
        );
      })()
    : { command, caption: found[1] };
};
