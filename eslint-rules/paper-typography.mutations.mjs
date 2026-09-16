/**
 * Батарея на `paper/typography` — три мутации по трём РАЗНЫМ свойствам: сам счёт, храповик и
 * его направление.
 *
 * 🔴 Почему храповику нужны ДВЕ мутации, а не одна. У него две половины, и они противоположны:
 * объявленный долг обязан МОЛЧАТЬ (иначе легаси-статья топит новую находку и правило выключают),
 * а рост обязан ГОВОРИТЬ (иначе долг превращается в разрешение). Мутация, снимающая первую,
 * оставляет вторую зелёной и наоборот — поэтому обе и нужны, и умереть они обязаны на разных
 * ассертах.
 *
 * ⚠️ Чего батарея НЕ проверяет и почему: точность самих регулярок счёта. Их держит харнесс
 * своими фикстурами (arXiv-идентификатор не десятичная дробь, `Figure` подряд не дефект), и
 * мутация здесь доказывала бы, что фикстура существует, а не что счёт верен.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "paper-typography.mjs");
const HARNESS = join(HERE, "paper-typography.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "храповик перестаёт ПРОПУСКАТЬ объявленный долг",
        harness: HARNESS,
        expect: "known debt, unchanged, is silent",
        disables:
          "половину «долг молчит» — легаси-статья с 246 знаками § начинает краснеть на каждом " +
          "прогоне, и правило выключают за день вместе с новыми находками",
        edits: [[RULE, "if (n <= before) continue; // known debt, unchanged or paid down", "if (false) continue;"]],
      },
      {
        name: "храповик перестаёт ЛОВИТЬ рост",
        harness: HARNESS,
        expect: "growth over known debt is reported",
        disables:
          "вторую половину — ту, ради которой долг вообще объявляют: без неё запись в файле " +
          "долга становится бессрочным разрешением, а не отметкой сегодняшнего состояния",
        // 🔴 НЕ `continue;` без условия: это убивает правило целиком, и харнесс умирает на первом
        // же ассерте «срабатывает на §» — то есть находка о МУТАЦИИ, а не о защите. `before > 0`
        // оставляет правило живым там, где долга нет, и глушит РОВНО рост над объявленным долгом.
        edits: [[RULE, "if (n <= before) continue; // known debt, unchanged or paid down", "if (before > 0) continue;"]],
      },
      {
        name: "счётчик `§` перестаёт видеть макросную форму",
        harness: HARNESS,
        expect: "the section sign count includes the macro form, not only the glyph",
        disables:
          "ровно тот случай, ради которого счётчик и писался: в LaTeX знак секции набирают " +
          "`\\S\\ref{…}`, а не глифом, и проверка, считающая только глиф, отчитывается чисто " +
          "на дефекте, которым её вызвали к жизни",
        edits: [
          [
            RULE,
            "(body.match(/§/g) || []).length + (body.match(/\\\\S(?=\\s*\\\\ref|~\\\\ref|\\d)/g) || []).length",
            "(body.match(/§/g) || []).length",
          ],
        ],
      },
    ],
  }),
);
