/**
 * `fill.ts` — what is recovered from pdf.js's exports for each text item: whether it is upright, and
 * the fill it was drawn in (the operator-list walk). Operator lists here are written by hand; the
 * real-PDF half runs in `pdf-facts.harness.mjs` and `test/e2e/banal.mjs`.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { isDeepStrictEqual } from "node:util";
import * as L from "./fill.ts";
import type { OperatorList } from "./fill.ts";

/** One vitest case per assertion, named by its label. */
const check = (label: string, cond: unknown, detail = "") => {
  test(label, () => {
    assert.ok(cond, detail ? `${label} — ${detail}` : label);
  });
};

// ── upright ─────────────────────────────────────────────────────────────────────────────
check("isUpright: the identity scaled", L.isUpright([10, 0, 0, 10, 5, 5]));
check(
  "isUpright: mirrored vertically is still upright",
  L.isUpright([10, 0, 0, -10, 5, 5]),
);
check("isUpright: rotated 90° is not", !L.isUpright([0, 10, -10, 0, 5, 5]));
check("isUpright: skewed is not", !L.isUpright([10, 0, 3, 10, 5, 5]));

// ── the fill walk ───────────────────────────────────────────────────────────────────────
const OPS = {
  save: 1,
  restore: 2,
  setFillRGBColor: 3,
  setTextRenderingMode: 4,
  showText: 5,
  showSpacedText: 6,
};
const glyphs = (s: string) => [[...s].map((unicode) => ({ unicode }))];
const ops = (...pairs: [number, unknown?][]): OperatorList => ({
  fnArray: pairs.map((p) => p[0]),
  argsArray: pairs.map((p) => p[1] ?? null),
});

check(
  "hexOf: current pdf.js passes a hex string",
  L.hexOf(["#E5E5E5"]) === "#e5e5e5",
);
check(
  "hexOf: older pdf.js passes three numbers",
  L.hexOf([229, 229, 229]) === "#e5e5e5",
);
{
  const list = ops(
    [OPS.save],
    [OPS.setFillRGBColor, ["#f5f5f5"]],
    [OPS.showText, glyphs("Light text")],
    [OPS.restore],
    [OPS.showText, glyphs("Dark")],
    [OPS.setTextRenderingMode, [3]],
    [OPS.showSpacedText, [[{ unicode: "O" }, -250, { unicode: "CR" }]]],
    [OPS.setTextRenderingMode, [0]],
    [OPS.showText, glyphs("After")],
  );
  const fills = L.fillsOf(OPS, list, ["Light text", "Dark", "OCR", "After"]);
  // Guards: save/restore — the colour set inside a group ends with it; the next item is not light.
  check(
    "fillsOf: a colour set inside save/restore ends at restore",
    isDeepStrictEqual(fills.slice(0, 2), [
      { kind: "rgb", hex: "#f5f5f5" },
      { kind: "unknown" },
    ]),
    JSON.stringify(fills),
  );
  // Guards: render mode 3 is invisible, and the mode is state, not a property of one operator.
  check(
    "fillsOf: render mode 3 is invisible, and mode 0 ends it",
    fills[2]?.kind === "invisible" && fills[3]?.kind === "unknown",
    JSON.stringify(fills),
  );
}
{
  const list = ops(
    [OPS.setFillRGBColor, ["#ff0000"]],
    [OPS.showText, glyphs("Hel")],
    [OPS.showText, glyphs("lo world")],
  );
  check(
    "fillsOf: an item drawn by two operators, and spaces that items and glyphs split differently",
    L.fillsOf(OPS, list, ["Hello", "world"]).every(
      (f) => f.kind === "rgb" && f.hex === "#ff0000",
    ),
  );
}
{
  const list = ops(
    [OPS.setFillRGBColor, ["#eeeeee"]],
    [OPS.showText, glyphs("first")],
    [OPS.showText, glyphs("second")],
  );
  const fills = L.fillsOf(OPS, list, ["nowhere", "second"]);
  // Guards: the direction of a miss — an item that cannot be found is drawn as black (kept), and
  // the walk does not lose its place for the items after it.
  check(
    "fillsOf: an unmatched item is `unknown` (kept, never dropped), and the next one still matches",
    fills[0]?.kind === "unknown" && fills[1]?.kind === "rgb",
    JSON.stringify(fills),
  );
}
check(
  "fillsOf: an empty item is `unknown`",
  L.fillsOf(OPS, ops(), [" "])[0]?.kind === "unknown",
);
