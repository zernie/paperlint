/**
 * Battery for `engine.ts` — which TeX Live `rpp build` compiles with.
 *
 * Each case breaks one line and names the harness row that must go red. The harness runs its
 * tables in order, so a case dies at its own assertion, not at a later one that happens to depend
 * on it.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "engine.ts");
const HARNESS = join(HERE, "engine.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "a complete cache is not preferred",
        harness: HARNESS,
        expect: "resolveEngine: a complete cache wins",
        disables:
          "the order: rpp's own verified cache first, so a build does not depend on whatever TeX Live the machine happens to carry",
        edits: [
          [
            SRC,
            "  if (f.cache && f.cache.missing.length === 0)",
            "  if (false)",
          ],
        ],
      },
      {
        name: "a system TeX qualifies by merely existing",
        harness: HARNESS,
        expect: "🔴 a system TeX that LACKS a declared package is NOT used",
        disables:
          "the whole point of #26: a TeX Live without libertine builds an acmart paper GREEN, in Computer Modern",
        edits: [
          [
            SRC,
            "  if (f.system && f.system.missing.length === 0)",
            "  if (f.system)",
          ],
        ],
      },
      {
        name: "the question offers everything even when a cache exists",
        harness: HARNESS,
        expect: "ask for the cache's gaps only",
        disables:
          "installing only what the cache lacks — a partial cache would be offered a full reinstall",
        edits: [
          [
            SRC,
            '  if (f.interactive) return { kind: "ask", missing };',
            '  if (f.interactive) return { kind: "ask", missing: f.required };',
          ],
        ],
      },
      {
        name: "one missing proof of two is ignored",
        harness: HARNESS,
        expect: "missingPackages: one proof of two missing",
        disables:
          "a package counts as present only when EVERY file that proves it resolves",
        edits: [
          [
            SRC,
            "    .filter(([, proofs]) => proofs.some((f) => !have.has(f)))",
            "    .filter(([, proofs]) => proofs.every((f) => !have.has(f)))",
          ],
        ],
      },
      {
        name: "a kpsewhich that cannot start reads as all present",
        harness: HARNESS,
        expect: "🔴 probeTree: a kpsewhich that cannot start",
        disables:
          '"could not ask" must never read as "nothing missing" — a broken tree would be used',
        edits: [
          [
            SRC,
            "  if (r.error) return Object.keys(packages).sort();",
            "  if (r.error) return [];",
          ],
        ],
      },
      {
        name: "a tool counts as installed when its path merely exists",
        harness: HARNESS,
        expect: "🔴 missingTools: a DIRECTORY named like the tool is missing",
        disables:
          "the runnable-file check. `existsSync` says yes to a directory and to a file without the " +
          "execute bit, and `rpp toolchain --check` reported a verified tree whose texcount could not start",
        edits: [
          [
            SRC,
            '    if (!statSync(path).isFile()) return false;\n    if (platform !== "win32") accessSync(path, constants.X_OK);\n',
            "    statSync(path);\n",
          ],
        ],
      },
      {
        name: "a regular file without the execute bit counts as installed",
        harness: HARNESS,
        expect:
          "🔴 missingTools: a regular file WITHOUT the execute bit is missing",
        disables:
          "the POSIX permission half. A file the installer left at 0644 fails to start, and must not " +
          "read as present",
        edits: [
          [
            SRC,
            '    if (platform !== "win32") accessSync(path, constants.X_OK);\n',
            "",
          ],
        ],
      },
    ],
  }),
);
