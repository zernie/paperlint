/**
 * `review/cold-read-cause` — открытая находка перечита, не назвавшая ПРИЧИНУ.
 *
 * ── КОНВЕНЦИЯ ──────────────────────────────────────────────────────────────────
 * Перечит (холодное чтение) статьи заканчивается таблицей находок. Пока находка
 * «открыта», она обязана называть, что её породило — дефект скилла, отсутствующий
 * скилл, хук или правило. Находка без причины чинится точечно, и следующий экземпляр
 * того же класса опять ищут глазами.
 *
 * ── ЧТО ЭТО ЗА ФАЙЛ ────────────────────────────────────────────────────────────
 * Единица 2 шага 9 выноса. Приехала из `checkColdReadCause` потребителя. От соседнего
 * `review/findings-cause` отличается тем, ЧЕГО требует: там пометка нужна ОДНА НА ФАЙЛ,
 * здесь — У КАЖДОЙ строки открытых находок. Поэтому это отдельное правило, а не вторая
 * конфигурация первого.
 *
 * 🔴 ГЛАВНЫЙ ВЫИГРЫШ ПЕРЕЕЗДА — ПОЗИЦИЯ. Старая версия печатала одну строку на файл
 * («3 из 7 находок не называют Причина:»), и человек искал эти три глазами. Правило
 * репортит НА СТРОКУ таблицы: редактор подсвечивает ровно ту находку, которой не
 * хватает разбора.
 *
 * ── ЧТО СНЯЛОСЬ САМО ───────────────────────────────────────────────────────────
 * Старая реализация несла два комментария о собственных ранах, и обе раны здесь
 * невыразимы:
 *   · секцию приходилось брать парсером, потому что `text.split(/^##\s+/m)` резал
 *     заметку по строкам, ПОХОЖИМ на заголовок, — заголовок внутри ```-ограды обрывал
 *     секцию, и хвост переставал проверяться;
 *   · строку-заголовок таблицы отсекали по ПОЗИЦИИ (`.slice(1)`), потому что попытка
 *     опознать её по словам провалилась: `\b` в JS не работает с кириллицей.
 * У AST секция — это заголовок и узлы до следующего заголовка того же уровня, а строка
 * заголовка таблицы — первый `tableRow` таблицы. Обе раны становятся невозможными.
 */

/** Текст узла целиком — включая вложенные `strong`, `code`, ссылки. */
const textOf = (node) =>
  node.type === "text" || node.type === "inlineCode"
    ? (node.value ?? "")
    : (node.children ?? []).map(textOf).join("");

export default {
  rules: {
    "cold-read-cause": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "every OPEN cold-read finding names its cause — what in the pipeline produced it",
        },
        schema: [
          {
            type: "object",
            properties: {
              openSection: { type: "string" },
              causeMarker: { type: "string" },
              sinceCreated: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          noCause:
            "an open cold-read finding does not name a «{{marker}}» (a skill · a missing skill · a hook · a rule). A finding without a cause gets patched in one spot, and the next instance of the same class is found by eye again.",
        },
      },
      create(context) {
        const {
          openSection = "^Открыто",
          causeMarker = "Cause:",
          sinceCreated,
        } = context.options[0] ?? {};
        const title = new RegExp(openSection);
        let created = "";
        // Внутри секции «Открыто» — да или нет. Состояние, а не поиск по тексту: границу
        // задаёт СЛЕДУЮЩИЙ заголовок того же или более высокого уровня, как в разметке и
        // определено. Заголовок внутри ограды сюда не попадает по построению.
        let inOpen = false;
        let openDepth = 0;

        return {
          yaml(node) {
            created = /^created:\s*(\d{4}-\d{2}-\d{2})/m.exec(node.value ?? "")?.[1] ?? "";
          },
          heading(node) {
            if (inOpen && node.depth <= openDepth) inOpen = false;
            if (!inOpen && title.test(textOf(node))) {
              inOpen = true;
              openDepth = node.depth;
            }
          },
          table(node) {
            if (!inOpen) return;
            if (sinceCreated && (!created || created < sinceCreated)) return;
            // Первая строка таблицы — её заголовок ВСЕГДА, это свойство разметки, а не
            // догадка по словам. Отсюда и `.slice(1)` у предшественницы; здесь то же
            // самое, но без риска принять за заголовок что-то другое.
            for (const row of (node.children ?? []).slice(1)) {
              if (textOf(row).includes(causeMarker)) continue;
              context.report({ node: row, messageId: "noCause", data: { marker: causeMarker } });
            }
          },
        };
      },
    },
  },
};
