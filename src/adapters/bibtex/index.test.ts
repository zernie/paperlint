/**
 * The bibtex reader over @retorquere/bibtex-parser: where each entry stands, its fields as text, its
 * name lists as names, the `@string` and `@preamble` a copy is compared on, and an entry it cannot
 * finish. What bibtex reads beyond it is the post-build check's (src/references.ts), measured on the
 * planted papers in src/paper-sources.test.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { absolutePath } from "../../domain/paths.ts";
import { bibReader } from "./index.ts";

const PATH = absolutePath("/p/refs.bib");
const read = (text: string) => bibReader.readFile(PATH, text);

describe("the bibtex reader", () => {
  it("places each entry in the text, a block's within the file that holds it", () => {
    const tex =
      "\\begin{filecontents*}{refs.bib}\n@misc{a, title={A}}\n@Article(b, title={B})\n\\end{filecontents*}\n";
    const body = { start: tex.indexOf("@misc"), end: tex.indexOf("\\end") };
    const bib = bibReader.read(absolutePath("/p/paper.tex"), tex, body);
    expect(
      bib.entries.map((e) => [
        e.type,
        e.key,
        tex.slice(e.span.start, e.span.end),
      ]),
    ).toEqual([
      ["misc", "a", "@misc{a, title={A}}"],
      ["article", "b", "@Article(b, title={B})"],
    ]);
  });

  it("reads fields as text: LaTeX accents, a link, a list field joined", () => {
    const [e] = read(
      '@book{k, title={M{\\"u}ller}, howpublished={\\url{https://x.org}}, publisher={A and B}}',
    ).entries;
    // The parser writes `{\"u}` as u and a combining diaeresis: compared composed.
    expect(
      Object.fromEntries(
        Object.entries(e?.fields ?? {}).map(([k, v]) => [
          k,
          v.normalize("NFC"),
        ]),
      ),
    ).toEqual({
      title: "Müller",
      howpublished: '<a href="https://x.org">https://x.org</a>',
      publisher: "A and B",
    });
  });

  it("reads a name list as names: family part, particle, suffix, a literal kept whole", () => {
    const [e] = read(
      "@misc{k, author={Lovelace, Ada and von Neumann, Jr., John and {World Health Organization} and others}}",
    ).entries;
    expect(e?.names).toEqual({
      author: [
        { lastName: "Lovelace", firstName: "Ada" },
        {
          lastName: "Neumann",
          firstName: "John",
          prefix: "von",
          suffix: "Jr.",
        },
        { name: "World Health Organization" },
        { lastName: "others" },
      ],
    });
  });
});

describe("the bibtex reader — what a copy is compared on, and what it leaves to bibtex", () => {
  it("reads @string definitions and @preamble commands", () => {
    const bib = read(
      '@string{v = "Venue"}\n@preamble{"\\x"}\n@misc{k, note = v}',
    );
    expect([bib.strings, bib.preamble, bib.entries[0]?.fields]).toEqual([
      { V: "Venue" },
      ['"\\x"'],
      { note: "Venue" },
    ]);
  });

  it("an entry it cannot finish is no entry — bibtex reports that file (v6, exit 2)", () => {
    const text = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../fixtures/paper-sources/v6-unclosed/refs.bib",
      ),
      "utf8",
    );
    expect(read(text).entries.map((e) => e.key)).toEqual(["a1", "a3"]);
  });
});
