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
import { z } from "zod";
import { createChecker } from "../../lib/check.ts";
import type { ScriptResult } from "../../test/support.ts";

/** The facts file, as far as these checks read it. */
const Facts = z.looseObject({
  schema: z.unknown().optional(),
  pdf: z.unknown().optional(),
  venue: z.unknown().optional(),
  kind: z.unknown().optional(),
  geometry_source: z.unknown().optional(),
  columns: z.unknown().optional(),
  fonts: z.unknown().optional(),
});
const Fonts = z.array(
  z.looseObject({
    name: z.unknown().optional(),
    embedded: z.unknown().optional(),
    type: z.unknown().optional(),
  }),
);
const readFacts = (file: string) =>
  Facts.parse(JSON.parse(readFileSync(file, "utf8")));

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIM = join(HERE, "extract-pdf-facts.mjs");
const FIX = resolve(HERE, "..", "..", "fixtures", "pdf-facts");

const check = createChecker();

const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-extract-")));
/**
 * Run the shim from `root`, with no banal anywhere unless `env` names one. `HOME` is the temp root:
 * without it Node falls back to the account's home, where `paperlint toolchain` may have installed banal.
 */
const shim = (args: readonly string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SHIM, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: root,
      CLAUDE_PROJECT_DIR: root,
      // Forwarded, not chosen: under `npm run coverage` these carry the coverage directory and the
      // preload that resolves dist/ to src/. Dropping them measured the shim's dist/ imports as a
      // second copy of each module (the function map remapped through source maps, with shifted
      // columns), so every function it did not call counted as uncovered in src/.
      ...(process.env.NODE_OPTIONS
        ? { NODE_OPTIONS: process.env.NODE_OPTIONS }
        : {}),
      ...(process.env.NODE_V8_COVERAGE
        ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE }
        : {}),
      ...env,
    },
  });
const said = (r: Pick<ScriptResult, "stdout" | "stderr">) =>
  `${r.stdout}${r.stderr}`;

try {
  const paper = join(root, "papers", "mixed");
  mkdirSync(paper, { recursive: true });
  cpSync(join(FIX, "t3-mixed.pdf"), join(paper, "paper.pdf"));
  writeFileSync(
    join(paper, "paperlint.json"),
    JSON.stringify({ extends: "paperlint:agenticdev", kind: "short" }),
  );
  const factsFile = join(paper, "_build", "paper.facts.json");

  check("usage: no target is exit 2", shim([]).status === 2);
  check("no such path is exit 1", shim([join(root, "nope")]).status === 1);

  const strict = shim([paper, "--strict"]);
  check(
    "🔴 --strict with no banal: exit 1, named as an environment error, and nothing written",
    strict.status === 1 &&
      /banal not found/.test(said(strict)) &&
      /`npx paperlint toolchain` installs it/.test(said(strict)) &&
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
  const facts = readFacts(factsFile);
  const fonts = Fonts.safeParse(facts.fonts);
  const fontList = fonts.success ? fonts.data : [];
  check(
    "the facts are schema 2, about paper.pdf, for the venue paperlint.json declares",
    facts.schema === 2 &&
      facts.pdf === "paper.pdf" &&
      facts.venue === "agenticdev" &&
      facts.kind === "short",
    JSON.stringify(facts).slice(0, 200),
  );
  check(
    "a text PDF has fonts",
    fonts.success && fontList.length === 4,
    JSON.stringify(facts.fonts),
  );
  const times = fontList.find((f) => f.name === "Times-Roman");
  check(
    "🔴 Times-Roman — pdffonts `Type 1 Custom no no yes` — is embedded: false (the old reader said true)",
    times?.embedded === false && times.type === "Type 1",
    JSON.stringify(times),
  );
  check(
    "the Type 3 font keeps poppler's type spelling, which consumers match on",
    fontList.some((f) => f.type === "Type 3"),
  );

  const fake = join(root, "banal.pl");
  writeFileSync(
    fake,
    `print '{"papersize":[792,612],"columns":2,"bodyfontsize":9,"pages":[{}]}';\n`,
  );
  const withBanal = shim([paper, "--strict"], { BANAL: fake });
  const g = readFacts(factsFile);
  check(
    "--strict with banal ($BANAL): exit 0, and the geometry is banal's",
    withBanal.status === 0 && g.geometry_source === "banal" && g.columns === 2,
    said(withBanal),
  );

  // Guards: missing perl is its own diagnosis, with the fix — not a generic "banal failed".
  const noPerl = shim([paper, "--strict"], {
    BANAL: fake,
    PATH: mkdtempSync(join(root, "empty-path-")),
  });
  check(
    "🔴 --strict with banal but no perl: exit 1, and the message names perl and how to get it",
    noPerl.status === 1 &&
      /perl is not installed/.test(said(noPerl)) &&
      /apt-get install perl/.test(said(noPerl)),
    said(noPerl),
  );
  const noPerlLocal = shim([paper], {
    BANAL: fake,
    PATH: mkdtempSync(join(root, "empty-path-")),
  });
  check(
    "without --strict and no perl: exit 0, and the missing geometry is said, naming perl",
    noPerlLocal.status === 0 &&
      /perl is not installed/.test(noPerlLocal.stderr),
    said(noPerlLocal),
  );

  writeFileSync(
    join(paper, "paperlint.json"),
    JSON.stringify({ pdf: "build/other.pdf" }),
  );
  const missing = shim([paper, "--strict"], { BANAL: fake });
  check(
    "a declared artifact that is not built is exit 3, not 1",
    missing.status === 3 && /not built/.test(said(missing)),
    said(missing),
  );

  // ── a PDF named directly, in a directory with no paperlint.json, no project dir set ──
  const loose = join(root, "papers", "loose");
  mkdirSync(loose, { recursive: true });
  cpSync(join(FIX, "t3-mixed.pdf"), join(loose, "draft.pdf"));
  const direct = shim([join(loose, "draft.pdf")], { CLAUDE_PROJECT_DIR: "" });
  const looseFacts = join(loose, "_build", "paper.facts.json");
  check(
    "a PDF path: facts go to its directory's _build/, the path printed relative to the cwd",
    direct.status === 0 &&
      direct.stdout.startsWith(
        "✅ draft.pdf → papers/loose/_build/paper.facts.json (",
      ) &&
      readFacts(looseFacts).venue === null,
    said(direct),
  );
  // The project directory IS the facts file (nonsense, but an environment can say it): the
  // relative path would be empty, so the absolute one is printed instead of nothing.
  const same = shim([join(loose, "draft.pdf")], {
    CLAUDE_PROJECT_DIR: looseFacts,
  });
  check(
    "a project dir equal to the facts file prints the absolute path, never an empty one",
    same.stdout.startsWith(`✅ draft.pdf → ${looseFacts} (`),
    said(same),
  );

  // ── a file that is not a PDF: refused, strict or not, in the words for the mode ──
  writeFileSync(join(loose, "broken.pdf"), "not a pdf at all\n");
  const brokenStrict = shim([join(loose, "broken.pdf"), "--strict"]);
  const brokenLocal = shim([join(loose, "broken.pdf")]);
  check(
    "an unreadable PDF: --strict exits 1 as an environment error; locally exit 0, saying THE PDF IS NOT CHECKED",
    brokenStrict.status === 1 &&
      /🛑 facts not taken: .* — in CI this is an environment error/.test(
        brokenStrict.stderr,
      ) &&
      brokenLocal.status === 0 &&
      /⏭️ {2}facts not taken: .*THE PDF IS NOT CHECKED/.test(
        brokenLocal.stderr,
      ),
    `${said(brokenStrict)}\n---\n${said(brokenLocal)}`,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(check.count)} assertions passed — extract-pdf-facts: the exit-code contract, schema 2, and the no-no-yes font`,
);
