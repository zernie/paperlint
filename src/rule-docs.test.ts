/**
 * Every rule paperlint ships has a page: `meta.docs.url` names `docs/rules/<group>/<rule>.md` on the
 * default branch, and that file exists. The rule set is read off paperlint's own config
 * (`rulePlugins`), so a new rule is checked the day it is registered.
 *
 * The rules older than this convention are listed in `AWAITING_PAGE` until #131 writes their
 * pages. The list only shrinks: a listed rule that now has a page fails here too, so the list is
 * trimmed in the same change.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { rulePlugins } from "./cli.ts";
import { fieldOf } from "./domain/record.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PAGES = "https://github.com/zernie/paperlint/blob/main/";

/** Rules shipped before per-rule pages, each waiting for its page in #131. Only ever shrinks. */
const AWAITING_PAGE: ReadonlySet<string> = new Set([
  "paper/author-list",
  "paper/cite-exists",
  "paper/figure-ref-style",
  "paper/leading-zero",
  "paper/refs-checked",
  "paper/refs-fresh",
  "paper/section-word",
  "paper/source",
  "paper/stages",
  "pdf/fonts",
  "pdf/fresh",
  "pdf/geometry",
  "pdf/last-page-balance",
  "pdf/measured",
  "pdf/profile",
  "review/frontmatter",
  "sibling/frontmatter",
  "tex/acm-frontmatter-override",
  "tex/future-promise",
]);

/** A rule's `meta.docs.url`, or null when it has none. */
const urlOf = (rule: unknown): string | null => {
  const url = fieldOf(fieldOf(fieldOf(rule, "meta"), "docs"), "url");
  return typeof url === "string" ? url : null;
};

/**
 * What is wrong with the rules' pages, one line per rule: a page URL that names no file under
 * `docs/rules/`, a rule with no page that is not awaiting one, and one awaiting a page it has.
 */
export function pageProblems(
  rules: Readonly<Record<string, unknown>>,
  awaiting: ReadonlySet<string>,
  exists: (repoPath: string) => boolean,
): string[] {
  return Object.entries(rules).flatMap(([id, rule]) => {
    const url = urlOf(rule);
    if (url === null)
      return awaiting.has(id)
        ? []
        : [
            `${id}: no meta.docs.url — write docs/rules/${id}.md and point at it`,
          ];
    if (awaiting.has(id))
      return [`${id}: has a page now — take it off AWAITING_PAGE`];
    const path = url.startsWith(PAGES) ? url.slice(PAGES.length) : null;
    return path !== null && path.startsWith("docs/rules/") && exists(path)
      ? []
      : [`${id}: meta.docs.url ${url} names no file under docs/rules/`];
  });
}

/** Every rule paperlint's config registers, by `<plugin>/<rule>`. */
const shipped = (): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(rulePlugins()).flatMap(([plugin, p]) =>
      Object.entries(p.rules ?? {}).map(([name, rule]) => [
        `${plugin}/${name}`,
        rule,
      ]),
    ),
  );

const inRepo = (p: string): boolean => existsSync(join(ROOT, p));

describe("every shipped rule has a page", () => {
  it("the rule set is read off the config, and the new rules are in it", () => {
    expect(Object.keys(shipped())).toEqual(
      expect.arrayContaining([
        "tex/template",
        "tex/required-section",
        "tex/venue-leftover",
      ]),
    );
  });

  it("each page named exists; every rule without one is awaiting it (#131)", () => {
    expect(pageProblems(shipped(), AWAITING_PAGE, inRepo)).toEqual([]);
  });

  it("every awaiting rule is still shipped — a removed rule leaves the list", () => {
    expect([...AWAITING_PAGE].filter((id) => !(id in shipped()))).toEqual([]);
  });
});

describe("pageProblems — both halves, on planted rules", () => {
  const withPage = (path: string) => ({
    meta: { docs: { url: PAGES + path } },
  });
  const exists = (p: string) => p === "docs/rules/x/ok.md";

  it("a brand-new rule without a page fails", () => {
    expect(pageProblems({ "x/new": { meta: {} } }, new Set(), exists)).toEqual([
      "x/new: no meta.docs.url — write docs/rules/x/new.md and point at it",
    ]);
  });

  it("a page that does not exist, outside docs/rules, or not on the default branch fails", () => {
    expect(
      pageProblems(
        {
          "x/gone": withPage("docs/rules/x/gone.md"),
          "x/readme": withPage("README.md"),
          "x/elsewhere": {
            meta: { docs: { url: "https://example.org/x.md" } },
          },
        },
        new Set(),
        exists,
      ),
    ).toHaveLength(3);
  });

  it("a listed rule that has a page now fails, so the list shrinks", () => {
    expect(
      pageProblems(
        { "x/ok": withPage("docs/rules/x/ok.md") },
        new Set(["x/ok"]),
        exists,
      ),
    ).toEqual(["x/ok: has a page now — take it off AWAITING_PAGE"]);
  });

  it("a rule with an existing page, and a listed rule without one, pass", () => {
    expect(
      pageProblems(
        { "x/ok": withPage("docs/rules/x/ok.md"), "x/old": {} },
        new Set(["x/old"]),
        exists,
      ),
    ).toEqual([]);
  });
});
