# versions/layout

**Level:** error · **Reads:** the paper's `versions/` folder, `versions/lock.json` and `paperlint.json`
(`cycles`) · **Reported on:** the first line of `PIPELINE-STATUS.md`

## What it catches

A paper that keeps `cycles` freezes each version it sends in one folder per attempt:

```text
versions/
├── alpha-2026/          ← a cycle id in paperlint.json
│   ├── submitted.pdf
│   └── submitted.tex
├── beta-2027/
│   ├── submitted.pdf
│   ├── submitted.tex
│   └── camera-ready.pdf ← only after the attempt is accepted
└── lock.json            ← written by paperlint: bytes, sha256, when each file was frozen
```

The rule reports:

- an entry of `versions/` that is neither `lock.json` nor a folder: a dated file from the layout
  before folders per attempt (`2026-07-22-submitted.pdf`) is named with the command that moves it;
- a folder that names no cycle in `paperlint.json`;
- a file in a cycle's folder that is not `<stage>.pdf` or `<stage>.tex`, the stage one of
  `submitted`, `camera-ready`, `arxiv`;
- a frozen PDF without its source beside it, unless the lock records the source as lost;
- a `submitted` or `camera-ready` PDF in a cycle whose `phase` is still `porting`;
- frozen files and no lock, a lock that does not read, a frozen file the lock does not record, a file
  whose bytes or digest are not the ones the lock recorded, and a lock entry whose file is gone.

Names and folders starting with `.` (`.gitkeep`) are not judged. A paper without `cycles` is not
judged either: its `stages:` list in `PIPELINE-STATUS.md` is still its record, checked by
`paper/stages` and `paper/source`.

## Why

The folder and the file name are the record: which attempt a file belongs to, and at which stage it
was frozen. What state it is in follows from the attempt's `outcome` in `paperlint.json` — under
review while the cycle is open, historical once it is rejected or withdrawn, the camera-ready's base
once accepted. A name outside the convention is a version whose state nobody can read off.

A frozen file is never supposed to change. The lock records its bytes and digest when paperlint froze
it, so a file that was replaced afterwards — the PDF a reviewer's page numbers point into, the source
their line numbers point into — is caught instead of trusted. The lock is generated, never typed:
`paperlint submission new|update --save` writes it when it freezes what it sent, and
`paperlint versions lock` records a file put there by hand.

## Examples

Failing — `paperlint.json` declares the cycle `open-2027`, and `versions/` still holds a file of the
old layout:

```text
papers/my-paper/PIPELINE-STATUS.md
  1:1  error  `versions/2026-07-22-submitted.pdf` is not part of the layout — a frozen version in the
              layout before folders per attempt: `npx paperlint versions migrate <paper>` moves it
              into versions/<cycle>/  versions/layout
```

Passing: `versions/open-2027/submitted.pdf` and `submitted.tex`, both recorded in `versions/lock.json`
as they stand.

## Options / preset fields

No rule options.

## What it does not check

- That a cycle with a submission froze anything at all — [`cycle/submitted-frozen`](../cycle/submitted-frozen.md) does.
- That the frozen source builds the frozen PDF: the lock records what was frozen together, and
  `submission --save` freezes the source only when the build's record says it is the one the PDF was
  built from.
- A lost source: the lock records it (`"sourceLost": true`) and `paperlint versions` shows it; there is
  nothing left to fix, so it is not reported.

## How to fix

- A dated file: `npx paperlint versions migrate <paper>` moves every one named in `stages:` into its
  cycle's folder, writes the lock and drops the list.
- A folder or file outside the convention: rename it to the cycle id or the stage, or move it to
  `extra/`.
- A file put there by hand, or one replaced on purpose: `npx paperlint versions lock <paper>`.
- A file replaced by accident, or deleted: restore it from git.
- A PDF sent from a cycle still `porting`: the port is done — drop the phase
  ([`cycle/port-done`](../cycle/port-done.md) says when).
