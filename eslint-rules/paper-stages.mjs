/**
 * `paper/stages` — the stage a paper has reached is an author's CLAIM, so it is a FIELD, and
 * the bytes on disk are the evidence that claim is checked against.
 *
 * ── WHAT THIS REPLACES, and why the replacement is not cosmetic ─────────────────────────
 * The predecessor kept a vocabulary of stage names in a JS const and applied its regexes to
 * the WHOLE of `PIPELINE-STATUS.md`:
 *
 *     { stage: "submitted", declaredBy: /(?<!\bas\s)(?<!\bbe\s)\bsubmitted\b/i }
 *
 * The lookbehinds are not decoration — they were added after the only match in one paper's
 * file turned out to be a reviewer's idiom, "Weak Accept as submitted", which says nothing
 * about submission. The check then demanded a frozen pdf and was RIGHT BY ACCIDENT.
 *
 * 🔴 And it stayed wrong in the other direction, measured 2026-09-16 on the live corpus:
 * `versions/2026-08-29-camera-ready.pdf` had been on disk for 16 days at 616 175 bytes while
 * the `camera-ready` pattern matched ZERO times anywhere in the file. The artefact preceded
 * the declaration, so all three checks gated on that declaration were blind by construction.
 *
 * ── TWO DIRECTIONS, and neither alone is the check ──────────────────────────────────────
 *   declared -> bytes   a record without its file, or with the wrong size, is a false claim
 *   bytes -> declared   a frozen version nobody declared is the case above, and it is also
 *                       what stops the whole rule being switched off by deleting a line
 *
 * Absence of the field is therefore LEGITIMATE — a paper that has shipped nothing owes
 * nothing — without being an escape hatch: the second direction still speaks if bytes exist.
 * That asymmetry is deliberate and is the reason this rule does not copy `doc/fields`, where
 * a missing frontmatter IS the finding.
 *
 * ── WHY A FIELD CANNOT BECOME A TICKED BOX HERE ─────────────────────────────────────────
 * The usual objection to turning a check into a field is that a field gets ticked instead of
 * the work being done. It does not apply, and the reason is the direction of the incentive:
 * a tick normally REMOVES an obligation, while `stages` CREATES them — declare a stage and
 * you owe a pdf of the right size. Nobody writes a line in order to receive findings. The
 * real-world pressure is to UNDER-declare, which is exactly what direction two catches.
 *
 * ── THE FIELD IS THE ONLY MACHINE-READABLE CARRIER ──────────────────────────────────────
 * ⚠️ A paper's status file also carries a `State:` line in its header and one or two
 * scorecard tables. Those are DISPLAY. No consistency check between them is written here on
 * purpose: one paper in the source corpus carries two scorecards in two different column
 * formats, and a rule reconciling them would drown in noise within a day.
 *
 * ── A LIST, NOT A MAP, and that is load-bearing ─────────────────────────────────────────
 * A paper can reach the same stage twice: one in the source corpus was submitted to a venue
 * in August, rejected in September, and is being resubmitted elsewhere in October. A map
 * keyed by stage name holds one. The `versions/<date>-<stage>.pdf` convention already holds
 * many, and the field must not be weaker than the filenames it describes.
 */
import { existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { load } from "js-yaml";

const STAGES = ["submitted", "camera-ready", "arxiv"];

/**
 * A YAML date without quotes parses to a `Date`, not a string — js-yaml honours YAML 1.1
 * timestamps. Comparing `Date === "2026-08-29"` is silently false, so every date is
 * normalised before it is compared with one taken from a filename.
 */
function isoDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0] ?? "";
  return "";
}

/** Frozen versions on disk, as `{name, date, stage}`. */
function frozenPdfs(versionsDir) {
  let names;
  try {
    names = readdirSync(versionsDir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith(".pdf")) continue;
    // ⚠️ A name carrying `STALE` is a version WITHDRAWN on purpose — one such file records
    // that the wrong pdf sat in the folder for a month. Demanding a declaration for it would
    // turn a deliberate record of a mistake into a finding.
    if (name.includes("STALE")) continue;
    const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.pdf$/.exec(name);
    if (!m) continue;
    if (!STAGES.includes(m[2])) continue;
    out.push({ name, date: m[1], stage: m[2] });
  }
  return out;
}

export default {
  rules: {
    stages: {
      meta: {
        type: "problem",
        docs: {
          description:
            "стадия статьи объявлена полем, и каждое объявление сверено с байтами на диске в обе стороны",
        },
        schema: [],
        messages: {
          badYaml: "фронтматтер не разбирается как YAML: {{reason}}",
          notAList: "`stages` обязано быть СПИСКОМ записей, а не {{got}} — статья может дойти до одной стадии дважды",
          badStage: "неизвестная стадия «{{stage}}» — словарь: {{known}}",
          missingKey: "в записи стадии «{{stage}}» нет поля `{{key}}`",
          badDate: "дата «{{date}}» в записи «{{stage}}» не в формате YYYY-MM-DD",
          declaredNoFile: "объявлена стадия «{{stage}}» ({{date}}), но файла `{{pdf}}` на диске нет",
          bytesDiffer: "«{{stage}}» ({{date}}): объявлено {{want}} байт, на диске {{got}} — это НЕ тот файл",
          fileNotDeclared:
            "`versions/{{file}}` заморожен, но стадия «{{stage}}» на {{date}} не объявлена в `stages` — артефакт обогнал объявление",
        },
      },
      create(context) {
        const dir = dirname(context.filename);
        let declared = null; // null = фронтматтера не было вовсе

        return {
          yaml(node) {
            let data;
            try {
              data = load(node.value ?? "");
            } catch (e) {
              context.report({ node, messageId: "badYaml", data: { reason: String(e.message) } });
              return;
            }
            const raw = data?.stages;
            if (raw === undefined) return;
            if (!Array.isArray(raw)) {
              context.report({
                node,
                messageId: "notAList",
                data: { got: raw === null ? "пусто" : typeof raw },
              });
              return;
            }
            declared = [];
            for (const rec of raw) {
              const stage = String(rec?.stage ?? "");
              if (!STAGES.includes(stage)) {
                context.report({
                  node,
                  messageId: "badStage",
                  data: { stage, known: STAGES.join(" · ") },
                });
                continue;
              }
              let complete = true;
              for (const key of ["date", "pdf", "bytes"]) {
                if (rec[key] === undefined) {
                  context.report({ node, messageId: "missingKey", data: { stage, key } });
                  complete = false;
                }
              }
              if (!complete) continue;
              const date = isoDate(rec.date);
              if (date === "") {
                context.report({
                  node,
                  messageId: "badDate",
                  data: { stage, date: String(rec.date) },
                });
                continue;
              }
              declared.push({ stage, date, pdf: String(rec.pdf), bytes: Number(rec.bytes) });

              // ── direction one: a claim owes its bytes ────────────────────────────────
              const abs = join(dir, String(rec.pdf));
              if (!existsSync(abs)) {
                context.report({
                  node,
                  messageId: "declaredNoFile",
                  data: { stage, date, pdf: String(rec.pdf) },
                });
                continue;
              }
              const got = statSync(abs).size;
              if (got !== Number(rec.bytes)) {
                context.report({
                  node,
                  messageId: "bytesDiffer",
                  data: { stage, date, want: String(rec.bytes), got: String(got) },
                });
              }
            }
          },

          // ── direction two: bytes owe their declaration ────────────────────────────────
          // 🔴 On `root:exit` rather than inside `yaml`, because the case worth catching is
          // precisely the one with NO frontmatter at all — where the `yaml` visitor never runs.
          "root:exit"(node) {
            const records = declared ?? [];
            for (const f of frozenPdfs(join(dir, "versions"))) {
              if (records.some((r) => r.stage === f.stage && r.date === f.date)) continue;
              context.report({
                node,
                messageId: "fileNotDeclared",
                data: { file: f.name, stage: f.stage, date: f.date },
              });
            }
          },
        };
      },
    },

    /**
     * `paper/source` — a declared stage must have its SOURCE frozen on disk, beside the pdf,
     * and the bytes must match. Not a commit reference. Not a hash of one.
     *
     * ── WHY NOT A COMMIT, measured 2026-09-16 and it is not a close call ──────────────────
     * The predecessor recorded provenance as `commit <sha>` in prose and checked that the sha
     * RESOLVED. Its stated premise was "git holds those bytes immutably, materialising a copy
     * duplicates a guarantee we already have". That premise is false wherever branches are
     * SQUASH-merged: the squash destroys the branch commits, and the next `git gc` removes
     * the objects.
     *
     * 🔴 Measured on the live corpus, inside ninety minutes of ONE session: two recorded shas
     * resolved, then stopped resolving after a routine `gc` following a branch reset. Of the
     * four declared stages in that corpus, THREE had lost their source entirely — including
     * papers already submitted to a venue, which is exactly the case the check existed for
     * (a reviewer cites a line number and there is no layout left to resolve it against).
     *
     * So a sha is not a pointer to bytes; it is a pointer to a pointer, and the outer one
     * evaporates. Checking it verifies that the REFERENCE is alive, which is a different
     * claim from the one anybody wants.
     *
     * ── COST, because "duplicating" was the objection ─────────────────────────────────────
     * A paper source is 57-68 KB of LaTeX beside a pdf of 305-382 KB that is already
     * committed. Freezing it adds under a fifth to what the folder holds anyway, and turns a
     * claim about the world into bytes this rule can actually compare.
     *
     * ── SEVERITY: nudge, and the reason CHANGED ──────────────────────────────────────────
     * Still `warn` at the consumer, but no longer because "only the author knows". Now it is
     * because a stage frozen BEFORE this convention existed cannot be fixed at all — those
     * bytes are gone. Failing a build over unrecoverable history is a gate nobody can clear.
     */
    /**
     * `paper/author-list` — отгруженная статья ДОЛЖНА СЕБЕ прогон сверки списков авторов.
     *
     * Класс, который ловит эта сверка, невидим для проверки существования ссылок: ссылка есть,
     * идентификатор резолвится, а авторы взяты от ПРЕПРИНТА при объявленной конференции. На живом
     * корпусе так нашлось семь записей в трёх статьях, включая ВЫБРОШЕННОГО ЖИВОГО ЧЕЛОВЕКА
     * (`schick2023toolformer` — пропущен Eric Hambro; у версии NeurIPS девять авторов, у препринта
     * восемь). Две из семи найдены на УЖЕ ОТПРАВЛЕННОЙ статье.
     *
     * 🔴 ЧТО ИСПРАВЛЕНО ПЕРЕНОСОМ, и это замер, а не вкус. Предшественница выводила объявленную
     * стадию РЕГУЛЯРКОЙ ПО ПРОЗЕ того же файла. Перезамер 2026-09-17 на живом корпусе: у
     * `agenticdev-2026` проза видит `submitted`, фронтматтер объявляет `submitted, camera-ready` —
     * шаблон `/camera-ready (?:uploaded|submitted|отгружен)/i` не ловит ту форму, которой стадия
     * записана. Набор находок сегодня от этого не менялся (обе проверки спрашивали лишь «есть ли
     * ХОТЬ ОДНА стадия»), но СООБЩЕНИЕ печатало неверный список стадий. Здесь предмет — то же
     * поле `stages`, которое `paper/stages` уже сверяет с байтами в обе стороны.
     *
     * 🔴 МАРКЕР ИЩЕТСЯ В ЯЧЕЙКАХ ТАБЛИЦЫ, А НЕ ГРЕПОМ ПО ФАЙЛУ. Первая редакция делала
     * `context.sourceCode.text.includes(marker)` и оправдывалась комментарием «у ячейки-примечания
     * нет своего узла». Это оказалось ПРОСТО НЕВЕРНО — замер 2026-09-17 показал, что парсер
     * markdown отдаёт `table`, `tableRow` и `tableCell` (двенадцать ячеек на трёхстрочной
     * таблице). Правило базы говорит дословно: «markdown разбираем парсером».
     *
     * Разбор к тому же СТРОЖЕ грепа, и разница содержательная: маркер, упомянутый в прозе за
     * пределами скоркарда — в заголовке, в абзаце «надо будет прогнать bib-authors», в чужой
     * цитате, — больше не засчитывается как запись о прогоне. Грепу эти три случая неотличимы от
     * настоящей записи.
     *
     * ⚠️ ЧЕГО ЭТО ВСЁ ЕЩЁ НЕ ЧИНИТ: внутри ячейки свидетельство остаётся ПРОЗОЙ, и прогон,
     * сформулированный другими словами, правило не увидит. Настоящее лекарство — поле во
     * фронтматтере (`gates.cites.ran`), а не более умный поиск по тексту; это отдельная работа,
     * задевающая четыре живых табеля.
     *
     * Поэтому severity назначает ПОТРЕБИТЕЛЬ, и по умолчанию это не `error`: доказательство
     * прогона — проза, а ложное срабатывание на блокирующем уровне дороже пропуска.
     */
    "author-list": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "у статьи с объявленной стадией записан прогон сверки списков авторов — класса, невидимого для проверки существования ссылок",
        },
        schema: [
          {
            type: "object",
            properties: {
              // Маркер прогона в табеле. Данные — у потребителя: как ИМЕННО он записывает, что
              // сверка состоялась, пакет знать не может.
              marker: { type: "string" },
              // Чем прогнать. Это АДРЕС ПОТРЕБИТЕЛЯ, и в публичном пакете его быть не должно:
              // предшественница зашивала `.claude/skills/verify-citations/scripts/bib-authors.mjs`
              // прямо в текст сообщения.
              command: { type: "string" },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          neverRan:
            "объявлена стадия «{{stages}}», но прогон сверки списков авторов в табеле не записан (искали «{{marker}}»). Она ловит то, чего проверка существования ссылок не видит: ссылка есть, id резолвится, а авторы взяты от ПРЕПРИНТА при объявленной конференции{{how}}",
        },
      },
      create(context) {
        const opts = context.options?.[0] ?? {};
        const marker = opts.marker ?? "bib-authors";
        const command = opts.command ?? "";

        // Решение откладывается до конца файла: узел фронтматтера приходит ПЕРВЫМ, а таблица
        // после него. Отчитаться на `yaml` значит вынести вердикт, не увидев скоркарда.
        let declaredAt = null;
        let stages = [];
        let recorded = false;

        return {
          yaml(node) {
            let data;
            try {
              data = load(node.value ?? "");
            } catch {
              return; // о нечитаемом YAML уже отчиталось `paper/stages`
            }
            const raw = data?.stages;
            if (!Array.isArray(raw)) return;
            stages = raw.map((r) => r?.stage).filter(Boolean);
            // Один страж, а не два: `raw.length === 0` был бы ЧАСТНЫМ случаем этого же условия,
            // и мутация по нему оказалась бы неубиваемой — второй страж её глушит. Здесь же
            // покрыт и случай непустого списка из записей без поля `stage`.
            if (stages.length === 0) return; // не отгружено — ничего не должно
            declaredAt = node;
          },

          // Свидетельство — ЯЧЕЙКА СКОРКАРДА, а не любое вхождение строки в файл. Узел у неё
          // есть; первая редакция утверждала обратное и грепала весь текст.
          tableCell(node) {
            if (recorded) return;
            if (context.sourceCode.getText(node).includes(marker)) recorded = true;
          },

          "root:exit"() {
            if (!declaredAt || recorded) return;
            context.report({
              node: declaredAt,
              messageId: "neverRan",
              data: {
                stages: stages.join("/"),
                marker,
                how: command ? `. Прогнать: ${command}` : "",
              },
            });
          },
        };
      },
    },

    source: {
      meta: {
        type: "problem",
        docs: {
          description:
            "у объявленной стадии исходник заморожен рядом с pdf и сверен побайтово — не ссылкой на коммит",
        },
        schema: [],
        messages: {
          noSource:
            "стадия «{{stage}}» ({{date}}) не несёт замороженного исходника. Ссылка на коммит для этого не годится: сквош и gc её убивают — в этом корпусе так уже потеряно три исходника из четырёх",
          sourceMissing:
            "«{{stage}}» ({{date}}): объявлен исходник `{{src}}`, но файла на диске нет",
          sourceBytes:
            "«{{stage}}» ({{date}}): исходник объявлен как {{want}} байт, на диске {{got}} — это НЕ тот файл",
          lostAcknowledged:
            "стадия «{{stage}}» ({{date}}): исходник объявлен УТРАЧЕННЫМ. Сопоставить сборку со строкой рецензента больше не с чем — если копия найдётся, положить в versions/ и снять флаг",
        },
      },
      create(context) {
        const dir = dirname(context.filename);
        return {
          yaml(node) {
            let data;
            try {
              data = load(node.value ?? "");
            } catch {
              return; // `paper/stages` уже отчиталось о нечитаемом YAML
            }
            const raw = data?.stages;
            if (!Array.isArray(raw)) return;
            for (const rec of raw) {
              const stage = String(rec?.stage ?? "");
              if (!STAGES.includes(stage)) continue;
              const date = isoDate(rec?.date);

              // Признание утраты — ЗАПИСЬ, а не освобождение: правило продолжает говорить,
              // потому что состояние остаётся дефектным, просто неисправимым сегодня.
              if (rec?.sourceLost === true) {
                context.report({ node, messageId: "lostAcknowledged", data: { stage, date } });
                continue;
              }
              const src = rec?.source === undefined ? "" : String(rec.source);
              if (src === "") {
                context.report({ node, messageId: "noSource", data: { stage, date } });
                continue;
              }
              const abs = join(dir, src);
              if (!existsSync(abs)) {
                context.report({ node, messageId: "sourceMissing", data: { stage, date, src } });
                continue;
              }
              const got = statSync(abs).size;
              const want = Number(rec?.sourceBytes);
              if (Number.isFinite(want) && got !== want)
                context.report({
                  node,
                  messageId: "sourceBytes",
                  data: { stage, date, want: String(want), got: String(got) },
                });
            }
          },
        };
      },
    },
  },
};
