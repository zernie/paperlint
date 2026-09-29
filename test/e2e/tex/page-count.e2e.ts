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

/** A consumer holding every paper and every variant under `papers/`, each variant's edits applied. */
function consumer(): string {
  const work = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-pages-")));
  const copy = (from: string, to: string) => {
    cpSync(join(CORPUS, from), join(work, "papers", to), {
      recursive: true,
      verbatimSymlinks: true,
    });
  };
  for (const p of papers) copy(p.name, p.name);
  for (const v of variants) {
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

/** `format/page-limit`'s messages for one paper, linted under `settings`. */
function pageLimit(name: string, settings: object): string[] {
  writeFileSync(
    join(work, "papers", name, "paperlint.json"),
    JSON.stringify(settings),
  );
  const r = spawnSync(
    process.execPath,
    [CLI, "lint", `papers/${name}`, "--json"],
    { cwd: work, encoding: "utf8" },
  );
  const report = z
    .array(
      z.looseObject({
        messages: z.array(
          z.looseObject({ ruleId: z.string().nullable(), message: z.string() }),
        ),
      }),
    )
    .parse(JSON.parse(r.stdout));
  return report
    .flatMap((f) => f.messages)
    .filter((m) => m.ruleId === "format/page-limit")
    .map((m) => m.message);
}

describe.skipIf(skip)("where the body ends, on real ACSAC papers", () => {
  let built = { status: -1, out: "" };
  beforeAll(async () => {
    const t0 = Date.now();
    built = await buildIn(work, ["--all"], {
      asked: [],
      checkReferences: referencesChecker({ today: () => "2026-09-29" }),
    });
    console.log(
      `built ${String(papers.length + variants.length)} papers in ${String(Math.round((Date.now() - t0) / 1000))} s`,
    );
  });

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
    expect(pageLimit("secure-acsac24", aidc)).toEqual([]);
    expect(pageLimit("barovox-acsac24", aidc)).toEqual([
      "body pages (up to the references on page 13): 13, over the limit 12 for aidc/regular — a desk reject; cut the text",
    ]);
  });
});
