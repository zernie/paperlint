/**
 * Both halves for `new-paper.ts` — the module behind `paperlint new` and `paperlint init --paper`.
 *
 * What is checked, and why each one matters:
 *   - the scaffold is what `paperlint lint` ACCEPTS: the old first run opened with "missing
 *     PIPELINE-STATUS.md", and a scaffold that still produced a finding would move that error
 *     from a missing file into a created one;
 *   - the scorecard carries NO `stages` — a new paper has shipped nothing,
 *     and a placeholder stage would be a red `paper/stages` on the very first run;
 *   - the scorecard carries the `**Readiness verdict:**` line the status hook surfaces on every
 *     paper edit — without it the hook reports that the paper cannot say whether it is ready;
 *   - it never overwrites, and on an existing folder adds only what is missing;
 *   - the project's `<papers>/.template/` wins over the package, file by file.
 *
 * ⚠️ Assertions at the TOP LEVEL: `vigiles test` imports the file and counts "did not throw"
 * as a pass.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { frontmatterBlock } from "../lib/markdown.ts";
import { createChecker } from "../lib/check.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const {
  newPaper,
  nameProblem,
  PACKAGE_TEMPLATES,
  OVERRIDE_DIR,
  STATUS_FILE,
  SOURCE_FILE,
} = await import(join(HERE, "new-paper.ts"));
const { run } = await import(join(HERE, "cli.ts"));

const check = createChecker();

const work = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-new-")));
const read = (...p) => readFileSync(join(...p), "utf8");
const front = (text) => load(frontmatterBlock(text) ?? "") ?? {};

/** `paperlint lint <dir>` in-process, output captured. */
async function lint(dir) {
  const out = [];
  const code = await run(["lint", dir], {
    log: (...a) => out.push(a.join(" ")),
    err: (...a) => out.push(a.join(" ")),
    cwd: work,
  });
  return { code, text: out.join("\n") };
}

try {
  // ── the templates are FILES in the package, one per required file ──────────────────────
  for (const f of [STATUS_FILE, SOURCE_FILE])
    check(
      `the package ships templates/paper/${f}`,
      existsSync(join(PACKAGE_TEMPLATES, f)),
    );
  check(
    "🔴 the templates ship in the npm tarball — `templates` is in package.json `files`",
    JSON.parse(read(ROOT, "package.json")).files.includes("templates"),
  );

  // ── names ───────────────────────────────────────────────────────────────────────────
  for (const ok of ["demo", "aisec-2026", "v1.2_final"])
    check(`\`${ok}\` is a valid name`, nameProblem(ok, []) === null);
  for (const bad of ["Demo", "my paper", "a/b", "../x", "", "ÿ"])
    check(`\`${bad}\` is refused`, typeof nameProblem(bad, []) === "string");
  for (const dot of [".template", ".x", ".."])
    check(
      `\`${dot}\` is refused — discovery skips dot-directories, so it would never be linted`,
      /starting with a dot/.test(nameProblem(dot, []) ?? ""),
    );
  check(
    "a refused name creates nothing",
    newPaper(work, "Bad", { venues: [] }).ok === false &&
      !existsSync(join(work, "Bad")),
  );

  // ── a fresh LaTeX paper ─────────────────────────────────────────────────────────────
  const papers = join(work, "papers");
  const r = newPaper(papers, "demo", { venues: [] });
  check(
    "a fresh folder gets the scorecard, a .tex source and paperlint.json, all from the package",
    r.ok &&
      r.fresh &&
      r.files.map((f) => `${f.file}:${f.status}:${f.from}`).join(" ") ===
        "PIPELINE-STATUS.md:created:package paper.tex:created:package paperlint.json:created:package",
  );
  const status = read(papers, "demo", STATUS_FILE);
  const fm = front(status);
  check(
    "🔴 the scorecard has NO `stages` — a new paper has shipped nothing and owes nothing",
    !("stages" in fm),
  );
  check(
    "the name is filled in, and no placeholder survives in any file",
    /PIPELINE-STATUS — demo/.test(status) &&
      !status.includes("{{name}}") &&
      !read(papers, "demo", "paper.tex").includes("{{name}}"),
  );
  const l = await lint(join(papers, "demo"));
  check(
    "🔴 `paperlint lint` passes the scaffold — exit 0, not a missing-file error — with the one warning that no venue is chosen yet",
    l.code === 0 &&
      /names no venue preset yet/.test(l.text) &&
      /1 problem \(0 errors, 1 warning\)/.test(l.text),
  );

  // What the status hook reads on every paper edit: the verdict line.
  check(
    "the scorecard carries the `**Readiness verdict:**` line the status hook surfaces",
    /^\*\*Readiness verdict:\*\*/m.test(
      readFileSync(join(papers, "demo", STATUS_FILE), "utf8"),
    ),
  );

  // ── never overwrite; on an existing folder only the missing files ─────────────────────
  writeFileSync(join(papers, "demo", STATUS_FILE), "mine\n");
  const again = newPaper(papers, "demo", { venues: [] });
  check(
    "🔴 a second run overwrites nothing",
    again.ok &&
      !again.fresh &&
      read(papers, "demo", STATUS_FILE) === "mine\n" &&
      again.files.every((f) => f.status === "kept"),
  );
  writeFileSync(join(papers, "afile"), "x");
  check(
    "a name taken by a FILE is refused, not written through",
    newPaper(papers, "afile", { venues: [] }).ok === false,
  );

  // ── the project's template wins, file by file ─────────────────────────────────────────
  mkdirSync(join(papers, OVERRIDE_DIR), { recursive: true });
  writeFileSync(
    join(papers, OVERRIDE_DIR, STATUS_FILE),
    "---\n---\n# House scorecard for {{name}}\n",
  );
  const own = newPaper(papers, "house", { venues: [] });
  // Guards: the override slot — `fromTemplate` in new-paper.ts reads `<papers>/.template/<file>`
  // before the package's copy. Replace that lookup with the package's alone and this goes red.
  check(
    "🔴 <papers>/.template/ is preferred for the file it holds, the package fills the rest",
    own.ok &&
      read(papers, "house", STATUS_FILE) ===
        "---\n---\n# House scorecard for house\n" &&
      own.files.find((f) => f.file === STATUS_FILE)?.from === "project" &&
      own.files.find((f) => f.file === SOURCE_FILE)?.from === "package",
  );

  // ── a missing template is a broken install, not an empty file ─────────────────────────
  const broken = newPaper(join(work, "b"), "x", {
    venues: [],
    packageTemplates: join(work, "no-such-dir"),
  });
  check(
    "a missing package template refuses and leaves no half-made folder",
    broken.ok === false &&
      /no template for/.test(broken.reason) &&
      !existsSync(join(work, "b", "x")),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  `✓ ${String(check.count)} assertions passed — paperlint new scaffolds what paperlint lint accepts`,
);
