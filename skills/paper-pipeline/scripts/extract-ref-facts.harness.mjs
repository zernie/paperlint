/**
 * Колоцированный тест извлекателя `extract-ref-facts.mjs`.
 * Прогон: `npx vigiles test .claude/skills/paper-pipeline/scripts/extract-ref-facts.harness.mjs`
 *
 * ПОРЯДОК НЕСУЩИЙ: сначала доказывается, что на ВЕРНОМ входе извлекатель отдаёт факты, какие
 * обещает, и только потом — что на сломанном он отказывается писать. Извлекатель, который тихо
 * пишет пустые факты, страшнее отсутствующего: пустая библиография читается как чистая.
 *
 * 🔴 ТРИ ЗАМЕРА ЗДЕСЬ — ЭТО ТРИ ДЕФЕКТА, КОТОРЫЕ ПРОЖИЛИ ВСЮ ЖИЗНЬ ПРЕДШЕСТВЕННИКА. Каждый
 * закреплён ассертом на НАСТОЯЩЕМ файле репозитория, а не на фикстуре, потому что все три
 * держались ровно на том, что настоящий файл никто не подавал:
 *   1. `refs.bib` не было в списке источников (`resolveSource`);
 *   2. регулярка `.bib` требовала `}` на отдельной строке и давала 0 записей на обоих наших файлах;
 *   3. в `.bib` автор пишется «Фамилия, Имя», а сравнение брало последний токен.
 *
 * 🔴 БЕЗ СЕТИ. Ответы реестров — фикстуры в файле кеша, читаемые тем же кодом, что пишет
 * настоящий запрос. Тест, которому нужен интернет, пропускают в CI, а пропущенная проверка
 * неотличима от прошедшей.
 *
 * 🔴 Ассерты — НА ВЕРХНЕМ УРОВНЕ МОДУЛЯ: `vigiles test` импортирует файл и считает «не бросил»
 * успехом, поэтому экспортированный объект тестов отчитался бы ✓, не прогнав ничего.
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT =
  consumerRoot();
const X = await import(join(HERE, "extract-ref-facts.mjs"));

// 🔴 КОРЕНЬ СТАТЕЙ — ИЗ ОБЪЯВЛЕНИЯ, А НЕ ИМЕНЕМ КАТАЛОГА ПЕРВОГО ПОТРЕБИТЕЛЯ (12.09.2026).
// `package.json` → `research-paper-pipeline.papers`, умолчание `papers`. Тот же ключ читают
// конфиг ESLint, хук и скиллы — механизм вынесен в пакет на шаге 2, и второй способ узнать
// то же самое был бы второй правдой.
//
// Настоящие статьи потребителя — ДОБАВКА к фикстуре, «если они есть — проверить и на них».
// Отсутствие законно и молча пропускается; сам тест несёт фикстура, и её отсутствие ловится
// громким нулём ниже.
//
// 🔴 ЧИТАЮТСЯ С ДИСКА, А НЕ ПЕРЕЧИСЛЯЮТСЯ ИМЕНАМИ (12.09.2026). Здесь стоял список из двух имён
// статей первого потребителя. Список имён в ПАКЕТЕ неверен дважды: у другого потребителя таких
// каталогов нет, то есть цикл не делает ни одной итерации и печатает успех, проверив ноль
// файлов; и он называет чужие неопубликованные работы в репозитории, который читают все.
// Каталог на диске отвечает на тот же вопрос, не зная ни одного имени заранее.
const PAPERS_ROOT = join(
  ROOT,
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))[
    "research-paper-pipeline"
  ]?.papers ?? "papers",
);
const REAL_PAPERS = existsSync(PAPERS_ROOT)
  ? readdirSync(PAPERS_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "extract-ref-facts-")));
// Уборка вешается СРАЗУ: ассерты бросают, и «rmSync внизу файла» не выполняется ровно в тех
// прогонах, которые красные.
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

// ── 1. ДЕФЕКТ №1: `refs.bib` обязан быть в списке источников ─────────────────
{
  assert.ok(
    X.SOURCE_ORDER.includes("refs.bib"),
    `в SOURCE_ORDER нет refs.bib — это дефект, из-за которого .bib-нога не открывалась ни разу: ${X.SOURCE_ORDER.join(", ")}`,
  );
  // 🔴 ПРЕДМЕТ — ФИКСТУРА, а настоящие статьи ДОБАВКА (12.09.2026). Здесь стоял только цикл по
  // двум нашим статьям с `continue`, если файла нет. В этом репозитории они есть, и тест зелёный;
  // в вынесенном пайплайне их каталогов НЕ БУДЕТ — оба цикла не сделают ни одной итерации, и
  // харнесс напечатает успех, проверив ноль файлов. «Зелёный над пустотой», класс, за который в
  // этой базе плачено трижды. Фикстура делает пустой прогон НЕВЫРАЗИМЫМ: она лежит рядом всегда.
  //
  // ⚠️ Каталог, а не файл: `resolveSource` возвращает сам путь, если это ФАЙЛ, и только для
  // каталога спускается по `SOURCE_ORDER`. Фикстура-файл проверяла бы не ту ветку.
  {
    const dir = join(HERE, "fixtures", "real-bib");
    assert.equal(
      X.resolveSource(dir),
      join(dir, "refs.bib"),
      "resolveSource не находит замороженный настоящий .bib — .bib-нога снова мертва",
    );
  }
  for (const paper of REAL_PAPERS) {
    const dir = join(PAPERS_ROOT, paper);
    if (!existsSync(join(dir, "refs.bib"))) continue;
    assert.equal(
      X.resolveSource(dir),
      join(dir, "refs.bib"),
      `resolveSource не находит настоящий refs.bib у ${paper} — .bib-нога снова мертва`,
    );
  }
}

// ── 2. ДЕФЕКТ №2: настоящий .bib разбирается, и число записей сходится ───────
//
// Именно НАСТОЯЩИЕ файлы, а не фикстура: прежний парсер падал на форме `}}` в конце последнего
// поля, а фикстура, написанная руками, почти наверняка закрыла бы запись на своей строке — то
// есть тест прошёл бы, а корпус нет. Ожидаемое число берётся из самого файла (`^@`), а не
// вписывается константой: константа устареет при первой же дописанной записи.
{
  // Счётчик прогнанных источников, и он проверяется после цикла: проверка, печатающая «прошло»
  // и не сказавшая СКОЛЬКО файлов открыла, — это счётчик, считающий то, что игнорирует.
  let parsed = 0;
  const sources = [
    join(HERE, "fixtures", "real-bib", "refs.bib"), // лежит рядом всегда
    ...REAL_PAPERS.map((p) => join(PAPERS_ROOT, p, "refs.bib")),
  ];
  for (const f of sources) {
    const paper = f.includes("fixtures")
      ? "fixtures/real-bib"
      : f.split("/").slice(-2)[0];
    if (!existsSync(f)) continue;
    parsed++;
    const text = readFileSync(f, "utf8");
    const want = (text.match(/^@\w+\{/gm) ?? []).length;
    const got = await X.parseBib(text);
    assert.ok(
      want > 0,
      `${paper}/refs.bib: в файле нет ни одной записи @… — фикстура сломана`,
    );
    assert.equal(
      got.length,
      want,
      `${paper}/refs.bib: разобрано ${got.length} записей из ${want}`,
    );
    for (const e of got) {
      assert.ok(e.title, `${paper}: у записи ${e.key} нет заголовка`);
      assert.ok(
        e.line > 0,
        `${paper}: у записи ${e.key} нет строки источника — находку некуда адресовать`,
      );
    }
  }
  // Громкий ноль. Фикстура делает его недостижимым сегодня — и именно поэтому ассерт стоит: он
  // ловит не отсутствие статей (это законно), а исчезновение самой фикстуры, после которого цикл
  // снова начнёт печатать успех, не открыв ни одного файла.
  assert.ok(
    parsed > 0,
    "разобрано НОЛЬ .bib-файлов. Это не «нечего проверять», а «проверка не нашла свой предмет»: " +
      "замороженная фикстура fixtures/real-bib/refs.bib обязана лежать в репозитории всегда.",
  );
}

// ── 3b. ИНСТИТУЦИЯ НЕ ИСЧЕЗАЕТ ──────────────────────────────────────────────
//
// `author={{Adversa AI}}` — двойная скобка означает «одно имя целиком, не разбирать». Парсер
// отдаёт такое как `{name}`, БЕЗ `lastName`, и это верно: у организации фамилии нет.
// Замер 17.09 на настоящем aisec-2026: одиннадцать записей из пятидесяти одной приходили с
// `authors = []`, потому что joinName эту форму не знал. Отказ в сторону ТИШИНЫ — сверка по
// таким записям не находила ничего и выглядела пройденной.
{
  const bib = `@misc{inst,
  author={{Adversa AI}},
  title={A Report}, year={2026}}
@misc{inst2,
  author={{sh-guard contributors}},
  title={Another}, year={2026}}`;
  const es = await X.parseBib(bib);
  assert.deepEqual(
    es.map((e) => e.authors),
    [["Adversa AI"], ["sh-guard contributors"]],
    `институция потеряна или разобрана на части: ${JSON.stringify(es.map((e) => e.authors))}`,
  );
  assert.equal(es[0].truncated, false, "институция — это не `and others`");
}

// ── 3c. …И ОДИНАРНАЯ СКОБКА ПО-ПРЕЖНЕМУ РАЗБИРАЕТСЯ КАК ЧЕЛОВЕК ─────────────
//
// Вторая половина. Без неё починка выше неотличима от «перестали разбирать имена вообще»:
// одинарная скобка — обычный автор, и порядок «Фамилия, Имя» обязан быть развёрнут.
{
  const bib = `@misc{human, author={Adversa, Alice}, title={T}, year={2026}}`;
  const [e] = await X.parseBib(bib);
  assert.deepEqual(e.authors, ["Alice Adversa"],
    `одинарная скобка обязана разбираться как человек: ${JSON.stringify(e.authors)}`);
}

// ── 3. ДЕФЕКТ №3: имя из .bib приводится к порядку «Имя Фамилия» ─────────────
//
// В BibTeX пишут `Jimenez, Carlos E.`, и «последний алфавитный токен» такой строки — `e`.
// Правило сравнивает именно последний токен, поэтому порядок обязан быть развёрнут ЗДЕСЬ.
{
  const bib = `@inproceedings{k1,
  author={Jimenez, Carlos E. and Di Penta, Massimiliano and others},
  title={A Title}, booktitle={ICLR}, year={2024}, note={arXiv:2310.06770}}`;
  const [e] = await X.parseBib(bib);
  assert.deepEqual(
    e.authors,
    ["Carlos E. Jimenez", "Massimiliano Di Penta"],
    `порядок имени не развёрнут: ${JSON.stringify(e.authors)}`,
  );
  assert.equal(
    e.truncated,
    true,
    "`and others` — это et al. формата BibTeX, и он обязан быть снят как усечение",
  );
  assert.deepEqual(X.extractIds(e), { arxiv: ["2310.06770"], doi: [] });
}

// ── 4. arXiv-DOI идёт в arXiv, а НЕ в CrossRef ───────────────────────────────
//
// Замер 26.08: `api.crossref.org/works/10.48550%2FarXiv.2107.03374` → HTTP 404 «Resource not
// found» на совершенно настоящем DOI, который стоит в <paper-b>/refs.bib. Спросив CrossRef,
// гейт `id-resolves` объявил бы корректную запись битой.
{
  assert.equal(X.routeOf("doi:10.48550/arXiv.2107.03374").registry, "arxiv");
  assert.ok(
    X.routeOf("doi:10.48550/arXiv.2107.03374").url.includes("2107.03374"),
  );
  assert.equal(X.routeOf("doi:10.1145/3597503.3623333").registry, "crossref");
  assert.equal(X.routeOf("arxiv:2310.06770").registry, "arxiv");
}

// ── 5. читатели реестров работают на СЫРЫХ телах ─────────────────────────────
//
// Кеш хранит сырые ответы именно ради этого: каждый сфабрикованный заголовок, который эта база
// отгружала, найден чтением ответа реестра. Кеш разобранных записей оставил бы читателей
// непокрытыми, выглядя покрытым.
{
  const atom = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/0000.00000v1</id>
    <title>A &amp; B: A Study</title>
    <published>2025-03-12T00:00:00Z</published>
    <author><name>Ada Lovelace</name></author>
    <author><name>Grace Hopper</name></author>
    <arxiv:journal_ref>Proc. ICSE 2025</arxiv:journal_ref>
  </entry>
</feed>`;
  const a = X.readArxiv(atom);
  assert.equal(a.title, "A & B: A Study", "XML-сущности не раскрыты");
  assert.deepEqual(a.authors, ["Ada Lovelace", "Grace Hopper"]);
  assert.equal(a.year, "2025");
  assert.equal(a.journalRef, "Proc. ICSE 2025");
  assert.equal(a.error, false);
  assert.equal(
    X.readArxiv(`<feed xmlns="http://www.w3.org/2005/Atom"></feed>`),
    null,
    "фид без <entry> обязан дать null",
  );

  // CrossRef кладёт подзаголовок после двоеточия в ОТДЕЛЬНОЕ поле; склейка обязана его вернуть,
  // иначе корректная запись получает схожесть 0.69 и объявляется выдуманной.
  const cr = JSON.stringify({
    message: {
      title: ["Variability-Aware Static Analysis at Scale"],
      subtitle: ["An Empirical Study"],
      author: [{ family: "Liebig" }, { family: "von Rhein" }],
      issued: { "date-parts": [[2018]] },
      "container-title": ["TOSEM"],
    },
  });
  const c = X.readCrossref(cr);
  assert.equal(
    c.title,
    "Variability-Aware Static Analysis at Scale: An Empirical Study",
  );
  assert.equal(c.year, "2018");
  assert.deepEqual(c.authors, ["Liebig", "von Rhein"]);
}

// ── 6. запись фактов: ответ реестра → запись, и НЕразобранный ответ тоже факт ─
{
  const key = "arxiv:2310.06770";
  const ok = X.recordFrom(key, {
    httpStatus: 200,
    body: `<feed><entry><title>T</title><author><name>A B</name></author><published>2023-01-01T00:00:00Z</published></entry></feed>`,
  });
  assert.equal(ok.found, true);
  assert.equal(ok.registry, "arxiv");
  assert.equal(
    X.recordFrom(key, { httpStatus: 404, body: "" }).found,
    undefined,
    "не-200 не должен объявляться найденным",
  );
  assert.equal(
    X.recordFrom(key, undefined).cached,
    false,
    "отсутствующий ответ — это факт «не запрашивали», а не «нет записи»",
  );
  const broken = X.recordFrom("doi:10.1145/x", {
    httpStatus: 200,
    body: "{не json",
  });
  assert.equal(broken.found, false);
  assert.ok(
    broken.parse_error,
    "нечитаемый ответ обязан оставить причину, а не тихо исчезнуть",
  );
}

// ── 7. markdown: список литературы, строки источника, `et al.`, приложение ───
{
  const md = [
    "# Paper",
    "",
    "## 1. Intro",
    "",
    "Prose.",
    "",
    "## References",
    "",
    "1. C. Yang, Z. Zhao, L. Zhang. *KNighter: Transforming Static Analysis.* arXiv:2503.09002, 2025.",
    "2. Z. Xiang et al. *Another Work.* ICSE 2024. arXiv:2401.00001",
    "",
    "## Appendix A",
    "",
    "1. Not a reference at all.",
    "",
  ].join("\n");
  const es = X.parseMarkdownRefs(md);
  assert.equal(
    es.length,
    2,
    `заголовок обязан закрывать список литературы, разобрано ${es.length}`,
  );
  assert.equal(
    es[0].line,
    9,
    `строка первой записи ${es[0].line}, а она девятая в файле`,
  );
  assert.equal(es[0].title, "KNighter: Transforming Static Analysis");
  assert.equal(es[1].truncated, true, "`et al.` обязан быть снят как усечение");
  assert.deepEqual(es[1].authors, ["Z. Xiang"]);
  assert.equal(es[1].year, "2024");
}

// ── 8. `## References` внутри ```-блока НЕ открывает список ──────────────────
// Статьи этой репы цитируют собственную разметку кусками; прежний `split` на этом открывал
// библиографию посреди примера кода.
{
  const md = [
    "# P",
    "",
    "## Body",
    "",
    "```md",
    "## References",
    "",
    "1. Fake. *X.* arXiv:1111.11111",
    "```",
    "",
  ].join("\n");
  assert.deepEqual(
    X.parseMarkdownRefs(md),
    [],
    "заголовок внутри ```-блока не заголовок",
  );
}

// ── 9. CLI: НОЛЬ ЗАПИСЕЙ — ОТКАЗ, а не пустые факты ─────────────────────────
{
  const { spawnSync } = await import("node:child_process");
  const dir = join(TMP, "empty");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "paper.md"), "# P\n\nНи одной ссылки.\n");
  const r = spawnSync(
    "node",
    [join(HERE, "extract-ref-facts.mjs"), dir, "--offline"],
    { encoding: "utf8" },
  );
  assert.equal(
    r.status,
    1,
    `пустая библиография обязана давать ненулевой код, дала ${r.status}`,
  );
  assert.ok(
    /ZERO|0 entries/u.test(r.stderr),
    `в stderr нет причины: ${r.stderr}`,
  );
  assert.ok(
    !existsSync(join(dir, "_build", "refs.facts.json")),
    "факты с пустым списком записаны на диск — их прочитали бы как чистую библиографию",
  );
}

// ── 10. CLI: нет источника — тоже отказ, а не тишина ─────────────────────────
{
  const { spawnSync } = await import("node:child_process");
  const dir = join(TMP, "nosrc");
  mkdirSync(dir, { recursive: true });
  const r = spawnSync(
    "node",
    [join(HERE, "extract-ref-facts.mjs"), dir, "--offline"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 1);
  assert.ok(
    /refs\.bib/u.test(r.stderr),
    "сообщение обязано перечислять источники, включая refs.bib",
  );
}

// ── 11. сквозняк: настоящая статья → факты, свежесть считается ───────────────
{
  const { spawnSync } = await import("node:child_process");
  const dir = join(TMP, "e2e");
  mkdirSync(join(dir, "repro"), { recursive: true });
  const paper = [
    "# P",
    "",
    "## References",
    "",
    "1. A. Lovelace, G. Hopper. *A Study.* arXiv:2503.09002, 2025.",
    "",
  ].join("\n");
  writeFileSync(join(dir, "paper.md"), paper);
  writeFileSync(
    join(dir, "repro", "refs-cache.json"),
    JSON.stringify({
      "arxiv:2503.09002": {
        httpStatus: 200,
        body: `<feed><entry><title>A Study</title><author><name>Ada Lovelace</name></author><author><name>Grace Hopper</name></author><published>2025-01-01T00:00:00Z</published></entry></feed>`,
      },
    }),
  );
  const r = spawnSync(
    "node",
    [join(HERE, "extract-ref-facts.mjs"), dir, "--offline"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const facts = JSON.parse(
    readFileSync(join(dir, "_build", "refs.facts.json"), "utf8"),
  );
  assert.equal(facts.schema, X.SCHEMA);
  assert.equal(facts.entries.length, 1);
  assert.equal(facts.records["arxiv:2503.09002"].found, true);
  const { createHash } = await import("node:crypto");
  assert.equal(
    facts.source_sha256,
    createHash("sha256").update(paper).digest("hex"),
    "sha256 источника не сходится — правило `fresh` не смогло бы поймать протухшие факты",
  );
}

console.log(
  "✓ extract-ref-facts: refs.bib в источниках, оба настоящих .bib разбираются целиком, порядок имени развёрнут, " +
    "arXiv-DOI не идёт в CrossRef, читатели реестров прогнаны на сырых телах, ноль записей = отказ",
);
