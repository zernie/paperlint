/**
 * Three facts read off the parse tree for the changelist (`src/changelist.ts`) and `versions diff`:
 * the keys a source cites, the numbers it registers with `\num`, `\SI` and their kin, and the text latexdiff
 * marked deleted. The first reads the main tree, where the citation macros carry their arguments
 * (`parse.ts`). The other two parse with macros the main parser does not sign (siunitx's, `\DIFdel`), a second parser so that signing them changes nothing the prose rules read.
 */
import { getParser } from "@unified-latex/unified-latex-util-parse";
import { once } from "remeda";
import { CITATION_MACROS } from "../../domain/citation-macros.ts";
import { collapse } from "../../domain/tex-document.ts";
import {
  isNode,
  mandatory,
  stringText,
  textOf,
  visited,
  type Macro,
  type Node,
} from "./nodes.ts";
import type { ParsedTex } from "./parse.ts";

const factParser = once(() =>
  getParser({
    macros: {
      num: { signature: "o m" },
      SI: { signature: "o m o m" },
      qty: { signature: "o m m" },
      numrange: { signature: "o m m" },
      SIrange: { signature: "o m m o m" },
      qtyrange: { signature: "o m m m" },
    },
  }),
);

/** Every macro of a tree called one of `names`, in document order. */
const macrosNamed = (
  // eslint-disable-next-line functional/prefer-immutable-types -- visit's own parameter type is mutable
  tree: Parameters<typeof visited>[0],
  names: ReadonlySet<string>,
): readonly Macro[] =>
  visited(tree, () => false).flatMap((v) =>
    isNode(v) && v.type === "macro" && names.has(v.content) ? [v] : [],
  );

/** The keys every citation macro of the source names: its last mandatory argument, split at commas. */
export const citeKeysOf = (t: ParsedTex): readonly string[] =>
  macrosNamed(t.root, CITATION_MACROS).flatMap((m) =>
    textOf(mandatory(m).at(-1)?.content)
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k !== ""),
  );

/** How many leading mandatory arguments of a siunitx macro are numbers: the rest is a unit. */
const NUMBER_ARGUMENTS: ReadonlyMap<string, number> = new Map([
  ["num", 1],
  ["SI", 1],
  ["qty", 1],
  ["numrange", 2],
  ["SIrange", 2],
  ["qtyrange", 2],
]);

/** The numbers siunitx macros typeset: the leading mandatory arguments of \num, \SI, \qty and their ranges. */
export const registeredNumbersOf = (src: string): readonly string[] =>
  macrosNamed(
    factParser().parse(src),
    new Set(NUMBER_ARGUMENTS.keys()),
  ).flatMap((m) =>
    mandatory(m)
      .slice(0, NUMBER_ARGUMENTS.get(m.content))
      .map((a) => collapse(textOf(a.content)))
      .filter((n) => n !== ""),
  );

/** Control symbols (`\{`, `\\`) are text a reader sees, written as they stand. */
const SYMBOLS: ReadonlySet<string> = new Set([
  "{",
  "}",
  "\\",
  "%",
  "&",
  "#",
  "$",
  "_",
]);

/** What a stretch says: its words, its control symbols as written, its groups unwrapped. */
function stretchText(nodes: readonly Node[]): string {
  return nodes
    .map((n) => {
      if (n.type === "string") return stringText(n.content);
      if (n.type === "whitespace" || n.type === "parbreak") return " ";
      if (n.type === "group") return stretchText(n.content);
      return n.type === "macro" && SYMBOLS.has(n.content)
        ? `\\${n.content}`
        : textOf([n]);
    })
    .join("");
}

/** One parser per set of macro names, each signed with one mandatory argument: building a parser compiles its grammar. */
const parsers = new Map<string, ReturnType<typeof getParser>>();
const parserFor = (names: readonly string[]) => {
  const key = [...names].sort().join(" ");
  const hit = parsers.get(key);
  const made =
    hit ??
    getParser({
      macros: Object.fromEntries(names.map((n) => [n, { signature: "m" }])),
    });
  // eslint-disable-next-line functional/immutable-data -- the memo, see above
  parsers.set(key, made);
  return made;
};

/** The text of the first argument of each macro called one of `names`, whitespace collapsed, empty ones left out. */
export const macroTextsOf = (
  src: string,
  names: readonly string[],
): readonly string[] =>
  macrosNamed(parserFor(names).parse(src), new Set(names)).flatMap((m) =>
    mandatory(m)
      .slice(0, 1)
      .map((a) => collapse(stretchText(a.content)))
      .filter((t) => t !== ""),
  );
