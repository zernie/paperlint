#!/usr/bin/env node
/**
 * extract-ref-facts.mjs — разобрать библиографию статьи, спросить реестры и записать ФАКТЫ в JSON.
 * Ничего не судит.
 *
 * Usage: node extract-ref-facts.mjs <папка статьи|paper.md|refs.bib> [--offline] [--refresh]
 *                                   [--cache=PATH] [--out=PATH] [--quiet]
 * Выход: 0 — факты записаны · 1 — записать нечего (нет источника, нет записей).
 *
 * ЗАЧЕМ РАЗДЕЛЕНИЕ. До 2026-08-26 измерение и суждение жили в одном скрипте
 * (`verify-refs.mjs`, 20 emit-сайтов, 8 видов находок) — то есть на пятой ступени лесенки
 * `the consumer's papers CLAUDE.md`. Суждение переехало в правила ESLint (`eslint-rules/ref-facts.mjs`):
 * реестр правил, severity конфигом, `eslint-disable` с причиной, позиции `file:line:col`. Сюда
 * осталась сантехника: разбор разметки, разбор `.bib`, сеть, разбор ответов реестров.
 *
 * Прецедент в этой же базе — `render-paper/extract-pdf-facts.mjs` + `eslint-rules/pdf-facts.mjs`.
 * Граница ровно та же: во внешний мир ходит скрипт, суждение выносит правило.
 *
 * 🔴 ПОЧЕМУ ПРАВИЛО НЕ МОЖЕТ ЖИТЬ НАД САМОЙ СТАТЬЁЙ. Из трёх статей базы `paper.md` есть у одной
 * (`<paper-a>`); у `<paper-b>` и `<paper-c>` библиография — `refs.bib`, а `.bib`
 * ни один language-плагин ESLint не разбирает. Общий вход, который умеет и то и другое, —
 * JSON фактов. Цена известна и записана: находка адресуется в факты, а не в строку `paper.md`;
 * поэтому у каждой записи в фактах лежит `line` источника, и правило печатает его в сообщении.
 *
 * 🔴 ЧТО ПОЧИНЕНО ЭТИМ ПЕРЕЕЗДОМ (обе ноги были МЕРТВЫ, замер 2026-08-26):
 *
 *  1. `.bib` НИКОГДА НЕ ОТКРЫВАЛСЯ. `resolveSource` перебирал `paper.md` → `draft.md` →
 *     `build/custom.bib`; `refs.bib` в списке не было, хотя текст ошибки обещал «or .bib».
 *     Прогон: `verify-refs.mjs <papers-root>/<paper-b>` →
 *     «no paper.md, draft.md or .bib … nothing to check».
 *  2. ПАРСЕР `.bib` НЕ БРАЛ НАСТОЯЩИЕ ФАЙЛЫ. Регулярка `/@\w+\{([^,]+),([\s\S]*?)\n\}/g` требовала
 *     `}` на отдельной строке, а обе наши `refs.bib` закрывают запись на строке последнего поля
 *     (`note={arXiv:2310.06770}}`). Прогон прямо по файлу: «parsed 0 references out of
 *     …/<paper-b>/refs.bib». То есть 40 строк `parseBib` не отработали ни разу.
 *  3. И ТРЕТИЙ, скрытый за первыми двумя: в `.bib` автор пишется «Фамилия, Имя», а сравнение
 *     брало ПОСЛЕДНИЙ токен строки — для `Jimenez, Carlos E.` это `e`. Даже если бы регулярка
 *     работала, сверка авторов по `.bib` сравнивала бы инициалы с фамилиями.
 *
 * Всё это лечится не аккуратностью, а тем, что `.bib` разбирает НАСТОЯЩИЙ ПАРСЕР
 * (`@retorquere/bibtex-parser`), который отдаёт `lastName` отдельным полем — класс №3 становится
 * невыразимым. Занятость проверена прогоном на обоих настоящих файлах ДО выбора: `bibtex-parse`,
 * `@retorquere/bibtex-parser`, `citation-js` и `astrocite-bibtex` — все четыре дают верные 27 и 51
 * запись против нуля у нашей регулярки. Взят retorquere, потому что он единственный отдаёт
 * СТРУКТУРНОЕ имя; с любым другим фамилию пришлось бы выкусывать руками, то есть писать самим ту
 * самую половину, которая и была сломана.
 *
 * 🔴 КЕШ — ЭТО ДОКАЗАТЕЛЬСТВО, А НЕ ВТОРАЯ ДЕКЛАРАЦИЯ. `<статья>/repro/refs-cache.json` хранит
 * СЫРЫЕ ТЕЛА ответов реестров и коммитится (у `<paper-a>` он лежит в git с 16.08).
 * Его нельзя сочинить — только обновить из реестра. Факты в `_build/` производны от него и от
 * библиографии, поэтому `_build/` в `.gitignore`, а в фактах лежит `source_sha256`: правило
 * `refs/fresh` сверяет его с файлом на диске, и протухшие факты становятся находкой, а не тишиной.
 * Ровно тот отказ, из-за которого `api:check` в vigiles печатал «no drift», читая `dist/` от
 * предыдущей сборки.
 *
 * 🔴 РАЗБОР ОТВЕТОВ ЖИВЁТ ЗДЕСЬ, А НЕ В ПРАВИЛЕ, И ЭТО НЕСУЩЕЕ. Кеш хранит сырые тела именно
 * затем, чтобы читатели CrossRef-JSON и arXiv-Atom прогонялись на настоящих ответах: каждый
 * сфабрикованный заголовок, который эта база когда-либо отгружала, найден чтением ответа реестра,
 * а не сравнением. Если бы кеш хранил разобранные записи, эти читатели остались бы непокрытыми,
 * выглядя покрытыми.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, basename } from "node:path";
import { headings as mdHeadings, requireMarkdown } from "../../../lib/markdown.mjs";
import { isMain } from "./consumer.mjs";

// Разбор разметки — парсером (`CLAUDE.md`, 2026-08-11). Падаем, а не деградируем: без парсера
// список литературы не нашёлся бы вовсе, и факты вышли бы пустыми — то есть чистый вердикт про
// статью, у которой на самом деле сорок источников.
requireMarkdown();

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CROSSREF = "https://api.crossref.org/works/";
const ARXIV = "https://export.arxiv.org/api/query?id_list=";
// CrossRef просит контакт в User-Agent и за него отдаёт вежливый пул. Ни аккаунта, ни ключа —
// это любезность, анонимный пул режется по частоте.
const UA = "extract-ref-facts/1.0 (https://github.com/; paper-pipeline citation facts)";

export const SCHEMA = 1;

// ── разбор: список литературы в markdown ─────────────────────────────────────
//
// Та же форма, что читает `repro/md2submission.py`, намеренно: этот скрипт превращает список в
// .bib, который реально загружается на площадку, поэтому всё, что записью считает он, — запись.
// `^\d{1,2}. ` открывает запись, отступ продолжает её, пустая строка закрывает.

const REF_OPEN = /^(\d{1,2})\.\s+(.*)$/;
/** Рабочие пометки, не доезжающие до PDF; md2submission их срезает, значит и мы. */
const BRACKET_NOTE = /\[(VERIFY|ANONYMIZ)[^\]]*\]/g;

export function parseMarkdownRefs(text) {
  // Секцию режет парсер. Прежнее `text.split(/^## References\s*$/m)[1]` открывало список
  // литературы на `## References`, процитированном внутри ```-блока, — а в этой репе статьи
  // цитируют собственную разметку кусками.
  const refsHs = mdHeadings(text).filter((h) => h.depth === 2 && /^References\s*$/u.test(h.text));
  if (refsHs.length === 0) return [];
  const nl = text.indexOf("\n", refsHs[0].offset);
  const body = text.slice(nl === -1 ? text.length : nl, refsHs[1] ? refsHs[1].offset : text.length);
  // Строка начала тела в исходном файле — чтобы у записи был АДРЕС в `paper.md`, а не только
  // номер в списке. Правило печатает его в сообщении: файл фактов лежит в `_build/`, и без
  // строки источника находку пришлось бы искать глазами.
  const bodyLine = text.slice(0, nl === -1 ? text.length : nl).split("\n").length;
  // Заголовок закрывает список — приложения идут ПОСЛЕ библиографии, и без этого их нумерованная
  // проза разбиралась бы как ссылки. Номера строк берём у парсера: `/^#{1,6}\s/` считал заголовком
  // и решётку внутри ```-блока.
  const headingLines = new Set(mdHeadings(body).map((h) => h.line));
  const entries = [];
  let cur = null;
  let buf = [];
  let curLine = 0;
  const flush = () => {
    if (cur !== null)
      entries.push({ n: cur, line: curLine, raw: buf.join(" ").replace(BRACKET_NOTE, "").trim() });
    cur = null;
    buf = [];
  };
  const lns = body.split("\n");
  for (let i = 0; i < lns.length; i++) {
    const ln = lns[i];
    if (headingLines.has(i)) break;
    const m = REF_OPEN.exec(ln);
    if (m) {
      flush();
      cur = Number(m[1]);
      curLine = bodyLine + i;
      buf = [m[2].trim()];
    } else if (cur !== null && ln.trim()) buf.push(ln.trim());
    else if (cur !== null) flush();
  }
  flush();
  return entries.map(splitEntry).filter(Boolean);
}

/** `A, B, C. *Title.* rest` → авторы / заголовок / остаток — форма, которую делает md2submission. */
function splitEntry(e) {
  const base = { n: e.n, line: e.line, key: null, raw: e.raw };
  const mt = /\*(.+?)\*/.exec(e.raw);
  if (!mt) return { ...base, authors: [], truncated: false, title: null, year: yearIn(e.raw), venue_text: e.raw };
  const title = mt[1].trim().replace(/\.$/, "");
  const rawAuthors = splitAuthors(e.raw.slice(0, mt.index));
  const note = e.raw.slice(mt.index + mt[0].length).trim().replace(/^,\s*/, "");
  const { authors, truncated } = dropEtAl(rawAuthors);
  return { ...base, authors, truncated, title, year: yearIn(note) ?? yearIn(e.raw), venue_text: note };
}

function splitAuthors(a) {
  const s = a.trim().replace(/\.\s*$/, "").trim();
  if (!s) return [];
  return s.split(",").map((p) => p.trim()).filter(Boolean);
}

/**
 * `Z. Xiang et al.` — запись намеренно даёт ПРЕФИКС списка авторов. Это факт о записи, а не
 * суждение, поэтому усечение снимается здесь, а правило получает уже честный префикс и флаг.
 */
const ET_AL = /\bet\s+al\.?$/i;
function dropEtAl(authors) {
  if (!authors.length || !ET_AL.test(authors[authors.length - 1].trim()))
    return { authors, truncated: false };
  const out = authors.slice();
  out[out.length - 1] = out[out.length - 1].replace(ET_AL, "").trim();
  return { authors: out.filter(Boolean), truncated: true };
}

const yearIn = (s) => (/\b(19|20)\d{2}\b/.exec(s ?? "") ?? [null])[0];

// ── разбор: .bib НАСТОЯЩИМ ПАРСЕРОМ ──────────────────────────────────────────

/**
 * Порядок имени приводится к «Имя Фамилия» — той же форме, в которой авторы записаны в markdown.
 * Тогда у правила ОДНА функция `surname()` (последний алфавитный токен) на оба источника, а не
 * две ветки. Приведение формата — работа разбора; сравнение — работа правила.
 *
 * 🔴 ДВЕ ФОРМЫ, И ОБЕ ПЕРЕЧИСЛЕНЫ ЯВНО. Парсер отдаёт институцию (`author={{Adversa AI}}` —
 * двойная скобка значит «одно имя целиком, не разбирать») как `{name}`, БЕЗ `lastName`: у
 * организации фамилии нет, и это верно. Первая редакция этой функции формы `name` не знала,
 * поэтому все четыре поля были undefined, строка выходила пустой, и вызывающий отбрасывал её
 * своим `.filter(Boolean)` — автор исчезал молча.
 *
 * Замер 2026-09-17 на настоящем aisec-2026: ОДИННАДЦАТЬ записей из пятидесяти одной приходили
 * с `authors = []`, то есть сверка по ним не находила ничего и выглядела пройденной. Ровно тот
 * отказ в сторону тишины, против которого и брали настоящий парсер вместо регулярки.
 *
 * ⚠️ Перечисление, а не «первое непустое поле»: со списком следующая форма читается как
 * отсутствующая строка, а с `??`-цепочкой по произвольным полям она растворилась бы снова.
 */
const joinName = (a) =>
  a.name ?? [a.firstName, a.prefix, a.lastName, a.suffix].filter(Boolean).join(" ").trim();

/**
 * 🔴 ПАРСЕР .bib — ОПЦИОНАЛЬНАЯ ЗАВИСИМОСТЬ, И ОТКАЗ ОБЯЗАН БЫТЬ ГРОМКИМ И С ЛЕКАРСТВОМ.
 * Он весит 15 МБ из 56 МБ установки потребителя (сам пакет 9 МБ плюс англоязычная модель
 * `wink-eng-lite-web-model` 4 МБ и `unicode2latex` 2 МБ) — 27% веса ради одного вызова, который
 * нужен только тому, кто извлекает факты о библиографии. Импорт здесь и так динамический, то
 * есть ленивость уже была; манифест просто перестал врать про обязательность.
 *
 * ⚠️ Тихий пропуск здесь был бы худшим из вариантов: отсутствующий чекер и прошедший выглядят
 * одинаково, а «библиография не проверена» читается как «библиография в порядке». Поэтому
 * сообщение называет команду, а не факт.
 */
export async function parseBib(text) {
  let parse;
  try {
    ({ parse } = await import("@retorquere/bibtex-parser"));
  } catch (e) {
    if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
    throw new Error(
      "разбор .bib требует @retorquere/bibtex-parser — он объявлен ОПЦИОНАЛЬНЫМ, потому что " +
        "весит 15 МБ и нужен только для фактов о библиографии.\n" +
        "   Поставить:  npm i -D @retorquere/bibtex-parser\n" +
        "   Почему не своя регулярка: замер 26.08 — регулярка давала 0 записей на обоих " +
        "настоящих файлах, четыре библиотеки давали верные 27 и 51.",
    );
  }
  // `sentenceCase: false` — заголовок нужен как написан. Наша нормализация всё равно приводит
  // регистр, но факт обязан быть фактом: пересказанный заголовок нельзя показать человеку.
  const res = parse(text, { sentenceCase: false, verbatimFields: [] });
  // Строка записи в файле — по её ключу. Парсер позиций не отдаёт, а адрес находке нужен;
  // ключ в `.bib` уникален по определению формата, так что поиск однозначен.
  const lines = text.split("\n");
  const lineOfKey = (key) => {
    const i = lines.findIndex((l) => l.includes(`{${key},`));
    return i === -1 ? 0 : i + 1;
  };
  return res.entries.map((e, i) => {
    const f = e.fields ?? {};
    const names = Array.isArray(f.author) ? f.author : [];
    // `and others` — это `et al.` формата BibTeX. Парсер отдаёт его как автора без имени.
    const isOthers = (a) => !a.firstName && /^others$/i.test(a.lastName ?? "");
    const truncated = names.some(isOthers);
    const authors = names.filter((a) => !isOthers(a)).map(joinName).filter(Boolean);
    const str = (v) => (Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : v == null ? "" : String(v));
    const venueText = [f.booktitle, f.journal, f.note, f.howpublished].map(str).filter(Boolean).join(" ");
    return {
      n: i + 1,
      line: lineOfKey(e.key),
      key: e.key,
      // `raw` — по нему ищутся идентификаторы: они прячутся и в `note`, и в `journal`
      // (`arXiv preprint arXiv:2107.03374`), и в отдельном поле `doi`.
      raw: [str(f.author && authors.join(" and ")), str(f.title), venueText, str(f.doi), str(f.url), str(f.year)]
        .filter(Boolean)
        .join(" "),
      authors,
      truncated,
      title: str(f.title).trim() || null,
      year: str(f.year).trim() || null,
      venue_text: [venueText, str(f.doi)].filter(Boolean).join(" "),
      // DOI в BibTeX объявляется полем, а не спрятан в прозе — берём его прямо, не выуживая.
      doi_field: str(f.doi).trim() || null,
    };
  });
}

// ── идентификаторы ───────────────────────────────────────────────────────────

const ARXIV_RE = /arxiv[:\s]\s*(\d{4}\.\d{4,5})(v\d+)?/i;
const DOI_RE = /(?:doi[:\s]\s*|doi\.org\/)(10\.\d{4,9}\/[^\s,;)}]+)/i;
const ARXIV_RE_G = new RegExp(ARXIV_RE.source, "gi");
const DOI_RE_G = new RegExp(DOI_RE.source, "gi");

/**
 * ВСЕ идентификаторы записи, а не первый.
 *
 * 🔴 Запись [16] статьи, против которой это писалось, — одна нумерованная запись, несущая ДВЕ
 * работы (TOGA и её позднейший переразбор), у каждой свой arXiv id. Парсер, останавливающийся на
 * первом, проверяет половину записи и молчит про вторую — ровно та тишина, ради снятия которой
 * всё это существует. Сравнить лишние нечем (у записи один заголовок и один список авторов, и они
 * про первую работу), поэтому они РЕЗОЛВЯТСЯ, а правило говорит, что не сравнивало их.
 */
export function extractIds(entry) {
  const hay = `${entry.venue_text ?? ""} ${entry.raw ?? ""}`;
  const uniq = (xs) => [...new Set(xs)];
  const doi = uniq([
    ...(entry.doi_field ? [entry.doi_field] : []),
    // Точка в конце принадлежит предложению, а не DOI. Суффиксы законно содержат точки
    // (10.18653/v1/2020.acl-main.168), поэтому срезается только ПОСЛЕДНЯЯ.
    ...[...hay.matchAll(DOI_RE_G)].map((m) => m[1].replace(/[.,]$/, "")),
  ]);
  return { arxiv: uniq([...hay.matchAll(ARXIV_RE_G)].map((m) => m[1])), doi };
}

/**
 * 🔴 `10.48550/arXiv.NNNN.NNNNN` — DOI, ЗАРЕГИСТРИРОВАННЫЙ В DATACITE, А НЕ В CROSSREF.
 * Замер 2026-08-26: `api.crossref.org/works/10.48550%2FarXiv.2107.03374` → **HTTP 404**,
 * «Resource not found», при том что DOI совершенно настоящий и стоит в `<paper-b>/refs.bib`.
 * Спросив про него CrossRef, мы получили бы `unresolvable-id` на КОРРЕКТНОЙ записи — то есть
 * правило уровня `error`, падающее на верном входе, которое выключают в тот же день.
 * Такой DOI разрешается в arXiv по его же номеру.
 */
export const ARXIV_DOI = /^10\.48550\/arxiv\.(\d{4}\.\d{4,5})(v\d+)?$/i;

/** Запись, о которой судят заголовок/авторов/год: DOI, если он есть. */
export const primaryOf = (ids) =>
  ids.doi.length ? `doi:${ids.doi[0]}` : ids.arxiv.length ? `arxiv:${ids.arxiv[0]}` : null;
export const allKeys = (ids) => [...ids.doi.map((d) => `doi:${d}`), ...ids.arxiv.map((a) => `arxiv:${a}`)];

/** Куда идти за ключом и с каким id. Решается ДО сети — от этого зависит и разбор ответа. */
export function routeOf(key) {
  const kind = key.slice(0, key.indexOf(":"));
  const id = key.slice(key.indexOf(":") + 1);
  if (kind === "arxiv") return { registry: "arxiv", url: ARXIV + encodeURIComponent(id) };
  const m = ARXIV_DOI.exec(id);
  if (m) return { registry: "arxiv", url: ARXIV + encodeURIComponent(m[1]) };
  return { registry: "crossref", url: CROSSREF + encodeURIComponent(id) };
}

// ── читатели реестров ────────────────────────────────────────────────────────

export function readCrossref(body) {
  const j = JSON.parse(body);
  const m = j.message;
  if (!m) return null;
  const dp =
    m.issued?.["date-parts"]?.[0]?.[0] ??
    m["published-print"]?.["date-parts"]?.[0]?.[0] ??
    m["published-online"]?.["date-parts"]?.[0]?.[0] ??
    null;
  // 🔴 CrossRef кладёт подзаголовок после двоеточия в ОТДЕЛЬНОЕ поле: для TOSEM-овской
  // «Variability-Aware Static Analysis at Scale: An Empirical Study» он отдаёт
  // title=["Variability-Aware Static Analysis at Scale"], subtitle=["An Empirical Study"].
  // Сравнение с одним `title[0]` дало корректной записи 0.69 и объявило заголовок выдуманным.
  // Чекер, срабатывающий на корректных записях, глушат — и тогда он не чекер.
  const parts = [
    ...(Array.isArray(m.title) ? m.title : [m.title]),
    ...(Array.isArray(m.subtitle) ? m.subtitle : m.subtitle ? [m.subtitle] : []),
  ];
  return {
    title: parts.filter(Boolean).join(": "),
    authors: (m.author ?? []).map((a) => a.family ?? a.name ?? ""),
    year: dp ? String(dp) : null,
    venue: Array.isArray(m["container-title"]) ? m["container-title"][0] : m["container-title"],
    journalRef: null,
    doi: null,
    error: false,
  };
}

/** arXiv отвечает Atom. Один `<entry>` на id; ноль записей — id не разрешается. */
export function readArxiv(body) {
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(body);
  if (!entry) return null;
  const e = entry[1];
  const tag = (name) => {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(e);
    return m ? unescapeXml(m[1]).replace(/\s+/g, " ").trim() : null;
  };
  const authors = [...e.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map((m) =>
    unescapeXml(m[1]).replace(/\s+/g, " ").trim(),
  );
  const published = tag("published");
  return {
    title: tag("title"),
    authors,
    year: published ? published.slice(0, 4) : null,
    venue: null,
    // Собственные поля arXiv «это где-то вышло». Любое из них значит, что есть опубликованная версия.
    journalRef: tag("arxiv:journal_ref"),
    doi: tag("arxiv:doi"),
    // Ответ поиска по отозванному или выдуманному id всё равно возвращает <entry>, чей id —
    // эхо запроса; у настоящей записи заголовок никогда не «Error».
    error: /^Error$/i.test(tag("title") ?? ""),
  };
}

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

// ── кеш и сеть ───────────────────────────────────────────────────────────────

export function loadCache(path) {
  if (!path || !existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(path, cache) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache, null, 1)}\n`);
}

async function fetchKey(key) {
  const { url } = routeOf(key);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  return { httpStatus: r.status, body: await r.text(), fetched: new Date().toISOString().slice(0, 10) };
}

/**
 * Сырой ответ → запись фактов. Именно ЗДЕСЬ живёт всё, что может бросить: правило, которое
 * бросает, роняет весь прогон ESLint, а не одну находку.
 */
export function recordFrom(key, cached) {
  if (!cached) return { cached: false };
  const { registry } = routeOf(key);
  const base = { cached: true, registry, httpStatus: cached.httpStatus ?? null, fetched: cached.fetched ?? null };
  if (cached.httpStatus !== 200) return base;
  let rec; // без инициализатора: try присваивает, catch возвращает (2026-08-28)
  try {
    rec = registry === "crossref" ? readCrossref(cached.body) : readArxiv(cached.body);
  } catch (e) {
    return { ...base, found: false, parse_error: String(e.message).split("\n")[0] };
  }
  if (!rec) return { ...base, found: false };
  return { ...base, found: !rec.error, ...rec };
}

// ── сборка фактов ────────────────────────────────────────────────────────────

/** `paper.md` → `draft.md` → `refs.bib` → `build/custom.bib`. `refs.bib` ДОБАВЛЕН 26.08 (дефект №1). */
export const SOURCE_ORDER = ["paper.md", "draft.md", "refs.bib", "build/custom.bib"];

export function resolveSource(target) {
  const t = resolve(target);
  if (existsSync(t) && statSync(t).isFile()) return t;
  for (const c of SOURCE_ORDER) {
    const p = join(t, c);
    if (existsSync(p)) return p;
  }
  return null;
}

export async function loadEntries(path) {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".bib") ? parseBib(text) : parseMarkdownRefs(text);
}

/** Все ключи реестров, нужные списку записей. Считаются один раз, чтобы запросы шли пачкой. */
export function keysFor(entries) {
  const keys = new Set();
  for (const e of entries) for (const k of allKeys(extractIds(e))) keys.add(k);
  return [...keys];
}

const rel = (p) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p);

export function buildFacts({ source, text, entries, cache, cachePath }) {
  const withIds = entries.map((e) => {
    const ids = extractIds(e);
    return { ...e, ids, primary: primaryOf(ids), keys: allKeys(ids) };
  });
  const records = {};
  for (const e of withIds) for (const k of e.keys) if (!(k in records)) records[k] = recordFrom(k, cache[k]);
  return {
    schema: SCHEMA,
    source: rel(source),
    source_kind: source.endsWith(".bib") ? "bibtex" : "markdown",
    source_sha256: createHash("sha256").update(text).digest("hex"),
    cache: cachePath ? rel(cachePath) : null,
    generated: new Date().toISOString().slice(0, 10),
    entries: withIds,
    records,
  };
}

// ── cli ──────────────────────────────────────────────────────────────────────

async function main(argv) {
  const args = argv.slice(2);
  const target = args.find((a) => !a.startsWith("--")) ?? ".";
  const offline = args.includes("--offline");
  const refresh = args.includes("--refresh");
  const quiet = args.includes("--quiet");
  const opt = (name) => (args.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=").slice(1).join("=");

  const src = resolveSource(target);
  if (!src) {
    console.error(`🛑 нет ${SOURCE_ORDER.join(", ")} под ${resolve(target)} — библиографию брать неоткуда.`);
    return 1;
  }
  const paperDir = statSync(resolve(target)).isFile() ? dirname(src) : resolve(target);
  const cachePath = opt("cache") ? resolve(opt("cache")) : join(paperDir, "repro", "refs-cache.json");
  const out = opt("out") ? resolve(opt("out")) : join(paperDir, "_build", "refs.facts.json");

  const text = readFileSync(src, "utf8");
  const entries = await loadEntries(src);
  if (!entries.length) {
    // 🔴 Ноль записей — подозреваемый, а не успех. Факты с пустым списком выглядели бы как чистая
    // библиография, поэтому их не пишем вовсе и выходим ненулевым кодом.
    console.error(`🛑 из ${rel(src)} разобрано 0 записей. Тишина здесь выглядела бы как чистая библиография.`);
    return 1;
  }

  const cache = loadCache(cachePath);
  let fetched = 0;
  if (!offline) {
    for (const k of keysFor(entries)) {
      if (cache[k] && !refresh) continue;
      try {
        cache[k] = await fetchKey(k);
        fetched++;
      } catch (err) {
        // Сетевой отказ — НЕ чистый результат: ключ остаётся отсутствующим, и правило скажет,
        // что запись не проверена, вместо того чтобы объявить её верной.
        if (!quiet) console.error(`   … ${k}: ${err.message}`);
      }
      // Тело в скобках: сокращённая стрелка возвращает Timeout из исполнителя промиса, где его
      // никто не читает (`no-promise-executor-return`, 2026-08-28). Поведение то же.
      await new Promise((r) => { setTimeout(r, 250); }); // оба реестра просят вежливый темп
    }
    if (fetched) saveCache(cachePath, cache);
  }

  const facts = buildFacts({ source: src, text, entries, cache, cachePath });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(facts, null, 2)}\n`);
  const resolved = Object.values(facts.records).filter((r) => r.found).length;
  console.log(
    `📚 ${basename(src)} → ${rel(out)} (${entries.length} записей, ${Object.keys(facts.records).length} идентификаторов, ` +
      `${resolved} разрешились${offline ? ", offline" : fetched ? `, +${fetched} запрошено` : ", всё из кеша"})`,
  );
  return 0;
}

if (isMain(import.meta.url)) main(process.argv).then((c) => process.exit(c));
