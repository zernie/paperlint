/**
 * Battery for `tex-requirements.ts` — the TeX packages the venue profiles declare.
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
const SRC = join(HERE, "tex-requirements.ts");
const HARNESS = join(HERE, "tex-requirements.harness.mjs");
const SCHEMA = join(
  ROOT,
  "skills",
  "submit-paper",
  "references",
  "venues",
  "venue-profile.schema.json",
);
const AGENTICDEV = join(
  ROOT,
  "skills",
  "submit-paper",
  "references",
  "venues",
  "agenticdev.jsonc",
);

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the base file is listed as a venue",
        harness: HARNESS,
        expect: "venueNames: the .jsonc profiles, without the base set",
        disables:
          "keeping tex-base out of the venue list — it would be offered as a venue named tex-base",
        edits: [
          [
            SRC,
            "    .filter((f) => f.endsWith(PROFILE_EXT) && f !== BASE_PROFILE)",
            "    .filter((f) => f.endsWith(PROFILE_EXT))",
          ],
        ],
      },
      {
        name: "fancyhdr is dropped from an acmart venue",
        harness: HARNESS,
        expect: "🔴 agenticdev: declares fancyhdr",
        disables:
          "#37: fancyhdr held up by an accident of the base image, absent on a minimal one",
        edits: [[AGENTICDEV, '      "fancyhdr": ["fancyhdr.sty"],\n', ""]],
      },
      {
        name: "the schema accepts unknown keys",
        harness: HARNESS,
        expect: "schema rejects an unknown top-level key",
        disables:
          "typo detection: `templat` would be accepted and the field silently unread",
        edits: [
          [
            SCHEMA,
            '  "required": ["tex"],\n  "additionalProperties": false,',
            '  "required": ["tex"],\n  "additionalProperties": true,',
          ],
        ],
      },
      {
        name: "a double declaration keeps only the last proofs",
        harness: HARNESS,
        expect: "mergeRequirements: a package declared twice",
        disables:
          "the union: two venues proving one package by different files would lose one proof",
        edits: [
          [
            SRC,
            "      out[name] = [...new Set([...(out[name] ?? []), ...proofs])];",
            "      out[name] = [...proofs];",
          ],
        ],
      },
      {
        name: "a paper with no venue is treated as a venue named null",
        harness: HARNESS,
        expect: "no venue.json → the base set, and the source says so",
        disables: "saying WHY a paper runs on the base set",
        edits: [[SRC, "  if (venue === null)", "  if (false)"]],
      },
    ],
  }),
);
