# talk/one-slide-size

**Level:** error · **Reads:** `paper.tex` → `paperlint.json` (`talk.one_slide`), the preset's
`talk.one_slide`, and the one-slide image's PNG header

## What it catches

- The one-slide image is not the declared size (`size`).
- The file is not a PNG (`notPng`).

The size is the paper's `talk.one_slide` when it states one, else the preset's. When neither states
a size, the rule is silent: a size nobody asked for is not a requirement. The width and height are
read from the PNG's `IHDR` header; the pixels are never decoded.

## Why

A one-slide summary is shown on a fixed canvas — a poster wall, a session screen, a page of the
program. An image of another size is letterboxed or cropped.

## Examples

Failing — the paper declares `"one_slide": { "width_px": 1920, "height_px": 1080 }`:

> papers/p/talk/one-slide.png is 1280×720 px, and the one-slide must be 1920×1080 px

Passing: a 1920×1080 PNG.

## Options / preset fields

No rule options. Preset: `talk.one_slide`. Paper: `talk.one_slide`, which wins.

## What it does not check

Its content; formats other than PNG; a missing file (`talk/required-files`).

## How to fix

Render the image at the declared size, or correct the declared size.
