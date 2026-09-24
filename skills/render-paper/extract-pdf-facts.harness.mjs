#!/usr/bin/env node
/**
 * `extract-pdf-facts.mjs` — the command-line shim over `writeFacts`, run as a process the way CI
 * runs it, on a real committed PDF.
 *
 * What is pinned here is the CONTRACT callers branch on — the exit codes and where the file lands —
 * plus the one defect of the poppler reader this shim used to carry: it read `yes` anywhere in a
 * `pdffonts` row, so a font printed `no no yes` (not embedded, not subset, has a ToUnicode map)
 * came out embedded. `fixtures/pdf-facts/t3-mixed.pdf` carries exactly such a font.
 *
 * The shim imports the compiled package (`dist/`), so `npm run build` runs before this.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIM = join(HERE, "extract-pdf-facts.mjs");
const FIX = resolve(HERE, "..", "..", "fixtures", "pdf-facts");

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, detail ? `${label} — ${detail}` : label);
  n++;
};

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-extract-")));
/** Run the shim from `root`, with no banal anywhere unless `env` names one. */
const shim = (args, env = {}) =>
  spawnSync(process.execPath, [SHIM, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH, CLAUDE_PROJECT_DIR: root, ...env },
  });
const said = (r) => `${r.stdout}${r.stderr}`;

try {
  const paper = join(root, "papers", "mixed");
  mkdirSync(paper, { recursive: true });
  cpSync(join(FIX, "t3-mixed.pdf"), join(paper, "paper.pdf"));
  writeFileSync(
    join(paper, "venue.json"),
    JSON.stringify({ venue: "agenticdev", kind: "short" }),
  );
  const factsFile = join(paper, "_build", "paper.facts.json");

  check("usage: no target is exit 2", shim([]).status === 2);
  check("no such path is exit 1", shim([join(root, "nope")]).status === 1);

  const strict = shim([paper, "--strict"]);
  check(
    "🔴 --strict with no banal: exit 1, named as an environment error, and nothing written",
    strict.status === 1 &&
      /banal not found/.test(said(strict)) &&
      /environment error/.test(said(strict)) &&
      !existsSync(factsFile),
    said(strict),
  );

  const local = shim([paper]);
  check(
    "without --strict and no banal: exit 0, facts written, the missing geometry said out loud",
    local.status === 0 &&
      existsSync(factsFile) &&
      /banal not found/.test(local.stderr),
    said(local),
  );
  const facts = JSON.parse(readFileSync(factsFile, "utf8"));
  check(
    "the facts are schema 2, about paper.pdf, for the venue venue.json declares",
    facts.schema === 2 &&
      facts.pdf === "paper.pdf" &&
      facts.venue === "agenticdev" &&
      facts.kind === "short",
    JSON.stringify(facts).slice(0, 200),
  );
  check(
    "a text PDF has fonts",
    Array.isArray(facts.fonts) && facts.fonts.length === 4,
    JSON.stringify(facts.fonts),
  );
  const times = facts.fonts.find((f) => f.name === "Times-Roman");
  check(
    "🔴 Times-Roman — pdffonts `Type 1 Custom no no yes` — is embedded: false (the old reader said true)",
    times?.embedded === false && times.type === "Type 1",
    JSON.stringify(times),
  );
  check(
    "the Type 3 font keeps poppler's type spelling, which consumers match on",
    facts.fonts.some((f) => f.type === "Type 3"),
  );

  const fake = join(root, "banal.pl");
  writeFileSync(
    fake,
    `print '{"papersize":[792,612],"columns":2,"bodyfontsize":9,"pages":[{}]}';\n`,
  );
  const withBanal = shim([paper, "--strict"], { BANAL: fake });
  const g = JSON.parse(readFileSync(factsFile, "utf8"));
  check(
    "--strict with banal ($BANAL): exit 0, and the geometry is banal's",
    withBanal.status === 0 && g.geometry_source === "banal" && g.columns === 2,
    said(withBanal),
  );

  writeFileSync(
    join(paper, "venue.json"),
    JSON.stringify({ venue: "x", pdf: "build/other.pdf" }),
  );
  const missing = shim([paper, "--strict"], { BANAL: fake });
  check(
    "a declared artifact that is not built is exit 3, not 1",
    missing.status === 3 && /not built/.test(said(missing)),
    said(missing),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — extract-pdf-facts: the exit-code contract, schema 2, and the no-no-yes font`,
);
