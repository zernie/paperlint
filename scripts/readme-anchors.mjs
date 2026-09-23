#!/usr/bin/env node
/**
 * Every `README.md#<anchor>` named in a CODE COMMENT resolves to a real heading of README.md.
 *
 * 🔴 WHY. The code that implements what the README documents (`rpp init`, `rpp new`) carries a
 * one-line pointer at its defining spot — "Documented in README.md#<anchor> — update it when
 * this changes." The pointer is only worth anything while the anchor exists: rename the heading
 * and the pointer silently leads nowhere, which is the same state as having no pointer, except
 * that it looks like one. So the pointer is CHECKED, not trusted.
 *
 * HOW, and why each half is a parser rather than a pattern over the file:
 *   - comments are found with the TypeScript parser, so a string literal that happens to hold
 *     the same text is NOT a pointer (a harness that plants a bad anchor in a string must not
 *     turn this red), and a comment is found wherever it sits;
 *   - headings come from markdown-it, and their anchors from `github-slugger` — the algorithm
 *     GitHub itself uses — so a heading with inline code or punctuation gets the anchor a reader
 *     will actually click, not one this file guessed.
 * Inside ONE comment, the pointer is one lexeme; finding it there is not parsing anything.
 *
 * ⚠️ ZERO POINTERS IS A FAILURE, not a pass: a check that found nothing to check is
 * indistinguishable from one that checked everything (CLAUDE.md, rule 4).
 */
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import MarkdownIt from "markdown-it";
import GithubSlugger from "github-slugger";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CODE = new Set([".ts", ".mts", ".mjs", ".js", ".cjs"]);
/** Not code of this package: installed trees, build output, test inputs, evidence kept as run. */
const SKIP = new Set(["node_modules", ".git", "dist", "fixtures", ".claude"]);
const SKIP_PATHS = new Set([join("docs", "prior-art", "repro")]);

/** The anchors GitHub renders for README.md's headings, in document order. */
export function anchorsOf(markdown) {
  const md = new MarkdownIt();
  const slugger = new GithubSlugger();
  const out = [];
  const toks = md.parse(markdown, {});
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type !== "heading_open") continue;
    // The heading's TEXT as rendered: inline code keeps its content, markup goes.
    const text = (toks[i + 1]?.children ?? [])
      .filter((c) => c.type === "text" || c.type === "code_inline")
      .map((c) => c.content)
      .join("");
    out.push(slugger.slug(text));
  }
  return out;
}

/** Every comment's text in a JS/TS source, found by the parser. */
export function commentsOf(source, fileName = "x.ts") {
  const kind =
    extname(fileName) === ".ts" || extname(fileName) === ".mts"
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const found = new Map();
  const take = (ranges) => {
    for (const r of ranges ?? [])
      found.set(r.pos, {
        text: source.slice(r.pos, r.end),
        line: sf.getLineAndCharacterOfPosition(r.pos).line + 1,
      });
  };
  const visit = (node) => {
    take(ts.getLeadingCommentRanges(source, node.pos));
    take(ts.getTrailingCommentRanges(source, node.end));
    // getChildren, not forEachChild: it includes TOKENS, so a comment before a closing brace —
    // attached to no statement — is still reached.
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  return [...found.values()];
}

/** The README pointers inside comment texts. `docs/README.md#x` is another file's anchor. */
export function pointersIn(comments) {
  const out = [];
  for (const c of comments)
    for (const m of c.text.matchAll(/(?<![\w./-])README\.md#([\w-]+)/g))
      out.push({ anchor: m[1], line: c.line });
  return out;
}

/** Every code file of the package, repository-relative. */
export function codeFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const rel = relative(root, p);
      if (SKIP.has(e) || SKIP_PATHS.has(rel)) continue;
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (CODE.has(extname(e))) out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}

/** @returns {{ pointers: {file,line,anchor}[], broken: {file,line,anchor}[] }} */
export function checkAnchors(root = ROOT) {
  const anchors = new Set(
    anchorsOf(readFileSync(join(root, "README.md"), "utf8")),
  );
  const pointers = [];
  for (const file of codeFiles(root)) {
    const source = readFileSync(join(root, file), "utf8");
    for (const p of pointersIn(commentsOf(source, file)))
      pointers.push({ file, ...p });
  }
  return { pointers, broken: pointers.filter((p) => !anchors.has(p.anchor)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // An optional root, so the harness can run the real entry point over a planted tree.
  const { pointers, broken } = checkAnchors(process.argv[2] ?? ROOT);
  if (pointers.length === 0) {
    console.error(
      "🔴 no `README.md#<anchor>` pointer found in any code comment — nothing was checked, " +
        "which is not the same as everything passing",
    );
    process.exit(1);
  }
  if (broken.length > 0) {
    console.error(
      "🔴 code comments point at README anchors that do not exist:",
    );
    for (const b of broken)
      console.error(`  ${b.file}:${String(b.line)}  README.md#${b.anchor}`);
    console.error(
      "\n  Rename the anchor in the comment, or restore the heading — the pointer is how the " +
        "next person finds the prose to update.",
    );
    process.exit(1);
  }
  console.log(
    `✓ ${String(pointers.length)} README pointer(s) in code comments, every anchor resolves: ` +
      pointers.map((p) => `${p.file} → #${p.anchor}`).join(", "),
  );
}
