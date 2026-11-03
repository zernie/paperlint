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
the "How to answer" screen, the practice before the real items, one question per screen. Its look:
one dark palette, one column, answer buttons as full-width rows with space between them, an optional
icon per answer and never a coloured side stripe, `backticks` and the `code` field shown as code,
code blocks that show leading and trailing whitespace (a space as ·, a tab as →) and each line's
length.

## items.json

- **`questions`**: each with a closed set of `options`. Every option has a `value`, a `label` and a
  required `example`: a real case of the study, in a line, that takes that answer. `icon` (an
  emoji) is optional. Two labels that read the same, or two equal values, stop the build.
- **`practice`**: 3 or more real cases whose answer you are sure of, each with `expected` (one answer
  per question) and a one-line `why`. Never an item that is also on the page to be labelled.
- **`practice_round`**: raise it after rewording a question; the practice reopens and the answers of
  the earlier round are kept but not counted.
- **`items`**: `source_id` (the study's own, never shown), `group`, `body`, and optionally `title`,
  `code`, `context`, `unit`. Nothing else: the allow-list is fixed in the generator, and a field outside it
  is taken out of the item, not added to the list to make a build pass.
- **`unit`**: `{text, part, of}` on an item that is one requirement of a line holding several
  ("TypeScript only (no JavaScript); top-level await is allowed" is two). Each requirement is its
  own item with its own question, and its card shows "From the line (requirement 1 of 2):" and the
  whole line beneath, so the labeller judges one requirement at a time and sees where it came from.
  The build refuses a line whose parts do not add up (one missing, repeated, a different `of`, or
  split across groups), naming the item. Splitting the line is the study's job, before the page.
- **`seed`**: fixes the order. Rebuilding with the same seed keeps every id, and a new item gets the
  next one; a different seed is refused once a key exists.
- **`ask_why`** on an option: a prompt. That answer is incomplete, on the page and in the export,
  until a reason is saved.

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

The items are the drawn units verbatim. The practice is three units whose fate is obvious. Each
dropped unit carries its reason in the labels file. The author's words, with the date, then go into
`author_check` of the plan; a dropped unit is replaced by the next one in the draw.

## The export

`export` reads the store's three collections (`answers`, `groups`, `practice`) from `dump.json`, in
the shape the generator's header gives. It refuses, naming the path, any name the key does not know
or any document of the wrong type. An answer or familiarity value outside the offered options is not
counted: the item is marked incomplete and printed (same rule as on the page); correct it in the dump
and export again. It also prints every item that is missing an answer or a reason, and every group
with no familiarity answer. The practice of the current round is scored into its own file and never
into the labels.
