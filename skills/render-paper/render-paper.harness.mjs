/**
 * render-paper — the free, deterministic tier. No model, no network.
 *
 * COLOCATED ON PURPOSE. vigiles decides coverage by PLACEMENT as of 2026-08-11:
 * a test that merely names a surface no longer counts, because that tier was
 * crediting surfaces nothing touched. So each skill needs a file inside its own
 * directory — this one.
 *
 * The assertions live in `.claude/lib/skill-checks.mjs` and are CALLED here with
 * this skill's name. They are not copied: 22 copies of the same checks is the drift that
 * module exists to avoid. (Until 2026-08-11 this was an env-var side channel into a
 * 614-line file named after no surface; it is a function call now.)
 *
 * What this proves: this skill's frontmatter parses as strict YAML, its declared
 * tool contract is sane, its pipeline wiring points at scripts that exist, and it
 * announces/records under ITS OWN identity rather than a sibling's.
 *
 * What it does NOT prove: that the skill fires, or that its guidance produces a
 * good result. Those need a real model — see `render-paper.eval.mjs`.
 */
import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkSkill } from "../../lib/skill-checks.mjs";
import { papersRoot } from "../../eslint-rules/papers.mjs";
import { consumerPkg, consumerRoot } from "../paper-pipeline/scripts/consumer.mjs";

await checkSkill("render-paper");

// LOCAL assert, deliberately not pushed into the shared module: this fact is about THIS
// skill's installer, and 21 other skills have no installer to make it true or false.
//
// Why it exists at all — both packages fail INVISIBLY, in opposite directions, and both were
// measured on a real camera-ready build 2026-08-24:
//   texlive-fonts-extra missing   -> acmart warns and silently uses Computer Modern. The PDF
//                                    compiles clean and is typeset in the wrong fonts.
//   texlive-plain-generic missing -> newtx cannot find binhex.tex: hard emergency stop. So
//                                    adding ONLY the first package breaks a working build.
// A list nobody reads back drifts; deleting either line now fails here.
const toolchain = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "ensure-toolchain.sh"),
  "utf8",
);
for (const pkg of ["texlive-fonts-extra", "texlive-plain-generic"]) {
  assert.match(
    toolchain,
    new RegExp(`^\\s*${pkg}\\b`, "m"),
    `ensure-toolchain.sh must install ${pkg} — see the comment above this assert`,
  );
}

// ── TEXINPUTS: КУДА СКРИПТЫ ИЩУТ `paper-guards.tex` ──────────────────────────
//
// Почему это стережётся тестом, а не вычиткой. Страж ссылок подключается строкой
// `\input{paper-guards}` БЕЗ пути — файл ищется по `TEXINPUTS`, и выставляет её вызывающий.
// Не найденный `\input` НЕ роняет pdflatex: он пишет строчку в лог и продолжает, то есть PDF
// собирается ЗЕЛЁНЫМ и просто больше не проверяет висячие `\ref`/`\cite`. Значит промах в этой
// проводке неотличим от успеха ровно до того дня, когда в отправленной статье найдут `??`.
//
// Проверяется РЕЗОЛВ, а не сборка: ради этого у `check-render.sh` есть режим `--print-venues`,
// который печатает выбранный каталог и ничего не компилирует.
//
// Чего эти ассерты НЕ доказывают: что найденный файл корректен, что pdflatex его прочитал и
// что страж сработал. Это ловит `paper-guards.tex` сам (он падает `\PackageError`), а здесь —
// только «каталог найден и найден в правильном порядке».
{
  const HERE = dirname(fileURLToPath(import.meta.url));
  const CHECK = join(HERE, "check-render.sh");
  const run = (args, opts = {}) =>
    spawnSync("bash", [CHECK, ...args], { encoding: "utf8", ...opts });

  // Половина первая — на СЕГОДНЯШНЕМ дереве резолв обязан удаться, ЕСЛИ ЕСТЬ ЧЕМУ
  // резолвиться.
  //
  // 🔴 ЗДЕСЬ БЫЛ БЕЗУСЛОВНЫЙ `assert.equal(status, 0)`, И ПЕРЕЕЗД ЕГО УРОНИЛ — по делу, а не
  // случайно. Он опирался на ОКРУЖАЮЩЕЕ дерево: пока скилл лежал у потребителя, побеждала
  // вторая ступень лестницы (`.claude/skills/submit-paper/references/venues/`). В чекауте
  // пакета нет ни её, ни первой — `venues/` приезжает вместе с `submit-paper`, а он ещё не
  // перенесён. То есть ассерт проверял не резолв, а наличие чужого каталога рядом.
  //
  // Форма теперь такая: резолв обязан удаться ТОГДА И ТОЛЬКО ТОГДА, когда на диске есть хотя
  // бы один кандидат. Это по-прежнему настоящий ассерт — он падает, если кандидат есть, а
  // скрипт его не нашёл, — но перестаёт требовать наличия того, чего в этом репозитории пока
  // нет. Отсутствие обоих кандидатов ПЕЧАТАЕТСЯ, а не проглатывается: «проверка не нашла, что
  // проверять» и «проверка прошла» обязаны выглядеть по-разному.
  const candidates = [
    // ступень 1 — пакет
    join(HERE, "..", "..", "venues", "paper-guards.tex"),
    // ступень 2 — каталог скилла у потребителя
    join(HERE, "..", "submit-paper", "references", "venues", "paper-guards.tex"),
  ].filter((c) => existsSync(c));

  const ok = run(["--print-venues"]);
  if (candidates.length === 0) {
    assert.notEqual(
      ok.status,
      0,
      `на диске нет НИ ОДНОГО paper-guards.tex, но --print-venues вернул 0 и напечатал ` +
        `${JSON.stringify(ok.stdout.trim())}. Резолв, удающийся из ничего, — это тот самый ` +
        `тихий успех, ради которого весь этот блок и написан.`,
    );
    console.log(
      `  --print-venues: НЕ ПРОВЕРЕН на живом дереве — paper-guards.tex отсутствует и в пакете ` +
        `(venues/), и рядом (submit-paper/references/venues/). Он приезжает с \`submit-paper\`; ` +
        `до тех пор эту половину держат только фикстуры ниже.`,
    );
  } else {
    assert.equal(
      ok.status,
      0,
      `кандидат на диске есть (${candidates[0]}), значит --print-venues обязан резолвиться:\n${ok.stderr}`,
    );
    assert.ok(
      existsSync(join(ok.stdout.trim(), "paper-guards.tex")),
      `--print-venues напечатал ${ok.stdout.trim()}, но paper-guards.tex там нет`,
    );
  }

  // Половина первая-бис — РЕЗОЛВ НЕ ЗАВИСИТ ОТ ТЕКУЩЕГО КАТАЛОГА, и этот случай написан по
  // настоящей регрессии 12.09, а не придуман. Сам `check-render.sh` делает `cd` в каталог статьи
  // ДО того, как ищет venues, а `gates.harness.mjs` зовёт его на временной фикстуре с урезанным
  // окружением. Значит `git rev-parse --show-toplevel` выполняется во временном каталоге, а
  // `CLAUDE_PROJECT_DIR` не выставлен — и лестница не находила ничего, останавливая сборку на
  // тесте, который накануне проходил. Якорем стал каталог САМОГО СКРИПТА: он не зависит ни от
  // cwd, ни от того, лежит ли вызывающий внутри git-дерева.
  //
  // ⚠️ Как и половина первая, этот случай требует, чтобы на диске БЫЛ хотя бы один
  // `paper-guards.tex`: он проверяет, что резолв не зависит от cwd, а не что файл существует.
  // Без кандидата проверять нечего, и это печатается, а не проглатывается.
  if (candidates.length > 0) {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "venues-cwd-")));
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    const r = run(["--print-venues"], { cwd: outside, env });
    assert.equal(
      r.status,
      0,
      `резолв обязан работать вне git-дерева и без CLAUDE_PROJECT_DIR:\n${r.stderr}`,
    );
    assert.ok(
      existsSync(join(r.stdout.trim(), "paper-guards.tex")),
      `вне репозитория напечатан ${r.stdout.trim()}, но paper-guards.tex там нет`,
    );
  } else {
    console.log(
      `  --print-venues (вне git-дерева): НЕ ПРОВЕРЕН — кандидата на диске нет, см. выше.`,
    );
  }

  // Половина вторая — и она несущая, потому что тихий отказ живёт именно тут. Когда файла
  // нет НИГДЕ, скрипт обязан выйти с кодом 2 и сказать почему. Молчаливый успех здесь и есть
  // тот дефект, ради которого написана вся лестница.
  //
  // 🔴 ГОНЯЕТСЯ НА КОПИИ СКРИПТА, И ЭТО НЕ ОБХОД ТЕСТА, А СЛЕДСТВИЕ ПЕРЕЕЗДА (12.09, волна ③).
  // До переноса `submit-paper` «нигде» воспроизводилось пустым корнем потребителя: обе прежние
  // ступени смотрели наружу (имя пакета из cwd · `.claude/` под корнем), и в пустом каталоге не
  // находили ничего. Теперь у скрипта есть ступень, привязанная к каталогу ЕГО САМОГО
  // (`$SELF_DIR/../submit-paper/references/venues`) — она и добавлена ради cwd-независимости, —
  // поэтому, пока скрипт лежит в пакете, venues рядом с ним есть ВСЕГДА, и «нигде» через
  // окружение больше недостижимо. Единственный честный способ предъявить это состояние —
  // вынести сам скрипт из пакета. Проверяемое свойство при этом то же самое, слово в слово:
  // ничего не разрешилось ⇒ exit 2 + имя недостающего файла. ⚠️ Что эта форма больше НЕ
  // проверяет: что пустой корень потребителя не заставит скрипт врать, — и не должна, потому
  // что такой корень теперь законно перекрывается копией в пакете.
  const empty = realpathSync(mkdtempSync(join(tmpdir(), "venues-none-")));
  const lonely = join(empty, "check-render.sh");
  copyFileSync(CHECK, lonely);
  const none = spawnSync("bash", [lonely, "--print-venues"], {
    encoding: "utf8",
    cwd: empty, // вне git-дерева ⇒ пакет не резолвится
    env: { ...process.env, CLAUDE_PROJECT_DIR: empty },
  });
  assert.equal(none.status, 2, "нет venues нигде ⇒ exit 2, а не тихий успех");
  assert.match(
    none.stderr,
    /paper-guards\.tex/,
    "сообщение об отказе обязано называть недостающий файл",
  );

  // Половина третья — ПОРЯДОК ступеней. Он не косметика: в день переезда обе ступени будут
  // истинны одновременно, и победить обязан пакет, иначе потребитель молча продолжит собирать
  // со своей старой копией. Подкладываем ОБА кандидата и смотрим, какой выбран.
  const both = realpathSync(mkdtempSync(join(tmpdir(), "venues-both-")));
  const pkgVenues = join(
    both,
    "node_modules",
    "research-paper-pipeline",
    "venues",
  );
  const skillVenues = join(
    both,
    ".claude",
    "skills",
    "submit-paper",
    "references",
    "venues",
  );
  for (const d of [pkgVenues, skillVenues]) mkdirSync(d, { recursive: true });
  writeFileSync(
    join(both, "node_modules", "research-paper-pipeline", "package.json"),
    JSON.stringify({
      name: "research-paper-pipeline",
      version: "0.0.0",
      exports: { "./venues/*": "./venues/*" },
    }),
  );
  writeFileSync(join(pkgVenues, "paper-guards.tex"), "% from package\n");
  writeFileSync(join(skillVenues, "paper-guards.tex"), "% from skill dir\n");
  const race = run(["--print-venues"], {
    cwd: both,
    env: { ...process.env, CLAUDE_PROJECT_DIR: both },
  });
  assert.equal(
    race.status,
    0,
    `оба кандидата на месте ⇒ резолв обязан удаться:\n${race.stderr}`,
  );
  assert.equal(
    race.stdout.trim(),
    pkgVenues,
    "при обоих кандидатах побеждает ПАКЕТ, а не каталог скилла",
  );
}

// ── ТА ЖЕ ЛЕСТНИЦА В build.sh СТАТЬИ, И ПОЧЕМУ АССЕРТ ДРУГОЙ ─────────────────
//
// Скрипт сборки статьи до 12.09.2026 держал ХАРДКОД
// `export TEXINPUTS="$ROOT/.claude/skills/submit-paper/references/venues:"` — адрес внутрь
// каталога скиллов, который после их переноса в пакет указывает в пустоту, и снова ТИХО:
// у LaTeX реакция на пропавший \input — молчание, а не ошибка.
//
// Здесь нельзя повторить приём с `--print-venues`: у build.sh нет режима, который печатает
// решение, не запуская pdflatex, а заводить его ради теста — это менять форму скрипта статьи
// под тест. Поэтому ассерт СТРУКТУРНЫЙ, и он намеренно якорится на ИСПОЛНЯЕМУЮ строку, а не
// на подстроку где угодно: файл цитирует старый путь в комментарии, объясняющем правку,
// и поиск «нет ли тут этой строки» поймал бы объяснение вместо дефекта.
//
// 🔴 ПРЕДМЕТ ПРОВЕРКИ — ЧУЖОЙ ФАЙЛ, И ОТСЮДА ВСЯ ЕЁ ФОРМА. До переноса в пакет этот блок
// читал ОДИН захардкоженный путь в приватный корпус первого потребителя. В пакете такого
// пути нет и быть не может, поэтому свойство вынесено в чистую функцию и доказывается
// ДВАЖДЫ, по правилу «обе половины»:
//
//   1. на ФИКСТУРАХ — `build-clean.sh` обязан пройти, `build-defect.sh` обязан упасть. Это
//      единственная половина, которая работает в чекауте самого пакета, где статей нет
//      вовсе. Без неё проверка в пакете была бы вакуумной и печатала бы зелёный ноль;
//   2. на НАСТОЯЩИХ статьях потребителя — через носитель `papers`, а не через путь в коде.
//      Потребителей может быть много, каталог называется у каждого по-своему, и ровно для
//      этого носитель существует.
//
// Счётчик ниже печатается ВСЕГДА и растёт вместе с вердиктом, а не до него: «0 скриптов
// потребителя» — честный вывод (в чекауте пакета он и должен быть нулём), а вот «0», выданное
// молча, было бы неотличимо от проверенного корпуса.
{
  const HERE = dirname(fileURLToPath(import.meta.url));

  /** Свойство сборочного скрипта статьи. Чистая функция — чтобы её можно было и УРОНИТЬ. */
  const assertLadder = (build, where) => {
    assert.doesNotMatch(
      build,
      /^\s*export\s+TEXINPUTS="\$ROOT\/\.claude\//m,
      `${where}: снова присваивает TEXINPUTS захардкоженный путь в каталог скиллов`,
    );
    assert.match(
      build,
      /^\s*export\s+TEXINPUTS="\$VENUES_DIR:"/m,
      `${where}: обязан выставлять TEXINPUTS из резолвнутого VENUES_DIR`,
    );
    assert.match(
      build,
      /require\.resolve\("research-paper-pipeline\/venues\/paper-guards\.tex"\)/,
      `${where}: первая ступень лестницы (пакет) должна остаться`,
    );
    assert.match(
      build,
      /^\s*kpsewhich paper-guards\.tex/m,
      `${where}: после выставления TEXINPUTS обязан УБЕДИТЬСЯ, что LaTeX видит файл`,
    );
  };

  // ── Половина первая: фикстуры. Обе стороны, иначе «молчит» неотличимо от «мертва».
  const fx = join(HERE, "..", "..", "fixtures", "render-paper");
  assertLadder(readFileSync(join(fx, "build-clean.sh"), "utf8"), "fixture build-clean.sh");
  assert.throws(
    () => assertLadder(readFileSync(join(fx, "build-defect.sh"), "utf8"), "fixture build-defect.sh"),
    /TEXINPUTS/,
    "фикстура с дефектом обязана уронить проверку — иначе проверка ничего не проверяет",
  );

  // ── Половина вторая: настоящие статьи потребителя, адрес — из носителя `papers`.
  // `papersRoot()` БРОСАЕТ, когда каталога нет; в чекауте самого пакета его и нет, и это
  // не ошибка, а отсутствие потребителя. Ловим ровно этот случай и говорим о нём вслух.
  const root = (() => {
    try {
      return papersRoot(consumerPkg(), consumerRoot());
    } catch {
      return null;
    }
  })();

  let checked = 0;
  if (root) {
    const base = join(consumerRoot(), root);
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const script = join(base, entry.name, "build.sh");
      if (!existsSync(script)) continue;
      // Счёт растёт ВМЕСТЕ с вердиктом, а не перед ним.
      assertLadder(readFileSync(script, "utf8"), `${root}/${entry.name}/build.sh`);
      checked += 1;
    }
  }

  console.log(
    `  build.sh ladder: 2 fixture(s) + ${checked} consumer script(s)` +
      (root === null ? " (no papers root on disk — package checkout)" : ` under ${root}/`),
  );
}
