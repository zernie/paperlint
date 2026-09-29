# anonymity/images

**Level:** warn · **Reads:** `paper.tex` → `paperlint.json`, the preset it extends, and
`_build/paper.facts.json`

## What it catches

A double-blind venue's PDF (`"blind": true` in its preset) with pages that paint raster images —
PNG or JPEG figures, screenshots, logos. It names those pages.

## Why

[`anonymity/identity`](identity.md) reads the PDF's text. Text inside a raster image is pixels,
not text, and no extraction sees it: a screenshot of a terminal with your user name, a GitHub page
with your handle, a logo of your institution. Those pages have to be looked at by a person; this
rule says which ones.

## Examples

> PDF, page(s) 3, 7: raster images; anonymity/identity reads text, not pixels, so a name in a
> screenshot or a logo there is not checked. aidc reviews double-blind: look at them, then turn this
> rule off for the paper

A figure included as a vector PDF is not a raster image: its text is extracted and checked.

## Options / preset fields

No rule options. It reads `blind` from the preset, like `anonymity/identity`.

## What it does not check

What the images show. It lists pages; it does not read pixels (no OCR).

## How to fix

Look at each page named. When the images are clean, turn the rule off for the paper in its
`paperlint.json`:

```json
{ "rules": { "anonymity/images": "off" } }
```
