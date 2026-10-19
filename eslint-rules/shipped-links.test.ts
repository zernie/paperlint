/**
 * `package/md-link-shipped` (eslint-rules/shipped-links.ts) on real ESLint, the Markdown language and
 * a pack list given by the test: silent on a link that leads to a shipped file, and loud — at the
 * link's own line and column, with the link, where it leads and the way out — on a link that leaves
 * the package, leads to a file the pack list leaves out, is a root path, or is written as raw HTML.
 * The last test lints every Markdown file the real package ships.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import { describe, expect, it } from "vitest";
import { spawnProcess } from "../src/adapters/node/index.ts";
import { packedPaths } from "../src/pack-list.ts";
import shippedLinks from "./shipped-links.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RULE = "package/md-link-shipped";
const SHIPPED = new Set([
  "README.md",
  "docs/a.md",
  "docs/rules/c.md",
  "docs/nowhere-ship.md",
  "docs/rules/tex/b.md",
  "skills/x/SKILL.md",
  "skills/x/references/r.md",
  "src/code.ts",
]);

/** An ESLint whose rule reads `shipped`, counting how many times it is asked for it. */
const linter = (shipped: () => ReadonlySet<string>) =>
  new ESLint({
    cwd: ROOT,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, package: shippedLinks({ root: ROOT, shipped }) },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { [RULE]: "error" },
      },
    ],
  });

/** What the rule says of `text` as the file `path` of the package: `line:column` and the message's first words. */
async function found(
  text: string,
  path = "docs/rules/c.md",
  shipped: () => ReadonlySet<string> = () => SHIPPED,
): Promise<string[]> {
  const [res] = await linter(shipped).lintText(text, {
    filePath: join(ROOT, path),
  });
  expect(res?.messages.filter((m) => m.fatal)).toEqual([]);
  return (res?.messages ?? [])
    .filter((m) => m.ruleId === RULE)
    .map((m) => `${String(m.line)}:${String(m.column)} ${m.message}`);
}

const WAYS_OUT =
  "Rewrite it as text that names the source, link the public repository's URL, or — for a file that should ship — add it to `files` in package.json.";

describe("package/md-link-shipped — loud", () => {
  it("a link out of the package, at its own line and column: the link, where it leads, why, the ways out", async () => {
    expect(
      await found(
        "# r\n\nSee [the source](../../../../other-project/notes.md) for more.\n",
        "skills/x/references/r.md",
      ),
    ).toEqual([
      `3:5 The link \`../../../../other-project/notes.md\` leads outside the package (../other-project/notes.md), so it is broken in the published package. ${WAYS_OUT}`,
    ]);
  });

  it("a link to a file the pack list leaves out", async () => {
    expect(
      await found(
        "[x](../../../fixtures/accepted-papers/README.md)",
        "docs/rules/tex/b.md",
      ),
    ).toEqual([
      `1:1 The link \`../../../fixtures/accepted-papers/README.md\` leads to \`fixtures/accepted-papers/README.md\`, which the package does not ship, so it is broken in the published package. ${WAYS_OUT}`,
    ]);
  });

  it("a root-absolute link, even to a file the package ships", async () => {
    expect(await found("See [a](/docs/a.md#top).")).toEqual([
      "1:5 The link `/docs/a.md#top` is a root path, which a reader of the package cannot follow from the file that holds it, so it is broken in the published package. Rewrite it as a path relative to the file, link the public repository's URL, or — for a file that should ship — add it to `files` in package.json.",
    ]);
  });

  it("an image, and a reference-style link at its definition", async () => {
    // Guards: an image is a link too, and a reference is judged once, where it is defined.
    expect(
      await found(
        "![fig](gone.png)\n\n[ref][1] and [again][1]\n\n[1]: ../nowhere.md\n",
      ),
    ).toEqual([
      expect.stringMatching(
        /^1:1 The link `gone\.png` leads to `docs\/rules\/gone\.png`/u,
      ),
      expect.stringMatching(
        /^5:1 The link `\.\.\/nowhere\.md` leads to `docs\/nowhere\.md`/u,
      ),
    ]);
  });

  it("raw HTML: an anchor and an image, at the attribute, on a later line of a block too", async () => {
    const html = [
      'Inline <a href="../../../other/notes.md">notes</a> and <img src="gone.png">.',
      "",
      "<div>",
      '  <p><a href="missing.md#top">x</a> <a href="https://example.org/y">y</a> <a href="../a.md">ok</a></p>',
      "</div>",
    ].join("\n");
    expect((await found(html)).map((m) => m.split(" leads")[0])).toEqual([
      "1:11 The link `../../../other/notes.md`",
      "1:61 The link `gone.png`",
      "4:9 The link `missing.md#top`",
    ]);
  });
});

describe("package/md-link-shipped — quiet", () => {
  it("links that stay inside the pack list, URLs, protocol-relative URLs, anchors and mail links", async () => {
    const text = [
      "[a](../a.md) [b](tex/b.md#heading) [c](./../a.md?plain=1) [d](../../skills/x)",
      "[u](https://example.org/x) [m](mailto:a@b.c) [h](#here) [p](//example.org/x)",
      "Autolink literals: www.example.org and you@example.org, <https://example.org/z>.",
      '<span class="x">no link</span> <a href="../a.md">ok</a>',
    ].join("\n");
    expect(await found(text)).toEqual([]);
  });

  it("a link with no path — only a query or a fragment, or nothing — leads to the file itself, at the root too", async () => {
    // Guards: joining "." and "" is `.`, which no pack list holds; a valid link failed the check.
    expect([
      await found("[v](?plain=1) [e]() [f](?a=1#top)", "README.md"),
      await found("[v](?plain=1)", "docs/a.md"),
    ]).toEqual([[], []]);
  });

  it("an invalid percent-escape is read as written, not thrown at", async () => {
    expect(
      (await found("[x](%ff.md)")).map((m) => m.split(" leads")[0]),
    ).toEqual(["1:1 The link `%ff.md`"]);
  });

  it("a Markdown file the package does not ship is not judged, and the pack list is not asked for", async () => {
    // Guards: the list is read when a shipped-looking link needs it, and a file outside it passes.
    expect(await found("[x](../nowhere.md)", "test/fixtures/x.md")).toEqual([]);
    expect(
      await found("# no links here\n", "docs/a.md", () => {
        throw new Error("asked for the pack list by a file with no link");
      }),
    ).toEqual([]);
  });
});

describe("package/md-link-shipped — in the repository's own config", () => {
  it("is an error on a shipped Markdown file, and the file's own text is clean", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const own = readFileSync(join(ROOT, "docs/rules.md"), "utf8");
    const at = (text: string) =>
      eslint.lintText(text, { filePath: join(ROOT, "docs/rules.md") });
    const [clean] = await at(own);
    const [planted] = await at(`${own}\n[x](../../outside/notes.md)\n`);
    const ours = (r: typeof clean) =>
      r?.messages.filter((m) => m.ruleId === RULE) ?? [];
    // Guards: registered at `error` for every Markdown file, through the config the repository lints with.
    expect([
      ours(clean).length,
      ours(planted).map((m) => [m.severity, m.message.split(" leads")[0]]),
    ]).toEqual([0, [[2, "The link `../../outside/notes.md`"]]]);
  }, 120_000);
});

describe("package/md-link-shipped — the real package", () => {
  it("every Markdown file the package ships links only to files it ships", async () => {
    const shipped = packedPaths(spawnProcess(), ROOT, {
      PATH: String(process.env["PATH"]),
      HOME: String(process.env["HOME"]),
    });
    const files = [...shipped].filter((p) => p.endsWith(".md"));
    const eslint = linter(() => shipped);
    // One file at a time: the shared instance builds its config once, then lints each in turn.
    const broken: string[] = [];
    for (const p of files) {
      const [r] = await eslint.lintText(readFileSync(join(ROOT, p), "utf8"), {
        filePath: join(ROOT, p),
      });
      for (const m of r?.messages ?? [])
        if (m.ruleId === RULE)
          broken.push(`${p}:${String(m.line)} ${m.message}`);
    }
    // Guards: the files were found (not an empty set that passes), and none is broken.
    expect(files.length).toBeGreaterThan(100);
    expect(broken).toEqual([]);
  }, 120_000);
});
