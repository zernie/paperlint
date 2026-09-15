/**
 * Батарея на `review/cold-read-cause`: четыре мутации, каждая снимает своё несущее
 * свойство — вердикт, освобождение по пометке, границу секции и дату.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "cold-read-cause.mjs");
const HARNESS = join(HERE, "cold-read-cause.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "правило перестаёт репортить",
        harness: HARNESS,
        expect: "две строки без разбора",
        disables: "сам вердикт — открытые находки без причин проходят молча",
        edits: [[RULE, "if (!inOpen) return;", "if (true) return;"]],
      },
      {
        name: "пометка «Причина:» перестаёт освобождать",
        harness: HARNESS,
        expect: "тишина",
        disables: "освобождение — строка С разбором тоже начинает краснеть",
        edits: [[RULE, "if (textOf(row).includes(causeMarker)) continue;", "void causeMarker;"]],
      },
      {
        name: "граница секции перестаёт закрываться",
        harness: HARNESS,
        expect: "не должны попадать в находки",
        disables: "выход из секции — «Закрыто» начинает требовать разбора у сделанного",
        edits: [[RULE, "if (inOpen && node.depth <= openDepth) inOpen = false;", "void openDepth;"]],
      },
      {
        name: "«правило от даты» перестаёт освобождать",
        harness: HARNESS,
        expect: "известный долг, а не находка",
        disables: "освобождение исторического корпуса",
        edits: [[RULE, "if (sinceCreated && (!created || created < sinceCreated)) return;", "if (false) return;"]],
      },
    ],
  }),
);
