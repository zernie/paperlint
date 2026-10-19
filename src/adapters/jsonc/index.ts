/**
 * A venue preset's JSONC text with its `deadlines` rewritten — the `PresetRewriter` port over
 * TypeScript's JSON parser and Prettier. The block is found on the file's syntax tree and replaced;
 * everything else in the file, its comments above all, is left as it is, and Prettier formats the
 * result as `npm run fmt` would.
 *
 * Its own adapter because it exists for one format, JSONC with comments, and the two packages that
 * read and print it: if either changed, this folder would, and nothing else.
 */
import { format } from "prettier";
import ts from "typescript";
import type { Reading } from "../../domain/deadline.ts";
import type { PresetRewriter } from "../../ports/preset-files.ts";

/** The top-level property `name` of a JSONC object, on its syntax tree; undefined when absent. */
function property(
  file: Readonly<ts.JsonSourceFile>,
  name: string,
): Readonly<ts.PropertyAssignment> | undefined {
  const top = file.statements[0]?.expression;
  if (top === undefined || !ts.isObjectLiteralExpression(top)) return undefined;
  return top.properties
    .filter(ts.isPropertyAssignment)
    .find((p) => ts.isStringLiteral(p.name) && p.name.text === name);
}

/**
 * The preset's text with `deadlines` set to `readings`: the value replaced where the key is, or the
 * key inserted after `portal`. Formatted as the repository formats a preset.
 */
async function withDeadlines(
  text: string,
  file: string,
  readings: readonly Reading[],
): Promise<string> {
  const tree = ts.parseJsonText(file, text);
  const json = JSON.stringify(readings, null, 2);
  const held = property(tree, "deadlines");
  const spliced =
    held === undefined
      ? insertAfterPortal(tree, text, json)
      : text.slice(0, held.initializer.getStart(tree)) +
        json +
        text.slice(held.initializer.end);
  return format(spliced, { filepath: file });
}

/** `"deadlines": …` after the `portal` property — only a preset with a portal is ever refreshed. */
function insertAfterPortal(
  tree: Readonly<ts.JsonSourceFile>,
  text: string,
  json: string,
): string {
  const portal = property(tree, "portal");
  if (portal === undefined)
    throw new Error(`${tree.fileName}: no "portal" to put "deadlines" after`);
  return `${text.slice(0, portal.end)},\n\n  "deadlines": ${json}${text.slice(portal.end)}`;
}

/** The preset rewriter over TypeScript's JSON parser and Prettier. */
export const jsoncPresets: PresetRewriter = { withDeadlines };
