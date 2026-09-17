/**
 * `local/temp-root-realpath` — временный корень из `tmpdir()`, не разрешённый в realpath.
 *
 * ── ДЕФЕКТ, РАДИ КОТОРОГО ПРАВИЛО НАПИСАНО (замер из issue #9) ──────────────────
 * На macOS `os.tmpdir()` отдаёт путь под `/var/folders/…`, а `/var` сам по себе симлинк
 * на `/private/var`. Node резолвит `import.meta.url` модуля в РЕАЛЬНЫЙ путь, а
 * `process.argv[1]` и любой путь, составленный тестом из корня «как набрано», остаются
 * в старом написании. Один и тот же каталог получает два имени, и всякое сравнение
 * путей начинает врать:
 *
 *     meta: "file:///private/var/folders/…/probe.mjs"
 *     argv:            "/var/folders/…/probe.mjs"
 *
 * На `ubuntu-latest` `/tmp` — настоящий каталог, два написания совпадают, и те же самые
 * ассерты проходят. Три харнесса падали на macOS на ЧИСТОМ чекауте, а CI гонял только
 * Linux, поэтому зелёный там был утверждением про Linux и ни про что больше.
 *
 * 🔴 ПОЧЕМУ ЭТО ПРАВИЛО, А НЕ ТРИ ПРАВКИ. Автор issue починил три названных им файла и
 * честно написал, что остальные не аудировал. Корень заводят ПЯТНАДЦАТЬ файлов этого
 * репозитория; каждый следующий харнесс заводит шестнадцатый. Правка чинит сегодняшний
 * список, правило чинит форму — и, главное, оно КРАСНОЕ НА LINUX, где сам дефект
 * невоспроизводим. Без него единственный сторож — мак в руках у кого-то.
 *
 * ── ПРЕДИКАТ, И ПОЧЕМУ ОН РОВНО ТАКОЙ ──────────────────────────────────────────
 * Находка: вызов `mkdtempSync`, в АРГУМЕНТАХ которого есть вызов `tmpdir()`, и который
 * сам не является единственным аргументом `realpathSync(…)`.
 *
 * ⚠️ `tmpdir()` в аргументах — несущая часть, а не украшение. Вложенный корень вида
 * `mkdtempSync(join(TMP, "repo-"))` НЕ флагается: он наследует написание от `TMP`, а
 * `TMP` ловится на своём собственном месте создания. Так «разрешить каждый временный
 * корень ОДИН раз при создании» из issue становится проверяемым посимвольно, а не
 * оценочно: правило не пытается угадать, разрешена ли переменная, — оно требует, чтобы
 * разрешалось ровно то место, где платформенный путь входит в программу.
 *
 * ⚠️ ЧЕГО ПРАВИЛО НЕ ЛОВИТ, названо вслух, чтобы его не приняли за большее. Корень,
 * собранный в обход (`const t = tmpdir(); const d = mkdtempSync(t + "/x")`), пройдёт:
 * в аргументах `mkdtempSync` вызова `tmpdir()` нет. Форма дефекта на этом корпусе ровно
 * одна — `mkdtempSync(join(tmpdir(), …))`, — а предикат пошире пришлось бы строить на
 * межпроцедурном анализе, цена которого больше пользы при пятнадцати площадках.
 *
 * 🔴 И ЧТО ПРАВИЛО НАМЕРЕННО НЕ ТРОГАЕТ: `symlinkSync`. Симлинк, созданный ТЕСТОМ внутри
 * уже разрешённого корня, — это и есть предмет проверки у трёх харнессов, и резолв корня
 * его не отменяет, а делает единственным симлинком в кадре. До правки их было два:
 * поставленный тестом и подложенный платформой, — и утверждение теста было про их сумму.
 */

/** Имя вызываемой функции: `f()` и `mod.f()` — одно и то же имя для наших целей. */
const calleeName = (node) => {
  if (node?.type !== "CallExpression") return "";
  const c = node.callee;
  if (c.type === "Identifier") return c.name;
  if (c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier")
    return c.property.name;
  return "";
};

/**
 * Есть ли в поддереве вызов `tmpdir()`. Обход по узлам, а не поиск подстроки: слово
 * `tmpdir` в комментарии или в строковом литерале рядом вызовом не является, и текстовый
 * страж был бы вынужден исключать сам себя — ровно тот класс, из-за которого проверки
 * строкой в этом репозитории запрещены.
 */
const mentionsTmpdir = (node) => {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(mentionsTmpdir);
  if (typeof node.type !== "string") return false;
  if (calleeName(node) === "tmpdir") return true;
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    if (value !== null && typeof value === "object" && mentionsTmpdir(value)) return true;
  }
  return false;
};

/** `realpathSync(x)` и `realpathSync.native(x)` — оба разрешают путь, оба засчитываются. */
const isRealpathCall = (node) => {
  if (node?.type !== "CallExpression") return false;
  const name = calleeName(node);
  if (name === "realpathSync") return true;
  // `realpathSync.native(…)`: имя вызова — `native`, а объект — сам `realpathSync`.
  if (name !== "native") return false;
  const obj = node.callee.type === "MemberExpression" ? node.callee.object : null;
  if (obj?.type === "Identifier") return obj.name === "realpathSync";
  return obj?.type === "MemberExpression" && !obj.computed && obj.property.name === "realpathSync";
};

export default {
  rules: {
    "temp-root-realpath": {
      meta: {
        type: "problem",
        docs: {
          description:
            "a temp root taken from tmpdir() is resolved to its realpath at the moment it is created",
        },
        schema: [],
        messages: {
          unresolved:
            "temp root from tmpdir() is not resolved: wrap it as `realpathSync(mkdtempSync(join(tmpdir(), …)))`. " +
            "On macOS /var is a symlink to /private/var, so Node resolves import.meta.url to the realpath " +
            "while process.argv[1] and any path this file composes keep the spelling as typed — the same " +
            "directory under two names, and every path comparison built on it silently compares the two.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (calleeName(node) !== "mkdtempSync") return;
            if (!mentionsTmpdir(node.arguments)) return;
            const parent = node.parent;
            if (isRealpathCall(parent) && parent.arguments[0] === node) return;
            context.report({ node, messageId: "unresolved" });
          },
        };
      },
    },
  },
};
