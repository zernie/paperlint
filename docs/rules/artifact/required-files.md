# artifact/required-files

**Level:** error · **Reads:** the paper's `paperlint.json` (`artifact`), then the artifact's folder
(`artifact.dir`) or its committed list of paths (`artifact.files`) · **Reported on:** the first line
of the paper's `PIPELINE-STATUS.md`

## What it catches

A name the paper's `artifact.required` lists that is not at the top level of the artifact. A name is
matched without its extension and case: `README` is answered by `README.md`, `readme.txt` or
`README`; a `README.md` in a subfolder is not at the top level and does not count.

It also says when it cannot look: the folder `artifact.dir` does not exist, or the list
`artifact.files` does not exist or names no file.

## Why

An artifact-evaluation committee opens the top of the artifact first, and its instructions ask for
files there (a README with setup and usage, a LICENSE). The paper names what its artifact must
hold once; the rule keeps holding it as the artifact changes.

## Examples

Failing — the artifact has a README and no LICENSE:

```json
{ "artifact": { "dir": "repro", "required": ["README", "LICENSE"] } }
```

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  error  the artifact (repro) has no top-level LICENSE — any extension counts (LICENSE.md,
              LICENSE.txt, LICENSE); "artifact.required" in paperlint.json asks for one
              artifact/required-files
```

Passing: `repro/README.md` and `repro/LICENSE` are there; or the paper declares no `artifact`, or
an `artifact` without `required` — the rule then has nothing to judge.

## Options / preset fields

No rule options. It reads only the paper's own `artifact` ([configuration](../../configuration.md#a-papers-paperlintjson)).
`dir` is the artifact's folder, relative to the paper (usually `repro`); `files`, instead, is a
committed text file listing the artifact's paths one per line, as `zipinfo -1` or `find . -type f`
print them, for a bundle that is not committed; `required` lists the top-level names without an
extension (`["README", "LICENSE"]`).

Exactly one of `dir` and `files`. In a list, blank lines and folder entries (`data/`) are skipped
and a leading `./` is dropped. A single wrapper folder is looked through: when every path sits in
one folder and no file stands beside it (`repo-main/…` from GitHub's Download ZIP, Zenodo's and
OSF's archives), the top level is that folder's.

## What it does not check

- The hosted copy a reviewer downloads (an anonymous link, OSF, Zenodo): only the folder or the list
  in the repository. Comparing the two is #98 and #415.
- Whether the files are current with the paper's text, or what the README says.
- Whether `required` is complete: it holds what the paper declares, and no venue's list is built in.
  Calibrating such a list on a venue's badged artifacts is #492.
- The paper's own «(artifact)» markers, and a DOI or archival copy.

## How to fix

Add the file to the artifact's top level, or regenerate the list after adding it to the bundle.
If the paper no longer needs the name, remove it from `artifact.required`.
