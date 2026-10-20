# The submission on the venue's portal

`paperlint submission` creates, reads and updates a paper's submission on the venue's submission
portal. Only [HotCRP](https://github.com/kohler/hotcrp) is supported; any other portal is refused
with `portal kind "<kind>" is not supported; upload by hand`.

```sh
npx paperlint submission new papers/my-paper              # a dry run: the portal checks it and keeps nothing
npx paperlint submission new papers/my-paper --save       # creates the real submission
npx paperlint submission show papers/my-paper
npx paperlint submission update papers/my-paper           # a dry run
npx paperlint submission update papers/my-paper --save    # changes the real submission
```

## What it needs

| where                        | key                                                  | what it says                                                          |
| ---------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| the venue preset             | `"portal": { "kind": "hotcrp", "url": "https://…" }` | where the venue takes submissions (`paperlint:aidc`, `paperlint:msr`) |
| the paper's `paperlint.json` | `"authors": [{ "name", "email", "affiliation"? }]`   | for `new`: every author, in the paper's order — never guessed         |
| the paper's `paperlint.json` | `"submission": { "id": 7 }`                          | which submission is this paper's — `new --save` writes it             |
| the environment              | `HOTCRP_TOKEN_<SITE>`, e.g. `HOTCRP_TOKEN_MSR2027`   | your API token for that site                                          |

**The token** works on the site it was made on only, so each site has its own variable:
`HOTCRP_TOKEN_MSR2027` for `msr2027.hotcrp.com`; for a site not on hotcrp.com, its whole host
(with a port other than the default) and path, every other character becoming `_`, so two paths
on one host that differ only in punctuation (`/conf-a`, `/conf/a`) share one variable. A plain
`HOTCRP_TOKEN` is not read. When the token is missing, misnamed or refused, the command prints
where on that site to make one, which permissions to tick, and the exact variable to set. Set it
in your environment — never paste it into a chat; paperlint never prints it.

A missing key or token stops the command with exit 2 and a line naming what to set.

## `new`

Creates the submission and sends four things, printing them first — the abstract in full:

- **the title** — the paper's `\title`; when it holds a command of your own, the PDF's title;
- **the abstract** — `\begin{abstract}…\end{abstract}` as plain text: your argument-less macros
  expanded, dashes and quotes as TeX sets them, citations and comments dropped. Anything it cannot
  read without guessing stops the command with the macro and its line; then pass
  `--abstract <file>`, plain text;
- **the authors** — from `"authors"`; without it, `new` stops and names the key;
- **the PDF** — the paper's own, or `--pdf <file>`;
- **the fields** — from `"fields"`: the paper's answers to the venue's own form fields.

Without `--save` it is a dry run. With `--save` the new id is written into `paperlint.json` (the
open cycle, with `cycles`), and the next command is `show`. Every run prints what is left to do: the
venue's fields the paper did not answer, and what only the site takes. `new` is refused when the
paper already has a submission id.

## The venue's own fields

A venue preset records its form's own fields in `"submission_fields"`, as read (`source`, `url`,
`read`), each by the API's key with a kind: `checkboxes` (with its `options`), `text`, `email`,
`pc_conflicts`. The paper answers them in `"fields"`:

```json
"fields": {
  "topics": ["SE Topic: AI for software engineering"],
  "pc_conflicts": { "someone@example.org": "collaborator" },
  "ACMCorAut": "you@example.org"
}
```

They are checked against the preset before anything is sent: a key the form does not ask, a topic it
does not offer, a missing required one, each stops the command with exit 2. HotCRP keeps a topic it
does not know as nothing, without an error (a bare `"AI for software engineering"`, without its
group, is one), so after the portal answers, a topic list it did not take prints `NOT TAKEN` and
exits 1. `paperlint submission topics` reads the topics the portal offers and marks each against
the preset.

## `show`

Prints the submission's status, title, type, topics, abstract length and the PDF the portal holds,
then `match`: `yes` means the portal holds exactly the PDF you built (compared by sha256). Then the
deadlines in force for the current attempt, each with when and where it was read
([Deadlines](configuration.md#deadlines)). Exit 0 whenever the portal answered.

## `update`

Sends the PDF, the paper's `"fields"`, and, when asked, a new abstract (`--abstract <file>`) and
"submitted" (`--submit`).
Without `--save` it is a dry run. It prints the portal's verdict and its messages; exit 1 when the
portal would not take the change. Before sending, it asks you to open that exact PDF and check it
against the venue's call for papers.

The safe order: `new`, `new --save` once; then `show`, `update`, `update --save`, and `show` again
until it says `match yes`. Every `--save` comes after the author has read the dry run and said yes.

## What it does not do

- It does not set a field the venue preset does not record, change the authors after `new`, or
  upload supplementary files.
- It does not check the PDF against the venue; that is `paperlint lint`.
