/**
 * The one command that installs paperlint, with its caption: `init` adds paperlint to the project and
 * sets up the paper folder. The home page's Install section and /integrations both show it;
 * src/pages/home/model/captions.test.ts checks that the README's install block runs it.
 */
export const INIT = {
  command: "npx paperlint init",
  caption:
    "Adds paperlint to this project and sets up the paper folder: it finds or asks where your papers live, then offers TeX Live and an automatic check on GitHub. It installs only what you say yes to.",
} as const;
