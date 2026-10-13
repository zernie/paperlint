# paper/prereg-coverage

**Level:** error · **Reads:** `repro/<study>/prereg.json`, for every study folder at the top of the
paper's `repro/` that holds one (every folder there but the shared `tools/` and `data/`, whatever
its name) · **Reported on:** the first line of the paper's
`PIPELINE-STATUS.md`, once per problem

## What it catches

A study's pre-registration that does not say how its sample relates to the population the paper
talks about. Every `prereg.json` in a study folder (`repro/<slug>-YYYY-MM-DD/`) must carry five
fields; every other key in the file is the author's and is not read.

| field          | holds                                                                                                                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `population`   | `about`: what the paper's claim is about, in its own words · `source`: where the units come from (census, crawl, registry, with its date) · `size`: how many units, a whole number above 0 (an estimate is fine; say how in `source`)                                             |
| `strata`       | `by`: the property the screens are counted by (rule type, language, …) · `values`: its values, at least one, each once                                                                                                                                                            |
| `screens`      | one entry per screen applied between the population and the sample: `name` (what it keeps, as applied) and `removed`, an object with a count for **every** declared stratum value (0 where it removed none) and no other key. `[]` when no screen was applied                     |
| `coverage`     | `share`: the share of the population the sample can represent, 0 to 1, or `null` with a `reason` · `unreachable`: the strata or kinds of units the sample cannot reach (`[]` only when it reaches them all; a `share` of 1 with a non-empty list is refused)                      |
| `author_check` | `who` looked at the drawn units before the run, `when` (YYYY-MM-DD), `units_seen` of `units_drawn` (the units drawn — rules, cases — not the items made from them), and the `verdict` to "is this what you meet in practice?": `representative`, `partly` or `not-representative` |

A verdict other than `representative` needs `author_check.decision`: `proceed` (true or false), `by`
whom, and `why`. A doubtful verdict with no recorded decision is an error; with one, either way, it
passes: the rule asks that the decision be made and written down, not which way it goes.

A study folder without a `prereg.json` owes nothing here.

**When it acts.** Inside stage 3, the study: `build-benchmark` writes the `prereg.json` before the
sample is drawn, the author checks the drawn units, and only then the run and any labelling
(`build-label-page`) follow. The rule runs on every `paperlint lint` and in CI, so a study whose
pre-registration lacks a field fails from the moment the file exists. The flow and the map:
[`layout.md`](../../layout.md).

## Why

A measurement study of how language models read coding rules drew its rules from three pools, kept
only the rules judgeable from one code excerpt of at most 40 lines, restricted one pool to a
classifier's "enforceable" lane, and let a model pick short excerpts. Each screen was reasonable
alone; together they left a sample of crisp rules. The labeller found 93 % of the items designed as
borderline clear-cut, and the rules looked nothing like the ones met in practice. A spot-check of
ten items flagged it (seven of ten clear-cut), and the run went ahead.

Nothing in that design forced anyone to state what share of the real population the sample covered,
or which screens removed which kinds of rules. Those are the statements this rule requires, before
the sample is frozen, in the file that freezes it. The counts per stratum are what make the drift
visible: a screen that removes 120 crisp rules and 1,630 vague ones is a screen on the construct.
The author's check is on the drawn **units**, because ten items made from crisp rules look fine one
by one.

## Examples

Failing: a pre-registration with hypotheses and arms, and none of the five fields.

```text
papers/rule-reading/PIPELINE-STATUS.md
  1:1  error  `repro/draw-2026-10-12/prereg.json`: `population` is missing — add `population`: what
              the paper's claim is about (`about`), where its units come from (`source`) and how many
              there are (`size`). Why: a study once screened its sample down to rules that are easy
              to judge — its labeller found 93 % of the items designed as borderline clear-cut — and
              nothing in its design made anyone state what share of the real population the sample
              covered or which screens removed which kinds of units. Rule paper/prereg-coverage: …
              paper/prereg-coverage
  1:1  error  … `strata` is missing …
  1:1  error  … `screens` is missing …
  1:1  error  … `coverage` is missing …
  1:1  error  … `author_check` is missing …
```

Failing: a screen counted under a value `strata` does not declare, and a doubtful check with no
decision.

```text
  1:1  error  `repro/draw-2026-10-12/prereg.json`: `screens[0].removed.procedural` is not a declared
              stratum value — `strata.values` declares crisp, parameterised, vague; add it there or
              count it under one of them. …
  1:1  error  `repro/draw-2026-10-12/prereg.json`: `author_check.decision` is missing — the verdict
              is «partly», and a doubtful verdict with no recorded decision is how a sample the author
              doubted gets run anyway: add `proceed` (true or false), `by` whom and `why`. …
```

Passing:

```json
{
  "hypotheses": ["…the author's own keys, not read…"],
  "population": {
    "about": "rules written in agent instruction files of public repositories",
    "source": "a census of instruction files, crawled 2026-07-28",
    "size": 4210
  },
  "strata": {
    "by": "rule type",
    "values": ["crisp", "parameterised", "vague"]
  },
  "screens": [
    {
      "name": "judgeable from one code excerpt of at most 40 lines",
      "removed": { "crisp": 120, "parameterised": 410, "vague": 1630 }
    }
  ],
  "coverage": {
    "share": 0.31,
    "unreachable": ["vague", "rules about process rather than code"]
  },
  "author_check": {
    "who": "first author",
    "when": "2026-10-12",
    "units_seen": 24,
    "units_drawn": 24,
    "verdict": "partly",
    "decision": {
      "proceed": true,
      "by": "first author",
      "why": "the claim is narrowed to crisp and parameterised rules; vague rules are named as out of reach"
    }
  }
}
```

## Options / preset fields

No rule options.

## What it does not check

- Whether the numbers are true: that `removed` adds up to what the pools held, that `share` follows
  from them, or that the author really looked. It checks that each was stated, in a shape a reader
  and a script can use.
- That the paper's text matches `population.about` or names what `coverage.unreachable` lists. That
  is reading, and the paper skills do it (`build-benchmark`, `draft-paper`'s threats section).
- A `prereg.json` deeper than a study folder's top (`repro/<study>/sub/prereg.json`), at the top of
  `repro/` itself, or under any other name. The study's folder and its name are `paper/repro-layout`'s.
- A study without a `prereg.json`.

## How to fix

Add the five fields to the study's `prereg.json` before the sample is frozen: count what each screen
removed per stratum value from the screening script's own output, and show the author the drawn
units with the question "is this what you meet in practice?". A pre-registration already frozen and
run gets the fields as a dated addendum, with the values measured now; a paper that cannot give them
turns the rule off for itself in its `paperlint.json`
(`"rules": { "paper/prereg-coverage": "off" }`), which says so in the record.
