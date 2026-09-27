/**
 * texToMdast / texLanguage on the shapes the harness does not carry: a `thebibliography`
 * environment, a float on the file's last line with no newline after it, a heading whose title
 * holds a macro, an unknown macro in prose, and a parse that fails.
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

test("a body that cannot be read is a parse failure, not a throw", () => {
  const r = texLanguage.parse({
    body: {
      toString() {
        throw new Error("unreadable");
      },
    },
  });
  assert.deepEqual(
    [r.ok, r.errors.map((e) => e.message)],
    [false, ["unreadable"]],
  );
});
