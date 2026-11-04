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
the real items, one question per screen, each card's place ("G007 · 7 of 20"), the card just
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
  | `witness`  | one situation in code where two readings split      | `situation`, `example`, `details` (below)          |
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

## The witness card

A witness page asks about code, never about configs: one card per situation (one requirement ×
one reason its readings split), and one question, whose text each card replaces with its own
`situation.question`. A page with two questions is refused. Items made for the earlier card (only
`readings` and `file`) are refused, naming `situation`.

- **`situation`**: `{kind, summary, question}`. `kind` is `scope` (the readings check different
  files, named by the file category) or `construct` (they forbid different code, named by the
  construct); `summary` is one plain sentence.
- **`example`**: `{file, url, lines, message, caught_by}`. `lines` are `{n, text, mark}`, the
  caught line marked and 2 or 3 lines of context (`text` may be empty); at least one line is
  marked. `message` is the linter's own, shown under the code; `caught_by` (`a` or `b`) is shown
  only in the settings. `url` (optional) makes the file name a link.
- **`more_like_this`** (optional): `{count, files}`, shown as «N more like it», folded; `files`
  may list fewer than `count`.
- **`details`**: `{a, b}`, each a list of `{key, raw, plain, matches_example}`: one row per glob or
  option (`key` is `files`, `ignores`, `rule` or `option:<name>`), the raw value, its plain reading
  by a fixed template, and whether it matches the example file (`true`, `false`, or `null` when
  the row does not decide that). Folded under «Settings behind this card»; a row in both lists
  (same `key` and `raw`) is shown once as «A and B», after the differences.
- **`repeat`** (optional): `{group, index, of}`; «Card i of n for this requirement» when `of` is
  more than 1. `group` never reaches the page.
- **`rules[].explanation`**, required on every rule of a witness card and allowed on any card:
  `{source, what, why, example_bad, example_good, url}`, the rule as its own docs explain it.
  `source` is `ruff rule`, `eslint docs`, `plugin docs`, `config message` or `none`; `what` is
  required unless it is `none`, and `none` shows «No official explanation for this rule». A rule
  with an explanation is not looked up in the linter. Long text shows three lines and a «more».

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

## The export

`export` reads the store's three collections (`answers`, `groups`, `practice`) from `dump.json`, in
the shape the generator's header gives. It refuses, naming the path, any name the key does not know
or any document of the wrong type. An answer or familiarity value outside the offered options is not
counted: the item is marked incomplete and printed (same rule as on the page); correct it in the dump
and export again. It also prints every item that is missing an answer or a reason, and every group
with no familiarity answer. The practice of the current round is scored into its own file and never
into the labels.
