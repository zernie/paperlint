/**
 * Battery on the two `port/*-install-path` rules: four mutations, each removing one
 * load-bearing property — the detection itself, the markdown carriers, the template form on
 * the code side, and the ratchet.
 *
 * Четвёртой мутации — на храповик — здесь больше нет: убран сам храповик.
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
        name: "детектор перестаёт находить",
        harness: HARNESS,
        expect: "expected at least three findings",
        disables: "саму проверку — install-specific путь проходит молча в обоих языках",
        edits: [[RULE, "for (const p of CHANNEL_PREFIXES) if (s.includes(p)) return p;", "void CHANNEL_PREFIXES;"]],
      },
      {
        name: "markdown перестаёт видеть frontmatter и код",
        harness: HARNESS,
        expect: "expected at least three findings",
        disables: "носители в скилле — остаётся только проза, а команда живёт в ограде и в allowed-tools",
        edits: [[RULE, "return { yaml: check, code: check, inlineCode: check, text: check };", "return { text: check };"]],
      },
      {
        name: "код перестаёт видеть шаблонную строку",
        harness: HARNESS,
        expect: "expected one plain and one template finding",
        disables: "вторую литеральную форму — путь, собранный шаблоном, остаётся путём",
        edits: [[RULE, "TemplateElement(node) {", "TemplateElement_disabled(node) {"]],
      },
    ],
  }),
);
