/**
 * The author's decision page for a paper's candidate neighbours, and the decisions back into the repo.
 *
 *   node candidate_page.ts build  <paper-dir> <out.html>
 *   node candidate_page.ts export <paper-dir> <decisions-dir>
 *
 * build: reads siblings/candidates/*.json (shape and rules: novelty_candidates.py, asked through its `shape`
 * command so there is one copy of them), the claims of siblings/novelty.json and siblings/candidate-page.json:
 *
 *   {"artifact": "https://claude.ai/artifact/...",  // where the page is published, one URL per paper
 *    "session": "session_...",                       // the Claude session "Send decisions to Claude" wakes
 *    "pdfs": {"<candidate id>": "<asset url of its PDF>"}}
 *
 * and fills candidate_page.html: an overview tab and one tab per candidate (in plain words, the authors'
 * abstract and conclusion, why it came up, each passage as its highlighted page crop with the verbatim quote
 * and what it means, PDF and source links, add / cite / skip with a reason). Crops are embedded and the look is
 * candidate_page.css inlined, so the page rebuilds from the repo alone. Publish it with
 * capabilities {db: {}, assets: {}, mcp: {servers: [{server: "Claude Code Remote", tools: ["send_message"]}]}}.
 * A press saves to the `decisions` collection (doc id = candidate id: {choice, reason, at, source: "page"}).
 *
 * export: reads the `decisions` documents ArtifactData saved (`list` with out_dir; one <id>.json each) and
 * writes each into its candidate file's `decision`. An id with no candidate or a choice outside add / cite /
 * skip is refused and nothing is written; a file whose decision is unchanged is left alone.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

type Json = Record<string, any>;
const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(here, "candidate_page.html");
const OCEAN = join(here, "candidate_page.css");
const CHOICES = ["add", "cite", "skip"] as const;
const DOC_FIELDS = ["choice", "reason", "at", "source"] as const;

const fail = (msg: string): never => {
  console.error(`ERROR ${msg}`);
  process.exit(1);
};
const readJson = (p: string): Json => JSON.parse(readFileSync(p, "utf8"));
const candidateFiles = (paper: string): string[] => {
  const dir = join(paper, "siblings", "candidates");
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n.endsWith(".json"))
        .sort()
        .map((n) => join(dir, n))
    : [];
};

const shapeProblems = (paper: string): string => {
  try {
    execFileSync(
      "python3",
      ["-I", join(here, "novelty_candidates.py"), "shape", paper],
      { encoding: "utf8" },
    );
    return "";
  } catch (e: any) {
    return (e.stdout || e.message || "").trim();
  }
};

const pageData = (paper: string): Json => {
  const problems = shapeProblems(paper);
  if (problems) fail(problems.split("\n").join("; "));
  const files = candidateFiles(paper);
  if (!files.length) fail(`no candidates in ${paper}/siblings/candidates`);
  const conf = readJson(join(paper, "siblings", "candidate-page.json"));
  const claims = Object.fromEntries(
    (readJson(join(paper, "siblings", "novelty.json")).claims || []).map(
      (c: Json) => [c.id, c.sentence || ""],
    ),
  );
  const crop = (rel: string) =>
    `data:image/png;base64,${readFileSync(join(paper, rel)).toString("base64")}`;
  return {
    paper: basename(normalize(paper)),
    session: conf.session || "",
    claims,
    candidates: files.map((f) => {
      const c = readJson(f);
      return {
        id: c.id,
        title: c.title,
        authors: c.authors,
        venue: c.venue,
        year: c.year,
        url: c.url,
        summary: c.summary,
        abstract: c.abstract,
        conclusion: c.conclusion,
        suggestion: c.suggestion,
        suggestion_why: c.suggestion_why,
        found_by: c.found_by,
        pdf: (conf.pdfs || {})[c.id] || null,
        decision: c.decision || null,
        passages: c.passages.map((p: Json) => ({
          claim: p.claim,
          page: p.page,
          quote: p.quote,
          meaning: p.meaning,
          img: crop(p.crop),
        })),
      };
    }),
  };
};

const build = (paper: string, out: string) => {
  const data = pageData(paper);
  // </script> inside the JSON would end the data block early; "<\/" is the same string to JSON.parse.
  const blob = JSON.stringify(data).replaceAll("</", "<\\/");
  const title = `Neighbour Candidates · ${data.paper}`.replace(
    /[&<>"]/g,
    (ch) => `&#${ch.charCodeAt(0)};`,
  );
  const page = readFileSync(TEMPLATE, "utf8")
    .replace("__TITLE__", () => title)
    .replace("__OCEAN__", () => readFileSync(OCEAN, "utf8"))
    .replace("__DATA__", () => blob);
  writeFileSync(out, page);
  console.log(
    `${out}: ${data.candidates.length} candidate(s), ${Math.floor(page.length / 1024)} KB`,
  );
};

const exportDecisions = (paper: string, folder: string) => {
  const cands = new Map(
    candidateFiles(paper).map((f) => [basename(f, ".json"), f] as const),
  );
  const sub = existsSync(join(folder, "decisions"))
    ? join(folder, "decisions")
    : folder;
  // ArtifactData may wrap a document's fields; take the fields either way.
  const docs = readdirSync(sub)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => {
      const raw = readJson(join(sub, n));
      return [
        basename(n, ".json"),
        raw.data && typeof raw.data === "object" ? raw.data : raw,
      ] as const;
    });
  const problems = [
    ...docs
      .filter(([id]) => !cands.has(id))
      .map(([id]) => `${id}: no candidate with this id`),
    ...docs
      .filter(([, d]) => !CHOICES.includes(d.choice))
      .map(
        ([id, d]) =>
          `${id}: choice ${JSON.stringify(d.choice)} is not one of ${CHOICES.join(", ")}`,
      ),
  ];
  if (problems.length) fail(problems.join("; "));
  docs.forEach(([id, d]) => {
    const file = cands.get(id) as string;
    const c = readJson(file);
    const decision: Json = {
      source: "page",
      ...Object.fromEntries(
        DOC_FIELDS.filter(
          (k) => d[k] !== undefined && d[k] !== null && d[k] !== "",
        ).map((k) => [k, d[k]]),
      ),
    };
    const sorted = (o: Json | null | undefined) =>
      JSON.stringify(Object.entries(o ?? {}).sort());
    if (sorted(c.decision) === sorted(decision))
      return console.log(`${id}: unchanged (${decision.choice})`);
    writeFileSync(file, JSON.stringify({ ...c, decision }, null, 2) + "\n");
    console.log(
      `${id}: ${decision.choice}${decision.reason ? ` — ${decision.reason}` : ""}`,
    );
  });
  const decided = new Set(docs.map(([id]) => id));
  const waiting = [...cands]
    .filter(([id, f]) => !decided.has(id) && !readJson(f).decision)
    .map(([id]) => id);
  if (waiting.length) console.log(`still undecided: ${waiting.join(", ")}`);
};

const [cmd, paper, target] = process.argv.slice(2);
if (!cmd || !paper || !target || !["build", "export"].includes(cmd)) {
  console.error(
    "usage: node candidate_page.ts build <paper-dir> <out.html> | export <paper-dir> <decisions-dir>",
  );
  process.exit(2);
}
if (cmd === "build") build(paper, target);
else exportDecisions(paper, target);
