#!/usr/bin/env node
/**
 * Unit tests for bib-authors.mjs — the pure half, no network.
 *
 * The network half (DBLP) is deliberately NOT mocked: a mock of DBLP would assert that our
 * mock behaves, which is the "checker that never failed" trap. What is worth pinning here is
 * the NORMALISATION, because that is the part whose failure is silent and expensive:
 *
 *   too loose  -> real differences vanish (a dropped author reads as a formatting quirk)
 *   too strict -> 13 findings of which 11 are "Last, First" vs "First Last", the checker is
 *                 read once and never again. Measured on our own bibliography 2026-08-24.
 *
 * Run: node .claude/skills/verify-citations/scripts/bib-authors.test.mjs
 */
import assert from "node:assert/strict";
import { surnames, compare, claimsPublished, parseMarkdownRefs } from "./bib-authors.mjs";

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

console.log("bib-authors — normalisation");

t("the two BibTeX name orders normalise to the SAME sequence", () => {
  const a = surnames("Schick, Timo and Dwivedi-Yu, Jane and Scialom, Thomas");
  const b = surnames("Timo Schick and Jane Dwivedi-Yu and Thomas Scialom");
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["schick", "dwivedi-yu", "scialom"]);
});

t("accents and TeX braces do not create a difference", () => {
  assert.deepEqual(surnames("Dess{\\`i}, Roberto"), surnames("Roberto Dessì"));
});

t("`and others` is dropped, not treated as a surname", () => {
  assert.deepEqual(surnames("Zheng, Lianmin and Yin, Liangsheng and others"), ["zheng", "yin"]);
});

t("a multi-token surname keeps its last token, consistently in both orders", () => {
  assert.deepEqual(surnames("van der Berg, Jan"), surnames("Jan van der Berg"));
});

console.log("bib-authors — comparison");

t("identical sequences produce nothing", () => {
  const d = compare(["raji", "denton"], ["raji", "denton"]);
    assert.deepEqual(d, { missing: [], extra: [], orderDiffers: false });
});

t("REGRESSION — Toolformer: a dropped author is reported as MISSING", () => {
  // Ours (arXiv preprint) had 8; NeurIPS 2023 has 9. Eric Hambro was absent from a citation
  // in an archival publication until 2026-08-24. This assert is that exact paper.
  const ours = surnames(
    "Schick, Timo and Dwivedi-Yu, Jane and Dess{\\`i}, Roberto and Raileanu, Roberta and " +
      "Lomeli, Maria and Zettlemoyer, Luke and Cancedda, Nicola and Scialom, Thomas",
  );
  const neurips = surnames(
    "Timo Schick and Jane Dwivedi-Yu and Roberto Dessì and Roberta Raileanu and Maria Lomeli and " +
      "Eric Hambro and Luke Zettlemoyer and Nicola Cancedda and Thomas Scialom",
  );
  const d = compare(ours, neurips);
  assert.deepEqual(d.missing, ["hambro"]);
  assert.deepEqual(d.extra, []);
});

t("REGRESSION — Efficiency Misnomer: same people, preprint ORDER, reported as order", () => {
  const ours = surnames("Dehghani, Mostafa and Arnab, Anurag and Beyer, Lucas and Vaswani, Ashish and Tay, Yi");
  const iclr = surnames("Mostafa Dehghani and Yi Tay and Anurag Arnab and Lucas Beyer and Ashish Vaswani");
  const d = compare(ours, iclr);
  assert.equal(d.orderDiffers, true, "an order-only difference must still be a finding");
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.extra, []);
});

t("REGRESSION — Raji: order-only, found by the script itself after the other two were fixed", () => {
  const ours = surnames("Raji, Inioluwa Deborah and Bender, Emily M. and Paullada, Amandalynne and Denton, Emily and Hanna, Alex");
  const neurips = surnames("Inioluwa Deborah Raji and Emily Denton and Emily M. Bender and Alex Hanna and Amandalynne Paullada");
  assert.equal(compare(ours, neurips).orderDiffers, true);
});

t("an author we invented would be reported as EXTRA", () => {
  assert.deepEqual(compare(["raji", "ghost"], ["raji"]).extra, ["ghost"]);
});

console.log("bib-authors — scope");

t("a preprint entry is NOT held to a published author list", () => {
  assert.equal(claimsPublished({ booktitle: "", journal: "arXiv preprint arXiv:2604.22750" }), false);
  assert.equal(claimsPublished({ booktitle: "", journal: "CoRR" }), false);
});

t("a proceedings entry IS in scope", () => {
  assert.equal(claimsPublished({ booktitle: "NeurIPS Datasets and Benchmarks Track", journal: "" }), true);
});

console.log("bib-authors — где начинается библиография");

// Обе половины. «Молчит на ограде» без «находит настоящий» неотличимо от сломанного разбора.
t("настоящий ## References разбирается", () => {
  const md = [
    "# Paper", "текст", "", "## References", "",
    "1. A. Author. *A title*. In NeurIPS, 2023.",
  ].join("\n");
  const refs = parseMarkdownRefs(md);
  assert.equal(refs.length, 1);
  assert.match(refs[0].title, /A title/);
});

t("## References внутри ```-ограды НЕ открывает библиографию", () => {
  const md = [
    "# Paper", "", "Раздел оформляется так:", "", "```markdown", "## References", "",
    "1. Z. Ghost. *Не ссылка, а пример разметки*. In Nowhere, 2020.", "```", "",
    "Конец.",
  ].join("\n");
  assert.deepEqual(parseMarkdownRefs(md), [],
    "процитированная разметка не библиография — регулярка ^#+ считала её заголовком");
});

console.log(`\n${n} assertions passed.`);
