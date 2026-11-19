# paperlint.dev design

The design system of paperlint.dev and the decisions behind it, as the author made them with
screenshots on 2026-11-19. `site/CLAUDE.md` holds the rules in short; this page holds the detail.
Every token below is copied from `src/app/styles/globals.css`, and the page may use no other value.

## Principles

- **Calm.** The author calls it "zen". Grounds stay soft, and nothing is set on a dark band. A
  near-black checkpoints section was rejected: "the black section looks terrifying" ... "I like zen".
- **Subtract first.** Every element earns its place. Nothing goes in that the reader did not need:
  no strip, no extra link, no repeated label. A change removes before it adds.
- **A magazine, not a scientific journal.** The air of Kinfolk and Cereal, with Monocle's
  structure (numbered rubrics, thin rules, a column grid). The look of Nature, Science or a LaTeX
  paper was rejected.
- **Not scary for non-programmers.** Plain words come first. A finding is a title and a sentence;
  its exact terminal output is folded under it. A command carries a caption and a Copy button.
- **Only what ships.** A count, venue, finding or command is read from the repository at build
  time or quoted with a test behind it. Prose around it is written by hand and checked against
  the docs.

## Tokens

A class name uses these tokens only: no `w-[13px]`, no `bg-[#fff]`, no Tailwind palette colour.
eslint-plugin-tailwindcss fails the lint otherwise. A new value is added to the `@theme` once,
with a name that says what it is for.

### Colour and grounds

| token                      | value     | use                                                          |
| -------------------------- | --------- | ------------------------------------------------------------ |
| `--color-paper`            | `#faf9f5` | the page; the hero and the questions                         |
| `--color-stone`            | `#f2f1ec` | the ground of 01 Checks and of the footer                    |
| `--color-sand-soft`        | `#f3ead9` | the ground of 02 Venues                                      |
| `--color-sand-edge`        | `#d6c19b` | a hairline or underline on soft sand                         |
| `--color-surface`          | `#ffffff` | a checkpoint's plate, a popover, the command box             |
| `--color-card`             | `#f2efe9` | a file's contents, the folded terminal line                  |
| `--color-border`           | `#e4e1d8` | hairlines                                                    |
| `--color-ink`              | `#181816` | headings and the wordmark (`foreground`)                     |
| `--color-copy`             | `#45433e` | running text                                                 |
| `--color-muted-foreground` | `#5f5d58` | labels and quiet text                                        |
| `--color-faint`            | `#85827a` | a checkpoint that is not open (3.4:1 on stone, large type)   |
| `--color-ink-blue`         | `#305e8b` | the one accent (`primary`): the venue name, the open numeral |
| `--color-sage`             | `#56695c` | a fact's word in the hero (5.6:1 on paper)                   |
| `--color-sand-deep`        | `#8a6a36` | a fact's word in the hero (4.8:1 on paper)                   |
| `--color-signal`           | `#c15f3c` | terracotta, for an error only (`destructive`)                |
| `--color-error`            | `#a24a2b` | a finding's «Must fix»                                       |
| `--color-warn`             | `#8a6a1c` | a finding's «Advice»                                         |

### Type

Through next/font, served from the site: Newsreader (`--font-display`) for headings, Inter
(`--font-sans`) for body text and UI, JetBrains Mono (`--font-mono`) for code. A font change is
shown side by side first.

| token                 | size                                | use                                                    |
| --------------------- | ----------------------------------- | ------------------------------------------------------ |
| `--text-cover`        | `clamp(3.5rem, 6.5vw, 5.5rem)`      | the hero's cover line: weight 400, letter-spacing 0    |
| `--text-display`      | `clamp(2.5rem, 4.75vw, 4rem)`       | a section's headline, at `--font-weight-quiet`         |
| `--text-numeral`      | `clamp(3rem, 5vw, 4.5rem)`          | a checkpoint's numeral in the index                    |
| `--text-title`        | `clamp(2rem, 3vw, 2.5rem)`          | a plate's title, a fact's word, a stop's name          |
| `--text-subtitle`     | `1.5rem`                            | a finding's or a question's title; the lead's wordmark |
| `--text-lead`         | `clamp(1.125rem, 1.6vw, 1.3125rem)` | the hero's lead                                        |
| `--text-body`         | `1.0625rem`                         | running text                                           |
| `--text-label`        | `0.75rem`, letter-spacing `0.16em`  | rubrics and labels, set uppercase                      |
| `--text-code`         | `0.875rem`                          | commands and terminal output                           |
| `--font-weight-quiet` | `300`                               | section headlines and the index; never the cover line  |

### Space and size

Every gap is a multiple of 8 px (Tailwind's 2, 4, 6, 8, 12, 16 …).

| token                 | value    | use                                                   |
| --------------------- | -------- | ----------------------------------------------------- |
| `--spacing-band`      | `6rem`   | a section's top and bottom inside its ground          |
| `--container-page`    | `75rem`  | the content width                                     |
| `--container-prose`   | `40rem`  | a paragraph                                           |
| `--container-measure` | `28rem`  | the short measure of a lead or a note                 |
| `--container-cover`   | `56rem`  | the cover line, so it breaks after "for"              |
| `--container-wide`    | `84rem`  | the hero's plate, wider than the text                 |
| `--aspect-plate`      | `14 / 5` | the plate's crop, to the arcades                      |
| `--plate-fade`        | `12%`    | how far the plate fades into the paper (`mask-plate`) |

## Page anatomy

1. **Header.** The wordmark and three anchors; GitHub.
2. **Hero, on paper.** The cover line, «Writing a paper for _an IEEE conference_?», with the venue
   cycling through the README's table. The lead, whose first «paperlint» is the `Wordmark`
   (`src/shared/ui/wordmark.tsx`, the same component as the nav logo). Four facts. The campus
   etching as a plate, its edges masked into the paper, with no caption. There is no install
   block and there are no links.
3. **01 Checks, on stone.** On the left, an index of the four stops; on the right, the open stop's
   plate, a white sheet with a hairline edge. Only this section shows findings: stop 01 shows
   three real desk-reject reasons. On a phone each stop opens in place.
4. **02 Venues, on soft sand.** The heading and a short note on the left, with the families in one
   line («And any ACM, IEEE or ACL conference, by its template»). On the right, the four fields of
   `docs/venues.md` two by two, each workshop under its conference. A name opens its format and
   page limits.
5. **03 Questions, on paper.** The heading on the left, the folded answers on the right. The
   install commands live in "How do I start?", read from the README, each with its caption.
6. **Footer, on stone.** The README's «An aid, not a guarantee», the links, «Made by zernie».

## Patterns

- **Rubric.** «NN — Name» in `text-label` capitals, under a thin ink rule across the page, then
  the headline. No deck on the right.
- **Fact.** A short word in the serif at `text-title`, each in its own colour (ink-blue, sage, ink,
  sand-deep), over a muted sans label. No hairlines or boxes. Each fact is backed by a test
  (`src/pages/home/model/facts.test.ts`).
- **Finding.** «Must fix» or «Advice», a serif title, one plain sentence, then «Show what the
  terminal says», which unfolds the exact line. The rule id appears once: in the terminal line
  when the line carries it, otherwise on its own line under it.

## Motion

Quiet and short. A section fades and rises into place as it scrolls in. The cover line's venue
changes in place. An open plate fades in. A reader who asks for reduced motion gets none of it:
the venue stays on its first name.

## Rejected, and why

| what                                           | why                                               |
| ---------------------------------------------- | ------------------------------------------------- |
| numbered circles on a thin line                | "looks very cheap, like a typical Tilda template" |
| the checkpoints index on a near-black band     | "the black section looks terrifying"              |
| the shelf of book spines                       | the author chose the index                        |
| a masthead strip under the nav                 | it crowded the hero (Subtract First)              |
| links in the hero                              | a reader scrolls anyway                           |
| the install command in the hero                | "who's going to install without checking first?"  |
| findings in the hero                           | they repeated checkpoint 01                       |
| a caption under the etching                    | it said what the page should not say              |
| decks on the right of each rubric              | repeated labels                                   |
| an eyebrow on the open plate                   | the same words were in the index beside it        |
| Newsreader at weight 300, tight, for the cover | hard to read at that size                         |
