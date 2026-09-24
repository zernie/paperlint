/**
 * `engine.ts` — which TeX Live `rpp build` compiles with.
 *
 * Tables, in the order the mutation battery relies on:
 *   1. `resolveEngine` over `EngineFacts` — one row per branch of the order;
 *   2. the fact readers: `missingPackages` over kpsewhich output, `missingTools`, `whichOnPath`,
 *      `probeTree` through a fake runner.
 * All pure or port-driven: no TeX needed. The real-TeX half is `test/e2e/build.mjs`.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  resolveEngine,
  missingPackages,
  missingTools,
  whichOnPath,
  probeTree,
  supportedPlatform,
} = await import(join(HERE, "engine.ts"));

let n = 0;
const check = (label, cond, detail = "") => {
  assert.ok(cond, `${label}${detail ? ` — ${detail}` : ""}`);
  n++;
};

// ── 1. resolveEngine ────────────────────────────────────────────────────────────────────
const tree = (label, missing = []) => ({ label, bin: `/${label}`, missing });
const COMPLETE_CACHE = tree("cache");
const PARTIAL_CACHE = tree("cache", ["kastrup"]);
const COMPLETE_SYS = tree("sys");
const PARTIAL_SYS = tree("sys", ["cm-super", "libertine"]);
const REQUIRED = ["acmart", "cm-super", "kastrup", "libertine"];
const facts = (o) => ({
  supported: true,
  cache: null,
  system: null,
  interactive: false,
  required: REQUIRED,
  ...o,
});
const ROWS = [
  [
    "a complete cache wins, even over a complete system TeX",
    facts({ cache: COMPLETE_CACHE, system: COMPLETE_SYS }),
    { kind: "use-cache", tree: COMPLETE_CACHE },
  ],
  [
    "a partial cache yields to a complete system TeX",
    facts({ cache: PARTIAL_CACHE, system: COMPLETE_SYS }),
    { kind: "use-system", tree: COMPLETE_SYS },
  ],
  [
    "no cache, a complete system TeX is used",
    facts({ system: COMPLETE_SYS }),
    { kind: "use-system", tree: COMPLETE_SYS },
  ],
  [
    "🔴 a system TeX that LACKS a declared package is NOT used — not even non-interactively",
    facts({ system: PARTIAL_SYS }),
    { kind: "refuse", reason: "not-installed", missing: REQUIRED },
  ],
  [
    "nothing qualifies, a terminal: ask, for everything",
    facts({ interactive: true, system: PARTIAL_SYS }),
    { kind: "ask", missing: REQUIRED },
  ],
  [
    "nothing qualifies, a terminal, a partial cache: ask for the cache's gaps only",
    facts({ interactive: true, cache: PARTIAL_CACHE }),
    { kind: "ask", missing: ["kastrup"] },
  ],
  [
    "nothing qualifies, no terminal: refuse (never a silent install)",
    facts({}),
    { kind: "refuse", reason: "not-installed", missing: REQUIRED },
  ],
  [
    "unsupported platform, nothing qualifies: refuse as unsupported, even on a terminal",
    facts({ supported: false, interactive: true }),
    { kind: "refuse", reason: "unsupported", missing: REQUIRED },
  ],
  [
    "unsupported platform, a complete system TeX: used",
    facts({ supported: false, system: COMPLETE_SYS }),
    { kind: "use-system", tree: COMPLETE_SYS },
  ],
];
for (const [label, f, want] of ROWS) {
  const got = resolveEngine(f);
  check(
    `resolveEngine: ${label}`,
    JSON.stringify(got) === JSON.stringify(want),
    JSON.stringify(got),
  );
}
check(
  "supportedPlatform: linux and darwin, not win32",
  supportedPlatform("linux") &&
    supportedPlatform("darwin") &&
    !supportedPlatform("win32"),
);

// ── 2. the fact readers ─────────────────────────────────────────────────────────────────
const PKGS = {
  acmart: ["acmart.cls"],
  latex: ["latex.ltx", "article.cls"],
  libertine: ["libertine.sty"],
};
check(
  "missingPackages: matched by FILE NAME of each printed path, sorted",
  JSON.stringify(
    missingPackages(
      PKGS,
      "/t/tex/latex/acmart/acmart.cls\n/t/tex/latex/base/latex.ltx\n",
    ),
  ) === '["latex","libertine"]',
);
check(
  "missingPackages: one proof of two missing is enough to count the package missing",
  missingPackages(
    { latex: ["latex.ltx", "article.cls"] },
    "/t/latex.ltx\n",
  ).includes("latex"),
);
check(
  "missingPackages: all present → none",
  missingPackages(
    PKGS,
    "/a/acmart.cls\n/b/latex.ltx\n/b/article.cls\n/c/libertine.sty\n",
  ).length === 0,
);
check(
  "missingTools: by executable in the bin directory",
  JSON.stringify(
    missingTools(
      { texcount: ["texcount"], checkcites: ["checkcites"] },
      "/bin",
      (p) => p === "/bin/texcount",
    ),
  ) === '["checkcites"]',
);
check(
  "whichOnPath: the first directory that has it; empty segments skipped",
  whichOnPath("pdflatex", ":/a:/b:/c", (p) =>
    ["/b/pdflatex", "/c/pdflatex"].includes(p),
  ) === "/b",
);
check(
  "whichOnPath: nowhere → null",
  whichOnPath("pdflatex", "/a:/b", () => false) === null,
);
{
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, args]);
    return { stdout: "/x/acmart.cls\n", status: 1 };
  };
  const missing = probeTree("/tl/bin", PKGS, run);
  check(
    "probeTree: runs THAT tree's kpsewhich, once, with every proof file once",
    calls.length === 1 &&
      calls[0][0] === "/tl/bin/kpsewhich" &&
      calls[0][1].length === 4,
    JSON.stringify(calls),
  );
  check(
    "probeTree: kpsewhich's exit code is not the verdict — the printed paths are",
    JSON.stringify(missing) === '["latex","libertine"]',
  );
}
check(
  "🔴 probeTree: a kpsewhich that cannot start finds NOTHING — never 'all present'",
  JSON.stringify(
    probeTree("/none", PKGS, () => ({ error: new Error("ENOENT") })),
  ) === '["acmart","latex","libertine"]',
);

console.log(`engine: ${n} checks passed`);
