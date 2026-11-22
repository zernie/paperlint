import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { clackPrompts } from "./index.ts";

/** Clack over in-memory streams: the keys are typed once the prompt has drawn itself. */
const typed = (...keys: readonly string[]) => {
  const input = new PassThrough();
  const output = new PassThrough();
  Object.assign(input, { isTTY: true, setRawMode: () => input });
  output.on("data", () => undefined);
  setTimeout(() => {
    for (const k of keys) input.write(k);
  }, 20);
  return clackPrompts({ input, output });
};

const ENTER = "\r";
const DOWN = "\u001b[B";
const CTRL_C = "\u0003";

describe("clackPrompts — the Prompts port over @clack/prompts", () => {
  it("confirm: Enter takes the initial value, `n` answers no", async () => {
    expect(
      await typed(ENTER).confirm({ message: "q?", initial: true }),
    ).toEqual({ kind: "answer", value: true });
    expect(
      await typed("n", ENTER).confirm({ message: "q?", initial: true }),
    ).toEqual({ kind: "answer", value: false });
  });

  it("select: the arrow moves off the initial option", async () => {
    expect(
      await typed(DOWN, ENTER).select({
        message: "which?",
        options: ["a", "b", "c"],
        initial: "a",
      }),
    ).toEqual({ kind: "answer", value: "b" });
  });

  it("text: what was typed; an empty line is the empty string", async () => {
    expect(
      await typed("draft", ENTER).text({
        message: "name?",
        placeholder: "skip",
      }),
    ).toEqual({ kind: "answer", value: "draft" });
    expect(
      await typed(ENTER).text({ message: "name?", placeholder: "skip" }),
    ).toEqual({ kind: "answer", value: "" });
  });

  it("🔴 Ctrl+C is a cancel, never an answer", async () => {
    expect(
      await typed(CTRL_C).confirm({ message: "q?", initial: true }),
    ).toEqual({ kind: "cancel" });
  });
});
