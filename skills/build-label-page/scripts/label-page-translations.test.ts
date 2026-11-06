/**
 * A second language for the page's own words (#394): what `translations` must cover, what the page
 * is handed, and that the ids and the key do not depend on it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { z } from "zod";
import {
  ITEMS,
  QUESTIONS,
  build,
  config,
  run,
  setup,
} from "../../../test/label-page-kit.ts";

/** The questions of the kit's page in Russian: every question and every answer, by id and value. */
const RU = {
  title: "Разметьте",
  labels: { how_to: "📖 Как отвечать", for_example: "Например: " },
  questions: {
    label: {
      text: "Это верно?",
      short: "верно?",
      options: {
        yes: { label: "Да", example: "Сортировка вернула 1, 2, 3." },
        no: { label: "Нет", example: "Сортировка вернула 3, 1, 2." },
      },
    },
    boundary: {
      text: "Ясный случай или пограничный?",
      options: {
        clear: { label: "Ясный", example: "Пустой список." },
        boundary: { label: "Пограничный", example: "Два равных ключа." },
      },
    },
  },
};
const withRu = (over: Record<string, unknown> = {}) =>
  config({ translations: { ru: RU }, ...over });

/** The page's data: the JSON the template is filled with. */
const dataOf = (page: string): unknown =>
  JSON.parse(
    String(
      page
        .split('<script type="application/json" id="data">')[1]
        ?.split("</script>")[0],
    ).replaceAll("<\\/", "</"),
  );
const Data = z
  .object({ lang: z.string(), translations: z.record(z.string(), z.unknown()) })
  .loose();

test("🔴 a translation hands the page each language's words whole, and leaves the key byte for byte as without it", () => {
  const plain = setup("lang-plain", config());
  const translated = setup("lang-ru", withRu());
  const { page } = build(translated);
  build(plain);
  const keyOf = (dir: string) =>
    readFileSync(join(dir, "out", "key.json"), "utf8");
  assert.equal(keyOf(translated), keyOf(plain));
  const [label, boundary] = QUESTIONS;
  assert.ok(label !== undefined && boundary !== undefined);
  const data = Data.parse(dataOf(page));
  assert.deepEqual(
    [data.lang, data.translations],
    [
      "en",
      {
        ru: {
          title: RU.title,
          intro: "",
          labels: {
            place: "{id} · {n} of {total}",
            line: "Line",
            line_part: "{line} · part {part} of {of}",
            repeat: "Card {index} of {of}",
            practice_example: "",
            hidden: "lines {from}–{to}",
            hidden_one: "line {from}",
            wait: "⏳ You can answer in {s} s",
            ...RU.labels,
          },
          questions: [
            {
              id: "label",
              text: "Это верно?",
              short: "верно?",
              options: label.options.map((o) => ({
                value: o.value,
                ...RU.questions.label.options[o.value === "yes" ? "yes" : "no"],
              })),
            },
            {
              id: "boundary",
              text: "Ясный случай или пограничный?",
              options: boundary.options.map((o) => ({
                value: o.value,
                ...RU.questions.boundary.options[
                  o.value === "clear" ? "clear" : "boundary"
                ],
              })),
            },
          ],
        },
      },
    ],
  );
  // Guards: a page without translations carries neither key, so it is as it was.
  assert.deepEqual(
    ["lang", "translations"].filter((k) =>
      Object.hasOwn(
        z
          .object({})
          .loose()
          .parse(dataOf(build(plain).page)),
        k,
      ),
    ),
    [],
  );
});

test("🔴 the page's own language may be named, and an intro, a reason prompt and a card's own question are translated with it", () => {
  const [label, boundary] = QUESTIONS;
  assert.ok(label !== undefined && boundary !== undefined);
  const why = {
    ...label,
    options: [label.options[0], { ...label.options[1], ask_why: "Why not?" }],
  };
  const ru = {
    ...RU,
    intro: "Отвечайте как знаете.",
    situation_question: "Строка {n} верна?",
    questions: {
      ...RU.questions,
      label: {
        ...RU.questions.label,
        options: {
          ...RU.questions.label.options,
          no: { ...RU.questions.label.options.no, ask_why: "Почему?" },
        },
      },
    },
  };
  const [first, ...rest] = ITEMS;
  const { page } = build(
    setup(
      "lang-full",
      config({
        lang: "de",
        intro: "Answer as you know.",
        questions: [why, boundary],
        translations: { ru },
        items: [
          {
            ...first,
            situation: { question: "Is line 3 correct?" },
            excerpt: { lines: [{ n: 3, text: "x = 1", mark: true }] },
          },
          ...rest,
        ],
      }),
    ),
  );
  const data = z
    .object({
      lang: z.string(),
      translations: z.object({
        ru: z
          .object({
            intro: z.string(),
            situation_question: z.string(),
            questions: z.array(z.unknown()),
          })
          .loose(),
      }),
    })
    .loose()
    .parse(dataOf(page));
  assert.deepEqual(
    [
      data.lang,
      data.translations.ru.intro,
      data.translations.ru.situation_question,
      data.translations.ru.questions[0],
    ],
    [
      "de",
      ru.intro,
      ru.situation_question,
      {
        id: "label",
        text: "Это верно?",
        short: "верно?",
        options: [
          { value: "yes", ...RU.questions.label.options.yes },
          { value: "no", ...ru.questions.label.options.no },
        ],
      },
    ],
  );
});

/** The kit's page with its Russian words changed by `ru`, and more of the config by `over`. */
const refusedWith = (
  ru: Record<string, unknown>,
  over: Record<string, unknown> = {},
) => withRu({ translations: { ru: { ...RU, ...ru } }, ...over });
const ruQuestion = (
  qid: "label" | "boundary",
  change: Record<string, unknown>,
) => ({
  questions: { ...RU.questions, [qid]: { ...RU.questions[qid], ...change } },
});
const ruOptions = (options: Record<string, unknown>) =>
  ruQuestion("label", { options });
const situated = (excerpt: boolean) => ({
  items: ITEMS.map((i, n) =>
    n === 0
      ? {
          ...i,
          situation: { question: "Is it correct?" },
          ...(excerpt
            ? { excerpt: { lines: [{ n: 3, text: "x", mark: true }] } }
            : {}),
        }
      : i,
  ),
});

test("🔴 a translation that leaves out or invents a question, an answer, an intro, a reason prompt or a card's question stops the build, by path", () => {
  const [label] = QUESTIONS;
  assert.ok(label !== undefined);
  const cases: readonly (readonly [string, Record<string, unknown>, string])[] =
    [
      [
        "own",
        withRu({ translations: { en: RU } }),
        "translations.en: is the page's own language (`lang` is 'en') — translate into another one",
      ],
      [
        "no-question",
        refusedWith({ questions: { label: RU.questions.label } }),
        "translations.ru.questions.boundary: is required and missing — every question of the page is translated",
      ],
      [
        "stray-question",
        refusedWith({
          questions: { ...RU.questions, ghost: RU.questions.label },
        }),
        "translations.ru.questions.ghost: not a question of this page (label, boundary)",
      ],
      [
        "no-answer",
        refusedWith(ruOptions({ yes: RU.questions.label.options.yes })),
        "translations.ru.questions.label.options.no: is required and missing — every answer is translated",
      ],
      [
        "stray-answer",
        refusedWith(
          ruOptions({
            ...RU.questions.label.options,
            maybe: { label: "Может", example: "e" },
          }),
        ),
        "translations.ru.questions.label.options.maybe: not one of yes, no",
      ],
      [
        "same-label",
        refusedWith(
          ruOptions({
            ...RU.questions.label.options,
            no: { label: " да ", example: "e" },
          }),
        ),
        "translations.ru.questions.label.options.no.label: ' да ' reads the same as options.yes.label — each button needs its own label",
      ],
      [
        "no-why",
        withRu({
          questions: [
            {
              ...label,
              options: [
                label.options[0],
                { ...label.options[1], ask_why: "Why?" },
              ],
            },
            QUESTIONS[1],
          ],
        }),
        "translations.ru.questions.label.options.no.ask_why: is required and missing — this answer asks why",
      ],
      [
        "stray-why",
        refusedWith(
          ruOptions({
            ...RU.questions.label.options,
            no: { ...RU.questions.label.options.no, ask_why: "Почему?" },
          }),
        ),
        "translations.ru.questions.label.options.no.ask_why: is never shown — the page has no text it translates",
      ],
      [
        "no-intro",
        withRu({ intro: "Answer." }),
        "translations.ru.intro: is required and missing — the page has an `intro`",
      ],
      [
        "stray-intro",
        refusedWith({ intro: "Отвечайте." }),
        "translations.ru.intro: is never shown — the page has no text it translates",
      ],
      [
        "no-situation",
        withRu(situated(true)),
        "translations.ru.situation_question: is required and missing — items[0].situation asks the first question in the card's own words",
      ],
      [
        "stray-situation",
        refusedWith({ situation_question: "Верно?" }),
        "translations.ru.situation_question: is never shown — the page has no text it translates",
      ],
      [
        "line-without-code",
        refusedWith(
          { situation_question: "Строка {n} верна?" },
          situated(false),
        ),
        "translations.ru.situation_question: names the marked line, and items[0] has no `excerpt` — add it, or write the question without `{n}` and `{line}`",
      ],
    ];
  assert.deepEqual(
    cases.map(([name, cfg]) => {
      const dir = setup(`lang-refused-${name}`, cfg);
      return run([
        "build",
        join(dir, "items.json"),
        join(dir, "out"),
      ]).out.trim();
    }),
    cases.map(([, , why]) => `REFUSED: ${why}`),
  );
  // Guards: the same card question with its marked line in the code, and one without `{n}` on a
  // card without code, both build.
  assert.deepEqual(
    [
      refusedWith({ situation_question: "Строка {n} верна?" }, situated(true)),
      refusedWith({ situation_question: "Верно?" }, situated(false)),
    ].map((cfg, n) => {
      const dir = setup(`lang-situated-${String(n)}`, cfg);
      return run(["build", join(dir, "items.json"), join(dir, "out")]).status;
    }),
    [0, 0],
  );
});
