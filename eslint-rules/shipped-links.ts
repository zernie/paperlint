/**
 * `package/md-link-shipped` — a link in a Markdown file the package ships must lead to a file the
 * package ships (#187).
 *
 * "Ships" is the pack list: what `npm pack` puts in the tarball from `files` in package.json
 * (`src/pack-list.ts`), not the repository. A link to a sibling of the package, to a file `files`
 * leaves out, or to a directory of another project resolves for the author and is broken for every
 * reader of the published package — and a `docs/` page once carried one for weeks. The rule reads the
 * list through `shipped`, a thunk the config memoises, so `npm pack` runs once per lint run and not
 * once per file; a file that holds no link never asks for it.
 *
 * WHAT IT READS. The `link`, `image` and `definition` nodes of the Markdown tree (a reference-style
 * link is judged where it is defined), and the `href` and `src` attributes of raw HTML, which
 * Markdown hands over as `html` nodes: they are read with an HTML parser (parse5), at the attribute.
 * A link with a scheme (`https:`, `mailto:`), a protocol-relative URL (`//host/x`) and a link to an
 * anchor of the same file (`#x`) are not paths in the package and are not read. A link with no path
 * before its query or fragment (`?plain=1`) leads to the file that holds it. A root path (`/x`) is
 * always broken: it resolves against a website's root, which a reader of the tarball does not have.
 *
 * A file that is not in the pack list is not judged.
 */
import { posix, relative, sep } from "node:path";
import type { Html, Image, Link, Definition } from "mdast";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { z } from "zod";
import type { RuleContext } from "./rule-context.ts";

/** What the rule reads with. */
export interface ShippedLinkDeps {
  /** The package's root: the pack list's paths are relative to it. */
  readonly root: string;
  /** The paths `npm pack` ships, relative to `root`. Called when a link needs it; memoised by the caller. */
  readonly shipped: () => ReadonlySet<string>;
}

type Verdict =
  | { readonly messageId: "outside"; readonly target: string }
  | { readonly messageId: "unshipped"; readonly target: string }
  | { readonly messageId: "root"; readonly target: string };

/** A link to a path: not a URL (a scheme, or `//host`), and not an anchor of the same file. */
const isPath = (href: string): boolean =>
  !/^[a-z][a-z0-9+.-]*:/iu.test(href) &&
  !href.startsWith("#") &&
  !href.startsWith("//");

/** `path` with its percent-escapes decoded; as written when they are malformed. */
const decoded = (path: string): string => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

/** The path `href` names from the directory of `file`; `file` itself when it names none before `?` or `#`. */
const targetOf = (file: string, href: string): string => {
  const path = decoded(href.split(/[#?]/u, 1).join(""));
  return path === ""
    ? file
    : posix.normalize(posix.join(posix.dirname(file), path));
};

/**
 * Why the link `href` in the shipped file `file` (relative to the package) is broken; null when it
 * leads to a shipped file, or is not a path.
 */
export const verdictOf = (
  file: string,
  href: string,
  shipped: ReadonlySet<string>,
): Verdict | null => {
  if (!isPath(href)) return null;
  if (href.startsWith("/")) return { messageId: "root", target: href };
  const target = targetOf(file, href);
  if (target === ".." || target.startsWith("../"))
    return { messageId: "outside", target };
  const ships =
    shipped.has(target) || [...shipped].some((p) => p.startsWith(`${target}/`));
  return ships ? null : { messageId: "unshipped", target };
};

/** A destination in the file, and where it starts and ends. */
interface Found {
  readonly href: string;
  readonly start: { readonly line: number; readonly column: number };
  readonly end: { readonly line: number; readonly column: number };
}

/** Where parse5 says an attribute of an element lies, when asked for locations (`sourceCodeLocationInfo`). */
const Place = z.object({
  startLine: z.number(),
  startCol: z.number(),
  endLine: z.number(),
  endCol: z.number(),
});
const PointSchema = z.object({ line: z.number(), column: z.number() });
const ElementPlace = z.object({
  attrs: z.record(z.string(), Place).default({}),
});

/** `href` and `src` of every element of the HTML `html` that starts at `at` in the file. */
const htmlHrefs = (
  html: string,
  at: { readonly line: number; readonly column: number },
): readonly Found[] => {
  // A point of the fragment as a point of the file: the first line continues the node's own.
  const point = (line: number, col: number) => ({
    line: at.line + line - 1,
    column: line === 1 ? at.column + col - 1 : col,
  });
  const visit = (
    node: Readonly<DefaultTreeAdapterMap["node"]>,
  ): readonly Found[] => [
    ...("attrs" in node
      ? Object.entries(ElementPlace.parse(node.sourceCodeLocation).attrs)
          .filter(([name]) => name === "href" || name === "src")
          .flatMap(([name, loc]) =>
            node.attrs
              .filter((a) => a.name === name)
              .map((a): Found => ({
                href: a.value,
                start: point(loc.startLine, loc.startCol),
                end: point(loc.endLine, loc.endCol),
              })),
          )
      : []),
    ...("childNodes" in node ? node.childNodes.flatMap(visit) : []),
  ];
  return visit(parseFragment(html, { sourceCodeLocationInfo: true }));
};

/** The package-relative, `/`-separated path of `filename`. */
const relativeTo = (root: string, filename: string): string =>
  relative(root, filename).split(sep).join("/");

const MESSAGES = {
  outside:
    "The link `{{href}}` leads outside the package ({{target}}), so it is broken in the published package. Rewrite it as text that names the source, link the public repository's URL, or — for a file that should ship — add it to `files` in package.json.",
  unshipped:
    "The link `{{href}}` leads to `{{target}}`, which the package does not ship, so it is broken in the published package. Rewrite it as text that names the source, link the public repository's URL, or — for a file that should ship — add it to `files` in package.json.",
  root: "The link `{{href}}` is a root path, which a reader of the package cannot follow from the file that holds it, so it is broken in the published package. Rewrite it as a path relative to the file, link the public repository's URL, or — for a file that should ship — add it to `files` in package.json.",
} as const;

type Destination = Readonly<Link | Image | Definition>;

/** What judges one destination of the file being linted, reporting through `context`. */
const judgeIn =
  (deps: ShippedLinkDeps, context: RuleContext) => (found: Found) => {
    // The list is read when a link needs it: a file with none never asks.
    const shipped = deps.shipped();
    const file = relativeTo(deps.root, context.filename);
    if (!shipped.has(file)) return;
    const verdict = verdictOf(file, found.href, shipped);
    if (verdict !== null)
      context.report({
        loc: { start: found.start, end: found.end },
        messageId: verdict.messageId,
        data: { href: found.href, target: verdict.target },
      });
  };

/** The nodes of the Markdown tree that hold a destination, each judged through `judge`. */
const visitors = (judge: (found: Found) => void) => {
  const destination = (node: Destination) => {
    // GFM's autolink literals (www.example.org, you@example.org) are made after parsing and carry
    // no position; they are URLs, which the rule does not read anyway.
    const p = node.position;
    if (p !== undefined) judge({ href: node.url, start: p.start, end: p.end });
  };
  return {
    link: destination,
    image: destination,
    definition: destination,
    html(node: Readonly<Html>) {
      // Raw HTML is made by the parser itself, so it always has its position.
      const p = z.object({ start: PointSchema }).parse(node.position);
      htmlHrefs(node.value, p.start).forEach(judge);
    },
  };
};

/** The Markdown rule, reading the pack list through `deps`. */
export default (deps: ShippedLinkDeps) => ({
  rules: {
    "md-link-shipped": {
      meta: {
        type: "problem" as const,
        docs: {
          description:
            "a link in a Markdown file the package ships must lead to a file the package ships",
        },
        schema: [],
        messages: MESSAGES,
      },
      create(context: RuleContext) {
        return visitors(judgeIn(deps, context));
      },
    },
  },
});
