# review/findings-closed

**Level:** off by default · **Reads:** `reviews/*.md` of a paper, the `findings` of its YAML frontmatter

## What it catches

A finding in a review's frontmatter whose `status` is still `open`. It reports once per finding, on the frontmatter, with the finding's id, its `title` and, when the record has one, its `where`:

```text
finding 1 is still open: Abstract overclaims (paper.tex:83)
```

A review with no `findings` key, no frontmatter, or a frontmatter that does not parse reports nothing here; [`review/frontmatter`](../../rules.md) reports a block that does not parse.

## Opt-in, and why

This rule is optional: registered, and silent until a project turns it on. It is a rule about the author's process, not about a venue. No call for papers asks that a review's findings be closed, so no venue preset turns it on, and a paper that does not use `reviews/` is not affected. (A check ships on by default only when the venue's own text, a desk reject or a broken build decides it.)

It exists because findings get written and are not closed: one consumer project held 499 open findings from a single month, and nothing said so.

## Turning it on

In the root `paperlint.json`, or in one paper's own:

```json
{
  "rules": { "review/findings-closed": "warn" }
}
```

See [optional rules](../../optional-rules.md). If the rule is on and no paper of the project gets it, `paperlint lint` fails and says so, as for every optional rule.

## Why

A review that ends with open findings leaves no sign of which are still true. Closing a finding is a decision (`fixed`, or `wontfix` with a `note`), and the build can ask that someone made it.

## Examples

Failing:

```yaml
---
findings:
  - id: 1
    status: open
    cause: rule
    title: Abstract overclaims
    where: paper.tex:83
    found_by: tex/claim-emphasis
---
```

Passing:

```yaml
---
findings:
  - id: 1
    status: fixed
    where: paper.tex:83
    found_by: tex/claim-emphasis
  - id: 2
    status: wontfix
    note: the venue's template sets this
---
```

## Options / preset fields

None. The finding fields it reads are `id`, `status`, `title` and `where`; `where` (a location such as `paper.tex:83`) and `found_by` (the skill, rule or person that found it) are optional fields of the review schema, so every existing review stays valid.

## What it does not check

That a finding marked `fixed` is fixed; that a `wontfix` has a `note`; whether `where` points at a line that exists. An entry that is no mapping, or has no `status`, is skipped: `review/frontmatter` reports it.

## How to fix

Fix the text and set `status: fixed`, or decide not to and set `status: wontfix` with a `note`.
