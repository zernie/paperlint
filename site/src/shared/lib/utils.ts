import { createCn } from "cn/config";

/**
 * The named tokens of src/app/styles/globals.css that Tailwind's defaults do not have, by the
 * theme key the class merger groups them under. Without them `cn("text-hero", "text-copy")` reads
 * `text-hero` as a colour and drops it; utils.test.ts fails when globals.css gains a token missing
 * here.
 */
export const themeTokens = {
  text: [
    "hero",
    "cover",
    "display",
    "title",
    "numeral",
    "subtitle",
    "lead",
    "body",
    "label",
    "code",
  ],
  spacing: ["hero", "band", "section"],
  container: ["page", "prose", "measure", "wide", "cover"],
} as const;

/** shadcn's class merger: later classes win over earlier ones of the same group. */
export const cn = createCn({
  extend: {
    theme: {
      text: [...themeTokens.text],
      spacing: [...themeTokens.spacing],
      container: [...themeTokens.container],
    },
  },
});
