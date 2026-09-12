#!/usr/bin/env node
/**
 * extract-pdf-facts.mjs — измерить готовый PDF и записать ФАКТЫ в JSON. Ничего не судит.
 *
 * ЗАЧЕМ РАЗДЕЛЕНИЕ. До 26.08 измерение и суждение жили в одной функции (`check-geometry.mjs`),
 * то есть на пятой ступени лесенки — своим скриптом. Суждение переезжает в правила ESLint
 * (реестр, severity конфигом, подавление с причиной, позиции). Сюда остаётся сантехника.
 *
 * Это НЕ наша выдумка: так устроен veraPDF, единственный PDF-валидатор с пользовательскими
 * правилами — дословно «doesn't parse PDF documents directly. Instead it processes the machine
 * readable report output». Бинарь в движок правил не попадает вообще.
 *
 * ЧЕМ МЕРЯЕМ. `banal` Эдди Колера (тот, что внутри HotCRP зовёт `checkformat.php`) — геометрия.
 * `pdffonts` — шрифты, которых banal не знает по построению (слов `type3`/`embed` в его 1901
 * строке нет ни разу). Два инструмента, две половины, ни одна не дублирует другую.
 *
 * 🔴 ПРОТУХАНИЕ. Факты — производное от PDF, а PDF в git НЕ КОММИТИТСЯ
 * (потребитель исключает собранный `paper.pdf` своим `.gitignore`). Значит и факты коммитить
 * нельзя: получился
 * бы ровно `api:check`, который читал `dist/` от предыдущей сборки и печатал «verified, no drift».
 * Поэтому файл пишется в `_build/` (gitignored) и несёт `pdf_sha256` — первое правило сверяет его
 * с файлом на диске, и протухшие факты становятся находкой, а не тишиной.
 *
 * 🔴 ДВА РЕЖИМА ОТСУТСТВИЯ ИНСТРУМЕНТА. Локально `banal` может не стоять — это законный пропуск.
 * В CI отсутствие инструмента это ошибка ОКРУЖЕНИЯ, и молчать о ней нельзя: пропущенный шаг в
 * интерфейсе неотличим от прошедшего. Отсюда `--strict` (CI ставит его всегда).
 */
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, basename } from "node:path";

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/** Разбор вывода pdffonts: начертание, тип, встроенность. */
export function readFonts(text) {
  const rows = text
    .split("\n")
    .slice(2)
    .filter((l) => l.trim());
  return rows.map((l) => {
    const c = l
      .trim()
      .split(/\s{2,}|\s(?=yes|no)/)
      .filter(Boolean);
    return {
      name: (c[0] || "").replace(/^[A-Z]{6}\+/, ""),
      type: c[1] || "",
      embedded: /\byes\b/.test(l),
    };
  });
}

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Высоты двух колонок ПОСЛЕДНЕЙ страницы, в пунктах, либо null. Ничего не судит — порог у правила.
 *
 * ЗАЧЕМ. 29.08 издатель (Conference Publishing) вернул ПРИНЯТУЮ статью с «Please correct the last
 * page balancing»: библиография заполняла первую колонку на 625 pt и вторую на 304. Ни один наш
 * гейт этого не видел: `banal` считает страницы и кегли, а не распределение материала по
 * колонкам, и `pdflatex` про свой вывод не знает ничего.
 *
 * 🔴 МЕРЯТЬ ГЕОМЕТРИЮ, А НЕ СТРОКИ. Первая версия замера в тот день считала строки из
 * `pdftotext -layout` и объявила «сбалансировано» на странице с разницей в 377 pt: раскладка
 * склеивает колонки построчно, и у обеих выходит одинаковое число строк ПО ПОСТРОЕНИЮ.
 *
 * 🔴 ДЕЛИТЬ ПО СЕРЕДИНЕ СТРАНИЦЫ, А НЕ ПО КРАЯМ СЛОВ. Вторая версия брала середину между
 * крайними словами — и на странице, где заполнена только левая колонка, разрез приходился
 * внутрь неё, давая «77 / 731» там, где на бумаге шесть строк вверху слева.
 *
 * 🔴 РЕВЬЮ-СБОРКУ НЕ СУДИМ, и это не послабление. Номера строк на полях идут по ВСЕЙ высоте
 * страницы, поэтому колонка с десятком строк текста меряется как полная: замер 29.08 дал
 * «656.8 / 654.8» для страницы, у которой правая колонка заполнена на шестую часть. Балансировка
 * же требуется от camera-ready, а не от версии для рецензентов, — значит правильный ответ здесь
 * «нечего мерить», а не подогнанное число. Признак: короткие целые числа на внешних полях.
 *
 * Третья и четвёртая эвристики (срез «подвала» по разрыву между строками) ПРОВЕРЕНЫ И ОТКЛОНЕНЫ
 * 29.08: на реальной статье разрез срабатывал на законном разрыве внутри колонки и оставлял от
 * неё 31 pt из 657. Здесь ничего подобного нет намеренно — чем меньше эвристик, тем меньше
 * способов соврать.
 */
export function lastPageColumns(pdf, npages, pageWidthPt) {
  if (!npages || npages < 1 || !pageWidthPt) return null;
  let xml;
  try {
    xml = execFileSync(
      "pdftotext",
      ["-bbox", "-f", String(npages), "-l", String(npages), pdf, "-"],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch {
    return null; // pdftotext может не стоять локально; в CI это ловит --strict у вызывающего
  }
  return columnHeights(xml, pageWidthPt);
}

/**
 * Разбор `pdftotext -bbox` → две высоты или null. Вынесено из функции выше РАДИ ТЕСТА: за один
 * день 29.08 в этом замере было четыре ошибки подряд, и ни одну не поймал бы тест на живом PDF —
 * они все про разбор координат. Здесь нет ни одного обращения к диску, значит случаи подаются
 * рукописной разметкой, включая те, которых в корпусе сегодня нет.
 */
export function columnHeights(xml, pageWidthPt) {
  if (!pageWidthPt) return null;
  const words = [
    ...xml.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g,
    ),
  ].map((m) => [+m[1], +m[2], +m[3], +m[4], m[5]]);
  if (words.length < 60) return null; // страница-огрызок: балансировать там нечего

  const margin = pageWidthPt * 0.08;
  const lineNumbers = words.filter(
    (w) =>
      /^\d{1,4}$/.test(w[4].trim()) &&
      (w[2] < margin || w[0] > pageWidthPt - margin),
  );
  if (lineNumbers.length >= 5) return null; // сборка для рецензентов — балансировка к ней не предъявляется

  const mid = pageWidthPt / 2;
  const h = (side) => {
    const c = words.filter(side);
    if (!c.length) return 0;
    return +(
      Math.max(...c.map((w) => w[3])) - Math.min(...c.map((w) => w[1]))
    ).toFixed(1);
  };
  return [h((w) => w[0] < mid), h((w) => w[0] >= mid)];
}

/**
 * Собрать факты. Бросает, если инструмент недоступен — решение «пропуск или отказ» принимает
 * вызывающий, потому что оно зависит от того, локальный это прогон или CI.
 */
export function extract(pdf, { venue, kind, banalPath } = {}) {
  const bp = banalPath || process.env.BANAL || join(ROOT, "vendor/banal");
  if (!existsSync(bp)) throw new Error(`banal не найден: ${bp}`);
  const banal = JSON.parse(
    execFileSync("perl", [bp, "-no-time", "-json", pdf], { encoding: "utf8" }),
  );
  const fonts = readFonts(
    execFileSync("pdffonts", [pdf], { encoding: "utf8" }),
  );

  // banal отдаёт papersize как [высота, ширина] в ПУНКТАХ — порядок проверен на живом выводе 26.08
  const ps = Array.isArray(banal.papersize)
    ? banal.papersize.map((x) => x / 72)
    : null;
  const pages = banal.pages || [];
  const bib = pages.find((x) => x.type === "bib" && x.reffontsize != null);

  // 🔴 banal ОПУСКАЕТ поле `type`, когда оно равно "body" (его строка 1022:
  // `push ... if $page->{type} ne "body"`). Поэтому `filter(x => x.type === "body")` возвращает
  // НОЛЬ для любой статьи на свете — и ровно так была написана первая версия гейта лимита
  // страниц в `check-geometry.mjs`. Она печатала «0 находок» и не могла сработать ни разу:
  // `if (bodyPages && ...)` замыкается на нуле. Тот же класс, что мёртвая проверка
  // относительных дат в kb-lint — проверка, у которой отказ неотличим от успеха.
  // Полный набор типов у banal: blank · cover · appendix · bib · figure · body(по умолчанию).
  const byType = {};
  for (const x of pages)
    byType[x.type ?? "body"] = (byType[x.type ?? "body"] || 0) + 1;
  // «Тело» для лимита страниц — всё, что не библиография и не приложение: cover и figure
  // занимают место в лимите так же, как обычный текст.
  const refPages = byType.bib || 0;
  const appendixPages = byType.appendix || 0;

  return {
    schema: 1,
    pdf: pdf.startsWith(ROOT) ? pdf.slice(ROOT.length + 1) : pdf,
    pdf_sha256: sha256(pdf),
    venue: venue ?? null,
    kind: kind ?? null,
    page_w_in: ps ? +ps[1].toFixed(3) : null,
    page_h_in: ps ? +ps[0].toFixed(3) : null,
    columns: banal.columns ?? null,
    body_pt: banal.bodyfontsize ?? null,
    ref_pt: bib ? bib.reffontsize : null,
    body_pages: pages.length - refPages - appendixPages,
    ref_pages: refPages,
    appendix_pages: appendixPages,
    pages_by_type: byType,
    npages: pages.length,
    last_page_cols_pt: lastPageColumns(
      pdf,
      pages.length,
      Array.isArray(banal.papersize) ? banal.papersize[1] : null,
    ),
    fonts,
  };
}

/**
 * Куда подаётся статья — из `<paper-dir>/venue.json`. До 26.08 это не было объявлено НИГДЕ
 * машиночитаемо: комментарий в `venues/agenticdev.yaml` ссылался на `paper.yaml`, которого не
 * существует. Классический случай конструкции, описанной прозой и не построенной.
 */
export function declaredVenue(paperDir) {
  const f = join(paperDir, "venue.json");
  if (!existsSync(f)) return null;
  const d = JSON.parse(readFileSync(f, "utf8"));
  return d.venue
    ? { venue: d.venue, kind: d.kind ?? null, pdf: d.pdf ?? null }
    : null;
}

/**
 * Принять либо путь к PDF, либо ПАПКУ СТАТЬИ — и во втором случае найти артефакт самому.
 *
 * 🔴 Зачем понадобилось: у `compile-rules-2026` PDF не лежит рядом с исходником. Она пишется в
 * `paper.md` и собирается скриптом в `build/acl_latex.pdf`. Захардкодить `paper.pdf` в обходе CI
 * значило бы молча пропускать ровно эту статью — тот же класс, что пропуск `aisec-2026` из-за
 * отсутствия `venue.json`, только на шаг позже.
 *
 * Путь объявляет сама статья полем `pdf` в `venue.json`; по умолчанию — `paper.pdf` рядом.
 * Факты при этом ВСЕГДА кладутся в `<папка статьи>/_build/`, а не рядом с PDF: иначе у этой
 * статьи они уехали бы в `build/_build/`, куда не смотрит ни glob конфига, ни человек.
 */
export function resolveTarget(arg) {
  const isDir = existsSync(arg) && statSync(arg).isDirectory();
  const paperDir = isDir ? arg : dirname(arg);
  const decl = declaredVenue(paperDir);
  const pdf = isDir ? join(paperDir, decl?.pdf || "paper.pdf") : arg;
  return { paperDir, pdf, decl: decl || {} };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  const [target, venue, kind] = argv.filter((a) => a !== "--strict");
  if (!target) {
    console.error(
      "usage: extract-pdf-facts.mjs <paper.pdf | папка статьи> [venue] [kind] [--strict]",
    );
    process.exit(2);
  }
  if (!existsSync(target)) {
    console.error(`🛑 нет пути ${target}`);
    process.exit(1);
  }
  const { paperDir, pdf } = resolveTarget(target);
  if (!existsSync(pdf)) {
    // 🔴 КОД 3, А НЕ 1 (2026-08-31, внешнее ревью). «Артефакт не собран» и «извлечение упало»
    // — разные события, и вызывающий обязан их различать. Раньше оба давали 1, поэтому шаг CI
    // не мог поступить иначе, чем считать ЛЮБОЙ отказ ожидаемым: он писал «не собран этим
    // джобом» и шёл дальше. Следствие — площадка, у которой `--strict` упал по настоящей
    // причине (нет pdffonts, битый PDF, падение разбора), молча теряла ВСЕ проверки шрифтов,
    // геометрии и лимита страниц, а джоб выходил в ноль.
    // Знание о том, где лежит PDF, живёт здесь (venue.json + resolveTarget), поэтому различать
    // должен этот скрипт. Проверка существования на стороне вызывающего была бы вторым
    // источником правды о путях.
    console.error(
      `🛑 нет артефакта ${pdf} — статья объявила его в venue.json, но он не собран`,
    );
    process.exit(3);
  }
  // Аргументы командной строки перебивают декларацию — для разовой проверки чужого PDF.
  const decl = declaredVenue(paperDir) || {};
  const v = venue ?? decl.venue ?? null;
  const k = kind ?? decl.kind ?? null;
  let facts;
  try {
    facts = extract(pdf, { venue: v, kind: k });
  } catch (e) {
    const msg = e.message.split("\n")[0];
    if (strict) {
      console.error(
        `🛑 факты не сняты: ${msg} — в CI это ошибка окружения, а не пропуск`,
      );
      process.exit(1);
    }
    console.error(
      `⏭️  факты не сняты: ${msg} (локальный прогон, без --strict). PDF НЕ ПРОВЕРЕН`,
    );
    process.exit(0);
  }
  const out = join(paperDir, "_build", "paper.facts.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(facts, null, 2) + "\n");
  console.log(
    `✅ ${basename(pdf)} → ${out.slice(ROOT.length + 1)} (${facts.fonts.length} начертаний, ${facts.npages} стр.)`,
  );
}
