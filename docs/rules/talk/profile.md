# talk/profile

**Level:** error · **Reads:** `paper.tex` → `paperlint.json` (`talk`, `kind`, `extends`) and the
venue preset's `talk` block

## What it catches

A talk the other `talk/*` rules cannot judge, one reason at a time:

- the paper declares `talk` and names no venue preset (`noPreset`);
- the preset has no `talk` block (`noTalkBlock`);
- the paper's `talk.mode` is not one of the preset's `modes` (`mode`);
- the paper names no `kind` (`kindMissing`), or the preset sets no talk slot for that kind
  (`kindNoSlot`).

## Why

Every other talk rule needs one of these to say anything. Without a slot the length is not checked;
without a talk block nothing is. A rule that went quiet for these reasons would look exactly like a
rule that checked and passed, so this one says which piece is missing.

## Examples

Failing — AgenticDev allows only remote video:

```json
{
  "extends": "paperlint:agenticdev",
  "kind": "short",
  "talk": { "mode": "in-person" }
}
```

> `agenticdev` allows the talk modes remote-video; this paper declares `in-person`

Failing — the email gave the short-paper slot only:

```json
{
  "extends": "paperlint:agenticdev",
  "kind": "full",
  "talk": { "mode": "remote-video" }
}
```

> `AgenticDev` sets no talk slot for a `full` paper, so the video's length is not checked; its talk
> kinds: short

Passing: `"kind": "short", "talk": { "mode": "remote-video" }`.

## Options / preset fields

No rule options. Preset: `talk.modes` (a list; empty or absent allows any mode) and `talk.kinds`.

## What it does not check

A preset or `paperlint.json` that does not resolve or parse at all: `pdf/profile` reports that, and
every talk rule is silent.

## How to fix

Declare the mode the venue allows; set `kind`; when the venue's talk numbers are not in the shipped
preset, put them in your own preset (`"extends": "./my-venue.jsonc"`) with a `talk` block that
quotes the organizers.
