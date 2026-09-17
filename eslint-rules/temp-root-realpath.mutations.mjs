/**
 * Батарея на `local/temp-root-realpath`. Пять мутаций, пять РАЗНЫХ ассертов: правило
 * должно срабатывать, должно освобождать разрешённый корень, не должно кричать на
 * вложенный, должно понимать namespace-написание — и, отдельно, случай 6 обязан ловить
 * РЕГРЕССИЮ В КОРПУСЕ, а не только в выдуманной строке.
 *
 * 🔴 Последняя мутация — единственное, что делает починку issue #9 охраняемой. Дефект
 * невоспроизводим на Linux: снятая обёртка `realpathSync` оставляет все 52 харнесса
 * зелёными. Если её снятие не краснит НИЧЕГО, то двадцать четыре правки держатся
 * исключительно на памяти следующего автора.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "temp-root-realpath.mjs");
const HARNESS = join(HERE, "temp-root-realpath.harness.mjs");
const CORPUS = join(ROOT, "skills", "paper-pipeline", "scripts", "consumer.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "правило перестаёт репортить",
        harness: HARNESS,
        expect: "ожидалась одна находка",
        disables: "сам вердикт — неразрешённый корень проходит молча",
        edits: [[RULE, "context.report({ node, messageId: \"unresolved\" });", "void node;"]],
      },
      {
        name: "освобождение по realpathSync снимается",
        harness: HARNESS,
        expect: "правило обязано молчать",
        disables: "освобождение — уже починенный корень начинает краснеть, а для error-правила ложное срабатывание хуже пропуска",
        edits: [[RULE, "if (isRealpathCall(parent) && parent.arguments[0] === node) return;", "void parent;"]],
      },
      {
        name: "условие «в аргументах есть tmpdir()» снимается",
        harness: HARNESS,
        expect: "вложенный корень наследует написание от родителя",
        disables: "сужение предиката — правило начинает требовать резолва и у вложенных корней",
        edits: [[RULE, "if (!mentionsTmpdir(node.arguments)) return;", "void node;"]],
      },
      {
        name: "namespace-написание перестаёт опознаваться",
        harness: HARNESS,
        expect: "namespace-написание обязано ловиться",
        disables: "разбор `fs.mkdtempSync` — дефект прячется за точкой",
        edits: [[RULE, "if (c.type === \"MemberExpression\" && !c.computed && c.property.type === \"Identifier\")\n    return c.property.name;", "if (false) return \"\";"]],
      },
      {
        name: "🔴 РЕГРЕССИЯ В КОРПУСЕ: с одного настоящего корня снята обёртка",
        harness: HARNESS,
        expect: "корпус обязан быть чист от неразрешённых корней",
        disables: "сторожа над самой починкой #9 — на Linux снятая обёртка не краснит НИ ОДИН поведенческий тест",
        edits: [[
          CORPUS,
          "const TMP = realpathSync(mkdtempSync(join(tmpdir(), \"consumer-harness-\")));",
          "const TMP = mkdtempSync(join(tmpdir(), \"consumer-harness-\"));",
        ]],
      },
    ],
  }),
);
