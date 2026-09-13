#!/usr/bin/env node
/**
 * bib-authors.mjs — does our author list match the VERSION we claim to cite?
 *
 * The gap this fills, stated precisely so it does not drift into its neighbour:
 *   verify-cites.mjs  asks "does this citation exist, and does the DOI point at it?"
 *   this script       asks "we say @inproceedings{...NeurIPS 2023}; is our author list
 *                     the NeurIPS one, or did we copy the arXiv preprint's?"
 *
 * 🔴 Why this is its own check (measured 2026-08-24, on a paper a `verify-citations`
 * pass had already reported as "ALL 23 cites verified real"):
 *
 *   schick2023toolformer   — ours 8 authors. NeurIPS 2023 has NINE. Eric Hambro, a real
 *                            person, was simply absent from a citation in an archival
 *                            publication. The arXiv preprint has 8 — that is where ours
 *                            came from.
 *   dehghani2022efficiency — ours: Dehghani, Arnab, Beyer, Vaswani, Tay.
 *                            ICLR 2022:  Dehghani, TAY, Arnab, Beyer, Vaswani.
 *                            Again the preprint's list, under a proceedings entry.
 *
 * Both are invisible to an existence check: the paper is real, the id resolves, the title
 * matches. The defect lives only in the gap between the venue we NAME and the metadata we
 * CARRY, and nothing in the pipeline was looking there.
 *
 * DBLP is the source because it indexes both records separately and says so —
 * "NeurIPS 2023" and "CoRR 2023" come back as two hits with different author lists. That
 * side-by-side is the cleanest evidence available for this question.
 *
 * ⚠️ Discovery credit and a deliberate NON-dependency: this class was found by running
 * `rebiber` (yuchenlin/rebiber), which rewrites bib entries to their DBLP records. We do
 * NOT depend on it here. Two reasons, both practical: its install needs a Python toolchain
 * that fights modern setuptools (bibtexparser wheel fails with `AttributeError:
 * install_layout`; the workaround is vendoring a tarball), and its output REPLACES entries
 * with DBLP's very long official booktitles, which is wrong for a page-limited paper. What
 * we actually needed was the comparison, and that is one HTTPS call with no dependencies.
 *
 * 🔴 The normalisation below is load-bearing, not tidiness. A first cut of this comparison
 * reported 13 mismatches on our bibliography, of which ELEVEN were "Last, First" vs
 * "First Last" — pure formatting. A checker that cries 13 when 2 are real is read once and
 * then ignored; that exact death is already recorded in this repo (a skill-pointer check
 * that reported 33 findings of which 22 were live files). So: compare SURNAME SEQUENCES,
 * and report nothing else.
 *
 * Usage:  node bib-authors.mjs <paper-dir-or-.bib-or-.tex> [--json]
 * Exit:   0 = no author-set/order differences   1 = differences found   2 = usage/IO error
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { headings as mdHeadings, requireMarkdown } from "../../../lib/markdown.mjs";
import { isMain } from "../../paper-pipeline/scripts/consumer.mjs";

const DBLP = "https://dblp.org/search/publ/api";

/* ---------- input: a .bib, a .tex with filecontents, or a paper dir ---------- */

/**
 * Some papers carry no BibTeX at all. `compile-rules-2026` writes its 67 references as a
 * hand-numbered markdown list that `repro/md2acl.py` turns into ACL format at build time:
 *
 *   12. N. F. Liu, K. Lin, J. Hewitt. *Lost in the Middle: How Language Models Use Long
 *       Contexts.* TACL, 2024. arXiv:2307.03172.
 *
 * 🔴 Exempting such a paper would be the wrong call, and measurably so: a hand-written author
 * list has NO machine-checkable source, so it is the MORE exposed of the two formats, not the
 * less. The class this script hunts lives exactly where an entry names a published venue and an
 * arXiv id in the same breath — which is most of this list.
 *
 * Authors are taken only from the text BEFORE the first `*`, on purpose: entries here sometimes
 * append a second work ("— and the reanalysis: S. B. Hossain, ...") after the title, and folding
 * those names in would invent co-authors that the first work does not have.
 */
export function parseMarkdownRefs(text) {
  // 🔴 Заголовок берём У ПАРСЕРА, а не регуляркой (правило базы «markdown разбираем парсером»).
  // Прежнее `text.search(/^#+\s*References\s*$/m)` открывало библиографию на строке
  // `## References`, ПРОЦИТИРОВАННОЙ внутри ```-ограды, — а статьи в этой репе цитируют
  // собственную разметку кусками. Ровно этот ассерт уже стоит у соседа
  // (`paper-pipeline/scripts/extract-ref-facts.harness.mjs`: «заголовок внутри ```-блока не
  // заголовок»), то есть класс известен и здесь воспроизводился заново.
  // `requireMarkdown()` — чтобы отсутствие markdown-it падало ГРОМКО: `headings()` при пустом
  // парсере возвращает [], и гейт бы отчитался «ссылок нет» вместо отказа. Это тот же обмен
  // одного тихого отказа на другой, против которого правило и написано.
  requireMarkdown();
  const h = mdHeadings(text).find((x) => /^References\s*$/u.test(x.text));
  if (!h) return [];
  const body = text.slice(h.offset);
  const out = [];
  // 🔴 `$(?![\s\S])`, NOT `\Z`. JavaScript has no `\Z` anchor — outside a unicode-mode pattern it
  // is an identity escape meaning the LETTER Z, so the first version of this lookahead ended entry
  // 1 in the middle of "J. Zhou", at the Z. Measured: 48 of 67 references parsed, and the missing
  // 19 looked like ordinary gaps rather than a bug. Same family as the `\b`-over-Cyrillic defect
  // already recorded in this repo: an escape that means one thing in Perl/Python and another here.
  const re = /^(\d+)\.[ \t]+([\s\S]*?)(?=^\d+\.[ \t]|^#|$(?![\s\S]))/gm;
  let m;
  while ((m = re.exec(body))) {
    const entry = m[2].replace(/\s*\n\s*/g, " ").trim();
    const t = entry.match(/\*([^*]+)\*/);
    if (!t) {
      // No italic title and no author list — in this corpus these are SOFTWARE references
      // (npm packages, repos). Nothing for DBLP to disagree with. They are surfaced as
      // not-applicable rather than dropped: an entry that silently vanishes between the file
      // and the report is indistinguishable from an entry that passed.
      out.push({ type: "mdref", key: `ref${m[1]}`, unparsed: true, author: "", title: "", booktitle: "", journal: "" });
      continue;
    }
    const authorPart = entry.slice(0, entry.indexOf("*")).trim().replace(/[.,;]\s*$/, "");
    const rest = entry.slice(entry.indexOf(t[0]) + t[0].length);
    out.push({
      type: "mdref",
      key: `ref${m[1]}`,
      author: authorPart.split(/,\s*|\s+and\s+/).filter(Boolean).join(" and "),
      title: t[1].replace(/\.$/, "").trim(),
      booktitle: rest.trim(),
      journal: "",
    });
  }
  return out;
}

function bibTextFrom(target) {
  let file = target;
  if (!existsSync(file)) die(`no such path: ${file}`);
  if (!extname(file)) {
    const names = readdirSync(file);
    // 🔴 КАНОНИЧЕСКОЕ ИМЯ ПЕРВЫМ, потом — единственный кандидат, и никогда
    // «первый попавшийся» (ревью #189). Было `names.find(f => f.endsWith(".tex"))`,
    // то есть первый по порядку каталога. Замер: у одной из статей корпуса
    // лежит ПЯТЬ черновиков (paper-CONSTRUCTIVE-…, paper-FOLDED-…, paper-SAFE-…),
    // а PIPELINE-STATUS.md называет поданным исходником `paper.tex`. Проверка
    // авторов уходила в устаревший черновик и печатала вердикт про НЕ ТУ
    // библиографию — гейт, проверяющий не тот файл, хуже отсутствующего, потому
    // что он говорит «проверено».
    const pick = (ext) => {
      const canon = names.find((f) => f === `paper${ext}`);
      if (canon) return canon;
      const all = names.filter((f) => f.endsWith(ext)).sort();
      if (all.length === 1) return all[0];
      if (all.length > 1) {
        // Не падаем: новая проверка тут завела бы ещё одну поверхность, а её дом
        // определяет лесенка из `CLAUDE.md` рядом со статьями, не этот скрипт
        // (храповик `frozen-checks` это и стережёт). Достаточно СКАЗАТЬ вслух и
        // выбрать ДЕТЕРМИНИРОВАННО — заголовок ниже всё равно печатает, какой
        // файл проверен, так что читатель видит выбор.
        console.error(
          `⚠️ в ${file} несколько ${ext}-файлов и нет канонического paper${ext}: ` +
            `${all.join(", ")} — взят ${all[0]}. Если это не тот, укажите файл явно.`,
        );
        return all[0];
      }
      return undefined;
    };
    const found =
      pick(".bib") ||
      pick(".tex") ||
      names.find((f) => f === "paper.md" || f === "draft.md");
    if (!found) die(`no .bib, .tex or paper.md in ${file}`);
    file = join(file, found);
  }
  const text = readFileSync(file, "utf-8");
  if (file.endsWith(".md")) return { text, file, markdown: true };
  if (file.endsWith(".bib")) return { text, file };
  // A .tex may carry the bibliography inline via filecontents — that is how our papers do it.
  const m = text.match(/\\begin\{filecontents\*?\}(?:\[[^\]]*\])?\{[^}]*\.bib\}\r?\n([\s\S]*?)\\end\{filecontents\*?\}/);
  if (m) return { text: m[1], file };
  const sibling = join(file, "..", "refs.bib");
  if (existsSync(sibling)) return { text: readFileSync(sibling, "utf-8"), file: sibling };
  die(`no bibliography found in ${file} (no filecontents block, no refs.bib beside it)`);
}

/* ---------- a deliberately small bib reader ----------
 * Only three fields are needed (type, key, author, title, booktitle/journal), and a full
 * BibTeX grammar would be a second thing to maintain. Brace-depth counting is enough and
 * is exercised by the colocated test. */
function parseBib(text) {
  const out = [];
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const [, type, key] = m;
    let i = re.lastIndex,
      depth = 1;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    const body = text.slice(re.lastIndex, i - 1);
    out.push({ type: type.toLowerCase(), key, ...fields(body) });
  }
  return out;
}

function fields(body) {
  const get = (name) => {
    const r = new RegExp(`(?:^|[,\\s])${name}\\s*=\\s*`, "i");
    const at = body.search(r);
    if (at === -1) return "";
    let i = body.indexOf("=", at) + 1;
    while (/\s/.test(body[i])) i++;
    if (body[i] === "{") {
      let depth = 1,
        j = i + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
        j++;
      }
      return body.slice(i + 1, j - 1);
    }
    if (body[i] === '"') {
      const j = body.indexOf('"', i + 1);
      return body.slice(i + 1, j);
    }
    const j = body.indexOf(",", i);
    return body.slice(i, j === -1 ? undefined : j);
  };
  return { author: get("author"), title: get("title"), booktitle: get("booktitle"), journal: get("journal") };
}

/* ---------- normalisation: surnames only, in order ---------- */

const DEACCENT = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[{}\\'`"^~]/g, "");

export function surnames(authorField) {
  if (!authorField) return [];
  return DEACCENT(authorField)
    .split(/\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // Reduce BOTH orders to the final token of the family name.
      //   "Berg, Jan van der"  -> family part "Berg"        -> "berg"
      //   "van der Berg, Jan"  -> family part "van der Berg"-> "berg"
      //   "Jan van der Berg"   -> last token               -> "berg"
      // 🔴 Taking the whole family part in the comma branch (the first version of this) made
      // the two orders normalise DIFFERENTLY for any particle surname — "van der berg" vs
      // "berg" — so every Dutch/German co-author would have read as a real disagreement
      // against DBLP, which always writes "First Last". The colocated test caught it before
      // this shipped; the assertion pinning it is "a multi-token surname keeps its last token,
      // consistently in both orders".
      const familyPart = p.includes(",") ? p.split(",")[0] : p;
      const last = familyPart.trim().split(/\s+/).slice(-1)[0] || "";
      return last.trim().toLowerCase().replace(/[.\s-]+$/, "");
    })
    .filter((s) => s && s !== "others");
}

const truncated = (authorField) => /\band\s+others\b/i.test(authorField || "");

/** Is the entry claiming a PUBLISHED venue (as opposed to a preprint)? */
export function claimsPublished(e) {
  const venue = `${e.booktitle} ${e.journal}`.trim();
  if (!venue) return false;
  return !/^\s*arxiv\b|arxiv preprint|\bcorr\b/i.test(venue);
}

/* ---------- DBLP ---------- */

async function dblpHits(title) {
  const url = `${DBLP}/?q=${encodeURIComponent(title)}&format=json&h=6`;
  // Per-request timeout: a check that hangs is indistinguishable from a check that is dead,
  // and this one runs 25+ requests. Measured 2026-08-24: a single unbounded query stalled the
  // whole run past two minutes while a healthy one answers in ~0.6 s.
  const res = await fetch(url, {
    headers: { "User-Agent": "bib-authors/1.0 (paper QA)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw Object.assign(new Error("DBLP 429"), { retryable: true });
  if (!res.ok) throw new Error(`DBLP ${res.status}`);
  const hits = (await res.json())?.result?.hits?.hit ?? [];
  return hits.map((h) => {
    const a = h.info?.authors?.author;
    const list = a ? (Array.isArray(a) ? a : [a]) : [];
    return {
      venue: h.info?.venue ?? "",
      year: h.info?.year ?? "",
      type: h.info?.type ?? "",
      title: h.info?.title ?? "",
      // DBLP disambiguates people as "Mostafa Dehghani 0001" — the digits are not a name.
      authors: list.map((p) => String(p.text).replace(/\s+\d{4}$/, "")),
    };
  });
}

const isPreprintRecord = (h) => /^corr$/i.test(h.venue) || /informal/i.test(h.type);
const looseTitle = (s) => DEACCENT(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

/* ---------- the comparison ---------- */

export function compare(ourSurnames, theirSurnames) {
  const missing = theirSurnames.filter((x) => !ourSurnames.includes(x));
  const extra = ourSurnames.filter((x) => !theirSurnames.includes(x));
  const orderDiffers =
    missing.length === 0 && extra.length === 0 && ourSurnames.join("|") !== theirSurnames.join("|");
  return { missing, extra, orderDiffers };
}

function die(msg) {
  console.error(`bib-authors: ${msg}`);
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  const asJson = process.argv.includes("--json");
  if (!args[0]) die("usage: bib-authors.mjs <paper-dir|file.bib|file.tex> [--json]");

  const { text, file, markdown } = bibTextFrom(args[0]);
  const parsed = markdown ? parseMarkdownRefs(text) : parseBib(text);
  const entries = parsed.filter((e) => e.title && e.author);
  const findings = [];
  const skipped = []; // legitimately not applicable
  const unchecked = []; // we FAILED to check — must never be reported as a pass

  for (const e of parsed.filter((x) => x.unparsed)) {
    skipped.push({ key: e.key, why: "нет автора/заголовка — ссылка на софт или датасет, DBLP неприменим" });
  }

  for (const e of entries) {
    if (!claimsPublished(e)) continue; // a preprint entry is allowed to carry preprint metadata
    if (truncated(e.author)) {
      skipped.push({ key: e.key, why: "author list ends in `and others` — completeness not checkable" });
      continue;
    }
    // 🔴 A failed lookup is NOT a skip. Measured 2026-08-24: the first run reported
    // "PASS: no author-list disagreement" while NINE of 27 entries had never been examined —
    // five of them because DBLP answered 429. A verdict printed over unexamined data is the
    // "counter that counts what it ignores" failure this repo already has written down.
    // So: retry transient failures, then record them in a SEPARATE bucket that suppresses PASS.
    let hits = null;
    for (let attempt = 0; attempt < 3 && hits === null; attempt++) {
      try {
        hits = await dblpHits(e.title.replace(/[{}]/g, ""));
      } catch (err) {
        const last = attempt === 2;
        if (last) unchecked.push({ key: e.key, why: `DBLP lookup failed: ${err.message}` });
        else await new Promise((r) => { setTimeout(r, 1500 * (attempt + 1)); });
      }
    }
    if (hits === null) continue;
    const want = looseTitle(e.title);
    const same = hits.filter((h) => looseTitle(h.title) === want);
    // We claim the published version, so compare against the published record, never CoRR.
    const rec = same.find((h) => !isPreprintRecord(h));
    if (!rec) {
      skipped.push({ key: e.key, why: same.length ? "only a preprint record on DBLP" : "no DBLP title match" });
      continue;
    }
    const ours = surnames(e.author);
    const theirs = surnames(rec.authors.join(" and "));
    const d = compare(ours, theirs);
    if (d.missing.length || d.extra.length || d.orderDiffers) {
      findings.push({ key: e.key, venue: `${rec.venue} ${rec.year}`.trim(), ours, theirs, ...d });
    }
    // Тело в скобках, а не сокращённая стрелка — см. `no-promise-executor-return` (2026-08-28).
    await new Promise((r) => { setTimeout(r, 900); }); // DBLP asks for gentle clients; 350 ms drew 429s
  }

  if (asJson) {
    console.log(JSON.stringify({ file, entries: entries.length, findings, skipped, unchecked }, null, 2));
  } else {
    console.log(`== bib-authors: ${file} ==`);
    for (const f of findings) {
      console.log(`\n  🔴 ${f.key}  (DBLP: ${f.venue})`);
      if (f.missing.length) console.log(`     MISSING from ours : ${f.missing.join(", ")}`);
      if (f.extra.length) console.log(`     EXTRA in ours     : ${f.extra.join(", ")}`);
      if (f.orderDiffers) {
        console.log(`     ORDER differs`);
        console.log(`       ours : ${f.ours.join(" > ")}`);
        console.log(`       DBLP : ${f.theirs.join(" > ")}`);
      }
    }
    for (const s of skipped) console.log(`  · n/a ${s.key} — ${s.why}`);
    for (const u of unchecked) console.log(`  ⚠️ NOT CHECKED ${u.key} — ${u.why}`);
    console.log(
      `\n-- ${entries.length} entries · ${findings.length} difference(s) · ` +
        `${skipped.length} not applicable · ${unchecked.length} NOT CHECKED`,
    );
    console.log(
      findings.length
        ? "FAIL: our author list disagrees with the version we claim to cite."
        : unchecked.length
          ? `PARTIAL: no disagreement among the entries reached, but ${unchecked.length} could not be checked — this is NOT a pass.`
          : "PASS: no author-list disagreement.",
    );
  }
  // 🔴 НЕПРОВЕРЕННОЕ — ТОЖЕ НЕ УСПЕХ (ревью #189). Код возврата зависел только
  // от findings, поэтому прогон, где DBLP не ответил НИ РАЗУ (таймаут, серия 429),
  // выходил в 0 — и вызывающий читал НЕВЫПОЛНЕННЫЙ аудит авторов как пройденный.
  // Текст рядом уже говорил «this is NOT a pass», но текст читает человек, а код
  // возврата читает CI. Расхождение между тем, что скрипт ГОВОРИТ, и тем, что он
  // СООБЩАЕТ вызывающему, — тот же класс, что «гейт проверил не тот файл».
  // Разные коды, чтобы вызывающий мог различить: 1 — есть расхождения, 2 — аудит
  // неполон.
  process.exit(findings.length ? 1 : unchecked.length ? 2 : 0);
}

// 🔴 `isMain`, А НЕ `import.meta.url === `file://${process.argv[1]}``. Node приводит точку входа
// к РЕАЛЬНОМУ пути для `import.meta.url`, но оставляет `process.argv[1]` как набрано, поэтому
// через симлинк они не равны и CLI молча не исполняется — процесс выходит 0, не сделав ничего.
// Потребитель добирается до этих скриптов именно через симлинк. Наблюдено 14.09 на прогоне
// 34784079821: `extract-pdf-facts.mjs --strict` вернул RC=0 и не создал файл фактов.
if (isMain(import.meta.url)) await main();
