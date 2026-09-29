/**
 * Where a source changes the page layout its class sets for the whole document — the input of
 * `format/layout-override`. Read from the parse tree, never the text: a command in a comment is not
 * a command.
 *
 * What counts, each by its node:
 *
 *   \usepackage{geometry} · \RequirePackage{…,geometry}   the package that re-sets the margins
 *   \geometry{…} · \newgeometry{…}                        its commands
 *   \setlength / \addtolength on a layout length          \textheight \textwidth \topmargin …
 *   \linespread{…} · \renewcommand{\baselinestretch}      the line spacing
 *
 * Local spacing — a negative `\vspace` or `\vskip` around one float — is not a layout the template
 * sets, and no venue's call names it; it is not read.
 *
 * A comment and a `comment` environment are not read — the parser hands both back as text, not
 * macros. Everything else is — the bibliography, math, floats — and a macro definition too: a
 * `\newcommand` whose body sets a layout length does so wherever it is used. Conditionals are not
 * evaluated.
 */
import type { LayoutOverride } from "../../domain/tex-document.ts";
import {
  collapse,
  isList,
  macroPlace,
  mandatory,
  textOf,
  visited,
  type Macro,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";

/** The lengths the class sets for the page and the line; changing one changes the venue's layout. */
export const LAYOUT_LENGTHS: ReadonlySet<string> = new Set([
  "textheight",
  "textwidth",
  "topmargin",
  "oddsidemargin",
  "evensidemargin",
  "columnsep",
  "headsep",
  "headheight",
  "footskip",
  "baselineskip",
]);

/** The macro a mandatory argument holds first, or undefined: `{\textheight}` → `textheight`. */
function firstMacro(m: Macro, i: number): string | undefined {
  const first = mandatory(m)[i]?.content.find((n) => n.type !== "whitespace");
  return first?.type === "macro" ? first.content : undefined;
}

const argText = (m: Macro, i: number): string =>
  collapse(textOf(mandatory(m)[i]?.content));

/** What names a macro that overrides the layout; null: this use of it does not. */
type Namer = (m: Macro) => string | null;

const usesGeometry: Namer = (m) =>
  argText(m, 0)
    .split(",")
    .map((p) => p.trim())
    .includes("geometry")
    ? `\\${m.content}{geometry}`
    : null;

const setsLayoutLength: Namer = (m) => {
  const length = firstMacro(m, 0);
  return length !== undefined && LAYOUT_LENGTHS.has(length)
    ? `\\${m.content}{\\${length}}`
    : null;
};

/** Each macro that may override the layout, and how to tell whether this use of it does. */
const OVERRIDES: ReadonlyMap<string, Namer> = new Map<string, Namer>([
  ["usepackage", usesGeometry],
  ["RequirePackage", usesGeometry],
  ["geometry", (m) => `\\${m.content}`],
  ["newgeometry", (m) => `\\${m.content}`],
  ["linespread", (m) => `\\linespread{${argText(m, 0)}}`],
  ["setlength", setsLayoutLength],
  ["addtolength", setsLayoutLength],
  [
    "renewcommand",
    (m) =>
      firstMacro(m, 0) === "baselinestretch"
        ? "\\renewcommand{\\baselinestretch}"
        : null,
  ],
]);

/** How a message names a macro that overrides the layout, or null when it does not. */
const overrideOf: Namer = (m) => OVERRIDES.get(m.content)?.(m) ?? null;

/** Every layout override in the source, in document order. */
export function layoutOverridesOf(t: ParsedTex): readonly LayoutOverride[] {
  // Nothing is pruned: a comment, and a `comment` environment, reach the tree as leaves of text.
  const lists = visited(t.root, () => false).filter(isList);
  return lists.flatMap((list) =>
    list.flatMap((n) => {
      if (n.type !== "macro") return [];
      const command = overrideOf(n);
      return command === null ? [] : [{ command, place: macroPlace(n) }];
    }),
  );
}
