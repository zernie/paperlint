/**
 * `review/findings-cause` — отчёт ревью с находками и без разбора ПРИЧИН.
 *
 * ── ЧТО ЭТО ЗА ПРАВИЛО ──────────────────────────────────────────────────────────
 * Конвенция пайплайна: ревью статьи заканчивается не списком находок, а ответом на
 * вопрос «что в ПАЙПЛАЙНЕ это пропустило» — дефект скилла, отсутствующий скилл, хук,
 * правило. Иначе правится текст статьи, а инструмент, который её пропустил, остаётся
 * прежним, и следующая статья приезжает с тем же дефектом.
 *
 * ── ПОЧЕМУ ЭТО ПЕРЕЕЗД, А НЕ НОВОЕ ПРАВИЛО ──────────────────────────────────────
 * Первая единица шага 9 выноса: до 2026-09-15 проверка жила в потребителе как
 * `checkReviewFindingsCause` в `.claude/hooks/paper-lint.mjs` — обход каталога плюс
 * три регулярки по тексту.
 *
 * 🔴 И ПЕРЕЕЗД ЗДЕСЬ НЕ КОПИЯ, А СНЯТИЕ ЦЕЛОГО КЛАССА ОШИБОК. Старая версия считала
 * находки так:
 *
 *     tableRows  ←  ^\|\s*\d+\s*\|            строка, начинающаяся «| <число> |»
 *     boldItems  ←  ^\s*[-*]\s+\*\*             пункт списка с полужирным началом
 *
 * (регулярки приведены БЕЗ завершающих слэшей и флагов намеренно: последовательность
 * «звёздочка-слэш» внутри блочного комментария закрывает его — я споткнулся об это
 * дважды за час, второй раз здесь же.)
 *
 * То есть «строка таблицы» опознавалась по написанию, а не по разметке: та же строка
 * внутри ```-ограды считалась находкой, ведущий пробел в ячейке ломал счёт, а `*` и `-`
 * приходилось перечислять вручную. У AST строка таблицы — это узел `tableRow`, и все три
 * промаха становятся невыразимыми. Ровно правило базы «markdown разбираем ПАРСЕРОМ».
 *
 * ── ЧТО ОСТАЁТСЯ ДАННЫМИ ПОТРЕБИТЕЛЯ ───────────────────────────────────────────
 * Порог находок — опция. «Правило от даты» (отчёты старше такой-то даты — известный долг,
 * а не находка) СЮДА НЕ ЕДЕТ вовсе: это факт о корпусе одного потребителя, и место ему в
 * его конфиге через `ignores`, а не в механизме. Механизм — в пакет, данные — у потребителя.
 */

/** Ячейка-номер: первая колонка строки таблицы, в которой стоит одно число. */
const isNumbered = (row) => {
  const first = row.children?.[0];
  const text = (first?.children ?? []).map((c) => c.value ?? "").join("").trim();
  return /^\d+$/.test(text);
};

/** Пункт-находка: элемент списка, начинающийся с полужирного — заголовка находки. */
const isBoldItem = (item) => {
  const para = item.children?.find((c) => c.type === "paragraph");
  return para?.children?.[0]?.type === "strong";
};

export default {
  rules: {
    "findings-cause": {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "a review report with findings names what in the pipeline let them through",
        },
        schema: [
          {
            type: "object",
            properties: {
              minFindings: { type: "integer", minimum: 1 },
              causeMarker: { type: "string" },
              sinceCreated: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          noCause:
            "{{count}} findings and not one «{{marker}}» note. First name what in the PIPELINE let them through (a defective skill · a missing skill · a hook · a rule) and fix THAT: the text edit falls out of running the fixed tool, not instead of it.",
        },
      },
      create(context) {
        const { minFindings = 3, causeMarker = "Причина:", sinceCreated } = context.options[0] ?? {};
        let findings = 0;
        let hasCause = false;
        let created = "";

        return {
          // 🔴 «ПРАВИЛО ОТ ДАТЫ» — МЕХАНИЗМ, ДАТА — ДАННЫЕ. Новая проверка, открывающаяся
          // стеной находок на историческом корпусе, глушится в тот же день; поэтому у
          // потребителя должен быть способ сказать «до такого-то числа это известный долг,
          // а не находка». Замер в первом потребителе: 84 отчёта, сработало бы 0 новых и
          // 49 старых — без этой опции правило открылось бы сорока девятью находками.
          // Дата НЕ зашита: она приходит опцией, читается из `created` во фронтматтере, и
          // документ без даты трактуется как СТАРЫЙ только когда опция задана — иначе
          // отсутствие фронтматтера стало бы способом обойти правило.
          yaml(node) {
            created = /^created:\s*(\d{4}-\d{2}-\d{2})/m.exec(node.value ?? "")?.[1] ?? "";
          },
          tableRow(node) {
            if (isNumbered(node)) findings++;
          },
          listItem(node) {
            if (isBoldItem(node)) findings++;
          },
          text(node) {
            if (node.value.includes(causeMarker)) hasCause = true;
          },
          "root:exit"(node) {
            if (hasCause || findings < minFindings) return;
            if (sinceCreated && (!created || created < sinceCreated)) return;
            // Находка про ФАЙЛ, а не про строку: отсутствует то, чего нигде нет. Поэтому
            // позиция — начало документа, единственное честное место для «здесь не хватает».
            context.report({
              loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
              messageId: "noCause",
              data: { count: String(findings), marker: causeMarker },
              node,
            });
          },
        };
      },
    },
  },
};
