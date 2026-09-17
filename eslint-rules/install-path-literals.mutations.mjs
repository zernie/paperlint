/**
 * Battery on the two `port/*-install-path` rules: four mutations, each removing one
 * load-bearing property — the detection itself, the markdown carriers, the template form on
 * the code side, and the ratchet.
 *
 * The fourth is the one worth arguing about. A ratchet that cannot fail is a comment, and
 * this one guards a number that only ever gets LOOSER by accident: raise the baseline while
 * nobody is looking and the rule keeps reporting, the suite keeps passing, and the debt grows
 * silently. So the mutation raises it, and the harness must go red.
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
      {
        name: "храповик ослабляется",
        harness: HARNESS,
        // Не "frozen at": при поднятой планке фактическое число оказывается НИЖЕ её, и
        // равенство падает второй веткой — той, что говорит «долг погашен, впиши новое
        // число». Ожидание названо по ней, потому что мутация обязана падать по СВОЕЙ
        // причине, а не просто краснеть.
        expect: "Lower BASELINE to",
        disables: "единственное, что удерживает долг от роста: поднятая планка не мешает ничему",
        edits: [[HARNESS, "const BASELINE = 76;", "const BASELINE = 760;"]],
      },
    ],
  }),
);
