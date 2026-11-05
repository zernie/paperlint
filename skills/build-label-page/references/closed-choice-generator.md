# The closed-choice generator

The page shape this generator builds: the labeller looks at one item and picks from a closed list of
answers, one question at a time, with an optional reason box and code blocks. For any other shape,
see "Which page you need" in `SKILL.md`: the agent writes that page itself.

The generator is `scripts/label-page.ts` in this skill, compiled beside itself to `label-page.js`.
It runs from the skill and is never copied into a study, so a fix to it reaches every page built
after the fix. The commands are in `SKILL.md` (procedure steps 3 and 8); its third subcommand,
`schema`, prints the declared schema of `items.json`. Its header holds the full `items.json`
example; this file says how to fill it.

It is two parts. The core, `label-page-core.ts`, has no page layout: the `items.json` schema and its
checks, the leak guard, the neutral ids, the key with its `allowed` and `needs_why` lists, the check
of the store's dump, and the export of labels and practice. The page, `label-page-html.ts`, fills the
one closed-choice template (`page-template.html`, its style and browser script kept as exact bytes)
with the core's payload. Another page shape would be another template on the same core.

## What it does by construction

Rules 2 to 5, 7 and the page half of 8 of [`checklist.md`](checklist.md): a filter instead of
scrolling, complete-item counting, neutral ids in a seeded order, the leak guard (an item field
outside the allow-list stops the build), save on click with a time, the store-unavailable banner,
the "How to answer" screen (folded into a toggle once the practice is done), the practice before
the real items, one question per screen, each card's place (`labels.place`, by default
"G007 · 7 of 20"), the card just
answered kept under "Next unanswered" until the next answer (so a mis-tap can be changed), and a
closing line once every item is complete. Its look:
one dark palette, one column, answer buttons as full-width rows with space between them, an optional
icon per answer and never a coloured side stripe, `backticks` and the `code` field shown as code,
code blocks that show leading and trailing whitespace (a space as ·, a tab as →) and each line's
length.

## items.json

- **`questions`**: each with a closed set of `options`. Every option has a `value`, a `label` and a
  required `example`: a real case of the study, in a line, that takes that answer. `icon` (an
  emoji) is optional. Two labels that read the same, or two equal values, stop the build.
- **`practice`**: 3 or more real cases whose answer you are sure of, each with `expected` (one answer
  per question) and a one-line `why`. Never an item that is also on the page to be labelled. A
  practice card carries the same fields as the real cards it rehearses (`rules`, `unit`,
  `readings`, `file`).
- **`practice_round`**: raise it after rewording a question; the practice reopens and the answers of
  the earlier round are kept but not counted.
- **`items`**: `source_id` (the study's own, never shown), `group`, `body`, and optionally `title`,
  `code`, `context`, `rules`, `unit`, `readings`, `file`. Nothing else: the allow-list is fixed in
  the generator, and a field outside it is taken out of the item, not added to the list to make a
  build pass.
- **`kind`** (required): what the page asks, and so which card fields every item and practice card
  must carry. A card without one fails the schema, naming the field and why the kind needs it:

  | kind       | the labeller decides                                 | required on every card                             |
  | ---------- | ---------------------------------------------------- | -------------------------------------------------- |
  | `approval` | keep or drop a drawn requirement                     | `unit` (the line, the requirement marked), `rules` |
  | `witness`  | why two readings of a requirement disagree on a file | `rules`, `readings`, `file`                        |
  | `labels`   | a gold label, a blind review                         | nothing beyond the item                            |

  Nothing reads `context`: it stays free text. A rule, a line or two readings written there show
  none of what their fields show, so on an `approval` or `witness` page they go in the fields.

- **`rules`**: `[{linter, id}]` (`linter` is `eslint` or `ruff`) on an item read as a linter rule.
  The card's "Rule" row shows "ruff `TID253` (flake8-tidy-imports): Checks for module-level
  imports that should instead be imported lazily…", taken at build time from the linter itself:
  `ruff rule <id>`'s "What it does" paragraph and family, or the ESLint rule's
  `meta.docs.description` from the ESLint and plugins installed where `items.json` is (a plugin
  rule's own name may hold a slash: `n/no-unsupported-features/node-builtins`). The build refuses a rule the linter cannot describe; a
  description is never typed into `items.json`.
- **`unit`**: `{id, text, mark, part, of}` on an item drawn from a source line: the whole line,
  the requirement's own words in it (`mark`, shown highlighted), and which requirement of the line
  it is ("TypeScript only (no JavaScript); top-level await is allowed" is two). The card's "Line"
  row shows the line with the mark, and "part 1 of 2" when the line holds several. A drawn sample
  may hold one part of a line and not the others; the build refuses a `mark` that is not in the
  line, and parts of one line that disagree (another text or `of`, a part repeated, split across
  groups), naming the item.
- **`readings`**: `{a, b}` on an item that compares two readings of one requirement: two rows,
  "Reading A" on a solid accent rule and "Reading B" on a dashed one, in the same place on every
  card. **`file`**: the witness file (a path, a link, what each reading did with it), on its own
  "File" row. `id` names one occurrence of the line (a file and line
  number, say) and is never shown: two files holding the same words are two lines, each judged in
  full. Splitting the line is the study's job, before the page.
- **`seed`**: fixes the order. Rebuilding with the same seed keeps every id, and a new item gets the
  next one; a different seed is refused once a key exists.
- **`ask_why`** on an option: a prompt. The page does not write that answer to the store until its
  reason box holds text: the card says «Not saved yet», and the store keeps what it had. The reason
  then saves with the answer as it is typed (after a pause, and when the page is left); a store echo
  while typing keeps the box and its focus. An answer stored without its reason (by an older page,
  or merged from chat) still counts as incomplete, on the page and in the export.

## Content blocks

Any card may carry these blocks, on any `kind`, and each one is optional. The page knows only the shape of each block. Every label and sentence on it comes from `items.json`, so a code review, a prose check or a configuration study each write their own words. A practice card carries the same blocks as the real cards it rehearses. `scripts/fixtures/blocks-items.json` is a whole page of them: a code review, with no preset.

```jsonc
{
  "situation": {
    "summary": "Reviewer A asked for a change at {line}; reviewer B approved it.",
    "question": "Does «Every query is parameterised» cover {line}?",
  },
  "excerpt": {
    "file": "app/report.py", // optional; with `url`, the name is a link
    "url": "https://example.com/app/report.py#L12", // optional
    "lines": [
      { "n": 11, "text": "def monthly(month):", "mark": false },
      {
        "n": 12,
        "text": "    rows = db.raw(\"SELECT … m=\" + month)",
        "mark": true,
      },
    ],
    "caption": "Reviewer A wrote: concatenated SQL.", // optional, under the code
    "mark_label": "◀ the line in question", // optional; default «◀ this line»
  },
  "references": {
    "summary": "What the guideline says", // the folded block's toggle
    "entries": [
      {
        "label": "Guideline", // optional row label
        "title": "Security guide `SQL-1`",
        "fields": [
          { "text": "Build every query with parameters." },
          { "label": "Why", "text": "Input becomes part of the query." }, // «Why: …»
          {
            "style": "note",
            "text": "The examples below are the guide's own.",
          },
          {
            "label": "Not like this",
            "style": "code",
            "text": "db.raw(\"… id=\" + id)",
          },
        ],
        "url": "https://example.com/guide#sql-1", // optional
        "url_label": "Security guide", // optional; the link text
      },
    ],
  },
  "more": {
    "summary": "3 more lines like this",
    "items": ["`app/export.py`", "`app/admin.py`"],
    "rest": "and 1 more", // optional, after the items
  },
  "table": {
    "summary": "What each reviewer wrote",
    "note": "Reviewer A asked for the change; reviewer B approved.", // optional
    "rows": [
      {
        "label": "A only · Comment",
        "value": "use parameters", // shown as code
        "plain": "asks for a parameterised query", // optional
        "mark": { "tone": "yes", "text": "✓ about this line" }, // optional; tone yes or no
      },
    ],
  },
  "repeat": { "group": "guide-sql", "index": 1, "of": 2 }, // `group` never reaches the page
}
```

- **Order on the card.** The card shows, in this order:
  1. its place (`labels.place`);
  2. the body, on a `labels.body` row when that label is set;
  3. the repeat sentence;
  4. the older fields (`code`, `unit`, `rules`, `readings`, `file`, `context`);
  5. the situation's summary;
  6. the excerpt;
  7. **the question and its answers**;
  8. `references`, `more` and `table`, each folded and closed.

  The question therefore sits right under the code it names.

- **`situation`**: `{summary, question}`.
  - `summary` is one sentence above the excerpt.
  - `question` replaces the text of the page's first question on this card. Other questions keep their own text.
  - In either text, `{line}` stands for the excerpt's first marked line. The page writes «line N: », then the line's code as code, without its indent. A code line holding a backtick reads as it is.
  - `{line}` on a card without an `excerpt` is refused by path.
- **`excerpt`**: at least one line is marked (`mark: true`). The marked line gets a `▶` in the gutter and `mark_label` after its code, and keeps its background, so it reads as marked even without its colour. A line's `text` may be empty, for a blank line.
- **`references.entries[].fields`**:
  - A field without `style` is a paragraph («label: text» when it has a label). A long one shows three lines and a «more».
  - `style: "code"` is a code block on a `label` row.
  - `style: "note"` is a quiet line.
- **`table.rows`**: shown in the order given. Each row shows its `label`, then `value` as code, `plain` under it, and `mark` last.
- **`repeat`**: shows the sentence `labels.repeat` when `of` is more than 1. `index` must lie between 1 and `of`.
- **`labels`** sits at page level, and every key in it is optional:

  | key                | what it is                                                      | default                        |
  | ------------------ | --------------------------------------------------------------- | ------------------------------ |
  | `place`            | the card's place                                                | `{id} · {n} of {total}`        |
  | `body`             | a row label for the body                                        | none                           |
  | `line`             | the label of the `unit` row                                     | `Line`                         |
  | `line_part`        | the `unit` row's label when the line holds several requirements | `{line} · part {part} of {of}` |
  | `repeat`           | the repeat sentence                                             | `Card {index} of {of}`         |
  | `practice_example` | text before each answer's example on a practice button          | empty                          |

- The leak guard reads every string these blocks render, one string at a time.

### Presets: named words for a narrow use

A preset is opt-in. An items file names it with `"preset": "<name>"`. The preset maps its own compact card fields onto the blocks above and supplies `labels`. The file's own `labels` override the preset's. The page and the core know nothing of any preset: each one lives in `scripts/label-page-presets.ts`.

- **`linter-config-witness`** is narrow: two linter configs of one requirement disagree on a line of code. The blocks underneath are generic.
  - **Input fields on a card:**
    - `example: {file, url?, lines, message, caught_by}`, which becomes the excerpt, with the caption «The linter says: …».
    - `rules: [{linter, id, explanation}]`, whose explanation has `source` (`ruff rule`, `eslint docs`, `plugin docs`, `config message` or `none`), plus `what`, `why`, `example_bad`, `example_good` and `url`. These become the references, folded under «What the linter rule does (official docs)».
    - `more_like_this: {count, files}`, which becomes the list «N more file(s) with the same situation».
    - `details: {a, b}`: rows of `{key, raw, plain, matches_example}`. They become the table «Settings behind this card», with «A only / B only / A and B» rows.
  - **Its labels**: «Card {n} of {total}», «Requirement», «Card {index} of {of} for this requirement», and «Example of this answer, about other code: ».
  - `scripts/fixtures/linter-config-witness-items.json` is a whole page of it.

## The approval page

The page on which the author checks a drawn sample before the runs (the plan's `author_check`: "is
this what you meet in practice?") is this generator's shape: one question whose answers are keep and
drop, the drop carrying `ask_why`.

```json
{
  "id": "keep",
  "text": "Is this what you meet in practice?",
  "short": "keep?",
  "options": [
    {
      "value": "keep",
      "label": "Keep",
      "icon": "👍",
      "example": "`Use 2-space indent.`"
    },
    {
      "value": "drop",
      "label": "Drop",
      "icon": "🗑️",
      "example": "`Be nice to reviewers.`",
      "ask_why": "Why drop it? (not a rule, a process rule, a misreading…)"
    }
  ]
}
```

The page sets `"kind": "approval"`, so every card carries its `unit` and `rules`, and leaves
`familiarity` out: the author is judging drawn units, not repositories they have
seen, so no per-group "how well do you know it" question is asked. Only a page that sets
`"familiarity": true` asks it (and a `familiarity_question` without it is refused).

The items are the drawn units verbatim, in a language the author reads. Units in other languages
are taken out before the draw, as a population rule the study's `plan.json` states ("English-language
units only") with the number excluded reported in the paper; a unit dropped at approval because the
author cannot read it is an exclusion made after the draw and goes unrecorded. The practice is three
units whose fate is obvious. Each dropped unit carries its reason in the labels file. The author's words, with the date, then go into
`author_check` of the plan; a dropped unit is replaced by the next one in the draw.

## Two answerers, and a minimum time on screen

Both keys are optional and top-level. Left out, the page, its store documents and the export are
exactly as above.

- **`answerers`**: two or more names (letters, digits, `-` and `_`), for a study where two people
  answer the same published page, each under their own name and without seeing the other's
  answers. The page first asks "Who is answering?"; the choice is kept in the browser's
  localStorage when it has one (otherwise it asks again on every visit), and "Switch" beside
  "Answering as …" asks again. Every document the page writes is named `<answerer>~<id>`
  (`second~G004`, `second~r1-P2`, `second~python`): `~` is outside the name pattern, so no answerer,
  item, group or practice id can hold it. The page reads only the current answerer's documents, so
  their progress, done-state and practice are their own. An item may carry its own `answerers`, a
  subset of the page's: it is shown only to those. A name an item lists that the page does not, a
  name twice, or an item's list on a page without one stops the build.
- **`min_seconds`**: an item's answer saves only after its card has been on screen that long. The
  cards are a list, so "on screen" is measured by an `IntersectionObserver`: half the card in view,
  or half the viewport filled by a card taller than that, while the tab is visible. A locked card
  shows "You can answer in N s" under its disabled buttons. The answer document gains `seconds`:
  how long the card had been on screen at its first save, kept on every later save. The practice
  cards are not held.

`key.json` carries `answerers`, each item's own subset (`ids.<id>.answerers`, only where it has one)
and `min_seconds`. With `answerers`, `export` refuses a document id without `<answerer>~`, an
answerer the key does not list, and an answer to an item not shown to its answerer, as it refuses
an unknown item. The labels file keeps each answerer's answers apart:

```text
{ "answerers": ["author", "second"],
  "items": [{ "id": "G001", "source_id": "case-1000", "group": "python",
              "answerers": ["author", "second"],
              "by_answerer": { "author": { "answers": { "label": "yes" }, "complete": true,
                                           "seconds": 41, "…": "the fields of an item above" },
                               "second": { "…": "…" } } }],
  "by_answerer": { "author": { "groups": {}, "complete_items": 1, "total_items": 1, "…": "…" },
                   "second": { "…": "…" } } }
```

An answerer with no document for an item is still listed, with every answer `null`. Each
answerer's practice is scored into its own file, `<study>-practice-r<round>-<answerer>-<date>.json`.
`seconds` appears only when the page was built with `min_seconds`.

## The export

`export` reads the store's three collections (`answers`, `groups`, `practice`) from `dump.json`, in
the shape the generator's header gives. It refuses, naming the path, any name the key does not know
or any document of the wrong type. An answer or familiarity value outside the offered options is not
counted: the item is marked incomplete and printed (same rule as on the page); correct it in the dump
and export again. It also prints every item that is missing an answer or a reason, and every group
with no familiarity answer. The practice of the current round is scored into its own file and never
into the labels.
