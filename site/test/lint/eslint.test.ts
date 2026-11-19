// Both halves of site/eslint.config.mjs: it fires on a planted defect of each family it turns on,
// and stays quiet on the same shapes written with the design tokens. A rule only ever seen quiet
// cannot be told from a rule that is not loaded (for the class-name rules: one that did not read
// the Tailwind v4 CSS entry, where `bg-red-500` would be a valid class).
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import * as R from "remeda";
import { describe, expect, it } from "vitest";

const site = fileURLToPath(new URL("../../", import.meta.url));
const fixture = (name: string): string =>
  fileURLToPath(new URL(`fixtures/eslint/${name}`, import.meta.url));

/** Each finding of one file as `line:column rule`, in ESLint's order. */
const findings = async (name: string): Promise<readonly string[]> => {
  // `ignore: false`: the config ignores test/lint/fixtures/ so that `npm run lint` stays green.
  const eslint = new ESLint({ cwd: site, ignore: false });
  const [result] = await eslint.lintFiles([fixture(name)]);
  return R.map(
    result?.messages ?? [],
    (m) => `${String(m.line)}:${String(m.column)} ${m.ruleId ?? "fatal"}`,
  );
};

describe("site/eslint.config.mjs", () => {
  it("fires on bad.tsx: a palette colour, two arbitrary values, the order, a hook, a promise, an <img>", async () => {
    expect(await findings("bad.tsx")).toEqual([
      "7:5 react-hooks/rules-of-hooks",
      "10:3 @typescript-eslint/no-floating-promises",
      "12:21 tailwindcss/no-arbitrary-value",
      "12:21 tailwindcss/classnames-order",
      "12:33 tailwindcss/classnames-order",
      "12:33 tailwindcss/no-custom-classname",
      "12:44 tailwindcss/no-arbitrary-value",
      "12:44 tailwindcss/classnames-order",
      "14:7 @next/next/no-img-element",
    ]);
  });

  it("stays quiet on clean.tsx: the same shapes, with tokens", async () => {
    expect(await findings("clean.tsx")).toEqual([]);
  });
});
