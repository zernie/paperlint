// Compiled to site/CLAUDE.md by `npx vigiles compile`. Edit THIS file, never the markdown.
import { file, guidance, instructionFile, prose } from "vigiles/spec";

export default instructionFile({
  sections: {
    "`site/`": prose`paperlint.dev: a static Next.js export (${file("site/next.config.ts")}) with its own
${file("site/package.json")} and lock, so the npm package carries none of it. ${file("site/src/shared/lib/readme/content.ts")} reads
the install commands, the lint output, the venue table and the disclaimer from the README at build time, and
throws when one is gone, so the build fails instead of the page losing a section; it reads the folder
tree from ${file("docs/layout.md")} the same way, and ${file("site/src/shared/lib/readme/venues.ts")} groups the shipped venues by field
from ${file("docs/venues.md")}. ${file("site/src/entities/finding/model/findings.ts")} quotes each finding the
journey shows from the file that holds it, and ${file("site/src/entities/finding/model/findings.test.ts")} fails when a quote is no
longer there. Code lives in \`site/src/\` in Feature-Sliced Design layers, checked by Steiger (${file("site/steiger.config.mjs")});
Next's routes stay in \`site/app/\`. A class name uses only the design tokens of ${file("site/src/app/styles/globals.css")}
(Tailwind v4, its palette cleared), which ${file("site/eslint.config.mjs")} enforces. Build it with \`npm run site:build\`
from the root, which runs site/'s lint, type check and tests first; deploying is in ${file("docs/website.md")}. The
design system and the decisions behind it: ${file("site/DESIGN.md")}; read it before changing how the page looks. The rules
below were decided with the author on 2026-11-19, over eight rounds of screenshots.`,
  },
  rules: {
    "no-ai-slop": guidance(
      "The page must read as a dependable tool to a working scientist, never as AI marketing. No sparkles, glow, decorative gradients, stock icons or emoji; no 'AI-powered', 'magic' or 'effortless'. Every block shows something real: a command, a real finding, a real file. Many researchers distrust AI tools, and one slop signal costs the reader's trust in the linter.",
    ),
    "the-linter-only": guidance(
      "The site sells the linter and the paper folder. The Claude Code skills, the hooks and anything agent-shaped are not mentioned on it, nor linked from it, until the author decides otherwise.",
    ),
    "modern-not-2010": guidance(
      "Editorial, in the manner of a design magazine (Kinfolk and Cereal for the air, Monocle for the structure), never a scientific journal: a large serif headline, warm paper, generous margins, the etching set like a plate. A 12-column grid, max width about 1200 px, every gap a multiple of 8 px, text left-aligned; sections are set apart by their grounds, thin rules and space, not by cards with drop shadows. The author rejected the earlier versions as looking like 2010 and then 2015 (2026-11-19). A change that shrinks the type, crowds the page or brings shadows back needs a screenshot and the author's yes. The details: `site/DESIGN.md`.",
    ),
    "type-and-colour": guidance(
      "Colours, grounds, type and sizes are the named tokens of `globals.css`, listed with their use in `site/DESIGN.md`. Terracotta is for an error only. Grounds stay soft, never a dark band ('terrifying'; 'I like zen', 2026-11-19). Newsreader for headings, Inter for body text and UI, JetBrains Mono for code, through next/font; the author chose Newsreader from a side-by-side sheet on 2026-11-19, and a font change is shown side by side first.",
    ),
    "the-journey": guidance(
      "The four checks are four stops on one road, each with its own real example: desk-reject checks, folder structure, measurements, prose, in that order (the default set first, the opt-in last). From a tablet up, an index of the four stops on the left and the open stop's plate on the right; on a phone each stop opens in place. One stop is open at a time, and they are never collapsed into one plain list. Findings appear only here. The author chose this index on 2026-11-19, on the quiet stone ground; what was rejected is in `site/DESIGN.md`.",
    ),
    "a-short-page": guidance(
      "The page is about four screens on a desktop: hero, the road, the venues, the questions, the footer. Everything past the first look is folded: a stop's panel, the exact terminal output, a venue's limits, each question's answer, a term's meaning (dotted underline, opens on hover or tap). The author asked for this on 2026-11-19, when the page measured 11 screens; a section that adds a screen needs a screenshot and the author's yes.",
    ),
    "subtract-first": guidance(
      "Every element earns its place: nothing is added that the reader did not need, such as a strip, an extra link or a repeated label. A change subtracts first and adds only what is missing. The author asked for this on 2026-11-19, after a masthead strip, two hero links and an install block crowded the hero and the hero repeated the first checkpoint's findings.",
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
    "not-scary-for-non-programmers": guidance(
      "Many readers are scientists who do not program. Every command and every piece of terminal output comes after plain words: a finding is first a card that says what is wrong with the paper and what to do ('Seven pages of body; AIDC short papers allow six'), and the exact output is folded underneath; a command carries a one-line caption of what it does and a Copy button. A block of code with no plain sentence before it is a defect. The author asked for this on 2026-11-19.",
    ),
    "say-latex-and-peer-review": guidance(
      "The page says, in so many words, that paperlint is for papers written in LaTeX and that it checks them before submission to peer review. A reader who skims the hero must not have to guess either.",
    ),
    "feature-sliced-design": guidance(
      "Code under `site/src/` follows Feature-Sliced Design (layers app, pages, widgets, features, entities, shared; a slice is imported only through its public index), and Steiger checks it in `npm run lint`. Next's router in `site/app/` only re-exports from `src/`.",
    ),
    "tokens-not-numbers": guidance(
      "A class name carries a design token, never a raw value: no `w-[13px]`, no `bg-[#fff]`, no default-palette colour such as `bg-red-500` (the theme clears it). A size, colour or font the page needs is added to the `@theme` once, with a name. eslint-plugin-tailwindcss (`no-arbitrary-value`, `no-custom-classname`) fails the lint otherwise.",
    ),
    "no-new-wheels": guidance(
      "Use the chosen libraries before writing a helper: shadcn/ui for components, usehooks-ts for hooks (clipboard, interval, media query), Remeda for collections, ts-essentials for types, motion for animation. A helper of our own needs a sentence saying which of these could not do it.",
    ),
    "tasteful-motion": guidance(
      "Animation is quiet and short: elements fade and rise into place as they scroll in, the venue name changes, a checkpoint's plate fades in. Nothing loops for attention, nothing bounces, and everything stops for a reader who asks for reduced motion.",
    ),
    "production-from-main-previews-on-request": guidance(
      "A push to `main` deploys production, and nothing else deploys on its own: `site/vercel.json` turns Git deployments off for every branch (`**`, since `*` does not match a `/`) and on for `main`, so a pull request gets no preview. A preview happens only when the author asks for it, by the CLI or the Vercel API (`docs/website.md`). The author decided this on 2026-11-19.",
    ),
    "static-and-private": guidance(
      "A static export: no server, no analytics, no cookies, no request to a third party when the page is opened. `.dev` is HSTS-preloaded, so the domain serves HTTPS from its first deploy.",
    ),
  },
});
