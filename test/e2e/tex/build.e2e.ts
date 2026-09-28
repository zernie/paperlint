/**
 * `paperlint build` against a REAL `pdflatex`, from source to finished PDF.
 *
 * 🔴 HOW THIS DIFFERS FROM `src/build.harness.mjs`, AND WHY BOTH ARE NEEDED. That harness
 * substitutes a fake TeX for `spawnSync`: it checks the shell's DECISIONS — what runs, in which
 * order, with which TEXINPUTS, and what is left on disk. Not one of its assertions can say that a
 * PDF came out at the end, let alone WHICH one. Here is the other half: paperlint compiles each fixture
 * with the real pdflatex and bibtex, and the result is measured with a tool rather than taken on
 * trust. No fixture carries a build script that paperlint would run: `cite/build.sh` exists only to
 * prove it is NOT run.
 *
 * 🔴 WHAT EXACTLY THIS CATCHES, AND IT IS NOT A HYPOTHESIS. `acmart.cls` checks for the presence
 * of `libertine.sty`, `zi4.sty` and `newtxmath.sty`; failing to find ANY of them it sets
 * `\@ACM@newfontsfalse` and silently typesets the paper in Computer Modern. The build is GREEN,
 * the PDF looks fine, and the metrics are different — which means different pagination. That is
 * how the SUBMITTED `aisec-2026` went out. A green exit code says nothing about it: the failure
 * lives in the content of the artifact, so the content is what gets measured.
 *
 * 🔴 EACH FIXTURE DECLARES WHAT IT MUST PRODUCE. `fixtures/build-e2e/<name>/expect.json` (schema:
 * `build-expect.ts`) says whether it builds, in which fonts, what its PDF and its directory hold, and
 * exactly which findings `paperlint lint` reports for the rules it names. One `describe` per fixture
 * directory turns those fields into tests; a new venue fixture is a new folder, not new test code.
 * What is not about one fixture — the refusal without TeX, the engine, the references cache — is an
 * ordinary test below.
 *
 * 🔴 THE ENGINE IS paperlint's OWN DECISION. The refusal — no TeX Live and no terminal gives one line
 * naming `npx paperlint toolchain` and nothing built — needs no TeX at all. The rest asks `paperlint
 * build --dry-run` which TeX Live the real run would use; under CI that must be paperlint's cache,
 * the one `paperlint toolchain` installed in the step before.
 *
 * 🔴 A MISSING TeX IS A SKIP, NOT A PASS. For a contributor without TeX Live the build tests are
 * reported SKIPPED; under CI the same absence fails (`../need.ts`): a skipped step and a passed one
 * look identical in the interface, and that is exactly the class this whole package is written
 * against.
 *
 *   npm run test:e2e:tex
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { PAPERS_DIR_FIELD } from "../../../lib/paper-config.ts";
// `run` is what `bin/paperlint.mjs` re-exports; imported from the build it re-exports, which has types.
import { run } from "../../../dist/cli.js";
import { referencesChecker } from "../../../dist/adapters/references/index.js";
import { missing, STRICT } from "../need.ts";
import {
  embeddedNames,
  fontNames,
  lastPageText,
  logEmbedded,
  readBuilt,
  sameFonts,
} from "../read-pdf.ts";
import {
  parseExpect,
  type Finding,
  type FixtureExpect,
} from "./build-expect.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const CLI = join(ROOT, "bin", "paperlint.mjs");
const FIXTURES = join(ROOT, "fixtures", "build-e2e");

/** `paperlint lint --json`: ESLint's results, with the message fields the checks read. */
const LintMessage = z.looseObject({
  ruleId: z.string().nullable(),
  message: z.string(),
  severity: z.number(),
  line: z.number().optional(),
});
type LintMessage = z.infer<typeof LintMessage>;
const LintReport = z.array(
  z.looseObject({ filePath: z.string(), messages: z.array(LintMessage) }),
);

/** The parts of `_build/paper.facts.json` the facts expectation reads. */
const FactsFile = z.looseObject({
  schema: z.unknown().optional(),
  last_page: z.unknown().optional(),
});
const MeasuredLastPage = z.looseObject({
  kind: z.literal("measured"),
  columns_pt: z.tuple([z.number(), z.number()]).rest(z.number()),
});

/** `_build/references.json`: the status and, per entry, the three verdict fields. */
const RecordedReferences = z.looseObject({
  status: z.unknown().optional(),
  entries: z.array(
    z.looseObject({
      key: z.unknown().optional(),
      exists: z.unknown().optional(),
      authors: z.unknown().optional(),
    }),
  ),
});

/** `repro/references-cache.json`: the answers per registry, each dated. */
const ReferencesCache = z.looseObject({
  schema: z.unknown().optional(),
  citations: z.record(
    z.string(),
    z.looseObject({ fetched: z.unknown().optional() }),
  ),
  dblp: z.record(z.string(), z.unknown()),
});

/** A JSON file's content, or `null` when there is no such file. */
const readJson = (file: string): unknown =>
  existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;

/** A file's text, or `null` when there is no such file. */
const readText = (file: string): string | null =>
  existsSync(file) ? readFileSync(file, "utf8") : null;

/** Every fixture directory, with its expectation parsed — or why it has none. */
const fixtures = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({
    name: d.name,
    expect: parseExpect(readText(join(FIXTURES, d.name, "expect.json"))),
  }));

/**
 * A consumer holding every fixture under `papers/`. Copied, because the build leaves `paper.pdf`,
 * `paper.aux` and `paper.log` beside the source. A fixture that must NOT build gets a stale PDF
 * "from an earlier build", which the run has to remove.
 */
function consumer(): string {
  const work = realpathSync(
    mkdtempSync(join(tmpdir(), "paperlint-build-e2e-")),
  );
  cpSync(FIXTURES, join(work, "papers"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  for (const f of fixtures)
    if (f.expect.ok && f.expect.value.build.outcome === "failed")
      writeFileSync(join(work, "papers", f.name, "paper.pdf"), "%PDF-stale");
  // `--all` takes the papers directory from the config, not from an argument: the CONSUMER names
  // the scope, and that is the same contract for which `lint` has no "." default.
  writeFileSync(
    join(work, "package.json"),
    JSON.stringify({ name: "consumer", private: true }, null, 2),
  );
  writeFileSync(
    join(work, "paperlint.json"),
    JSON.stringify({ [PAPERS_DIR_FIELD]: "papers" }, null, 2),
  );
  return work;
}

/** The TeX Live the real run will use, as `build --dry-run` names it. */
function engineIn(work: string): string {
  const plan = spawnSync(
    process.execPath,
    [CLI, "build", "--all", "--dry-run"],
    { cwd: work, encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  return plan.stdout.split("\n").find((l) => l.startsWith("engine: ")) ?? "";
}

/** What the real `build --all` produced, and what it asked the (fake) citation services. */
interface Built {
  readonly status: number;
  readonly out: string;
  readonly asked: string[];
  readonly checkReferences: ReturnType<typeof referencesChecker>;
}

/**
 * 🔴 NO LIVE CITATION SERVICE. The references step asks Crossref, OpenAlex, Semantic Scholar,
 * arXiv and DBLP; a run that depended on them took ~9 minutes and failed when DBLP did. The build
 * runs in-process through the CLI's own composition root, `run()`, with the REAL references
 * adapter over a fake `fetch` that answers every service and counts what it was asked — so the
 * lookup cache, the reachability probe and DBLP's pacing are the shipped ones. Everything else
 * is the real command: real pdflatex and bibtex.
 */
function fakeServices(asked: string[]): typeof fetch {
  return (url: string | URL | Request) => {
    const u = url instanceof Request ? url.url : String(url);
    asked.push(u);
    if (u.startsWith("https://export.arxiv.org/"))
      return Promise.resolve(new Response("<feed></feed>"));
    if (u.startsWith("https://dblp.org/"))
      return Promise.resolve(Response.json({}));
    return Promise.resolve(
      Response.json({ message: { items: [] }, results: [], data: [] }),
    );
  };
}

/** `paperlint build <args>` in-process, over the fake services; what it printed and returned. */
async function buildIn(
  work: string,
  args: readonly string[],
  services: { asked: string[]; checkReferences: Built["checkReferences"] },
): Promise<{ status: number; out: string }> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeServices(services.asked);
  const printed: string[] = [];
  const say = (...a: unknown[]) => printed.push(a.join(" "));
  try {
    const status = await run(["build", ...args], {
      cwd: work,
      log: say,
      err: say,
      checkReferences: services.checkReferences,
    });
    return { status, out: printed.join("\n") };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** The plan and result lines of ONE paper: its name, then the indented lines under it. */
function blockOf(out: string, name: string): string {
  const lines = out.split("\n");
  const at = lines.findIndex((l) => l === `papers/${name}`);
  if (at < 0) return "";
  const end = lines.findIndex((l, i) => i > at && !l.startsWith(" "));
  return lines.slice(at, end < 0 ? undefined : end).join("\n");
}

/** `paperlint lint papers/<name> --json`: its exit code and that paper's findings. */
function lintPaper(
  work: string,
  name: string,
  settings: Record<string, unknown> | undefined,
): { status: number | null; messages: LintMessage[]; raw: string } {
  if (settings !== undefined)
    writeFileSync(
      join(work, "papers", name, "paperlint.json"),
      JSON.stringify(settings),
    );
  const r = spawnSync(
    process.execPath,
    [CLI, "lint", `papers/${name}`, "--json"],
    { cwd: work, encoding: "utf8" },
  );
  const messages = LintReport.parse(JSON.parse(r.stdout))
    .filter((f) => f.filePath.endsWith(join(name, "paper.tex")))
    .flatMap((f) => f.messages);
  return { status: r.status, messages, raw: r.stdout + r.stderr };
}

/** A finding as the expectation spells it, for a readable diff. */
const shown = (m: LintMessage): Finding & { message: string } => ({
  severity: m.severity === 2 ? 2 : 1,
  ...(m.line === undefined ? {} : { line: m.line }),
  says: [],
  message: m.message,
});

/** Whether `got` is exactly the findings `want` lists, in line order. */
function sameFindings(got: readonly LintMessage[], want: readonly Finding[]) {
  const byLine = [...got].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return (
    byLine.length === want.length &&
    want.every((w, i) => {
      const g = byLine[i];
      return (
        g !== undefined &&
        g.severity === w.severity &&
        (w.line === undefined || g.line === w.line) &&
        w.says.every((s) => g.message.includes(s))
      );
    })
  );
}

// ── NO TeX LIVE, NO TERMINAL: one line, and nothing is built ────────────────────────────────
// Needs no TeX: PATH holds node alone, the cache directory is empty, CI is set. This is what an
// agent or a CI job without `paperlint toolchain` sees.
it("without TeX Live and without a terminal: one line naming `npx paperlint toolchain`, nothing built, the stale PDF gone", () => {
  const bare = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-bare-")));
  try {
    cpSync(join(FIXTURES, "acmart"), join(bare, "papers", "acmart"), {
      recursive: true,
    });
    writeFileSync(join(bare, "package.json"), '{"name":"c","private":true}');
    // A PDF from an earlier build beside the paper the refusal stops at: it must not survive either.
    const stale = join(bare, "papers", "acmart", "paper.pdf");
    writeFileSync(stale, "%PDF-stale");
    mkdirSync(join(bare, "bin"));
    symlinkSync(process.execPath, join(bare, "bin", "node"));
    const refused = spawnSync(
      process.execPath,
      [CLI, "build", join("papers", "acmart")],
      {
        cwd: bare,
        encoding: "utf8",
        env: {
          HOME: bare,
          PATH: join(bare, "bin"),
          CI: "1",
          PAPERLINT_TEXLIVE_DIR: join(bare, "cache"),
        },
      },
    );
    const said = `${refused.stdout}${refused.stderr}`;
    expect(refused.status, said).toBe(1);
    expect(
      said
        .split("\n")
        .some(
          (l) =>
            l.includes("run `npx paperlint toolchain`") &&
            l.includes("acmart") &&
            l.includes("libertine"),
        ),
      said,
    ).toBe(true);
    // Refused BEFORE compiling: no plan line, nothing installed.
    expect(said).not.toContain("compile:");
    expect(existsSync(join(bare, "cache"))).toBe(false);
    expect(existsSync(stale)).toBe(false);
    expect(said).toContain(
      "papers/acmart: paper.pdf removed — a stale PDF must not pass for this build",
    );
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

const work = consumer();
const engine = engineIn(work);
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

const skip = missing(
  "a TeX Live with every declared package",
  engine !== "" && !engine.startsWith("engine: none"),
  `\`build --dry-run\` says ${engine || "no engine line"}. Install one with \`node bin/paperlint.mjs toolchain\` (PAPERLINT_TEXLIVE_DIR picks the directory).`,
);

describe.skipIf(skip)("paperlint build --all on a real pdflatex", () => {
  const asked: string[] = [];
  const services = {
    asked,
    checkReferences: referencesChecker({ today: () => "2026-09-27" }),
  };
  let built: { status: number; out: string } = { status: -1, out: "" };
  beforeAll(async () => {
    built = await buildIn(work, ["--all"], services);
    console.log(built.out);
  });

  // 🔴 In CI the build must run on the TeX Live `paperlint toolchain` installed — the runner has no other.
  it(`${engine} — under CI, paperlint's own cache`, () => {
    expect(engine).toMatch(/^engine: TeX Live/);
    if (STRICT) expect(engine).toContain("paperlint cache");
  });

  it("the plan is printed: one line per step", () => {
    expect(built.out).toMatch(/ {2}inputs: TEXINPUTS \+= /);
    expect(built.out).toMatch(/ {2}compile: paper\.tex/);
  });

  it("the run as a whole fails exactly when some fixture expects a failed build", () => {
    const anyFails = fixtures.some(
      (f) => f.expect.ok && f.expect.value.build.outcome === "failed",
    );
    expect(built.status !== 0).toBe(anyFails);
  });

  describe.each(fixtures)("fixtures/build-e2e/$name", (f) => {
    it("declares what it must produce in a valid expect.json", () => {
      expect(f.expect.ok ? "" : f.expect.why).toBe("");
    });
    if (f.expect.ok) fixtureTests(f.name, f.expect.value, () => built.out);
  });

  describe("references — answered by the fake services, then from the committed cache", () => {
    referenceTests(services);
  });
});

/** The tests one fixture's expectation asks for: one per field it declares. */
function fixtureTests(name: string, e: FixtureExpect, out: () => string): void {
  const dir = join(work, "papers", name);
  const pdf = join(dir, "paper.pdf");
  it(`build: ${e.build.outcome === "pdf" ? "writes paper.pdf" : "fails, and no paper.pdf is left — not even the stale one planted before the run"}`, () => {
    expect(existsSync(pdf), blockOf(out(), name)).toBe(
      e.build.outcome === "pdf",
    );
  });
  if (e.says.length > 0 || e.saysNot.length > 0)
    it("its lines of the build output say what they must", () => {
      const block = blockOf(out(), name);
      for (const s of e.says) expect(block).toContain(s);
      for (const s of e.saysNot) expect(block).not.toContain(s);
    });
  if (e.build.outcome === "pdf") pdfTests(dir, e);
  if (e.files) filesTest(dir, e.files);
  if (e.facts) factsTest(dir, e.facts);
  if (e.lint) lintTest(name, e.lint);
}

/** The PDF's pages, fonts and text. */
function pdfTests(dir: string, e: FixtureExpect): void {
  const pdf = join(dir, "paper.pdf");
  const { build, fonts, text } = e;
  if (build.outcome === "pdf" && build.pages !== undefined) {
    const pages = build.pages;
    it(`the PDF has ${String(pages)} page(s)`, async () => {
      expect((await readBuilt(pdf)).pages).toBe(pages);
    });
  }
  if (fonts)
    it("the PDF's fonts are the ones declared", async () => {
      const facts = await readBuilt(pdf);
      const names = fontNames(facts);
      const all = fonts.all === undefined ? null : new RegExp(fonts.all);
      const some = fonts.some === undefined ? null : new RegExp(fonts.some);
      const none = fonts.none === undefined ? null : new RegExp(fonts.none);
      expect(names.length, "no fonts at all").toBeGreaterThan(0);
      if (all) expect(names.filter((n) => !all.test(n))).toEqual([]);
      if (some)
        expect(
          names.some((n) => some.test(n)),
          names.join(", "),
        ).toBe(true);
      if (none) expect(names.filter((n) => none.test(n))).toEqual([]);
      // The producer's list against the artifact's: pdfTeX names every program it embedded.
      if (fonts.matchLog) {
        const logged = logEmbedded(join(dir, "paper.log"));
        expect(logged.length).toBeGreaterThan(0);
        expect(
          sameFonts(logged, embeddedNames(facts)),
          `log: ${logged.join(", ")} · pdf.js: ${embeddedNames(facts).join(", ")}`,
        ).toBe(true);
      }
    });
  if (text)
    it("the last page's text is what it must be", async () => {
      const t = lastPageText(await readBuilt(pdf));
      for (const s of text.contains) expect(t).toContain(s);
      for (const s of text.lacks) expect(t).not.toContain(s);
    });
}

/** Files in the paper's directory after the build. */
function filesTest(dir: string, files: NonNullable<FixtureExpect["files"]>) {
  it("the paper's directory holds what it must, and not what it must not", () => {
    for (const f of files.exist) expect(existsSync(join(dir, f)), f).toBe(true);
    for (const f of files.absent)
      expect(existsSync(join(dir, f)), f).toBe(false);
    for (const [f, lacks] of Object.entries(files.lacks)) {
      const t = readText(join(dir, f));
      expect(t, `${f} is missing`).not.toBeNull();
      for (const s of lacks) expect(t).not.toContain(s);
    }
  });
}

/** `_build/paper.facts.json` as the build wrote it. */
function factsTest(dir: string, want: NonNullable<FixtureExpect["facts"]>) {
  it(`the build MEASURED it: _build/paper.facts.json, schema ${String(want.schema)}`, () => {
    const facts = FactsFile.nullable().parse(
      readJson(join(dir, "_build", "paper.facts.json")),
    );
    expect(facts?.schema).toBe(want.schema);
    const cols = want.lastPageColumnsPt;
    if (cols === undefined) return;
    const last = MeasuredLastPage.parse(facts?.last_page);
    expect(last.columns_pt[0]).toBeCloseTo(cols[0], 1);
    expect(last.columns_pt[1]).toBeCloseTo(cols[1], 1);
  });
}

/** `paperlint lint` on this one paper: its exit code, and exactly the findings named. */
function lintTest(name: string, want: NonNullable<FixtureExpect["lint"]>) {
  const exit = want.exit === undefined ? "" : `exit ${String(want.exit)}, `;
  const which =
    want.findings === undefined
      ? Object.keys(want.rules).join(", ") || "no rule"
      : "every rule";
  it(`paperlint lint: ${exit}exactly the findings declared for ${which}`, () => {
    const got = lintPaper(work, name, want.paperlintJson);
    if (want.exit !== undefined) expect(got.status, got.raw).toBe(want.exit);
    if (want.errors !== undefined)
      expect(
        got.messages.filter((m) => m.severity === 2).map(shown),
      ).toHaveLength(want.errors);
    if (want.findings !== undefined) {
      const all = want.findings;
      expect(
        got.messages.length === all.length &&
          all.every((f) =>
            sameFindings(
              got.messages.filter((m) => m.ruleId === f.rule),
              all.filter((x) => x.rule === f.rule),
            ),
          ),
        JSON.stringify(
          got.messages.map((m) => ({ rule: m.ruleId, ...shown(m) })),
        ),
      ).toBe(true);
    }
    for (const [rule, findings] of Object.entries(want.rules)) {
      const of = got.messages.filter((m) => m.ruleId === rule);
      expect(
        sameFindings(of, findings),
        `${rule}: ${JSON.stringify(of.map(shown))}`,
      ).toBe(true);
    }
  });
}

/** The references step on the `cite` fixture: answers recorded, then a warm build that asks nothing. */
function referenceTests(services: {
  asked: string[];
  checkReferences: Built["checkReferences"];
}): void {
  const cite = join(work, "papers", "cite");
  it("cite: _build/references.json holds the verdict derived from the services' answers", () => {
    const recorded = RecordedReferences.parse(
      readJson(join(cite, "_build", "references.json")),
    );
    expect(recorded.status).toBe("checked");
    expect(recorded.entries.map((e) => [e.key, e.exists, e.authors])).toEqual([
      ["knuth84", "unresolvable", "skipped"],
    ]);
  });
  it("cite: the answers landed in repro/references-cache.json — four registries and DBLP, dated", () => {
    const cache = ReferencesCache.parse(
      readJson(join(cite, "repro", "references-cache.json")),
    );
    expect(cache.schema).toBe(1);
    expect(Object.keys(cache.citations)).toHaveLength(4);
    expect(Object.keys(cache.dblp)).toHaveLength(1);
    for (const v of Object.values(cache.citations))
      expect(v.fetched).toBe("2026-09-27");
  });
  it("🔴 cite: a second build asks NOTHING, and says every answer came from the cache", async () => {
    const coldAsked = services.asked.length;
    services.asked.length = 0;
    const warm = await buildIn(work, ["papers/cite"], services);
    expect(coldAsked).toBeGreaterThan(0);
    expect(warm.status, warm.out).toBe(0);
    expect(services.asked).toEqual([]);
    expect(
      warm.out
        .split("\n")
        .some(
          (l) =>
            l.includes("references: 1 checked, 0 failing") &&
            l.includes("nothing fetched"),
        ),
      warm.out,
    ).toBe(true);
  });
}
