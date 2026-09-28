# tex/missing-input

**Level:** warn · **Reads:** `paper.tex`, and every file it includes

## What it catches

An `\input`, `\include` or `\subfile` that names a file which is not there. The path is resolved the
way TeX resolves it, from the paper's directory: `name.tex` first, then `name` as written. An
include inside an included file is resolved from the paper's directory too.

## Why

The rules that read the parse tree — `tex/template`, `tex/required-section`, `tex/venue-leftover`,
`tex/claim-provenance` — read the whole paper: `paper.tex` with every included file spliced in where
it is included, as TeX reads it. A file that is not there cannot be read, and without this rule the
others would report a clean body for text they never saw. TeX stops on it too.

## Examples

```latex
\input{sections/results}   % warns when neither sections/results.tex nor sections/results exists
\input{sections/intro}     % silent: sections/intro.tex is there
```

The first line reports:

> `sections/results` is not there (tried `sections/results.tex` and `sections/results`, from the
> paper's directory): TeX stops on it, and no rule read what it should hold

A missing file included by another included file is reported at the include in `paper.tex` that
brought that file in, and the message names the file that holds it.

## Options / preset fields

None.

## What it does not check

- A path built from a macro (`\input{\dir/intro}`): macros are not expanded, so the path is looked
  up as written.
- `\import{dir}{file}` and other packages' include macros.

## How to fix

Correct the path, or add the file. A file that a build step writes (a table of generated numbers)
is absent before that step runs — keep the include with a disable directive and the reason:

```latex
% eslint-disable-next-line tex/missing-input -- written by repro/numbers.sh before the build
\input{generated/numbers}
```

## Where findings in included files are reported

ESLint reports a finding in the file it lints, and paperlint lints `paper.tex`. A finding of any of
the rules above whose text came from an included file is reported at the include in `paper.tex`,
with the included file, line and column at the front of its message
(`sections/results.tex:12:3: …`). A disable directive for it goes above that include.
