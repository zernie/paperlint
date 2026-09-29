/**
 * Where the body of a real paper ends, on real PDFs: every accepted paper of the corpus that carries
 * a `page-count.json` (ACSAC papers, the parent venue of AIDC, in the same IEEEtran template), and
 * every variant in `page-count-variants.json` — one of those papers with ONE thing changed about
 * where its body ends, at the references or the appendix, whichever comes first. Each is built by
 * `paperlint build` on a real pdflatex, and the end `format/page-limit` finds (`bodyEnd`, over the
 * facts the build wrote) must equal the one established by rendering the PDF and looking at it,
 * recorded beside the paper with that evidence.
 *
 * Then the limit itself, through the real rule: under AIDC's regular limit of 12 body pages, the
 * paper whose body is 12 passes and the one whose body is 13 is reported.
 *
 * And `pdf/body-size` on the same build (`body-size.json`): every accepted paper there — the ACSAC
 * ones and an ACM one — draws no finding, and each variant, one font size changed, draws exactly
 * the finding recorded for it. The sizes the build measured are compared with the recorded ones, so
 * a drift in the measurement shows as itself and not as a rule that went quiet.
 *
 *   npm run test:e2e:tex
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { PAPERS_DIR_FIELD } from "../../../lib/paper-config.ts";
import { referencesChecker } from "../../../dist/adapters/references/index.js";
import { bodyEnd } from "../../../dist/domain/body-pages.js";
import { missing, STRICT } from "../need.ts";
import { buildIn, engineIn } from "./build-in.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const CLI = join(ROOT, "bin", "paperlint.mjs");
const CORPUS = join(ROOT, "fixtures", "accepted-papers");

/** Where the body ends, as a human established it on the rendered PDF. */
const Truth = z.object({
  ends_at: z.enum(["references", "appendix"]),
  ends_page: z.number().int().positive(),
  body_pages: z.number().int().nonnegative(),
  evidence: z.string().min(1),
});

const Variants = z.object({
  variants: z.array(
    Truth.extend({
      name: z.string().min(1),
      from: z.string().min(1),
      change: z.string().min(1),
      edits: z
        .array(
          z.object({ file: z.string(), find: z.string(), replace: z.string() }),
        )
        .min(1),
    }),
  ),
});

/** The facts the detector reads, as the build wrote them. */
const Facts = z.looseObject({
  pages_text: z.array(z.string()),
  bib_anchor_page: z.number().int().positive().nullable(),
  appendix_anchor_page: z.number().int().positive().nullable(),
});

const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(file, "utf8"));

/** Every corpus paper with a recorded page count. */
const papers = readdirSync(CORPUS, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() && existsSync(join(CORPUS, d.name, "page-count.json")),
  )
  .map((d) => ({
    name: d.name,
    truth: Truth.parse(readJson(join(CORPUS, d.name, "page-count.json"))),
  }));
const variants = Variants.parse(
  readJson(join(CORPUS, "page-count-variants.json")),
).variants;

/** The font sizes banal measured into the facts, as recorded. */
const Sizes = z.object({ body_pt: z.number(), ref_pt: z.number() });

/** The sizes read off the rendered glyphs with pdf.js, independently of banal and of the rule. */
const Rendered = z.object({
  rendered_body_pt: z.number(),
  rendered_ref_pt: z.number(),
  evidence: z.string().min(1),
});

const BodySize = z.object({
  papers: z.record(
    z.string(),
    Sizes.extend({ ...Rendered.shape, declared: z.string().min(1) }),
  ),
  variants: z.array(
    Sizes.extend({
      ...Rendered.shape,
      name: z.string().min(1),
      from: z.string().min(1),
      change: z.string().min(1),
      edits: Variants.shape.variants.element.shape.edits,
      findings: z.array(z.string()).min(1),
    }),
  ),
});
const bodySize = BodySize.parse(readJson(join(CORPUS, "body-size.json")));

/** A consumer holding every paper and every variant under `papers/`, each variant's edits applied. */
function consumer(): string {
  const work = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-pages-")));
  const copy = (from: string, to: string) => {
    cpSync(join(CORPUS, from), join(work, "papers", to), {
      recursive: true,
      verbatimSymlinks: true,
    });
  };
  const names = new Set([
    ...papers.map((p) => p.name),
    ...Object.keys(bodySize.papers),
  ]);
  for (const name of names) copy(name, name);
  for (const v of [...variants, ...bodySize.variants]) {
    copy(v.from, v.name);
    for (const e of v.edits) {
      const file = join(work, "papers", v.name, e.file);
      const text = readFileSync(file, "utf8");
      const found = text.split(e.find).length - 1;
      if (found !== 1)
        throw new Error(
          `${v.name}: \`${e.find}\` occurs ${String(found)} times in ${e.file}, not once — the variant would change nothing, or more than one thing`,
        );
      writeFileSync(file, text.replace(e.find, e.replace));
    }
  }
  writeFileSync(
    join(work, "package.json"),
    '{"name":"consumer","private":true}',
  );
  writeFileSync(
    join(work, "paperlint.json"),
    JSON.stringify({ [PAPERS_DIR_FIELD]: "papers" }),
  );
  return work;
}

const work = consumer();
const engine = engineIn(work);
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

const skip = missing(
  "a TeX Live with every declared package",
  engine !== "" && !engine.startsWith("engine: none"),
  `\`build --dry-run\` says ${engine || "no engine line"}. Install one with \`node bin/paperlint.mjs toolchain\`.`,
);

/** The end of the body `format/page-limit` finds in one built paper. */
const endOf = (name: string) => {
  const facts = Facts.parse(
    readJson(join(work, "papers", name, "_build", "paper.facts.json")),
  );
  return bodyEnd(facts.pages_text, {
    bib: facts.bib_anchor_page,
    appendix: facts.appendix_anchor_page,
  });
};

const Report = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({ ruleId: z.string().nullable(), message: z.string() }),
    ),
  }),
);

/**
 * One rule's messages for each paper, from ONE `paperlint lint --json` of their `paper.tex` — the
 * file the venue rules judge — under the `paperlint.json` each has on disk. One run, because a
 * lint of one real paper takes 10–25 s, most of it in the prose rules.
 */
function ruleMessages(
  names: readonly string[],
  ruleId: string,
): Map<string, string[]> {
  const r = spawnSync(
    process.execPath,
    [CLI, "lint", ...names.map((n) => `papers/${n}/paper.tex`), "--json"],
    { cwd: work, encoding: "utf8" },
  );
  const report = Report.parse(JSON.parse(r.stdout));
  const of = (n: string) => {
    const file = report.find(
      (f) => f.filePath === join(work, "papers", n, "paper.tex"),
    );
    // A paper missing from the report would read as "no finding" — the silence this test exists to tell apart.
    if (!file) throw new Error(`${n}: not in the lint report\n${r.stderr}`);
    return file.messages
      .filter((m) => m.ruleId === ruleId)
      .map((m) => m.message);
  };
  return new Map(names.map((n) => [n, of(n)]));
}

/** One rule's messages for one paper, linted under `settings`; its own `paperlint.json` is put back after. */
function messagesOf(name: string, ruleId: string, settings: unknown): string[] {
  const file = join(work, "papers", name, "paperlint.json");
  const own = readFileSync(file, "utf8");
  writeFileSync(file, JSON.stringify(settings));
  try {
    return ruleMessages([name], ruleId).get(name) ?? [];
  } finally {
    writeFileSync(file, own);
  }
}

/** The font sizes the build measured in one paper. */
const sizesOf = (name: string) =>
  Sizes.parse(
    readJson(join(work, "papers", name, "_build", "paper.facts.json")),
  );

// One build of every paper and variant, shared by both describes below.
let built = { status: -1, out: "" };
beforeAll(async () => {
  if (skip) return;
  const t0 = Date.now();
  built = await buildIn(work, ["--all"], {
    asked: [],
    checkReferences: referencesChecker({ today: () => "2026-09-29" }),
  });
  console.log(
    `built ${String(readdirSync(join(work, "papers")).length)} papers in ${String(Math.round((Date.now() - t0) / 1000))} s`,
  );
});

describe.skipIf(skip)("where the body ends, on real ACSAC papers", () => {
  it(`${engine} — under CI, paperlint's own cache`, () => {
    if (STRICT) expect(engine).toContain("paperlint cache");
    expect(built.status, built.out).toBe(0);
  });

  it("the corpus holds at least four built papers and every variant names one of them", () => {
    expect(papers.length).toBeGreaterThanOrEqual(4);
    const names = new Set(papers.map((p) => p.name));
    expect(variants.filter((v) => !names.has(v.from))).toEqual([]);
  });

  it.each([...papers.map((p) => ({ name: p.name, ...p.truth })), ...variants])(
    "$name: the $ends_at on page $ends_page end the body, $body_pages pages",
    (c) => {
      expect(endOf(c.name), c.evidence).toEqual({
        kind: "found",
        by: c.ends_at,
        page: c.ends_page,
        bodyPages: c.body_pages,
      });
    },
  );

  it("AIDC regular (12 body pages): a 12-page body passes, a 13-page body is reported", () => {
    const aidc = {
      extends: "paperlint:aidc",
      kind: "regular",
      identity: ["Nobody In These Papers"],
    };
    const pageLimit = (name: string) =>
      messagesOf(name, "format/page-limit", aidc);
    expect(pageLimit("secure-acsac24")).toEqual([]);
    expect(pageLimit("barovox-acsac24")).toEqual([
      "body pages (up to the references on page 13): 13, over the limit 12 for aidc/regular — a desk reject; cut the text",
    ]);
  });
});

describe.skipIf(skip)("pdf/body-size, on real accepted papers", () => {
  const names = [
    ...Object.keys(bodySize.papers),
    ...bodySize.variants.map((v) => v.name),
  ];
  let found = new Map<string, string[]>();
  beforeAll(() => {
    found = ruleMessages(names, "pdf/body-size");
  });

  it("every variant changes a paper of the corpus", () => {
    const papersOf = new Set(Object.keys(bodySize.papers));
    expect(bodySize.variants.filter((v) => !papersOf.has(v.from))).toEqual([]);
  });

  it.each(Object.entries(bodySize.papers))(
    "%s, an accepted paper, draws no finding",
    (name, truth) => {
      expect(sizesOf(name), truth.evidence).toEqual({
        body_pt: truth.body_pt,
        ref_pt: truth.ref_pt,
      });
      expect(found.get(name)).toEqual([]);
    },
  );

  it.each(bodySize.variants)("$name ($change) is reported", (v) => {
    expect(sizesOf(v.name), v.evidence).toEqual({
      body_pt: v.body_pt,
      ref_pt: v.ref_pt,
    });
    expect(found.get(v.name)).toEqual(v.findings);
  });
});
