// Compiled to site/CLAUDE.md by `npx vigiles compile`. Edit THIS file, never the markdown.
import { file, guidance, instructionFile, prose } from "vigiles/spec";

export default instructionFile({
  sections: {
    "`site/`": prose`paperlint.dev: a static Next.js export (${file("site/next.config.ts")}) with its own
${file("site/package.json")} and lock, so the npm package carries none of it. ${file("site/src/shared/lib/readme/content.ts")} reads
the install commands, the lint output, the venue table and the disclaimer from the README at build time, and
throws when one is gone, so the build fails instead of the page losing a section; it reads the folder
tree from ${file("docs/layout.md")} the same way. ${file("site/src/entities/finding/model/findings.ts")} quotes each finding the
journey shows from the file that holds it, and ${file("site/src/entities/finding/model/findings.test.ts")} fails when a quote is no
longer there. Code lives in \`site/src/\` in Feature-Sliced Design layers, checked by Steiger (${file("site/steiger.config.mjs")});
Next's routes stay in \`site/app/\`. A class name uses only the design tokens of ${file("site/src/app/styles/globals.css")}
(Tailwind v4, its palette cleared), which ${file("site/eslint.config.mjs")} enforces. Build it with \`npm run site:build\`
from the root, which runs site/'s lint, type check and tests first; deploying is in ${file("docs/website.md")}. The
design below was decided with the author on 2026-11-19, over three rounds of mockups.`,
  },
  rules: {
    "no-ai-slop": guidance(
      "The page must read as a dependable tool to a working scientist, never as AI marketing. No sparkles, glow, decorative gradients, stock icons or emoji; no 'AI-powered', 'magic' or 'effortless'. Every block shows something real: a command, a real finding, a real file. Many researchers distrust AI tools, and one slop signal costs the reader's trust in the linter.",
    ),
    "the-linter-only": guidance(
      "The site sells the linter and the paper folder. The Claude Code skills, the hooks and anything agent-shaped are not mentioned on it, nor linked from it, until the author decides otherwise.",
    ),
    "modern-not-2010": guidance(
      "Large display type (the headline 110–130 px on desktop), generous space, a real product shot (the lint output) under the hero, cards with soft depth. The author rejected two small-type, narrow-column versions as looking like 2010; a change that shrinks the type or crowds the page needs a screenshot and the author's yes.",
    ),
    "type-and-colour": guidance(
      "Palette and type follow zernie.com: paper #faf9f5, ink #181816, the ink-blue accent #305e8b; terracotta #c15f3c only for an error. Instrument Serif for headings, Inter for text, JetBrains Mono for code, all through next/font, which downloads them at build time and serves them from this site. Fonts matter to the author: a font change is shown side by side first.",
    ),
    "the-journey": guidance(
      "The four checks are four stops on one road, each its own section with its own real example: desk-reject checks, folder structure, measurements, prose, in that order (the default set first, the opt-in last). They are never collapsed back into one list.",
    ),
    "campus-not-a-landmark": guidance(
      "The hero art is an invented campus in the Stanford style (sandstone arcades, red tile roofs, palms), as an ink etching with a light wash. Never a real, recognisable building such as Hoover Tower or Memorial Church: a scientist who knows it reads an affiliation paperlint does not have. An image model draws them unasked; look before using any output.",
    ),
    "no-promise-beyond-the-readme": guidance(
      "The promise is that paperlint catches what gets a paper desk-rejected, before you submit. Never 'no desk reject', 'guaranteed' or 'compliant': the README calls paperlint an aid, not a guarantee, and the page shows that sentence, read from the README.",
    ),
    "only-what-ships": guidance(
      "A venue, finding, count or command on the page is read from the repository at build time or quoted with a test behind it. The prose around them is written by hand, and each sentence is checked against the rule's docs page in the same pass that writes it. The headline cycles only the venues of the README's table. A claim the code does not back (for instance findings inside an editor: `paperlint lint` builds its own ESLint config, so an editor shows none) stays off the page until it is measured.",
    ),
    "static-and-private": guidance(
      "A static export: no server, no analytics, no cookies, no request to a third party when the page is opened. `.dev` is HSTS-preloaded, so the domain serves HTTPS from its first deploy.",
    ),
  },
});
