/**
 * Where the consumer declares its settings — the ONE SOURCE for everything that is allowed to
 * import it.
 *
 * 🔴 WHY THIS MODULE DOES NOT REMOVE THE DUPLICATION COMPLETELY, AND THAT IS NOT AN OVERSIGHT.
 * The three hooks (`hooks/*.hook.mjs`) still have to keep their own copies of these values: a
 * compiled hook is forbidden to import anything but `vigiles/hook`, and that ban is not
 * arbitrary — a hook's capabilities equal its API surface, so allowing imports would mean
 * allowing a reach into `child_process`. The restriction is wider than strictly necessary
 * (importing plain constants adds no capability), and that is discussed in zernie/vigiles#245,
 * but until it is relaxed the hooks duplicate, and drift is caught by the cross-check in
 * `hooks/hooks.harness.ts`.
 *
 * 🔴 BUT THE REST WERE DUPLICATING FOR NO REASON AT ALL. `eslint-rules/papers.mjs` and
 * `skills/paper-pipeline/scripts/consumer.mjs` are not hooks, carry no import restriction, and
 * could always have taken the value from here. Worse, their copies were not covered by the
 * cross-check at all — it compared the three hooks against each other, while these two lived
 * next door and could drift apart silently. Found 2026-09-18 by grepping AFTER the cross-check
 * itself had already been fixed — i.e. the check's wording was fixed, but nobody measured its
 * COVERAGE.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The tool's name. Its settings file is named after it (`CONFIG_FILE`), its messages start with it,
 * and the hooks resolve their scripts through it. It equals the package name, and
 * `lib/paper-config.harness.mjs` checks that.
 */
export const CONFIG_KEY: string = "paperlint";

/**
 * THE SETTINGS FILE, ONE NAME AT TWO LEVELS, ONE SCHEMA (`SETTINGS_KEYS`):
 *
 *   paperlint.json                 optional, at the project root: where the papers are, the
 *                                  project's rules, and defaults for every paper
 *   <papersDir>/<paper>/paperlint.json   one paper: its venue preset, its kind, its own rules
 *
 * A paper's file merges over the root's: its `extends`, `kind` and `pdf` win, and its `rules` are
 * applied after the root's. A venue preset (`paperlint:<name>`, or the project's own `./x.jsonc`)
 * is the third level, below both.
 */
export const CONFIG_FILE: string = "paperlint.json";

/**
 * The files that make a directory a PAPER. A `paperlint.json` beside one of them is that paper's,
 * never the project's — so walking up from inside a paper does not stop at the paper's own file.
 */
export const PAPER_MARKERS: readonly string[] = Object.freeze([
  "paper.tex",
  "paper.md",
  "draft.md",
  "PIPELINE-STATUS.md",
]);

/**
 * The project root: the nearest directory, walking up from `startDir`, that holds a root
 * `paperlint.json` (one not beside a paper's files); else the nearest directory holding a
 * `package.json`; else `startDir` itself. The same walk eslint, prettier and tsc use for theirs.
 *
 * @param isFile  whether a path exists — `existsSync` by default; `src/` passes its Files port.
 */
export function findProjectRoot(
  startDir: string,
  isFile: (path: string) => boolean = existsSync,
): string {
  const start = resolve(startDir);
  const isPaper = (d: string) => PAPER_MARKERS.some((m) => isFile(join(d, m)));
  // Up from `start` to the first directory `found` accepts; null past the filesystem root. A
  // loop with an exit condition rather than `for (;;)`: the code after an endless loop is a block
  // that can never run, and coverage counts it as one that did not.
  const walk = (found: (dir: string) => boolean): string | null => {
    let d = start;
    while (!found(d)) {
      if (dirname(d) === d) return null;
      d = dirname(d);
    }
    return d;
  };
  return (
    walk((d) => isFile(join(d, CONFIG_FILE)) && !isPaper(d)) ??
    walk((d) => isFile(join(d, "package.json"))) ??
    start
  );
}

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * The project's settings: the object in `<root>/paperlint.json`, or undefined when there is no
 * such file, or it does not parse, or it is not an object. For readers that only need one key and
 * fall back to its default; `paperlint lint` parses the file strictly and names what is wrong.
 */
export function settingsOf(
  root: string,
): Readonly<Record<string, unknown>> | undefined {
  let v: unknown;
  try {
    v = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8"));
  } catch {
    return undefined;
  }
  return isObject(v) ? v : undefined;
}

/** The default papers directory, used when the root `paperlint.json` declares none (or there is none). */
export const DEFAULT_PAPERS_ROOT: string = "papers";

/**
 * The field that names the papers directory: `{ "papersDir": "papers" }` in the root
 * `paperlint.json`. Optional; absent means `DEFAULT_PAPERS_ROOT`.
 *
 * This is the one place the name is spelled. Code reads the field as
 * `settings[PAPERS_DIR_FIELD]`, never by a literal, so renaming it again is a one-line change
 * here. The three hooks cannot import this module, so they keep their own copy, and
 * `lib/paper-config.harness.mjs` checks that every copy matches this one.
 */
export const PAPERS_DIR_FIELD: string = "papersDir";

/**
 * Every key a `paperlint.json` may hold — the root's and a paper's, ONE schema — with who reads it.
 * A key not listed here is REFUSED with its name, because a typo in a key otherwise reads as "not
 * set". The keys in `ROOT_ONLY_KEYS` describe the whole project and are refused in a paper's file.
 *
 * 🔴 ONE LIST, AND IT IS CHECKED AGAINST THE READERS, NOT TRUSTED. `lib/paper-config.harness.mjs`
 * walks the package's source, finds every `settingsOf(…)?.<key>` read and every field of
 * `PaperlintConfig`, and requires each to be here — so a new reader that forgets this list turns
 * the harness red before a consumer's config does.
 */
export const SETTINGS_KEYS: Readonly<Record<string, string>> = Object.freeze({
  papersDir: `the papers directory, default "papers" — every command, the hooks`,
  structure: "which files a paper directory must hold — paperlint lint",
  rules:
    "rule overrides: { id: severity } for every paper in scope, or ESLint blocks (files, ignores, rules) — paperlint lint",
  extends:
    "the venue preset: paperlint:<name> or ./path.jsonc — the pdf/ venue rules, paperlint build",
  kind: "the kind of paper, whose page limit applies — pdf/limits",
  pdf: "where the built PDF is, relative to the paper, when it is not paper.pdf — the facts",
  identity:
    "what identifies the authors — names, handles, emails, affiliations, own project names; a blind venue's PDF must not say any of them — anonymity/identity. The root's list and a paper's are joined",
  scripts: "how skill prose names the scripts — consumer.mjs",
  timezone: "the zone deadline anchors are written in — consumer.mjs",
  contactEmail: "the polite-pool address for citation lookups — consumer.mjs",
  triggerCases:
    "the consumer's own skill trigger cases — lib/skill-trigger-cases.mjs",
  $comment: "a note for humans (JSON Schema's own comment keyword); ignored",
});

/** The keys that only mean something for the whole project: refused in a paper's `paperlint.json`. */
export const ROOT_ONLY_KEYS: readonly string[] = Object.freeze([
  "papersDir",
  "structure",
  "scripts",
  "timezone",
  "contactEmail",
  "triggerCases",
]);
