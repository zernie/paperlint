# The submission on the venue's portal

`paperlint submission` creates, reads and updates a paper's submission on the venue's submission
portal, through the portal's API. Only [HotCRP](https://github.com/kohler/hotcrp) is supported.

```sh
npx paperlint submission new papers/my-paper                    # a dry run: nothing is created
npx paperlint submission new papers/my-paper --save             # creates the real submission
npx paperlint submission show papers/my-paper
npx paperlint submission update papers/my-paper                 # a dry run: nothing is saved
npx paperlint submission update papers/my-paper --save          # changes the real submission
```

## What it needs

Keys, each in the file that owns the fact, and a token:

| where                        | key                                                  | what it says                                                             |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| the venue preset             | `"portal": { "kind": "hotcrp", "url": "https://…" }` | where the venue takes submissions                                        |
| the paper's `paperlint.json` | `"submission": { "id": 7 }`                          | which submission on that portal is this paper's — `new --save` writes it |
| the paper's `paperlint.json` | `"authors": [{ "name", "email", "affiliation"? }]`   | `new` only: the authors as the portal should record them, in order       |
| the environment              | `HOTCRP_TOKEN_<SITE>`, e.g. `HOTCRP_TOKEN_MSR2027`   | an API token for your account on that HotCRP site                        |

`paperlint:aidc` and `paperlint:msr` declare their portals. For another venue, add `portal` to your own preset (see
[`rules.md`](rules.md)) — or upload by hand: a kind paperlint has no adapter for is refused with
`portal kind "<kind>" is not supported; upload by hand`.

```jsonc
// papers/my-paper/paperlint.json
{ "extends": "paperlint:aidc", "kind": "regular", "submission": { "id": 7 } }
```

**The token** is per HotCRP site — one made on one site gets `401` from every other — so it is read
from one variable per site: `HOTCRP_TOKEN_` and the first label of the portal's host, upper-cased,
anything but a letter or digit as `_` (`msr2027.hotcrp.com` → `HOTCRP_TOKEN_MSR2027`,
`aidc.submit.acsac.org` → `HOTCRP_TOKEN_AIDC`). A plain `HOTCRP_TOKEN` is not read; set alone, the
command stops and tells you to rename it. Create the token on the site at `<site>/profile?t=developer`
(**Account settings → Developer**) with the scopes `submeta:read` and `document:read` (`show`), and
`submeta:write` and `document:write` (`update`, `new`). Set it in your environment — never paste it
into a chat. When a token is missing, or the portal answers 401 or 403, the command prints exactly
this: the variable it read, this site's token page, the scopes and the `export` line. paperlint sends
the token as `Authorization: bearer <token>` and never prints it or writes it anywhere.

A missing key or token stops the command with exit 2 and a line naming the file and key, or the
variable, to set.

## `new`

Creates the paper's submission: `POST /api/paper?p=new` — HotCRP's documented way to «create a new
submission; the response will contain the chosen submission ID». It sends four things:

- **the title** — the paper's `\title` as text; when it holds a command of your own, the PDF's Title
  (`\hypersetup{pdftitle=…}`);
- **the abstract** — as the PDF shows it, macros resolved: read from the build's page text
  (`_build/paper.facts.json`, which must describe the PDF being sent — run `paperlint build` first),
  from the line beginning «Abstract» to the next block (CCS Concepts, Keywords, Index Terms, ACM
  Reference Format, or the first section), words TeX hyphenated across lines rejoined. Or
  `--abstract <file>`, plain text;
- **the authors** — from the paper's `"authors"`, never guessed: without it, `new` stops and names the key;
- **the PDF** — the paper's own, or `--pdf <file>`.

It prints all of it — the abstract in full — before HotCRP's verdict. **Without `--save` it is a dry
run** (`dry_run=1`): nothing is created. With `--save`, the id HotCRP chose is written into
`paperlint.json` (`"submission": { "id": … }`, in the open cycle with `cycles`), and the next command
is `show`, which should say `match yes`. `new` is refused when the paper already has a submission id.

PC conflicts, topics and the venue's own fields (paper type, artifact, consent) are not sent; every run
lists them as **do on the site**, with the submission's page. HotCRP's own complaints about a missing
required field are printed as `portal says:` lines.

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

The safe order: `new` (dry run) and `new --save` once, then `show`, `update` (dry run), read what it
says, `update --save`, then `show` again and check `match yes`.

## What it does not do

- It does not set PC conflicts, topics or the venue's other form fields, change the authors after
  `new`, or upload supplementary files.
- It does not check the PDF against the venue; that is `paperlint lint`.
