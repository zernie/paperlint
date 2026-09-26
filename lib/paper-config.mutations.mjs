/**
 * Battery for `lib/paper-config.mjs` and the cross-check of its carriers.
 *
 * The subject is agreement among several files about one value. The failure here is silent by
 * construction: a drifted key breaks neither the build nor the run, it only makes one carrier
 * read settings the consumer never wrote. Every case below reintroduces that kind of drift.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "./mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const HARNESS = join(HERE, "paper-config.harness.mjs");
const HOOK = join(ROOT, "hooks", "paper-skills-nudge.hook.mjs");
const RULE = join(ROOT, "eslint-rules", "papers.mjs");
const DOCTOR = join(ROOT, "src", "doctor.ts");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the key drifts in one of the hooks",
        harness: HARNESS,
        expect: "all carriers agree on CONFIG_KEY",
        disables:
          "the whole point of the forced duplication. A hook with a mismatched key reads " +
          "settings the consumer never wrote, falls back to the default, and guards the wrong " +
          "directory — silently, because silence is exactly what its success looks like",
        edits: [
          [
            HOOK,
            'export const CONFIG_KEY = "paperlint";',
            'export const CONFIG_KEY = "paperlints";',
          ],
        ],
      },
      {
        name: "a hook's copy of the papers-directory field name drifts",
        harness: HARNESS,
        expect: "all carriers agree on PAPERS_DIR_FIELD",
        disables:
          "the check on the one value this package renamed. A hook reading a different field " +
          "name finds nothing, falls back to the default directory, and says nothing about it",
        edits: [
          [
            HOOK,
            // Prefix the value rather than spell it, so a future rename does not touch this file.
            'export const PAPERS_DIR_FIELD = "',
            'export const PAPERS_DIR_FIELD = "drifted-',
          ],
        ],
      },
      {
        name: "the ESLint rule grows its OWN copy of the default again",
        harness: HARNESS,
        expect: "all carriers agree on DEFAULT_PAPERS_ROOT",
        disables:
          "the re-export the consolidation existed for in the first place. A non-hook's own " +
          "copy serves nothing — the import restriction does not apply to it — and exactly this " +
          "kind of copy sat OUTSIDE the cross-check for two days, because the cross-check " +
          "compared hooks against each other",
        edits: [
          [
            RULE,
            "import {\n  CONFIG_KEY,\n  DEFAULT_PAPERS_ROOT,\n  PAPERS_DIR_FIELD,",
            'const DEFAULT_PAPERS_ROOT = "drafts";\nimport {\n  CONFIG_KEY,\n  PAPERS_DIR_FIELD,',
          ],
        ],
      },
      {
        name: "the config key stops being the package name",
        harness: HARNESS,
        expect: "config key equals the package name",
        disables:
          "the link between what the package is called and the name the consumer declares its " +
          "settings under. They drift apart when the package is renamed: the docs will say one " +
          "thing, a different one gets read, and there will be no error at all",
        // The PACKAGE is renamed, not the constant: the carriers stay in agreement with each
        // other, and the only thing that drifts is the "key = package name" link. Swapping the
        // constant itself would kill the neighboring carrier-agreement assertion first and
        // never reach this one.
        edits: [
          [
            join(ROOT, "package.json"),
            '"name": "paperlint",',
            '"name": "paperlint-renamed",',
          ],
        ],
      },
      {
        name: "a hook smuggles a capability past the vocabulary",
        harness: HARNESS,
        expect: "pulls in nothing outside the hook vocabulary",
        disables:
          "the one guarantee the hooks put up with duplication for: a hook's capabilities equal " +
          "its API surface. A hook that reaches `node:fs` still runs and passes the value " +
          "cross-check — the violation is visible only through this check",
        edits: [
          [
            HOOK,
            "import {\n  experimental_defineReact,",
            'import { readFileSync } from "node:fs";\nimport {\n  experimental_defineReact,',
          ],
        ],
      },
      {
        name: "a constant is written into a sixth file instead of imported",
        harness: HARNESS,
        expect: "no declaration outside the carrier list",
        disables:
          "the COMPLETENESS check. The carrier list is explicit, so a new copy planted anywhere " +
          "else would have nothing to compare against — which is exactly how the duplication " +
          "spread last time",
        edits: [
          [
            DOCTOR,
            'import {\n  papersRoot,\n  CONFIG_KEY,\n  DEFAULT_PAPERS_ROOT,\n  PAPERS_DIR_FIELD,\n} from "../hooks/paper-edit-guard.hook.mjs";',
            'import {\n  papersRoot,\n  DEFAULT_PAPERS_ROOT,\n  PAPERS_DIR_FIELD,\n} from "../hooks/paper-edit-guard.hook.mjs";\nconst CONFIG_KEY = "paperlint";',
          ],
        ],
      },
      {
        name: "the completeness walk stops looking into the hooks",
        harness: HARNESS,
        expect: "the search itself is not empty",
        disables:
          "the guard against a FALSE ZERO. A search that found nothing looks like a clean " +
          "corpus; without this assertion, the completeness check, having started looking in " +
          "the wrong place, would report all-clear",
        edits: [
          [
            HARNESS,
            'const skip = new Set([\n    "node_modules",\n    ".git",\n    "dist",\n    "_build",\n    "fixtures",\n    "repro",\n  ]);',
            'const skip = new Set([\n    "node_modules",\n    ".git",\n    "dist",\n    "_build",\n    "fixtures",\n    "repro",\n    "hooks",\n    "lib",\n  ]);',
          ],
        ],
      },
    ],
  }),
);
