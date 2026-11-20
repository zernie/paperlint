# artifact/promised

**Level:** error · **Reads:** the paper's `paperlint.json` (`artifact`), then the artifact's folder
(`artifact.dir`) or its committed list of paths (`artifact.files`) · **Reported on:** the first line
of the paper's `PIPELINE-STATUS.md`

## What it catches

A promise in the paper's `artifact.promises` whose glob matches no path of the artifact. A promise
is one thing the paper says the artifact contains — its Data Availability sentence, written once as
a label and a glob relative to the artifact's root (`"prompts": "**/prompts/*.md"`).

It also says when it cannot look: the folder `artifact.dir` does not exist, or the list
`artifact.files` does not exist or names no file.

## Why

"The prompts and the raw runs are in the artifact" is checked by a reviewer who opens it, after the
paper is submitted. The glob makes the same check on every lint, before.

## Examples

Failing — the paper promises raw runs the artifact does not hold:

```json
{
  "artifact": {
    "dir": "repro",
    "promises": { "prompts": "**/prompts/*.md", "runs": "runs/*.jsonl" }
  }
}
```

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  error  the artifact promise "runs" (runs/*.jsonl) matches no path of the artifact (repro):
              the paper says the artifact holds it — add the files, or correct the glob in
              "artifact.promises"  artifact/promised
```

Passing: each glob matches at least one file; or the paper declares no `artifact`, or an
`artifact` without `promises`.

## Options / preset fields

No rule options. It reads the paper's own `artifact` — `dir` or `files`, as
[`artifact/required-files`](required-files.md) describes them, and `promises`: label → glob. A glob
is matched with Node's `path.matchesGlob` against every file of the folder (or every line of the
list), so the folder and its list give the same answer; `*` and `**` do not match a dot-file or a
dot-folder unless the glob names the dot (`.github/**`). A single wrapper folder around every
path is looked through, as for `required`.

## What it does not check

- The hosted copy a reviewer downloads: only the folder or the list in the repository (#98, #415).
- Whether the files are current with the paper's text, or hold what their names say.
- Whether the promise list is complete: a sentence of the paper with no promise is not seen.
  Calibrating against a venue's badged artifacts is #492.
- The paper's own «(artifact)» markers, and a DOI or archival copy.

## How to fix

Add the files to the artifact, or correct the glob. If the paper no longer makes the promise,
remove it from `artifact.promises` in the same change as the sentence.
