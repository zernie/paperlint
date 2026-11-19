<!-- vigiles:sha256:c5fb580ba632309c compiled from site/CLAUDE.md.spec.ts -->

# CLAUDE.md

## `site/`

paperlint.dev: a static Next.js export (`site/next.config.ts`) with its own
`site/package.json` and lock, so the npm package carries none of it. `site/lib/content.ts` reads
the install commands, the lint output, the venue table and the disclaimer from the README at build time, and
throws when one is gone, so the build fails instead of the page losing a section; it reads the folder
tree from `docs/layout.md` the same way. `site/lib/findings.ts` quotes each finding the
journey shows from the file that holds it, and `site/lib/content.test.ts` fails when a quote is no
longer there. Build it with `npm run site:build` from the root; deploying is in `docs/website.md`. The
design below was decided with the author on 2026-11-19, over three rounds of mockups.

## Rules

### No Ai Slop

**Guidance only** — The page must read as a dependable tool to a working scientist, never as AI marketing. No sparkles, glow, decorative gradients, stock icons or emoji; no 'AI-powered', 'magic' or 'effortless'. Every block shows something real: a command, a real finding, a real file. Many researchers distrust AI tools, and one slop signal costs the reader's trust in the linter.

### The Linter Only

**Guidance only** — The site sells the linter and the paper folder. The Claude Code skills, the hooks and anything agent-shaped are not mentioned on it, nor linked from it, until the author decides otherwise.

### Modern Not 2010

**Guidance only** — Large display type (the headline 110–130 px on desktop), generous space, a real product shot (the lint output) under the hero, cards with soft depth. The author rejected two small-type, narrow-column versions as looking like 2010; a change that shrinks the type or crowds the page needs a screenshot and the author's yes.

### Type And Colour

**Guidance only** — Palette and type follow zernie.com: paper #faf9f5, ink #181816, the ink-blue accent #305e8b; terracotta #c15f3c only for an error. Instrument Serif for headings, Inter for text, JetBrains Mono for code, all through next/font, which downloads them at build time and serves them from this site. Fonts matter to the author: a font change is shown side by side first.

### The Journey

**Guidance only** — The four checks are four stops on one road, each its own section with its own real example: desk-reject checks, folder structure, measurements, prose, in that order (the default set first, the opt-in last). They are never collapsed back into one list.

### Campus Not A Landmark

**Guidance only** — The hero art is an invented campus in the Stanford style (sandstone arcades, red tile roofs, palms), as an ink etching with a light wash. Never a real, recognisable building such as Hoover Tower or Memorial Church: a scientist who knows it reads an affiliation paperlint does not have. An image model draws them unasked; look before using any output.

### No Promise Beyond The Readme

**Guidance only** — The promise is that paperlint catches what gets a paper desk-rejected, before you submit. Never 'no desk reject', 'guaranteed' or 'compliant': the README calls paperlint an aid, not a guarantee, and the page shows that sentence, read from the README.

### Only What Ships

**Guidance only** — A venue, finding, count or command on the page is read from the repository at build time or quoted with a test behind it. The prose around them is written by hand, and each sentence is checked against the rule's docs page in the same pass that writes it. The headline cycles only the venues of the README's table. A claim the code does not back (for instance findings inside an editor: `paperlint lint` builds its own ESLint config, so an editor shows none) stays off the page until it is measured.

### Not Scary For Non Programmers

**Guidance only** — Many readers are scientists who do not program. Every command and every piece of terminal output comes after plain words: a finding is first a card that says what is wrong with the paper and what to do ('Seven pages of body; AIDC short papers allow six'), and the exact output is folded underneath; a command carries a one-line caption of what it does and a Copy button. A block of code with no plain sentence before it is a defect. The author asked for this on 2026-11-19.

### Say Latex And Peer Review

**Guidance only** — The page says, in so many words, that paperlint is for papers written in LaTeX and that it checks them before submission to peer review. A reader who skims the hero must not have to guess either.

### Feature Sliced Design

**Guidance only** — Code under `site/src/` follows Feature-Sliced Design (layers app, pages, widgets, features, entities, shared; a slice is imported only through its public index), and Steiger checks it in `npm run lint`. Next's router in `site/app/` only re-exports from `src/`.

### Tokens Not Numbers

**Guidance only** — A class name carries a design token, never a raw value: no `w-[13px]`, no `bg-[#fff]`, no default-palette colour such as `bg-red-500` (the theme clears it). A size, colour or font the page needs is added to the `@theme` once, with a name. eslint-plugin-tailwindcss (`no-arbitrary-value`, `no-custom-classname`) fails the lint otherwise.

### No New Wheels

**Guidance only** — Use the chosen libraries before writing a helper: shadcn/ui for components, usehooks-ts for hooks (clipboard, interval, media query), Remeda for collections, ts-essentials for types, motion for animation. A helper of our own needs a sentence saying which of these could not do it.

### Tasteful Motion

**Guidance only** — Animation is quiet and short: elements fade and rise into place as they scroll in, the venue name changes, the road draws itself. Nothing loops for attention, nothing bounces, and everything stops for a reader who asks for reduced motion.

### Static And Private

**Guidance only** — A static export: no server, no analytics, no cookies, no request to a third party when the page is opened. `.dev` is HSTS-preloaded, so the domain serves HTTPS from its first deploy.
