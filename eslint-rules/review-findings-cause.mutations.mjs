/**
 * Батарея на `review/findings-cause`. Три мутации, три разных ассерта: правило должно
 * СРАБАТЫВАТЬ, должно МОЛЧАТЬ при разборе причин, и порог должен приходить опцией.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "review-findings-cause.mjs");
const HARNESS = join(HERE, "review-findings-cause.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "правило перестаёт репортить",
        harness: HARNESS,
        expect: "ожидалась одна находка",
        disables: "сам вердикт — отчёт без разбора причин проходит молча",
        edits: [[RULE, "if (hasCause || findings < minFindings) return;", "if (true) return;"]],
      },
      {
        name: "пометка «Причина:» перестаёт замечаться",
        harness: HARNESS,
        expect: "правило обязано молчать",
        disables: "освобождение — отчёт С разбором причин начинает краснеть",
        edits: [[RULE, "if (node.value.includes(causeMarker)) hasCause = true;", "void node;"]],
      },
      {
        name: "«правило от даты» перестаёт освобождать",
        harness: HARNESS,
        expect: "долг, а не находка",
        disables: "освобождение исторического корпуса — правило открывается стеной находок",
        edits: [[RULE, "if (sinceCreated && (!created || created < sinceCreated)) return;", "if (false) return;"]],
      },
      {
        name: "порог перестаёт быть опцией",
        harness: HARNESS,
        expect: "порог это данные",
        disables: "передачу порога снаружи — механизм присваивает данные себе",
        edits: [[RULE, "context.options[0] ?? {}", "{}"]],
      },
    ],
  }),
);
