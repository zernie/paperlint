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
  it("reads @preamble commands, and expands each @string where an entry uses it", () => {
    const bib = read(
      '@string{v = "Venue"}\n@preamble{"\\x"}\n@misc{k, note = v}\n@string{v = "Later"}',
    );
    expect([bib.preamble, bib.entries[0]?.fields]).toEqual([
      ['"\\x"'],
      { note: "Venue" },
    ]);
  });

  it("keeps each entry as bibtex takes it: the value it used, LaTeX and braces as written, whitespace folded", () => {
    const bib = read(
      '@string{v = "Venue"}\n@Misc{k, note = v # " 2", author = {G{\\"o}del,   Kurt}, title = {{X}}, keywords = {b, a}}\n@string{v = "Later"}',
    );
    expect(bib.written).toEqual([
      {
        type: "misc",
        key: "k",
        fields: {
          note: "Venue 2",
          author: 'G{\\"o}del, Kurt',
          title: "{X}",
          keywords: "a, b",
        },
      },
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

describe("the bibtex reader — databases in sequence, as bibtex reads them", () => {
  // bibtex reads the databases of `\\bibliography{abbreviations,references}` one after the other, and an
  // `@string` the first defines is in force in the second (fixtures/paper-sources/v27-shared-string:
  // its .bbl typesets the expanded author and booktitle).
  const ABBR =
    '@string{venue = "Proceedings of the {\\"O}ld Venue"}\n@string{who = "Lovelace, Ada"}\n';
  const REFS =
    "@inproceedings{late, author = who, booktitle = venue # {, Main}}\n";
  const SECOND = absolutePath("/p/references.bib");

  it("🔴 an @string an earlier database defined is in force in a later one: read as one file holding both", () => {
    const first = read(ABBR);
    const second = bibReader.readFile(SECOND, REFS, first.strings);
    const whole = read(ABBR + REFS);
    expect([
      second.entries.map((e) => [e.fields, e.names]),
      second.written,
    ]).toEqual([whole.entries.map((e) => [e.fields, e.names]), whole.written]);
    expect(second.written[0]?.fields).toEqual({
      author: "Lovelace, Ada",
      booktitle: 'Proceedings of the {\\"O}ld Venue, Main',
    });
  });

  it("the @strings in force after a database are those before it and its own, a redefinition winning; a block reads with them too", () => {
    const first = read(ABBR);
    const second = bibReader.readFile(
      SECOND,
      '@string{venue = "Newer"}\n',
      first.strings,
    );
    expect([second.inherited, second.strings]).toEqual([
      first.strings,
      { VENUE: "Newer", WHO: "Lovelace, Ada" },
    ]);
    const tex = `\\begin{filecontents*}{refs.bib}\n${REFS}\\end{filecontents*}\n`;
    const body = { start: tex.indexOf("@"), end: tex.indexOf("\\end") };
    expect(
      bibReader.read(absolutePath("/p/paper.tex"), tex, body, second.strings)
        .written[0]?.fields.booktitle,
    ).toBe("Newer, Main");
  });

  it("read alone, a database has nothing inherited: a name no @string defines stays unresolved", () => {
    const alone = bibReader.readFile(SECOND, REFS);
    expect([alone.inherited, alone.strings]).toEqual([{}, {}]);
    expect(alone.written[0]?.fields.author).not.toBe("Lovelace, Ada");
  });
});
