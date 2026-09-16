/**
 * `paper/research-question` — отгруженная статья формулирует свой вопрос ЯВНО.
 *
 * Дословный пункт рецензента A по agenticdev (#20), как он был разобран: «Сформулировать цель
 * как research question». Это ожидание площадки, а не вкус: эмпирическая статья, которая ни разу
 * не называет вопрос, на который отвечает, заставляет рецензента реконструировать его — и он об
 * этом пишет.
 *
 * ── ПОЧЕМУ ОБЛАСТЬ — ТОЛЬКО ОТГРУЖЕННЫЕ ─────────────────────────────────────────────────
 * Черновик ещё никого не просил себя читать. Область совпадает с `paper/author-list` намеренно:
 * предмет обоих — ДОЛГ отгруженной статьи, а у неотгруженной долга нет. Замер на живом корпусе
 * до переноса:
 *     agenticdev-2026   RQ есть,  отгружена      -> молчит  (добавлен по этой самой рецензии)
 *     aisec-2026        RQ нет,   отгружена      -> находка
 *     compile-rules     RQ нет,   отгружена      -> находка
 *     scored-2026       RQ нет,   НЕ отгружена   -> молчит
 *
 * ── ЧТО ИЗМЕНИЛ ПЕРЕНОС ─────────────────────────────────────────────────────────────────
 * Предшественница читала стадию РЕГУЛЯРКОЙ ПО ПРОЗЕ табеля. Перезамер 2026-09-17: у
 * `agenticdev-2026` проза видит `submitted`, а поле `stages` объявляет `submitted, camera-ready`.
 * Здесь стадия берётся из ПОЛЯ — того же, которое `paper/stages` сверяет с байтами в обе стороны.
 *
 * ⚠️ ЧЕГО ПЕРЕНОС НЕ ЧИНИТ, И ЭТО ИЗМЕРЕНО, А НЕ ПРЕДПОЛОЖЕНО. Правило читает СЫРОЙ текст, а не
 * разобранное дерево, поэтому упоминание RQ внутри комментария LaTeX (`% добавить RQ`) его
 * усыпит. Замер 2026-09-17 по всем четырём статьям: таких случаев НОЛЬ — совпадений в
 * комментариях нет ни одного. То есть дыра ЛАТЕНТНАЯ, а не наблюдённая, и закрывать её обходом
 * дерева значило бы усложнять правило без измеренной разницы. Соседнее `paper/typography`
 * устроено так же и по той же причине. Появится первый случай — здесь будет что процитировать.
 *
 * Правило ADVISORY по решению, а не по совпадению: у position-статьи вопроса может и не быть
 * законно. Тогда его отсутствие — решение автора, и правило говорит именно это, а не объявляет
 * отсутствие дефектом само по себе.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { load } from "js-yaml";

/**
 * Три написания одной вещи. Регулярка тут ЗАКОННА: предмет — человеческая проза, у которой
 * структуры нет по определению, и ни один парсер не отличит формулировку вопроса от абзаца о нём.
 * Список форм открыт намеренно: `\textbf{RQ` — как его набирают в LaTeX, `RQ1`/`RQ` — как на него
 * ссылаются в тексте, `research question` — как его называют словами.
 */
const RQ_RE = /\\textbf\{RQ|\bRQ[0-9]?\b|research question/i;

/** Стадии, объявленные ПОЛЕМ. Нет табеля или нет поля — статья не отгружена. */
function declaredStages(dir, statusName) {
  const p = join(dir, statusName);
  if (!existsSync(p)) return [];
  let text;
  try {
    text = readFileSync(p, "utf-8");
  } catch {
    return [];
  }
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return [];
  let data;
  try {
    data = load(m[1]);
  } catch {
    return []; // о нечитаемом YAML отчитывается `paper/stages`, на своём файле
  }
  const raw = data?.stages;
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => r?.stage).filter(Boolean);
}

export default {
  rules: {
    "research-question": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "статья, объявившая стадию, формулирует свой research question явно — иначе рецензент реконструирует его сам и пишет об этом",
        },
        schema: [
          {
            type: "object",
            properties: {
              // Имя табеля — конвенция ПОТРЕБИТЕЛЯ. Правило объявлено на исходнике статьи,
              // поэтому соседа оно вынуждено называть само, а не получать глобом конфига.
              statusFile: { type: "string" },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          missing:
            "статья отгружена (стадия «{{stages}}»), но НИ РАЗУ не формулирует research question явно. Это дословный пункт рецензента A по agenticdev (#20). Advisory: у position-статьи RQ может и не быть, но тогда это РЕШЕНИЕ, а не пропуск",
        },
      },
      create(context) {
        const statusName = context.options?.[0]?.statusFile ?? "PIPELINE-STATUS.md";
        return {
          // `root:exit` есть и у markdown, и у языка `tex/latex` — то же место, где живёт
          // `paper/typography`, и по той же причине: статья в этом корпусе бывает и та, и другая.
          "root:exit"(node) {
            const raw = context.sourceCode.raw ?? context.sourceCode.text;
            if (typeof raw !== "string") return;
            const stages = declaredStages(dirname(context.filename), statusName);
            if (stages.length === 0) return; // не отгружена — ничего не должна
            if (RQ_RE.test(raw)) return;
            context.report({ node, messageId: "missing", data: { stages: stages.join("/") } });
          },
        };
      },
    },
  },
};
