/**
 * `doc/fields` — документ обязан объявлять ПОЛЯ, а не намекать на них вёрсткой.
 *
 * ── ЗАЧЕМ ──────────────────────────────────────────────────────────────────────
 * Конвенция вида «в карточке должна стоять пометка `**Прочитано:**`» описывает не
 * данные, а ОФОРМЛЕНИЕ. Жирный текст в markdown означает «жирный текст»; то, что
 * автор имел в виду поле, — наша догадка. Правило требует настоящее поле во
 * фронтматтере и сверяет его значение со списком допустимых.
 *
 * ── ЧТО ЭТО ЗА ФАЙЛ ────────────────────────────────────────────────────────────
 * Единица 3 шага 9 выноса, и первая, которая НЕ является портом предшественницы.
 * Две предыдущие (`review/findings-cause`, `review/cold-read-cause`) переносили
 * механизм как есть; здесь механизм заменён, потому что предшественница искала
 * подстроку `**Прочитано:**` в сыром тексте, и замер показал промахи в обе стороны:
 *
 *   | вход                                        | подстрока |
 *   |---------------------------------------------|-----------|
 *   | `**Прочитано**: всё` (двоеточие снаружи)     | ❌ отказ   |
 *   | `__Прочитано:__ всё` (подчёркивания)         | ❌ отказ   |
 *   | ```-ограда с примером внутри                  | ✅ засчёт  |
 *   | `не хватает **Прочитано:** — я не читал`      | ✅ засчёт  |
 *
 * Последняя строка — суть дела: проверка ПОЛНОТЫ засчитывала прямое признание в
 * неполноте, потому что смотрела на символы, а не на утверждение.
 *
 * 🔴 И ОЧЕВИДНАЯ ПОЧИНКА СДЕЛАЛА БЫ ХУЖЕ. Наивный перевод на AST — «есть узел
 * `strong`, чей текст начинается с „Прочитано“» — засчитал бы живую карточку
 * `**Прочитано только на уровне абстракта.** Полный текст обязателен до сабмита`,
 * то есть принял бы известный долг за выполненную работу. Регулярка её отвергала
 * СЛУЧАЙНО — требовала двоеточие сразу после слова. Поле снимает спор целиком:
 * `read: abstract` — законное значение, а не неудачное написание.
 *
 * ── ЧЕГО ЭТО ПРАВИЛО НЕ ДЕЛАЕТ, И ЭТО РЕШЕНИЕ ──────────────────────────────────
 * Оно не заменяет собой проверки СОДЕРЖИМОГО. Поле — это утверждение автора о
 * себе, и проверить его нельзя: `refs_diffed: true` ставится галочкой, не сделав
 * работы. Поэтому требование «в карточке есть секция с разбором библиографии»
 * остаётся отдельной заголовочной проверкой у потребителя. Полем становится только
 * то, что и так является утверждением (что именно прочитано), а не артефактом.
 *
 * ── ГРАНИЦЫ ────────────────────────────────────────────────────────────────────
 * · Отсутствие фронтматтера — НАХОДКА, а не освобождение. Иначе гейт обходится
 *   удалением шапки; такая дыра в предшественнице этого семейства уже была
 *   (файл без `created` выпадал из проверки целиком).
 * · `sinceCreated` сравнивает строки ISO — это законно, потому что формат
 *   фиксирован и лексикографический порядок совпадает с хронологическим.
 */
import { load } from "js-yaml";

/**
 * `created` из YAML приезжает либо строкой, либо ДАТОЙ — js-yaml по умолчанию
 * распознаёт таймстампы YAML 1.1, и `created: 2026-07-29` без кавычек становится
 * объектом `Date`. Сравнение `Date < "2026-07-29"` даёт `false` молча, то есть
 * гейт от даты перестал бы работать и никто бы не заметил. Приводим к `YYYY-MM-DD`.
 */
function isoDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0] ?? "";
  return "";
}

export default {
  rules: {
    fields: {
      meta: {
        type: "problem",
        docs: {
          description:
            "a document declares its required frontmatter fields and their allowed values, instead of hinting at them with markup",
        },
        schema: [
          {
            type: "object",
            properties: {
              fields: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    values: { type: "array", items: { type: "string" }, minItems: 1 },
                    hint: { type: "string" },
                  },
                  additionalProperties: false,
                },
                minProperties: 1,
              },
              sinceCreated: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            },
            required: ["fields"],
            additionalProperties: false,
          },
        ],
        messages: {
          noFrontmatter:
            "no frontmatter — a document of this class must declare the fields {{names}}. A missing header is not an exemption: otherwise the check is bypassed by deleting it.",
          malformed: "the frontmatter does not parse as YAML ({{why}}) — there is nothing to read the fields {{names}} from.",
          missing:
            "the frontmatter has no `{{name}}` field{{hint}}. Allowed values: {{values}}. A note in the body is not a field: markup describes presentation, not data.",
          badValue:
            "`{{name}}: {{actual}}` — value is not in the list. Allowed: {{values}}.",
        },
      },
      create(context) {
        const { fields, sinceCreated } = context.options[0] ?? {};
        const names = Object.keys(fields);
        let seenFrontmatter = false;

        return {
          yaml(node) {
            seenFrontmatter = true;
            let data;
            try {
              data = load(node.value ?? "");
            } catch (e) {
              context.report({
                node,
                messageId: "malformed",
                data: { why: e.reason ?? e.message ?? "unparseable", names: names.join(", ") },
              });
              return;
            }
            if (data === null || typeof data !== "object" || Array.isArray(data)) {
              context.report({
                node,
                messageId: "malformed",
                data: { why: "the header is not a key-value mapping", names: names.join(", ") },
              });
              return;
            }
            // Гейт от даты стоит ЗДЕСЬ, а не в `root:exit`: документ без шапки не имеет
            // `created`, то есть под гейт не подпадает и обязан быть находкой (см. ГРАНИЦЫ).
            const created = isoDate(data.created);
            if (sinceCreated && (!created || created < sinceCreated)) return;

            for (const [name, spec] of Object.entries(fields)) {
              const values = spec.values;
              const hint = spec.hint ? ` (${spec.hint})` : "";
              if (!(name in data) || data[name] === null || data[name] === "") {
                context.report({
                  node,
                  messageId: "missing",
                  data: { name, hint, values: values.join(" · ") },
                });
                continue;
              }
              const actual = String(data[name]);
              if (!values.includes(actual))
                context.report({
                  node,
                  messageId: "badValue",
                  data: { name, actual, values: values.join(" · ") },
                });
            }
          },
          "root:exit"(node) {
            if (seenFrontmatter) return;
            context.report({ node, messageId: "noFrontmatter", data: { names: names.join(", ") } });
          },
        };
      },
    },
  },
};
