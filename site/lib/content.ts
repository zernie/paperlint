// What paperlint.dev says, read from the repository at build time so the site cannot drift from it.
// Every reader throws when the text it looks for is gone: the build fails instead of shipping a
// page with a hole in it. Pure functions over strings; `site/app/page.tsx` does the file reading.

/** One row of the README's "Supported venues" table. */
export interface Venue {
  readonly preset: string;
  readonly venue: string;
  readonly format: string;
  readonly limits: string;
}

/** The README's content the site shows. */
export interface ReadmeContent {
  readonly install: readonly string[];
  readonly lintOutput: readonly string[];
  readonly venues: readonly Venue[];
  readonly disclaimer: string;
}

const fail = (what: string): never => {
  throw new Error(
    `site: ${what} — the README changed; update site/lib/content.ts to match`,
  );
};

/** The body lines of the first fenced block after `anchor`, with the fence's language `lang`. */
export const fencedAfter = (
  text: string,
  anchor: string,
  lang: string,
): readonly string[] => {
  const at = text.indexOf(anchor);
  const from = at === -1 ? fail(`no "${anchor}"`) : at + anchor.length;
  const open = new RegExp("^([ \\t]*)```" + lang + "[ \\t]*$", "m").exec(
    text.slice(from),
  );
  const start =
    open === null ? fail(`no \`\`\`${lang} block after "${anchor}"`) : open;
  const indent = start.slice(1, 2).join("");
  const body = text.slice(from + start.index + start[0].length + 1);
  const close = body.search(new RegExp("^" + indent + "```[ \\t]*$", "m"));
  const lines =
    close === -1
      ? fail(`an unclosed block after "${anchor}"`)
      : body.slice(0, close);
  return lines
    .replace(/\n$/, "")
    .split("\n")
    .map((line) =>
      line.startsWith(indent) ? line.slice(indent.length) : line,
    );
};

/** Markdown inline markup to plain text: links keep their text, a "([why](…))" aside is dropped. */
export const plain = (cell: string): string =>
  cell
    .replace(/\s*\(\[why\]\([^)]*\)\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .trim();

/** The rows of the first table after `anchor`, header and rule line left out, cells trimmed. */
export const tableAfter = (
  text: string,
  anchor: string,
): readonly (readonly string[])[] => {
  const at = text.indexOf(anchor);
  const lines = (at === -1 ? fail(`no "${anchor}"`) : text.slice(at)).split(
    "\n",
  );
  const first = lines.findIndex((line) => line.startsWith("|"));
  const rest =
    first === -1 ? fail(`no table after "${anchor}"`) : lines.slice(first);
  const end = rest.findIndex((line) => !line.startsWith("|"));
  return (end === -1 ? rest : rest.slice(0, end))
    .slice(2)
    .map((line) => line.split("|").slice(1, -1).map(plain));
};

/** The README's warning that a clean run is no guarantee, as plain text, up to its licence sentence. */
export const disclaimer = (text: string): string => {
  const lines = text.split("\n");
  const at = lines.findIndex(
    (line) => line.startsWith(">") && line.includes("An aid, not a guarantee"),
  );
  const rest =
    at === -1 ? fail('no "An aid, not a guarantee" quote') : lines.slice(at);
  const end = rest.findIndex((line) => !line.startsWith(">"));
  const quote = (end === -1 ? rest : rest.slice(0, end))
    .map((line) => line.replace(/^>\s?/, ""))
    .join(" ");
  return plain(
    quote
      .replace(/\*\*/g, "")
      .replace(/^⚠️\s*/, "")
      .replace(/ Provided.*$/, ""),
  );
};

/** The README's install commands, its first lint output, its venue presets and its disclaimer. */
export const readmeContent = (readme: string): ReadmeContent => {
  const install = fencedAfter(readme, "### A new paper", "sh");
  const lintOutput = fencedAfter(
    readme,
    "the first run already catches something",
    "text",
  );
  const venues = tableAfter(readme, "## 🎯 Supported venues").map(
    ([preset = "", venue = "", format = "", limits = ""]) => ({
      preset,
      venue,
      format,
      limits,
    }),
  );
  return {
    install: install.some((line) => line.startsWith("npm i"))
      ? install
      : fail("no `npm i` in the install block"),
    lintOutput,
    venues: venues.length > 0 ? venues : fail("an empty venue table"),
    disclaimer: disclaimer(readme),
  };
};

/** The venue's short name for the headline: "AISec @ ACM CCS" → "AISec"; null for "any … conference". */
export const shortName = (venue: string): string | null =>
  venue.startsWith("any ") ? null : venue.replace(/ @ .*$| \(.*$/, "").trim();
