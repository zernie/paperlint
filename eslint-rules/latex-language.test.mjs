/**
 * texToMdast / texLanguage on the shapes the harness does not carry: a `thebibliography`
 * environment, a float on the file's last line with no newline after it, a heading whose title
 * holds a macro, an unknown macro in prose, and a parse that fails (nesting deep enough to exhaust the parser).
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { texLanguage, texToMdast } from "./latex-language.mjs";

/** The projection plus each node's type, lang/title and start–end offsets. */
const project = (src) => {
  const { root, text } = texToMdast(src);
  return {
    text,
    nodes: root.children.map((c) => [
      c.type,
      c.lang ?? c.title,
      c.position.start.offset,
      c.position.end.offset,
    ]),
  };
};

test("thebibliography: a References heading over `\\begin`, the rest one blanked code node", () => {
  assert.deepEqual(
    project(
      "\\begin{thebibliography}{9}\n\\bibitem{a} A.\n\\end{thebibliography}\n",
    ),
    {
      text: "## References             \n              \n                     \n",
      nodes: [
        ["heading", "References", 0, 13],
        ["code", "thebibliography", 14, 63],
      ],
    },
  );
});

test("a float on the last line with no newline after it ends at the end of the file", () => {
  assert.deepEqual(project("x\n\\begin{table}y\\end{table}"), {
    text: "x\n                         ",
    nodes: [["code", "table", 2, 27]],
  });
});

test("a heading's title drops an argument-less macro inside it; an unknown macro in prose loses only its name", () => {
  assert.deepEqual(
    project("\\section{A \\LaTeX{} b}\nsome \\foo{bar} text\n"),
    {
      text: "##               A  b \nsome     {bar} text\n",
      nodes: [["heading", "A  b", 0, 22]],
    },
  );
});

test("a heading's title keeps the text of a macro with an argument", () => {
  assert.deepEqual(project("\\section{A \\emph{b} c}\n"), {
    text: "##              A b c \n",
    nodes: [["heading", "A b c", 0, 22]],
  });
});

test("a body the parser cannot take (nesting deep enough to exhaust its stack) is a parse failure, not a throw", () => {
  const r = texLanguage.parse({ body: "{".repeat(20_000) });
  assert.deepEqual(
    [r.ok, r.errors.map((e) => e.constructor.name)],
    [false, ["RangeError"]],
  );
});

/** A node position on line 1, from offset `a` to offset `b`. */
const at = (a, b) => ({
  start: { offset: a, line: 1, column: a + 1 },
  end: { offset: b, line: 1, column: b + 1 },
});

test("node shapes today's parser never emits are read, not thrown on", () => {
  // Each node lacks what unified-latex always gives: `args`, an argument's `content`, a string `env`.
  const src = " ".repeat(200);
  const ast = {
    type: "root",
    content: [
      // a heading macro with no args at all: an empty title
      { type: "macro", content: "section", position: at(0, 8) },
      // a heading whose title holds a macro whose argument has no content
      {
        type: "macro",
        content: "subsection",
        position: at(10, 40),
        args: [
          {
            type: "argument",
            openMark: "{",
            closeMark: "}",
            content: [
              { type: "string", content: "T", position: at(22, 23) },
              { type: "macro", content: "emph", args: [{ type: "argument" }] },
            ],
          },
        ],
      },
      // an environment named by nodes rather than a string
      {
        type: "environment",
        env: [{ type: "string", content: "abstract" }],
        content: [],
        position: at(50, 80),
      },
      // a float whose caption has no args, and whose footnote's argument has no content
      {
        type: "environment",
        env: "table",
        position: at(90, 120),
        content: [
          { type: "macro", content: "caption", position: at(95, 100) },
          {
            type: "macro",
            content: "footnote",
            position: at(101, 110),
            args: [{ type: "argument" }],
          },
        ],
      },
      // texttt and a first-column textbf with no args; an ordinary macro whose argument is empty
      { type: "macro", content: "texttt", position: at(125, 132) },
      {
        type: "macro",
        content: "textbf",
        position: {
          start: { offset: 133, line: 2, column: 1 },
          end: { offset: 140, line: 2, column: 8 },
        },
      },
      {
        type: "macro",
        content: "foo",
        position: at(141, 150),
        args: [{ type: "argument" }],
      },
      // the same macros with an argument that has no content
      {
        type: "macro",
        content: "subsubsection",
        position: at(170, 180),
        args: [{ type: "argument", openMark: "{", closeMark: "}" }],
      },
      {
        type: "macro",
        content: "texttt",
        position: at(181, 185),
        args: [{ type: "argument" }],
      },
      {
        type: "macro",
        content: "emph",
        position: {
          start: { offset: 186, line: 3, column: 1 },
          end: { offset: 190, line: 3, column: 5 },
        },
        args: [{ type: "argument" }],
      },
      // `\bibliography` squeezed into one character: too short for `## References`, so no heading
      { type: "macro", content: "bibliography", position: at(160, 160) },
      // a node the walk meets without a position
      { type: "environment", env: "abstract", content: [] },
    ],
  };
  const { root } = texToMdast(src, { parse: () => ast });
  assert.deepEqual(
    root.children.map((c) => [c.type, c.title ?? c.lang ?? ""]),
    // Sorted by offset: the float's code node starts at its (single) line's start.
    [
      ["heading", ""],
      ["code", "table"],
      ["heading", "T"],
      ["heading", "Abstract"],
      ["strong", ""],
      ["heading", ""],
      ["strong", ""],
    ],
  );
});

test("a source code made from a parse result without the raw text reads the projection; parents are recorded", () => {
  const body = "\\section{A}\n";
  const parsed = texLanguage.parse({ body });
  const code = texLanguage.createSourceCode(
    { body },
    { ast: parsed.ast, projected: parsed.projected },
  );
  const [heading] = parsed.ast.children;
  assert.deepEqual(
    [
      code.raw === parsed.projected,
      code.getParent(parsed.ast),
      code.getParent(heading) === parsed.ast,
    ],
    [true, undefined, true],
  );
});
