/**
 * ESLint configuration for this repository's OWN fixtures.
 *
 * It is not the configuration a consumer will use — a consumer points the same block at the
 * path of its own paper (`papers/<name>/paper.tex` or wherever the source actually lives).
 * What is reusable here is the SHAPE: one plugin object carrying both the language and the
 * rules that read LaTeX source, one `language:` line, and an explicit severity per rule.
 *
 * 🔴 The glob matters more than it looks. A rule whose glob matches nothing is not "clean" —
 * it is never invoked, and the run reports exactly the same green as a rule that passed. That
 * is why `scripts/rules-see-files.mjs` exists and why it runs as part of the test suite:
 * every rule declared below must be enabled for at least one file that is actually on disk.
 */
import { texLanguage } from "./eslint-rules/latex-language.mjs";
import texBuild from "./eslint-rules/tex-build.mjs";
import markdown from "@eslint/markdown";
import reviewRules from "./eslint-rules/review-findings-cause.mjs";

export default [
  /**
   * 🔴 ЭТОТ БЛОК — ПРО САМ ПАКЕТ, и до 2026-09-15 его здесь не было: конфиг нёс ровно один
   * блок для `.tex` (глоб внутри этого комментария не привожу: последовательность
   * «звёздочка-слэш» закрыла бы сам комментарий — на чём я тут и споткнулся), а файл, под который нет ни одного блока, ESLint 9 просто ИГНОРИРУЕТ.
   * То есть 133 собственных `.mjs` — движок мутаций, три хука, скрипты 24 скиллов — не
   * проверял никто, при зелёном `npm run lint`. Инструмент, который проверяет чужие статьи
   * и не проверяет себя.
   *
   * Замер в первый же прогон: 15 файлов с мёртвыми импортами (`resolve`, `pathToFileURL`) и
   * осиротевшими константами — след переезда из `mine`, где эти имена были нужны. Все
   * вычищены до нуля в том же коммите, поэтому правило открывается ГЕЙТОМ на чистом
   * корпусе, а не долгом, который глушат.
   *
   * ⚠️ ПРАВИЛА ПЕРЕЧИСЛЕНЫ, А НЕ ВЗЯТЫ НАБОРОМ, по двум причинам. Первая: `@eslint/js` в
   * зависимостях нет, и тянуть его ради пресета — цена больше пользы при шести devDeps.
   * Вторая важнее: перечисление делает каждое включение РЕШЕНИЕМ, как и в блоке про .tex
   * ниже, где у каждой строки стоит причина.
   *
   * 🔴 ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: `require-atomic-updates`. Она даёт три находки в
   * `verify-cites.mjs` на классическом мемоизаторе (прочитать `cache[ck]` → `await` →
   * записать). Прочитано по коду: обход цитат последовательный, а цена гонки в худшем
   * случае — повторный сетевой вызов с равнозначным результатом. То есть на ЭТОМ корпусе
   * это ложное срабатывание, а для правила уровня `error` ложное срабатывание хуже
   * пропуска: его выключают в тот же день, и вместе с ним перестают читать остальные.
   * В `eslint:recommended` её, к слову, тоже нет.
   */
  {
    files: ["**/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module" },
    rules: {
      // Мёртвый импорт — не стиль, а след незаконченной правки: он говорит, что файл когда-то
      // делал что-то ещё. Пятнадцать таких и нашлись переездом.
      "no-unused-vars": "error",
      // Ниже — то, что молча меняет ПОВЕДЕНИЕ, а не вид: пустой блок `catch {}` (проглоченная
      // ошибка — записанный класс отказов этого репозитория), условие-константа, дубль ключа,
      // недостижимый код, провал сквозь `case`.
      "no-empty": "error",
      "no-constant-condition": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      // Регулярки: лишний экранирующий слэш и управляющий символ в классе — обе находки про
      // то, что паттерн ищет НЕ ТО, что автор написал. Предмет этого репозитория — проверки,
      // а проверка, ищущая не то, зелена по построению.
      "no-useless-escape": "error",
      "no-control-regex": "error",
      "no-misleading-character-class": "error",
      "no-prototype-builtins": "error",
    },
  },
  /**
   * Первое markdown-правило пакета — единица 1 шага 9 (переезд из потребителя).
   * Блок нацелен на СВОИ фикстуры: у потребителя тот же плагин наводится на его
   * каталог отчётов ревью. `warn` по той же причине, что и у .tex ниже: фикстуры
   * дефектны НАРОЧНО, и `error` означал бы, что `npx eslint .` красный на здоровом
   * чекауте. Сигнал живёт в `npm test`, а не в числе предупреждений.
   */
  {
    files: ["fixtures/review-findings-cause/**/*.md"],
    plugins: { markdown, review: reviewRules },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "review/findings-cause": "warn" },
  },
  {
    files: ["**/*.tex"],
    plugins: {
      // One plugin object carries BOTH the language and the rules: `tex/latex` is the
      // language, `tex/*` are the rules about the LaTeX source itself. ESLint permits this,
      // and a second plugin name would buy nothing.
      tex: { languages: { latex: texLanguage }, rules: texBuild },
    },
    language: "tex/latex",
    rules: {
      // `warn`, and that is an analysis rather than caution. The finding is NOT binary: a
      // promise in a shipped build is sometimes honest (something genuinely not released
      // yet), and the verdict "does this contradict the Availability paragraph" is a human
      // one — which is what the message says. There is also a demonstrable class of false
      // positives: "their replication will be published in 2027" is a sentence about SOMEONE
      // ELSE's work. An `error` that fails on a correct input gets switched off the same day,
      // and then the binary checks stop being read too.
      "tex/future-promise": "warn",
      // 🔴 `warn` HERE AND `error` IN A CONSUMER, on purpose. The finding itself is binary —
      // the macro is present or it is not — and it has a named exemption (`nonacm`), so in a
      // repository that lints a REAL paper it belongs at `error`: the cost of a miss is a desk
      // reject with no content review, and that asymmetry is the whole argument. This
      // repository lints fixtures that are broken by construction, where the same severity
      // would only mean `npx eslint .` exits non-zero on a healthy checkout. The severity is
      // a statement about the CORPUS being linted, not about how sure the rule is.
      "tex/acm-frontmatter-override": "warn",
    },
    // ⚠️ `npx eslint .` therefore reports six warnings on a healthy checkout: the four defect
    // fixtures are DEFECTIVE ON PURPOSE, and that is what makes the fire half of every harness
    // real. Do not silence them by adding an ignore — a rule that lints only clean inputs is
    // one whose firing path nothing exercises, which is rule 4 wearing a different hat. The
    // pass/fail signal lives in `npm test`, not in the warning count of `npm run lint`.
  },
];
