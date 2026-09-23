/**
 * Battery on the two `port/*-install-path` rules: four mutations, each removing one
 * load-bearing property — the detection itself, the markdown carriers, the template form on
 * the code side, and the ratchet.
 *
 * There is no fourth mutation here anymore — for the ratchet: the ratchet itself was removed.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "install-path-literals.mjs");
const HARNESS = join(HERE, "install-path-literals.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the detector stops finding anything",
        harness: HARNESS,
        expect: "expected at least three findings",
        disables:
          "the check itself — an install-specific path passes silently in both languages",
        edits: [
          [
            RULE,
            "for (const p of CHANNEL_PREFIXES) if (s.includes(p)) return p;",
            "void CHANNEL_PREFIXES;",
          ],
        ],
      },
      {
        name: "markdown stops seeing frontmatter and code",
        harness: HARNESS,
        expect: "expected at least three findings",
        disables:
          "the carriers in a skill — only prose is left, while the command lives in a fence and in allowed-tools",
        edits: [
          [
            RULE,
            "return { yaml: check, code: check, inlineCode: check, text: check };",
            "return { text: check };",
          ],
        ],
      },
      {
        name: "code stops seeing the template string",
        harness: HARNESS,
        expect: "expected one plain and one template finding",
        disables:
          "the second literal form — a path assembled by a template stays a path",
        edits: [
          [RULE, "TemplateElement(node) {", "TemplateElement_disabled(node) {"],
        ],
      },
    ],
  }),
);
