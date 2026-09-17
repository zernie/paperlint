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
import localRules from "./eslint-rules/temp-root-realpath.mjs";
import portRules from "./eslint-rules/install-path-literals.mjs";

export default [
  // 🔴 TRANSIENT DIRECTORIES ARE NOT THE CORPUS, and leaving them in is a RACE, not untidiness.
  // `paper-stages.harness.mjs` creates a temp tree under fixtures and removes it when done,
  // while `latex-language.harness.mjs` lints the whole repository to prove its glob matches
  // real files. Run in parallel, ESLint enumerates a path and then reads it, and the file can
  // be gone in between: ENOENT, in a harness that has nothing to do with either.
  //
  // Measured 2026-09-17: the race had been latent and surfaced the moment a 54th harness
  // shifted the scheduling. Nothing about the new harness was wrong — which is the point.
  { ignores: [".tmp-stages-src-*/", "fixtures/.tmp-*/"] },
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
    plugins: { local: localRules, port: portRules },
    rules: {
      // Rule 10's mechanical half, code side. `warn` and not `error`, unlike its neighbour
      // above: this one does NOT open on a clean corpus. Two shipped modules print a command
      // for a human that names an install-specific path, and neither is fixable by the
      // answer the skills get — a printed command has to be resolved through the port at
      // runtime. The line is held by a ratchet in the harness, which permits today's two and
      // refuses a third; the severity only keeps `npx eslint .` from being red on a healthy
      // clone, which is how a rule gets switched off and its binary neighbours ignored.
      "port/js-install-path": "warn",
      // 🔴 `error`, И ЭТО РЕШЕНИЕ, А НЕ УМОЛЧАНИЕ. Правило открывается ГЕЙТОМ на чистом
      // корпусе: все пятнадцать площадок разрешены в том же коммите, поэтому долга, который
      // пришлось бы глушить, нет. Строже того: дефект, который оно ловит, ВОСПРОИЗВОДИМ
      // ТОЛЬКО НА macOS, а CI здесь ровно один — `ubuntu-latest`. То есть на Linux это
      // единственный сторож, который вообще может покраснеть, и `warn` означал бы, что его
      // никто никогда не увидит: `eslint .` выходит нулём на предупреждениях.
      "local/temp-root-realpath": "error",
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
  /**
   * Rule 10's mechanical half, prose side — and this is where the debt actually is: 76
   * findings across 29 skills on a healthy checkout, every one of them a command that
   * resolves in one delivery channel and is absent in another.
   *
   * The severity is a statement about the CORPUS, exactly as in the .tex block below: the
   * finding itself is binary, but the corpus carries known debt that cannot be paid in the
   * commit that introduces the rule. `npm test` holds the ratchet, so the number may fall
   * and never rise; `warn` keeps a clean clone from being red in the meantime.
   */
  {
    files: ["skills/**/*.md"],
    plugins: { markdown, port: portRules },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "port/md-install-path": "warn" },
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
