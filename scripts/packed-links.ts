/**
 * Every relative link in a Markdown file the package ships must lead to a file the package ships.
 *
 * "Ships" is the pack list — what `npm pack` would put in the tarball from `files` in package.json —
 * not the repository: a link to a sibling of the package, to a file `files` leaves out, or to a
 * directory of another project resolves for the author and is broken for every reader of the
 * published package (#187). The list is read from `npm pack --dry-run --json`, so the check moves with
 * the definition of the package instead of keeping a second list.
 *
 * A link with a scheme (`https:`, `mailto:`), a link to an anchor of the same file (`#x`), and a
 * link whose target is generated text rather than a path are not relative links and are not read.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import { z } from "zod";

/** One relative link that does not lead to a shipped file. */
export interface BrokenLink {
  /** The shipped Markdown file that holds the link, relative to the package. */
  readonly file: string;
  readonly line: number;
  /** The link as written. */
  readonly href: string;
  /** Where it leads, relative to the package; starts with `..` when that is outside it. */
  readonly target: string;
}

/** The href of every link and image of `markdown`, with the line it is on. */
export const hrefsOf = (
  markdown: string,
): readonly { readonly href: string; readonly line: number }[] =>
  new MarkdownIt()
    .parse(markdown, {})
    .filter(
      (block): block is Token & { readonly map: [number, number] } =>
        block.map !== null,
    )
    .flatMap((block) =>
      (block.children ?? []).flatMap((t) => {
        const href =
          t.type === "link_open"
            ? t.attrGet("href")
            : t.type === "image"
              ? t.attrGet("src")
              : null;
        return href === null ? [] : [{ href, line: block.map[0] + 1 }];
      }),
    );

/** A target that is a path relative to the file: no scheme, not an anchor of the same file, not root-absolute. */
const isRelative = (href: string): boolean =>
  !/^[a-z][a-z0-9+.-]*:/iu.test(href) &&
  !href.startsWith("#") &&
  !href.startsWith("/");

/** The path `href` names from the directory of `file`, without its fragment or query. */
const targetOf = (file: string, href: string): string =>
  posix.normalize(
    posix.join(posix.dirname(file), decoded(href.split(/[#?]/u, 1).join(""))),
  );

/** `path` with its percent-escapes decoded; as written when they are malformed. */
const decoded = (path: string): string => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

/**
 * The relative links of the shipped Markdown `texts` (by path in the package) that lead outside the
 * package or to a path `shipped` does not list; a directory is shipped when a file under it is.
 */
export const brokenLinks = (
  texts: ReadonlyMap<string, string>,
  shipped: ReadonlySet<string>,
): readonly BrokenLink[] =>
  [...texts].flatMap(([file, text]) =>
    hrefsOf(text)
      .filter(({ href }) => isRelative(href))
      .map(({ href, line }) => ({
        file,
        line,
        href,
        target: targetOf(file, href),
      }))
      .filter(
        ({ target }) =>
          target === ".." ||
          target.startsWith("../") ||
          !(
            shipped.has(target) ||
            [...shipped].some((p) => p.startsWith(`${target}/`))
          ),
      ),
  );

/** What to tell the author of `b`: which file, which link, where it leads, and what to do. */
export const brokenLinkMessage = (b: BrokenLink): string => {
  const outside = b.target === ".." || b.target.startsWith("../");
  const where = outside
    ? `outside the package (${b.target})`
    : `to \`${b.target}\`, which the package does not ship`;
  return `${b.file}:${String(b.line)}: the link \`${b.href}\` leads ${where}, so it is broken in the published package. Rewrite it as text that names the source, link the public repository's URL, or — for a file that should ship — add it to \`files\` in package.json.`;
};

const Pack = z.array(
  z.object({ files: z.array(z.object({ path: z.string() })) }),
);

/** The paths `npm pack` would put in the tarball of the package at `root`, without running its lifecycle scripts. */
export const packedPaths = (root: string): ReadonlySet<string> => {
  const r = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  if (r.status !== 0)
    throw new Error(
      `npm pack --dry-run failed (exit ${String(r.status)}): ${r.stderr}`,
    );
  return new Set(
    Pack.parse(JSON.parse(r.stdout)).flatMap((p) => p.files.map((f) => f.path)),
  );
};

/** The messages for every broken relative link in the Markdown the package at `root` ships. */
export const packedLinkProblems = (
  root: string,
  shipped: ReadonlySet<string> = packedPaths(root),
): readonly string[] => {
  const texts = new Map(
    [...shipped]
      .filter((p) => p.endsWith(".md"))
      .map((p) => [p, readFileSync(join(root, p), "utf8")] as const),
  );
  return brokenLinks(texts, shipped).map(brokenLinkMessage);
};
