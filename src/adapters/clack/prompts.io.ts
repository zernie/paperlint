/**
 * The `Prompts` port drawn by @clack/prompts, the one prompt library of this package (chosen on
 * 2026-11-22: `docs/prior-art/prompt-libraries.md`). Clack's cancel (Ctrl+C, Esc) is a symbol;
 * it becomes the port's `cancel`, so nothing outside this folder knows the symbol exists.
 */
import { confirm, select, text } from "@clack/prompts";
import type { Readable, Writable } from "node:stream";
import type { Answer, Prompts } from "../../ports/prompts.ts";

/** Clack answers with the value or with its one symbol, the cancel (`isCancel` tests the same). */
const answer = <T extends string | boolean>(value: T | symbol): Answer<T> =>
  typeof value === "symbol" ? { kind: "cancel" } : { kind: "answer", value };

/** The terminal's streams by default; a test passes its own. */
export const clackPrompts = (
  streams: { readonly input?: Readable; readonly output?: Writable } = {},
): Prompts => ({
  confirm: async ({ message, initial }) =>
    answer<boolean>(
      await confirm({ ...streams, message, initialValue: initial }),
    ),
  select: async ({ message, options, initial }) =>
    answer<string>(
      await select({
        ...streams,
        message,
        options: options.map((value) => ({ value, label: value })),
        initialValue: initial,
      }),
    ),
  text: async ({ message, placeholder }) =>
    answer<string>(
      await text({ ...streams, message, placeholder, defaultValue: "" }),
    ),
});
