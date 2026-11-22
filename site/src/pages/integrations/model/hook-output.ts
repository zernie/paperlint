// What the `lint-edited` hook showed Claude Code after one edit, split into the lines the replay on
// /integrations colours. The text is hook-example.json, which src/lint-edited-site-example.test.ts at
// the repository root compares with what the real hook prints for that edit.

import example from "./hook-example.json";

export type HookLine =
  | { readonly kind: "file"; readonly text: string }
  | {
      readonly kind: "finding";
      readonly at: string;
      readonly level: "error" | "warning";
      readonly message: string;
      readonly rule: string;
    }
  | { readonly kind: "blank" }
  | { readonly kind: "text"; readonly text: string };

const FINDING = /^\s+(\d+:\d+)\s+(error|warning)\s+(.*?)\s{2,}(\S+)\s*$/;

/** One line of the hook's output: the file it names first, a finding, a blank, or its own words. */
const line = (text: string, i: number): HookLine => {
  const m = FINDING.exec(text);
  const [at = "", level = "", message = "", rule = ""] = m?.slice(1) ?? [];
  return i === 0
    ? { kind: "file", text }
    : m !== null
      ? {
          kind: "finding",
          at,
          level: level === "warning" ? "warning" : "error",
          message,
          rule,
        }
      : text === ""
        ? { kind: "blank" }
        : { kind: "text", text };
};

/** The hook's output, line by line; throws when it holds no finding, so the build fails. */
export const hookLines = (reason: string): readonly HookLine[] => {
  const lines = reason.split("\n").map(line);
  return lines.some((l) => l.kind === "finding")
    ? lines
    : ((): never => {
        throw new Error(
          "site: the lint-edited example holds no finding — update site/src/pages/integrations/model/hook-example.json",
        );
      })();
};

/** The example the page shows: the file the edit wrote, and what the hook printed. */
export const hookExample = {
  file: example.file,
  lines: hookLines(example.reason),
} as const;
