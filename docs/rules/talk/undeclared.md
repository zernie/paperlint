# talk/undeclared

**Level:** warn · **Reads:** `paper.tex` → `paperlint.json` and the paper's `talk/` folder

## What it catches

An `.mp4` file in the paper's `talk/` folder while the paper declares no `talk` (`undeclared`).

## Why

Every other talk rule is silent until the paper declares `talk`. A video made and never declared
would be sent unchecked, and the silence would read as "checked and fine". This is the other
direction of `talk/required-files`: a file with no declaration, rather than a declaration with no
file.

## Examples

Failing: `papers/p/talk/talk.mp4` exists, `papers/p/paperlint.json` has no `talk`:

> papers/p/talk/talk.mp4 is a talk video, and this paper declares no `talk`, so its length and
> format are not checked — declare it in paperlint.json: "talk": { "mode": "remote-video" }

Passing: the same file with `"talk": { "mode": "remote-video" }` declared.

## Options / preset fields

None.

## What it does not check

Only the default folder `talk/` and only `.mp4` files; a video elsewhere is not looked for.

## How to fix

Declare the talk in the paper's `paperlint.json`, or move the file out of `talk/`.
