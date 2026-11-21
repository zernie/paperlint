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
  its exact terminal output is shown open under it. A command carries a caption and a Copy button.
- **Code is shown open.** Commands and terminal output are never folded (the author,
  2026-11-22). What folds is prose: a stop, a venue's limits, an answer, a term's meaning.
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
| `--color-stone`            | `#f2f1ec` | the ground of 01 Checks, of the footer, of terminal output   |
| `--color-sand-soft`        | `#f3ead9` | the ground of 03 Venues                                      |
| `--color-sand-edge`        | `#d6c19b` | a hairline or underline on soft sand                         |
| `--color-surface`          | `#ffffff` | a checkpoint's plate, a popover, the command box             |
| `--color-card`             | `#f2efe9` | a file's contents                                            |
| `--color-border`           | `#e4e1d8` | hairlines                                                    |
| `--color-ink`              | `#181816` | headings and the wordmark (`foreground`)                     |
| `--color-copy`             | `#45433e` | running text                                                 |
| `--color-muted-foreground` | `#5f5d58` | labels and quiet text                                        |
| `--color-faint`            | `#85827a` | a checkpoint that is not open (3.4:1 on stone, large type)   |
| `--color-ink-blue`         | `#305e8b` | the one accent (`primary`): the venue name, the open numeral |
| `--color-sage`             | `#56695c` | a fact's word in the hero (5.6:1 on paper)                   |
| `--color-sand-deep`        | `#8a6a36` | a fact's word in the hero (4.8:1 on paper)                   |
| `--color-signal`           | `#c15f3c` | terracotta, for an error only (`destructive`)                |
| `--color-error`            | `#a24a2b` | a finding's «Must fix»; «error» in terminal output (AA)      |
| `--color-warn`             | `#846419` | a finding's «Advice»; «warning» in terminal output (AA)      |

### Code

Commands and JSON are highlighted by Shiki at build time (`src/shared/lib/highlight`): the page
gets spans with these classes and no highlighter script. Arguments and JSON keys stay ink. Each
passes AA for `text-code` on white, stone and card; the lowest ratio is on card.

| token                    | value              | use                                                               | on card |
| ------------------------ | ------------------ | ----------------------------------------------------------------- | ------- |
| `--color-syntax-command` | `ink-blue` #305e8b | the program: `npx`, `/plugin`                                     | 5.90:1  |
| `--color-syntax-flag`    | `sage` #56695c     | an option: `--venue`                                              | 5.12:1  |
| `--color-syntax-string`  | `#7f6131`          | a quoted string, a JSON value, a `quoted` name in terminal output | 5.00:1  |
| `--color-syntax-comment` | `#5f5d58`          | a comment                                                         | 5.73:1  |

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

1. **Header.** The wordmark; Install, Venues and Integrations (from a tablet up); GitHub. The
   links are absolute (`/#install`), so the same header serves `/integrations`.
2. **Hero, on paper.** The cover line, «Writing a paper for _an IEEE conference_?», with the venue
   cycling through the README's table. The lead, whose first «paperlint» is the `Wordmark`
   (`src/shared/ui/wordmark.tsx`, the same component as the nav logo). Four facts. The campus
   etching as a plate, its edges masked into the paper, with no caption. There is no install
   block and there are no links.
3. **01 Checks, on stone.** On the left, an index of the four stops; on the right, the open stop's
   plate, a white sheet with a hairline edge. Only this section shows findings: stop 01 shows
   three real desk-reject reasons. On a phone each stop opens in place.
4. **02 Install, on paper.** Right after the road, where a reader who has seen what paperlint
   catches asks how to start. The heading and «In a terminal, in the folder that holds your
   papers» on the left; on the right the one install command, `npx paperlint init`
   (`src/shared/config/install.ts`), then «Then, for each paper» and the README's commands that
   create, build and check one, each with its caption and a Copy button. Last, one line: the
   optional Claude Code plugin, linked to `/integrations`.
5. **03 Venues, on soft sand.** The heading and a short note on the left, with the families in one
   line («And any ACM, IEEE or ACL conference, by its template»). On the right, the four fields of
   `docs/venues.md` two by two, each workshop under its conference. A name opens its format and
   page limits.
6. **04 Questions, on paper.** The heading on the left, the folded answers on the right.
7. **Footer, on stone.** The README's «Check the venue's own call before you submit», the links,
   «Made by zernie».

## `/integrations`

The one page that describes the Claude Code plugin (`site/CLAUDE.md`, "The Linter First"), on
paper, with the same header and footer. On the left the label, the headline «paperlint and Claude
Code.», then first «Optional. It stays off until you turn it on.» and a lead saying paperlint works
on its own. On the right four parts under hairlines, in this order: the linter is fixed rules; what
the plugin adds; what stays the same; how to turn it on, which leads with `npx paperlint init` and
its question, then «Or add it by hand, inside Claude Code» with the two Claude Code commands. Every
command has its caption and a Copy button. The copy states facts plainly: no «not X but Y», no
«if you do not…»; a negative stays only where it is itself the fact («sends nothing to an AI
model»).

## Patterns

- **Rubric.** «NN — Name» in `text-label` capitals, under a thin ink rule across the page, then
  the headline. No deck on the right.
- **Fact.** A short word in the serif at `text-title`, each in its own colour (ink-blue, sage, ink,
  sand-deep), over a muted sans label. No hairlines or boxes. Each fact is backed by a test
  (`src/pages/home/model/facts.test.ts`).
- **Finding.** «Must fix» or «Advice», a serif title, one plain sentence, then what the terminal
  says, open, in a soft stone panel in JetBrains Mono: the file and the line muted, «error» in
  `error` or «warning» in `warn`, the message, the rule id muted. The line wraps rather than
  scrolling sideways.

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
| terminal output folded under a link            | code is shown open (2026-11-22)                   |
| install as a question among the questions      | it is a section of its own (2026-11-22)           |
| decks on the right of each rubric              | repeated labels                                   |
| an eyebrow on the open plate                   | the same words were in the index beside it        |
| Newsreader at weight 300, tight, for the cover | hard to read at that size                         |
