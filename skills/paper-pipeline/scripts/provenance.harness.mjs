/**
 * provenance.harness.mjs — что осталось от `check-provenance.mjs` после переезда, проверено с
 * обеих сторон. `npx vigiles test .claude/skills/paper-pipeline/scripts/provenance.harness.mjs`.
 *
 * 🔴 ОБЛАСТЬ СУЖЕНА 2026-08-26. Три находки из пяти уехали в правила ESLint:
 *   arm-mismatch    → `paper/number-arm-mismatch`
 *   untraced-number → `paper/number-untraced`
 *   arm-unlabelled  → `paper/number-arm-unlabelled`
 * Их случаи (включая дословный дефект 2026-08-05 и «предложение назвало свою руку — молчим»)
 * переехали в `eslint-rules/paper-registry.harness.mjs`, где стоят рядом с прогоном на настоящей
 * статье. Здесь остались две проверки, которые НЕ ЧИТАЮТ ТЕЛО СТАТЬИ ВООБЩЕ — им дан только
 * каталог, и потому правилом о линтуемом файле они быть не могут:
 *
 *   no-numbers-gate   нет `repro/paper_numbers.py`;
 *   numbers-coverage  сколько величин засорсено против храповика `numbers-grandfathered.txt`.
 *                     Это НЕ находка, а замер покрытия — и он обязан печататься всегда.
 *
 * 🔴 ПОЧЕМУ ГВАРДЫ ПРОВЕРЯЮТСЯ ОТДЕЛЬНО. У обеих оставшихся проверок есть два условия выхода,
 * унаследованных от удалённой половины: нет `paper.md` ⇒ молчим, нет ни одного непустого
 * провенанс-файла ⇒ молчим. После переезда они выглядят немотивированными («при чём тут проза,
 * если мы смотрим на каталог?») — и первый, кто «уберёт лишнее», изменит поведение. Ассерты
 * ниже фиксируют их как контракт.
 *
 * 🔴 Assertions run at MODULE TOP LEVEL. `vigiles test` imports the file and treats "did not throw"
 * as a pass, so a `tests` export or a describe block would report ✓ having run nothing — verified in
 * this repo on a file containing only `assert.equal(1, 2)` inside an exported function.
 *
 * Every fixture is a throwaway in a temp dir. Nothing here reads or writes a real paper.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = consumerRoot();
const SCRIPT = join(HERE, "check-provenance.mjs");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "prov-harness-")));

/** Run the gate over a fixture and return the set of finding kinds it reported. */
function kinds(dir) {
  let out;
  try {
    out = execFileSync("node", [SCRIPT, dir], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  }
  return { set: new Set([...out.matchAll(/^\s*\[([a-z-]+)\]/gm)].map((m) => m[1])), out };
}

/**
 * A paper dir with a body, a provenance file, and (unless `gate: false`) the per-paper numbers gate.
 * The gate file must exist or `no-numbers-gate` fires on every fixture and drowns the signal — which
 * is itself a finding worth having, and is asserted on its own below.
 */
function paper(name, { body, notes, gate = true, numbers, grandfathered, noPaper = false }) {
  const d = join(tmp, name);
  mkdirSync(join(d, "repro"), { recursive: true });
  if (!noPaper) writeFileSync(join(d, "paper.md"), `## Abstract\n\n${body}\n\n## References\n\n[1] x.\n`);
  if (notes !== undefined) writeFileSync(join(d, "NOTES.md"), notes);
  if (gate) writeFileSync(join(d, "repro", "paper_numbers.py"), "# the per-paper numbers gate\n");
  if (numbers !== undefined) writeFileSync(join(d, "repro", "numbers.tsv"), numbers);
  if (grandfathered !== undefined) writeFileSync(join(d, "repro", "numbers-grandfathered.txt"), grandfathered);
  return d;
}

// The provenance rows of the real 2026-08-05 defect: the count of failures is recorded against the
// ANNOTATED arm, in which the extractor's guesses were written in as if an author had authored them.
const NOTES = [
  "# where each number comes from",
  "- `.all.strict.compiled` = 147 — rules files that compiled",
  "- `.all.annotated.failedContradicted` = 22 — files failing admission in the annotated arm",
].join("\n");

// ── 1. МОЛЧИТ НА ВЕРНОМ: у статьи есть гейт и реестр — только замер покрытия, ноль находок ──
// Сначала эта половина: проверка, кричащая на корректном входе, опаснее отсутствия проверки.
{
  const d = paper("covered", {
    body: "The headline rate is **15.0%** across the corpus.",
    notes: NOTES,
    numbers: "# id\tvalue\n a\t1\n b\t2\n",
    grandfathered: "# ещё сырые\n42\n",
  });
  const { set, out } = kinds(d);
  assert.ok(!set.has("no-numbers-gate"), "статья с гейтом получила `no-numbers-gate`:\n" + out);
  assert.ok(set.has("numbers-coverage"), "замер покрытия обязан печататься всегда:\n" + out);
  assert.match(out, /2 quantities are sourced and guarded, 1 are still raw/,
    "числа в замере покрытия не сошлись — считаются строки реестра и строки храповика:\n" + out);
  assert.equal(set.size, 1, "после переезда трёх проверок этот вход обязан давать РОВНО замер покрытия:\n" + out);
}

// ── 2. a paper with no numbers gate at all is told so ──────────────────────────────────
// The coverage question, not a defect in the prose: without `repro/paper_numbers.py` every printed
// figure is a hand-typed digit whose only link to its data file is somebody's memory.
{
  const d = paper("no-gate", { body: "Nothing bolded here.", notes: NOTES, gate: false });
  const { set, out } = kinds(d);
  assert.ok(set.has("no-numbers-gate"), "a paper with no repro/paper_numbers.py was not told:\n" + out);
  assert.ok(!set.has("numbers-coverage"), "нет гейта — покрывать нечего, замер печататься не должен:\n" + out);
}

// ── 3. гейт есть, реестра `numbers.tsv` нет — молчание, а не нулевое покрытие ───────────
// Разница смысловая: «гейт скопировали, но ни одна величина им ещё не заведена» это НЕ то же
// самое, что «0 из 0 засорсено», и печатать второе значило бы отчитаться о покрытии, которого
// никто не мерил.
{
  const d = paper("gate-no-registry", { body: "Nothing bolded here.", notes: NOTES });
  const { set, out } = kinds(d);
  assert.equal(set.size, 0, "гейт без реестра обязан молчать:\n" + out);
}

// ── 4. ГВАРДЫ, унаследованные от удалённой половины — контракт, а не рудимент ───────────
// 🔴 После переезда обе выглядят немотивированными: проверка смотрит на каталог, при чём тут
// проза? Но убрать их значит поменять поведение на статьях, у которых нет ни одного
// провенанс-файла (их большинство) — и `no-numbers-gate` начнёт кричать на каждой.
{
  const d = paper("no-prov", { body: "Nothing bolded here.", notes: undefined, gate: false });
  const { set, out } = kinds(d);
  assert.equal(set.size, 0, "нет ни одного провенанс-файла — скрипт обязан молчать целиком:\n" + out);
  // 🔴 Молчать — да, но НЕ голосом успеха. До 2026-08-26 оба гварда печатали `clean`, и на
  // настоящем корпусе это давало уверенный зелёный на трёх статьях из четырёх (все три в .tex).
  assert.match(out, /SKIPPED/, "пропуск обязан назваться пропуском, а не чистым прогоном:\n" + out);
  assert.doesNotMatch(out, /clean/, "пропуск не смеет печатать слово `clean`:\n" + out);
}
{
  const d = paper("no-paper", { body: "", notes: NOTES, gate: false, noPaper: true });
  const { set, out } = kinds(d);
  assert.equal(set.size, 0, "нет paper.md/draft.md — скрипт обязан молчать целиком:\n" + out);
  assert.match(out, /SKIPPED/, "пропуск обязан назваться пропуском:\n" + out);
  assert.match(out, /\.tex/, "причина обязана назвать, ЧТО именно не покрыто — иначе читатель\n" +
    "решит, что дело в поломке:\n" + out);
  assert.doesNotMatch(out, /clean/, "пропуск не смеет печатать слово `clean`:\n" + out);
}

// ── 5. чистый прогон ГОВОРИТ, что он чистый ────────────────────────────────────────────
// Молчание и успех не должны выглядеть одинаково — это тот же класс, что «0 checks» против
// «checks passed» в интерфейсе PR.
{
  const d = paper("clean-voice", { body: "Nothing bolded here.", notes: NOTES });
  const { out } = kinds(d);
  assert.match(out, /clean/, "чистый прогон не напечатал вердикта:\n" + out);
}

rmSync(tmp, { recursive: true, force: true });
console.log("✓ check-provenance: no-numbers-gate fires, покрытие считается, оба гварда закреплены, чистый прогон звучит");
