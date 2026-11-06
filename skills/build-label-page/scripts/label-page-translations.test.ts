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

/** What the page is handed for Russian: the kit's labels with RU's over them, and every question. */
function expectedRu() {
  const [label, boundary] = QUESTIONS;
  assert.ok(label !== undefined && boundary !== undefined);
  const inRu = (qid: "label" | "boundary", value: string) =>
    qid === "label"
      ? RU.questions.label.options[value === "yes" ? "yes" : "no"]
      : RU.questions.boundary.options[value === "clear" ? "clear" : "boundary"];
  return {
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
          ...inRu("label", o.value),
        })),
      },
      {
        id: "boundary",
        text: "Ясный случай или пограничный?",
        options: boundary.options.map((o) => ({
          value: o.value,
          ...inRu("boundary", o.value),
        })),
      },
    ],
  };
}
/** The keys a built page's data has, of `names`. */
const dataKeys = (page: string, names: readonly string[]) =>
  names.filter((k) =>
    Object.hasOwn(z.object({}).loose().parse(dataOf(page)), k),
  );

test("🔴 a translation hands the page each language's words whole, and leaves the key byte for byte as without it", () => {
  const plain = setup("lang-plain", config());
  const translated = setup("lang-ru", withRu());
  const { page } = build(translated);
  const keyOf = (dir: string) =>
    readFileSync(join(dir, "out", "key.json"), "utf8");
  const data = Data.parse(dataOf(page));
  assert.deepEqual(
    [
      data.lang,
      data.translations,
      dataKeys(build(plain).page, ["lang", "translations"]),
    ],
    // Guards: a page without translations carries neither key, so it is as it was.
    ["en", { ru: expectedRu() }, []],
  );
  assert.equal(keyOf(translated), keyOf(plain));
});

test("🔴 a page that names its language without translations keeps it, and still carries no translations", () => {
  const page = build(setup("lang-only", config({ lang: "de" }))).page;
  assert.deepEqual(
    [
      z.object({ lang: z.string() }).loose().parse(dataOf(page)).lang,
      dataKeys(page, ["lang", "translations"]),
    ],
    ["de", ["lang"]],
  );
});

/** RU with an intro, a reason prompt on «no» and a card question naming the marked line. */
const RU_FULL = {
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
/** A German page with an intro, a reason prompt and a card that asks in its own words, and RU_FULL. */
function fullConfig() {
  const [label, boundary] = QUESTIONS;
  assert.ok(label !== undefined && boundary !== undefined);
  const [first, ...rest] = ITEMS;
  return config({
    lang: "de",
    intro: "Answer as you know.",
    questions: [
      {
        ...label,
        options: [
          label.options[0],
          { ...label.options[1], ask_why: "Why not?" },
        ],
      },
      boundary,
    ],
    translations: { ru: RU_FULL },
    items: [
      {
        ...first,
        situation: { question: "Is line 3 correct?" },
        excerpt: { lines: [{ n: 3, text: "x = 1", mark: true }] },
      },
      ...rest,
    ],
  });
}
const FullData = z
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
  .loose();

test("🔴 the page's own language may be named, and an intro, a reason prompt and a card's own question are translated with it", () => {
  const data = FullData.parse(
    dataOf(build(setup("lang-full", fullConfig())).page),
  );
  const ru = data.translations.ru;
  assert.deepEqual(
    [data.lang, ru.intro, ru.situation_question, ru.questions[0]],
    [
      "de",
      RU_FULL.intro,
      RU_FULL.situation_question,
      {
        id: "label",
        text: "Это верно?",
        short: "верно?",
        options: [
          { value: "yes", ...RU.questions.label.options.yes },
          { value: "no", ...RU_FULL.questions.label.options.no },
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

/** A page whose first question asks why on «no». */
function asksWhy() {
  const [label] = QUESTIONS;
  assert.ok(label !== undefined);
  return [
    {
      ...label,
      options: [label.options[0], { ...label.options[1], ask_why: "Why?" }],
    },
    QUESTIONS[1],
  ];
}
/** Configs only the translation checks refuse, each with its refusal. */
const REFUSALS: readonly (readonly [
  string,
  Record<string, unknown>,
  string,
])[] = [
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
    withRu({ questions: asksWhy() }),
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
    refusedWith({ situation_question: "Строка {n} верна?" }, situated(false)),
    "translations.ru.situation_question: names the marked line, and items[0] has no `excerpt` — add it, or write the question without `{n}` and `{line}`",
  ],
];
/** Build `cfg` in a folder of its own; the exit status and what it printed. */
const tryBuild = (name: string, cfg: Record<string, unknown>) => {
  const dir = setup(name, cfg);
  return run(["build", join(dir, "items.json"), join(dir, "out")]);
};

test("🔴 a translation that leaves out or invents a question, an answer, an intro, a reason prompt or a card's question stops the build, by path", () => {
  const cases = REFUSALS;
  assert.deepEqual(
    cases.map(([name, cfg]) =>
      tryBuild(`lang-refused-${name}`, cfg).out.trim(),
    ),
    cases.map(([, , why]) => `REFUSED: ${why}`),
  );
  // Guards: the same card question with its marked line in the code, and one without `{n}` on a
  // card without code, both build.
  assert.deepEqual(
    [
      refusedWith({ situation_question: "Строка {n} верна?" }, situated(true)),
      refusedWith({ situation_question: "Верно?" }, situated(false)),
    ].map((cfg, n) => tryBuild(`lang-situated-${String(n)}`, cfg).status),
    [0, 0],
  );
});

/** A page with two tagged cards, and Russian labels for its tags. */
const taggedPage = (ru: Record<string, unknown>) =>
  config({
    sources: { repo: "From the repository", ours: "Our restatement" },
    items: ITEMS.map((i, n) =>
      n < 2 ? { ...i, quote: { text: "t", from: n ? "ours" : "repo" } } : i,
    ),
    translations: { ru: { ...RU, ...ru } },
  });

test("🔴 translations.<lang>.sources hands the page the tag labels in that language, and one left out stays the page's own", () => {
  const ru = { sources: { repo: "Из репозитория" } };
  const data = z
    .object({
      translations: z.object({
        ru: z.object({ sources: z.record(z.string(), z.string()) }).loose(),
      }),
    })
    .loose()
    .parse(dataOf(build(setup("lang-sources", taggedPage(ru))).page));
  assert.deepEqual(data.translations.ru.sources, ru.sources);
});

test("🔴 a translated tag label for an id the page's sources do not have is refused, with or without sources on the page", () => {
  const stray = { sources: { zzz: "Чужой" } };
  const refused = (name: string, cfg: Record<string, unknown>) => {
    const dir = setup(name, cfg);
    return run(["build", join(dir, "items.json"), join(dir, "out")]);
  };
  assert.deepEqual(
    [
      refused("lang-sources-stray", taggedPage(stray)),
      refused(
        "lang-sources-none",
        withRu({ translations: { ru: { ...RU, ...stray } } }),
      ),
    ],
    [
      {
        status: 1,
        out: "REFUSED: translations.ru.sources.zzz: not one of the page's `sources` (repo, ours)\n",
      },
      {
        status: 1,
        out: "REFUSED: translations.ru.sources.zzz: not one of the page's `sources` (none)\n",
      },
    ],
  );
});
