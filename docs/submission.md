# The submission on the venue's portal

`paperlint submission` reads and updates a paper's submission on the venue's submission portal,
through the portal's API. Only [HotCRP](https://github.com/kohler/hotcrp) is supported.

```sh
npx paperlint submission show papers/my-paper
npx paperlint submission update papers/my-paper                 # a dry run: nothing is saved
npx paperlint submission update papers/my-paper --save          # changes the real submission
```

## What it needs

Two keys, each in the file that owns the fact, and a token:

| where                        | key                                                  | what it says                                    |
| ---------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| the venue preset             | `"portal": { "kind": "hotcrp", "url": "https://…" }` | where the venue takes submissions               |
| the paper's `paperlint.json` | `"submission": { "id": 7 }`                          | which submission on that portal is this paper's |
| the environment              | `HOTCRP_TOKEN`                                       | an API token for your HotCRP account            |

`paperlint:aidc` and `paperlint:msr` declare their portals. For another venue, add `portal` to your own preset (see
[`rules.md`](rules.md)) — or upload by hand: a kind paperlint has no adapter for is refused with
`portal kind "<kind>" is not supported; upload by hand`.

```jsonc
// papers/my-paper/paperlint.json
{ "extends": "paperlint:aidc", "kind": "regular", "submission": { "id": 7 } }
```

**The token** is read only from `HOTCRP_TOKEN`. Create it on the HotCRP site under **Account
settings → Developer**; `show` needs the scopes `submeta:read` and `document:read`, `update` also
`submeta:write` and `document:write`. paperlint sends it as `Authorization: bearer <token>` and
never prints it or writes it anywhere.

A missing key or token stops the command with exit 2 and a line naming the file and key, or the
variable, to set.

## `show`

Prints the submission's status (and when it was submitted), its id, title, paper type, topics, the
abstract's length in words, and the PDF the portal holds — its hash, size and upload time — then
whether that PDF is the local one: HotCRP stores a PDF's sha256 as `sha2-<hex>`, and paperlint
compares it with the sha256 of the paper's `paper.pdf` (or its `pdf` setting, or `--pdf <file>`).
`match yes` means the portal holds exactly the file you built. Exit 0 whenever the portal answered.

Then one `deadline` line per deadline in force for the current attempt — the venue preset's portal
readings with the paper's own call readings and overrides over them ([Deadlines](configuration.md#deadlines)):
the instant that binds, what set it (a reading and the day it was read, or an override with its
reason and evidence), and the other readings of it. Instants only; how long is left is not printed.

## `update`

Sends the PDF — the paper's own unless `--pdf <file>` names another — and, when asked, a new
abstract (`--abstract <file>`, plain text) and the status "submitted" (`--submit`).

**Without `--save` it is a dry run**: HotCRP's `dry_run=1` checks the change and keeps nothing. With
`--save` the real submission changes. Either way it prints HotCRP's verdict — `valid`, the fields the
change touched (`change_list`), HotCRP's messages — and the local file's sha256. Exit 1 when the
change is not valid or the HTTP status is not 2xx.

Before it sends anything, dry run or not, it prints one line asking you to open that exact PDF and
check it against the venue's call for papers — named by the preset's `url` when the preset is a
venue: what paperlint checks is an aid, and the venue's reading of the PDF is what counts.

The safe order: `show`, `update` (dry run), read what it says, `update --save`, then `show` again and
check `match yes`.

## What it does not do

- It does not create a submission, edit authors, topics or other form fields, or upload
  supplementary files.
- It does not check the PDF against the venue; that is `paperlint lint`.
