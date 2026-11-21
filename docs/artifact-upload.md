# The artifact's upload record

When a paper's reproduction artifact is uploaded (to OSF, Zenodo, Figshare, an anonymous mirror, an
institutional page), one small JSON file in the paper says what was uploaded, where, and what the
paper printed at that moment. The opt-in rule [`artifact/upload-current`](rules/artifact/upload-current.md)
reads it to say when the paper's numbers have moved past the upload. Everything here is optional:
with the rule off, nothing reads the file.

Four layers, each usable without the ones below it:

| layer                                | what it is                                                       | network |
| ------------------------------------ | ---------------------------------------------------------------- | ------- |
| the record                           | a documented JSON file; write it by hand or from your own script | no      |
| `artifact/upload-current`            | the rule that compares the record with the paper's numbers now   | no      |
| `paperlint artifact record`          | writes the record for an upload made any way, to any host        | no      |
| `paperlint artifact upload` / `show` | an optional wrapper over a host paperlint has an adapter for     | yes     |

The shape follows `quarto publish`, whose `_publish.yml` records "the service, id, and URL of the
published content" and is "suitable for checking in to version control" (quarto.org, publishing to
Quarto Pub): the record is a fact in the repository, and the rule reads that fact, never the host.

## The record

Default path `<paper>/submission/artifact-upload.json` (the rule's `record` option names another):

```json
{
  "version": 1,
  "host": "osf",
  "url": "https://osf.io/abcde/",
  "file": "artifact.zip",
  "id": "0123456789abcdef01234567",
  "sha256": "59bd16dfc39e768f82bb8ec74467e571e80ed284683b586f077dbf1aa2483ecd",
  "md5": "3f395fbbb68716f38f5ff7fa9d740e3b",
  "uploadedAt": "2026-11-01T10:00:00Z",
  "numbers": { "nRepos": "63", "pctPass": "41.2\\%" }
}
```

| field        | required | what                                                                                                                                  |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `version`    | yes      | `1`; a reader refuses a version it does not know                                                                                      |
| `host`       | yes      | the host's name: `osf`, `zenodo`, `other`, … — any name; `show` checks hashes only for a host paperlint has an adapter for            |
| `url`        | yes      | where it is: the project, the record or the file page                                                                                 |
| `file`       | yes      | the uploaded file's name                                                                                                              |
| `id`         | no       | the host's id of the file (OSF: the file's id); `show` finds the file by it, else by `file` in the project `url` names                |
| `sha256`     | no       | the file's sha256, 64 lowercase hex digits                                                                                            |
| `md5`        | no       | the file's md5, 32 lowercase hex digits                                                                                               |
| `uploadedAt` | yes      | when, ISO 8601 with a zone (`2026-11-01T10:00:00Z`)                                                                                   |
| `numbers`    | yes      | the paper's number macros at upload time, name → value as written in the numbers file (`\newcommand{\nRepos}{63}` → `"nRepos": "63"`) |

Any other key is refused, so a typo does not read as "not set". From a script, `numbers` is every
argument-less `\newcommand`, `\newcommand*`, `\renewcommand`, `\providecommand` and `\def` of the
numbers file, its body as written, without the macro's backslash.

## `paperlint artifact record`

```bash
npx paperlint artifact record artifact.zip --url https://osf.io/abcde/ papers/my-paper
```

No network. Hashes the zip (sha256 and md5), reads the numbers file, and writes the record with the
current time. The numbers file is `--numbers <file>` (relative to the paper), else the `numbers`
option of `artifact/upload-current` where `paperlint lint` turns it on for that paper: the command
asks ESLint for the rule's options on the paper's `PIPELINE-STATUS.md`, so a `rules` object, a list
of blocks, the root `paperlint.json` and the paper's own all count the same as they do for lint, and
the record goes to the rule's `record` path. `--host <name>` names the host; without it, a url an adapter
recognises names its host (`osf.io` → `osf`), and any other is `other`. The zip is relative to where
the command runs; the paper folder defaults to the current one. Exit 2, and nothing written, when
the zip, the url or the numbers are missing, or the url is not one.

## `paperlint artifact upload`

```bash
npx paperlint artifact upload --to osf artifact.zip --node abcde papers/my-paper          # dry run
npx paperlint artifact upload --to osf artifact.zip --node abcde papers/my-paper --save   # uploads
```

A DRY RUN unless `--save`: it prints the file, its size and sha256, the project, the record it
would write and whether the token is set, and sends nothing. With `--save` it uploads (a new version
of the file of the same name at the project's top level, else a new file), reads the host's hashes
back, refuses to write a record when the host's sha256 is not the one sent (exit 1), and otherwise
writes the same record as `record`, with the host's `id`, page and hashes. `--node` is the project's
id (OSF: the five characters after `osf.io/`). The dry run may leave it out and take the project of
an existing record's url, and then names it in its last line; `--save` uploads only to a project
named with `--node`, so the project the person said yes to is the one the file goes to.

The token is read from the environment only, never printed: `OSF_TOKEN_OSF_IO`, made at
`osf.io/settings/tokens` with the scope `osf.full_write`. A plain `OSF_TOKEN` is not read (it is
named when set), as `submission` names its per-site variables. In a Claude Code session with
paperlint's hooks, `artifact upload … --save` runs only after the person's yes to a question naming
the paper folder, the file's sha256 and the project (`submission-confirm`, the same gate as
`submission … --save`).

## `paperlint artifact show`

```bash
npx paperlint artifact show papers/my-paper
```

Prints the record, then, for a host whose adapter reads hashes, the hashes the host holds now and
`match yes` (exit 0) or `match no` (exit 1). A host with no adapter, or one that gives no hash: it
says so and prints the record's own hashes, to compare on the host's page. With `OSF_TOKEN_OSF_IO`
set it reads a project that is not public; without, a public one. Exit 2 when there is no record,
it does not parse, or the host does not answer.

## Hosts

| host  | upload | hashes read back | adapter             |
| ----- | ------ | ---------------- | ------------------- |
| `osf` | yes    | sha256, md5      | `src/adapters/osf/` |

Any other host works with `record` and the rule; only `upload` and `show` need an adapter. A new
host is one folder in `src/adapters/<host>/` implementing `src/ports/artifact-host.ts`, its recorded
answers and tests, and one line in `ARTIFACT_HOSTS` (`src/cli.ts`); the record and the rule do not
change.

## What none of this sees

- A file replaced on the host after `show` ran, or replaced by hand without a new record.
- Whether the archive's contents compute the numbers the record holds: the record says what the
  paper printed when it was uploaded.
- OSF view-only links: `show` addresses the project by its guid, with the owner's token when it is
  not public; a reviewer's view-only link was not tested.
