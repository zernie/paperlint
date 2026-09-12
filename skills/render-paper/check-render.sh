#!/usr/bin/env bash
# check-render.sh — mechanical render-quality gate for a LaTeX paper.
#
# WHY: eyeballing page 1-2 misses layout defects on later pages. LaTeX already
# reports them in the .log ("Overfull \hbox (12.3pt too wide) at lines X--Y").
# This compiles the paper and FAILS on visible layout defects, so "renders fine"
# is a checked fact, not a hope. Spirit: prose isn't policy — compile the check.
#
# Usage:   check-render.sh <paper-dir> [texbasename=paper] [threshold_pt=5]
#   NO_COMPILE=1 check-render.sh <dir> ...   # parse an existing .log, don't recompile
#
# Exit: 0 = clean; 1 = layout/ref defects found; 2 = usage/compile/log error.
# Threshold: hbox overfulls >= threshold_pt are "visible → must fix"; smaller ones
# are counted but not fatal (sub-point overfulls are usually invisible).

set -uo pipefail

# ── ГДЕ ЛЕЖИТ `paper-guards.tex` И ЧТО БУДЕТ, ЕСЛИ ЕГО НЕ НАЙТИ ───────────────
# Статьи подключают стража ссылок одной строкой `\input{paper-guards}`. Путь в ней НЕ
# указан — LaTeX ищет файл по `TEXINPUTS`, и выставить эту переменную обязан вызывающий.
#
# 🔴 РЕЖИМ ОТКАЗА ЗДЕСЬ ТИХИЙ, И РАДИ ЭТОГО ВСЯ ФУНКЦИЯ. Не найденный `\input` НЕ роняет
# сборку: LaTeX пишет `File \`paper-guards.tex' not found` в лог и продолжает. PDF выходит,
# выглядит нормально, и просто больше не содержит проверки висячих ссылок — то есть дефект,
# ради которого страж заведён, возвращается вместе с зелёным отчётом. Сломанный `import` в
# JS падает громко; здесь надо падать самим.
#
# Лестница из ТРЁХ кандидатов, потому что каталог ПЕРЕЕХАЛ (12.09): `venues/` теперь везёт пакет
# `research-paper-pipeline`, а у потребителя на прежнем месте стоит симлинк в него. Порядок
# «объявленный пакет → сосед по пакету → каталог у потребителя» намеренный: пакет должен
# побеждать молча. Громко становится только если НЕТ НИ ОДНОГО.
# 🔴 КАТАЛОГ САМОГО СКРИПТА — АБСОЛЮТНЫМ И ДО ЛЮБОГО `cd` (12.09.2026, вечер).
# Найдено КРАСНЫМ ХАРНЕССОМ `gates.harness.mjs`, а не вычиткой, и это моя же регрессия того же
# дня: ниже скрипт делает `cd "$DIR"` в каталог статьи, а резолв venues стоит ПОСЛЕ этого `cd`.
# Значит `git rev-parse --show-toplevel` выполнялся уже во временном каталоге фикстуры, корень не
# находился, и сборка честно останавливалась — на тесте, который до этого проходил.
#
# ⚠️ Прежняя версия ошибалась ТАК ЖЕ, но молча: она не проверяла результат и собирала PDF без
# стража ссылок. То есть покраснение — это не новая поломка, а проявление старой; но тест,
# который вчера был зелёным, а сегодня красный, чинить всё равно мне.
#
# Соседний `build.sh` этот же урок уже носит в комментарии («Каталог скрипта берётся ОДИН раз и
# АБСОЛЮТНЫМ, до cd») — там на нём падал CI 30.08. Второй экземпляр того же класса в файле рядом.
SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

resolve_venues() {
  local root pkg
  # Три источника корня, от самого явного к самому надёжному. Последний — расположение СКРИПТА
  # (`.claude/skills/render-paper/` ⇒ три уровня вверх), и он единственный не зависит ни от
  # текущего каталога, ни от того, лежит ли вызывающий внутри git-дерева.
  # ⚠️ СКОБКИ ОБЯЗАТЕЛЬНЫ, и это поймал харнесс через минуту после того, как я написал строку без
  # них. В bash `A || B && C` разбирается как `(A || B) && C`, поэтому при УСПЕШНОМ `git rev-parse`
  # выполнялся ещё и `pwd`, и подстановка возвращала ДВЕ строки — корень репозитория плюс текущий
  # каталог. Вручную из каталога вне git это не воспроизводилось: там git падал, и ветка была одна.
  # ⚠️ ПОСЛЕДНЯЯ СТУПЕНЬ ИЩЕТ, А НЕ СЧИТАЕТ УРОВНИ. Здесь стояло `cd "$SELF_DIR/../../.."` —
  # верно для `.claude/skills/render-paper/` (три уровня до корня) и молча неверно после
  # переезда скилла в пакет, где он лежит в `skills/render-paper/` (два): подъём промахивался
  # ВЫШЕ репозитория, и рунг 2 искал venues в чужом каталоге. Подъём до каталога с `.claude`
  # от глубины не зависит.
  local probe="$SELF_DIR" fallback=""
  while [ "$probe" != "/" ]; do
    if [ -d "$probe/.claude" ]; then fallback="$probe"; break; fi
    probe=$(dirname "$probe")
  done
  root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$fallback")}"

  # 1) пакет, если он уже везёт venues/ (после шага 5)
  pkg=$(node -e 'try{process.stdout.write(require.resolve("research-paper-pipeline/venues/paper-guards.tex"))}catch{}' 2>/dev/null || true)
  if [ -n "$pkg" ] && [ -f "$pkg" ]; then
    dirname "$pkg"
    return 0
  fi

  # 2) СОСЕДНИЙ СКИЛЛ, от каталога ЭТОГО скрипта. Заведена 12.09 вместе с переносом
  # `submit-paper` в пакет, и она единственная из трёх работает В ОБОИХ мирах разом:
  #   • чекаут пакета      `skills/render-paper/..` → `skills/submit-paper/references/venues`
  #   • потребитель        `.claude/skills/render-paper/..` → `.claude/skills/submit-paper/...`
  #     (оба каталога — симлинки в пакет, `-f` их проходит, а `cd`+`pwd` оставляет логический путь)
  # Рунг 1 зависит от cwd (`node -e` резолвит от текущего каталога), рунг 3 — от того, что корень
  # потребителя вообще нашёлся. Этот не зависит ни от того, ни от другого — ровно тот якорь, из-за
  # отсутствия которого 12.09 уже краснел `gates.harness.mjs`.
  local sibling="$SELF_DIR/../submit-paper/references/venues"
  if [ -f "$sibling/paper-guards.tex" ]; then
    (cd "$sibling" && pwd)
    return 0
  fi

  # 3) каталог скилла в потребителе — для потребителя, который смонтировал скиллы иначе
  local local_dir="$root/.claude/skills/submit-paper/references/venues"
  if [ -f "$local_dir/paper-guards.tex" ]; then
    printf '%s\n' "$local_dir"
    return 0
  fi

  return 1
}

# Отдельный режим, чтобы резолв можно было ПРОВЕРИТЬ, а не только выполнить: без него
# единственный способ узнать, куда смотрит скрипт, — собрать статью целиком.
if [ "${1:-}" = "--print-venues" ]; then
  if VD=$(resolve_venues); then
    printf '%s\n' "$VD"
    exit 0
  fi
  echo "✗ paper-guards.tex не найден: ни по имени пакета research-paper-pipeline, ни рядом со скриптом" >&2
  echo "  (skills/submit-paper/references/venues), ни у потребителя (.claude/skills/submit-paper/references/venues)." >&2
  echo "  Собирать статью без него нельзя: \\input{paper-guards} не упадёт, а молча исчезнет," >&2
  echo "  и PDF соберётся БЕЗ проверки висячих \\ref и \\cite." >&2
  exit 2
fi

DIR="${1:?usage: check-render.sh <paper-dir> [texbasename=paper] [threshold_pt=5]}"
BASE="${2:-paper}"
THRESH="${3:-5}"

cd "$DIR" || { echo "FAIL: cannot cd $DIR"; exit 2; }
LOG="$BASE.log"

# 🔴 УСЛОВИЕ `-f "$BASE.tex"` ДОБАВЛЕНО 26.08 — без него ветка «нет лога → exit 2» стала
# НЕДОСТИЖИМОЙ, и это моя же регрессия того же дня. Финальный проход зовётся как
# `pdflatex -jobname="$BASE" '\input{...}'`, и такая форма создаёт `$BASE.log` ДАЖЕ когда
# исходника нет: скрипт находил лог, доходил до общего `exit 1` и рапортовал «FAIL: почини
# находки» вместо честного «нет лога, сборку не гоняли».
#
# Замер, изолирующий причину (каталог без `paper.tex`):
#   версия до 22642552 → exit 2, на диске только texput.log
#   версия после       → exit 1, на диске paper.log И texput.log
# Разница ровно в `paper.log`, который пишет мой третий проход.
if [ "${NO_COMPILE:-0}" != "1" ] && [ -f "$BASE.tex" ]; then
  # Two passes: overfull boxes surface on every pass; a second pass settles refs
  # so Reference/Citation-undefined warnings are accurate.
  # 🔴 TEXINPUTS обязателен, и это найдено падением 26.08. Статьи подключают числа своей площадки
  # через `\input{<venue>}`, а файл лежит в `.claude/skills/submit-paper/references/venues/`.
  # Без этого пути сборка падает `File \`agenticdev.tex' not found` — а `|| true` ниже её глотает,
  # после чего скрипт читает лог НЕИЗВЕСТНОГО происхождения и рапортует по нему. То есть
  # компиляция этой статьи здесь молча не работала, и заметно это стало только когда появился
  # проход БЕЗ `|| true`.
  if ! VENUES_DIR=$(resolve_venues); then
    echo "✗ paper-guards.tex не найден — сборка остановлена ДО pdflatex." >&2
    echo "  Иначе \\input{paper-guards} молча исчезнет и PDF выйдет без проверки ссылок." >&2
    exit 2
  fi
  export TEXINPUTS="${VENUES_DIR}:${TEXINPUTS:-}"
  # Вторая половина: спросить у самого TeX, видит ли он файл по этому пути. `resolve_venues`
  # проверил наличие файла на диске; `kpsewhich` проверяет, что он виден ИМЕННО ТАК, как его
  # будет искать `\input` — то есть с учётом TEXINPUTS, кэша ls-R и прав.
  if ! kpsewhich paper-guards.tex >/dev/null 2>&1; then
    echo "✗ каталог найден ($VENUES_DIR), но kpsewhich не видит paper-guards.tex — TEXINPUTS не сработал." >&2
    exit 2
  fi
  pdflatex -interaction=nonstopmode "$BASE.tex" >/dev/null 2>&1 || true
  pdflatex -interaction=nonstopmode "$BASE.tex" >/dev/null 2>&1 || true
  # 🔴 ФИНАЛЬНЫЙ проход с `\finalpass` — им активируются стражи преамбулы, которым нужен
  # СОШЕДШИЙСЯ `.aux`. Сегодня это «нет висячих ссылок и цитат»: LaTeX этот факт уже знает,
  # и спросить его строго сильнее, чем читать потом его дневник грепом (см. блок про
  # undefined ниже — он остаётся как страховка для статей без стража в преамбуле).
  #
  # Почему отдельным проходом, а не флагом на всех трёх: на первом проходе `.aux` пуст, все
  # ссылки не определены ПО ПОСТРОЕНИЮ. Замер 26.08 с безусловной формой: проход 1 падает →
  # `.aux` не дописан → проход 2 падает на том же → цикл НЕ СХОДИТСЯ никогда.
  #
  # `|| true` тут НЕТ намеренно: если страж сработал, это находка, а не шум.
  pdflatex -interaction=nonstopmode -jobname="$BASE" '\def\finalpass{}\input{'"$BASE"'}' >/dev/null 2>&1
fi

[ -f "$LOG" ] || { echo "FAIL: no $DIR/$LOG (compile failed — run render-paper toolchain first)"; exit 2; }

fail=0
big=0
small=0

echo "== check-render: $DIR/$BASE (threshold ${THRESH}pt) =="

# --- Overfull \hbox (text/tables bleeding past the column/margin) ---
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pt=""
  if [[ $line =~ \(([0-9]+\.?[0-9]*)pt\ too\ wide\) ]]; then
    pt="${BASH_REMATCH[1]}"
  fi
  if [ -n "$pt" ] && awk -v a="$pt" -v b="$THRESH" 'BEGIN{exit !(a>=b)}'; then
    echo "  OVERFULL hbox  ${pt}pt  ${line#*) }"
    big=$((big+1))
  else
    small=$((small+1))
  fi
done < <(grep -F 'Overfull \hbox' "$LOG" || true)

# --- Overfull \vbox (content past the bottom of the text block) ---
# Apply the same pt threshold as hbox: a sub-threshold vbox (< a few pt) is an
# invisible fraction of a line, not a visible defect.
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pt=""
  if [[ $line =~ \(([0-9]+\.?[0-9]*)pt\ too\ high\) ]]; then
    pt="${BASH_REMATCH[1]}"
  fi
  if [ -z "$pt" ] || awk -v a="$pt" -v b="$THRESH" 'BEGIN{exit !(a>=b)}'; then
    echo "  OVERFULL vbox   ${line}"
    big=$((big+1))
  else
    small=$((small+1))
  fi
done < <(grep -F 'Overfull \vbox' "$LOG" || true)

# --- Reference / citation / control-sequence problems ---
undef=$(grep -icE "Undefined control sequence|Citation .* undefined|Reference .* undefined|LaTeX Warning: There were undefined references" "$LOG" || true)
fatal=$(grep -icE "^!|Fatal error|Emergency stop" "$LOG" || true)

# --- BibTeX's OWN log (.blg) — a SECOND log nobody was reading ---
# 🔴 ADDED 2026-08-24, same evening as the class-warning check, after the same shape of failure
# bit twice. BibTeX does not abort the build: on a malformed entry it prints
#   "You're missing a field name---line N of file refs.bib"
#   "I'm skipping whatever remains of this entry"
# and CARRIES ON. pdflatex then produces a perfectly clean PDF with those references SILENTLY
# ABSENT from the bibliography. Measured: two entries vanished and the LaTeX log stayed at
# undefined=0, because the stale .aux still resolved the keys from the previous run.
# The trigger that day: a `%` comment placed INSIDE a @inproceedings entry. `%` is a LaTeX
# comment, NOT a BibTeX one — inside an entry it is a parse error that eats the whole record.
blgerr=0
BLG="$BASE.blg"
if [ -f "$BLG" ]; then
  blgerr=$(grep -cE "I'm skipping whatever remains|Error may have been|repeated entry|I couldn't open" "$BLG" || true)
  if [ "$blgerr" -gt 0 ]; then
    echo "  BIBTEX errors ($blgerr) — entries are DROPPED from the bibliography, build stays green:"
    grep -E "^(You're|I'm skipping|Repeated entry|I couldn't open)" "$BLG" | sed 's/^/      /' | head -12
  fi
  # A cited key that never made it into the .bbl is the same failure seen from the other side.
  if [ -f "$BASE.aux" ] && [ -f "$BASE.bbl" ]; then
    missing=0
    while read -r key; do
      [ -z "$key" ] && continue
      grep -qF "{$key}" "$BASE.bbl" || { echo "      cited but NOT in the bibliography: $key"; missing=$((missing+1)); }
    done < <(grep -oE '\\citation\{[^}]*\}' "$BASE.aux" | sed 's/.*{//;s/}//' | tr ',' '\n' | sort -u)
    [ "$missing" -gt 0 ] && { echo "  CITED-BUT-ABSENT references: $missing"; blgerr=$((blgerr+missing)); }
  fi
fi

# --- Which PUBLISHER is this paper? The gate was publisher-blind until 2026-08-24 ---
# Measured that day: this repo holds THREE shapes — acmart (agenticdev, aisec), ACL's acl.sty
# (compile-rules, built via repro/build-submission.sh), and a bare `article` (scored). The
# checks above are publisher-independent and stay that way. What is NOT publisher-independent
# is which EXTERNAL checker exists, and naming it is the whole point: the author-side tool for
# an ACL paper (aclpubcheck) is not the one for an ACM paper, and for ACM there is no offline
# community checker at all — the publisher checks server-side. Saying so here stops the next
# person re-deriving it, and stops them running the ACL checker on an ACM paper.
publisher="unknown"
if [ -f "$BASE.tex" ]; then
  if grep -qE '^[^%]*\\documentclass[^{]*\{acmart\}' "$BASE.tex"; then publisher="ACM"
  elif grep -qE '^[^%]*\\usepackage\{acl\}|acl_natbib' "$BASE.tex"; then publisher="ACL"
  elif grep -qE '^[^%]*\\documentclass[^{]*\{IEEEtran\}' "$BASE.tex"; then publisher="IEEE"
  fi
fi
echo "  publisher: $publisher"
case "$publisher" in
  ACM)
    # No offline community checker exists for ACM by design — HotCRP's format checker and ACM
    # TAPS validate on upload. The author-side mechanism IS acmart's own warnings, checked below.
    ;;
  ACL)
    echo "  NOTE: ACL paper — the official author-side checker is aclpubcheck, and it is NOT run here."
    echo "        Run it on the CAMERA-READY build (a line-numbered review PDF yields thousands of"
    echo "        spurious margin errors — measured 2026-08-24: 2192 errors, ALL of category Margin):"
    echo "          python3 -m venv env && env/bin/pip install 'setuptools<60' wheel"
    echo "          env/bin/pip install 'aclpubcheck @ git+https://github.com/acl-org/aclpubcheck'"
    echo "          env/bin/aclpubcheck --paper_type long <camera-ready.pdf>"
    echo "        (the setuptools pin is load-bearing: this container's setuptools breaks every"
    echo "         legacy setup.py package with 'AttributeError: install_layout')"
    ;;
  IEEE)
    echo "  NOTE: IEEE paper — validate with IEEE PDF eXpress / LaTeX Analyzer before upload."
    ;;
esac

# --- The document CLASS's own warnings (acmart / IEEEtran / llncs) ---
# 🔴 ADDED 2026-08-24 after three camera-ready blockers shipped past this gate in one
# evening — every one of them ANNOUNCED IN THIS LOG, none of them read:
#   "You do not have the libertine package installed"  -> acmart does NOT fail; it falls
#       back to Computer Modern, so the PDF compiles clean and is set in the WRONG FONTS.
#   "A possible image without description"             -> ACM requires alt text on figures.
#   "CCS concepts are mandatory for papers over two pages" -> a hard venue requirement.
# None of these is an Overfull, an undefined ref, or a fatal error, so the gate passed all
# three. The class is the venue's own voice about venue compliance; not reading it was the
# whole defect. Blocking, not advisory: each of the three would have been shipped.
# 🔴 STAGE-AWARENESS, added 2026-08-24 after running this gate on the HELD-OUT submitted
# version (commit eac95937). It fired 4 warnings there and TWO were false: at submission time
# `printacmref=false` and a missing CCS block are DELIBERATE and correct — the venue requires
# neither until camera-ready. A gate that cries on a legitimate submission build gets muted,
# so camera-ready-only requirements are suppressed while the document is still in review mode.
# Detection is self-contained (the document says what it is), not a flag someone must remember.
review_mode=0
if [ -f "$BASE.tex" ]; then
  grep -qE '^[^%]*\\documentclass\[[^]]*\breview\b' "$BASE.tex" && review_mode=1
  grep -qE '^[^%]*printacmref=false' "$BASE.tex" && review_mode=1
fi
CAMERA_ONLY='ACM reference format is mandatory|CCS concepts are mandatory'
CLASS_RE="^(Class|Package) (acmart|IEEEtran|llncs|refcheck) Warning"

# 🔴 СОВЕТУЮЩИЕ предупреждения класса: печатаются, но НЕ блокируют (2026-09-02).
#
# Тот же довод, что абзацем выше про CAMERA_ONLY, только с другой стороны: гейт, который
# валит статью за то, на что автор повлиять не может, глушат целиком — вместе с настоящими
# находками. Замер, из-за которого список появился, — первый же прогон починенного
# render-gate по корпусу:
#
#   agenticdev-2026   1 предупреждение, `\vspace`. В paper.tex его НЕТ, в .sty статьи НЕТ —
#                     порождает пакет. Издатель принял этот PDF со второй подачи с НУЛЁМ
#                     находок, то есть его собственная проверка возражений не имела.
#   aisec-2026        3, из них ДВА про отсутствие описаний у изображений — вот это
#                     требование ACM, чинится автором, и остаётся блокирующим.
#
# То есть в одном ведре лежали находка, которую надо чинить, и шум, который чинить нечем.
# Разделение — не ослабление: `\vspace` по-прежнему виден в выводе отдельной строкой.
#
# ⚠️ Список держать УЗКИМ и пополнять только по замеру: каждая строка здесь — это класс
# находок, который перестал ронять сборку. Расширение «на всякий случай» превращает гейт
# обратно в печать.
CLASS_ADVISORY='\\vspace should only be used'
if [ "$review_mode" = 1 ]; then
  echo "  stage: SUBMISSION (review mode) — camera-ready-only requirements not gated"
  class_hits=$(grep -E "$CLASS_RE" "$LOG" | grep -vE "$CAMERA_ONLY" || true)
else
  echo "  stage: CAMERA-READY"
  class_hits=$(grep -E "$CLASS_RE" "$LOG" || true)
fi
# Одна выборка, два ведра: блокирующее и советующее. Считать их одним числом и было дефектом.
class_block=$(printf '%s\n' "$class_hits" | grep -vE '^$' | grep -vE "$CLASS_ADVISORY" || true)
class_advis=$(printf '%s\n' "$class_hits" | grep -vE '^$' | grep -E "$CLASS_ADVISORY" || true)
classwarn=$(printf '%s\n' "$class_block" | grep -cE '^.' || true)
classadv=$(printf '%s\n' "$class_advis" | grep -cE '^.' || true)
if [ "$classwarn" -gt 0 ]; then
  echo "  DOCUMENT-CLASS warnings ($classwarn) — venue compliance, not cosmetics:"
  printf '%s\n' "$class_block" | sed 's/^/      /' | head -20
fi
if [ "$classadv" -gt 0 ]; then
  echo "  document-class advisory ($classadv) — printed, NOT gated (see CLASS_ADVISORY):"
  printf '%s\n' "$class_advis" | sed 's/^/      /' | head -20
fi

# ⌫ ACM fonts: проверка УДАЛЕНА 2026-08-26 — переехала в правило `pdf/fonts`.
# (намеренно НЕ блок `# ---`: блоки считает храповик, а надгробие проверкой не является)
# Блок жил здесь с 25.08 и был первым, кто ловил «acmart молча уехал на Computer Modern».
# Теперь то же самое делает `eslint-rules/pdf-facts.mjs` над `_build/paper.facts.json`, и делает
# ШИРЕ: здешний блок пропускал review-режим, правило судит артефакт всегда. Два источника правды
# об одном факте разъезжаются — поэтому дубль удалён, а не оставлен «на всякий случай».
#
# 🔴 Условие, при котором это станет потерей: правило смотрит на статьи, объявившие площадку в
# `venue.json`. Появится статья со сборкой, но без `venue.json` — её шрифты не проверит никто.
# Сегодня таких нет (все три настоящие статьи объявлены).

# --- chktex, if installed: LaTeX-source typography the log cannot see ---
# Adopted 2026-08-24 instead of writing our own. Measured first: out of the box it produced 28
# findings on a clean camera-ready and exactly ONE was real (`95\% CI. Averages` — a period after
# capitals that LaTeX renders with a NARROW space; the fix is `CI\@.`). The five noisy rules are
# disabled BY NAME in $REPO/.chktexrc with the measurement recorded there; ~30 rules stay armed.
# Advisory, not blocking: the two survivors of rule 13 on our own corpus are false, and a gate
# that fails on known-false findings is a gate someone disables.
if command -v chktex >/dev/null 2>&1 && [ -f "$BASE.tex" ]; then
  # 🔴 Walk UP from the paper dir first. The three candidates below all failed on 2026-08-24 in a
  # plain `bash check-render.sh <dir>` call: $CLAUDE_PROJECT_DIR is unset outside the harness, and
  # $OLDPWD is whatever the caller sat in before this script's own `cd` — here the paper dir, which
  # holds no rc. Result: 32 advisory findings printed with the five noisy rules ARMED, i.e. the
  # config we measured and wrote that morning was silently not in effect. The tell is the absence
  # of `rc=` in the header line; nothing else says so. Same class as every other config-not-applied
  # defect in this repo, so the lookup no longer depends on an env var or on the caller's cwd.
  RC=""
  d=$(cd "$(dirname "$BASE.tex")" && pwd)
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    [ -f "$d/.chktexrc" ] && { RC="$d/.chktexrc"; break; }
    d=$(dirname "$d")
  done
  [ -z "$RC" ] && for cand in "${CLAUDE_PROJECT_DIR:-}/.chktexrc" "$OLDPWD/.chktexrc" "$HOME/.chktexrc"; do
    [ -n "$cand" ] && [ -f "$cand" ] && { RC="$cand"; break; }
  done
  ck=$(chktex -q ${RC:+-l "$RC"} "$BASE.tex" 2>/dev/null | grep -cE "^(Warning|Error)" || true)
  if [ "$ck" -gt 0 ]; then
    echo "  chktex ($ck, advisory${RC:+, rc=$(basename "$RC")}):"
    chktex -q ${RC:+-l "$RC"} "$BASE.tex" 2>/dev/null | grep -E "^(Warning|Error)" | sed 's/^/      /' | head -10
  fi
fi

# --- refcheck: unreferenced labels. NOT our code — the package ships with TeX Live (2013) and
# writes `Package refcheck Warning: Unused label 'tab:orphan'` into the same .log, which the
# CLASS_RE above already reads. Turn it on for a CHECK build only:
#     \usepackage{refcheck}
# ⚠️ never in the shipped source — by default it prints label names in the margins. Verified
# 2026-08-24 on a fixture: it names both an orphan table and an orphan figure. Our own paper had
# exactly this defect the same day (`tab:tasks`, a table added AT THE REVIEWERS' REQUEST and never
# referenced), found by hand because nothing was looking.

# --- Advisory: literal space inside \texttt{...} (a multi-token command can wrap
# at that space with NO Overfull warning — e.g. rm -rf breaking as rm | -rf). Tie
# command tokens with ~ (\texttt{rm~-rf}). Advisory only: many \texttt spaces are fine.
if [ -f "$BASE.tex" ]; then
  ttspace=$(grep -oE '\\texttt\{[^{}]* [^{}]*\}' "$BASE.tex" 2>/dev/null | sort -u | head -20 || true)
  if [ -n "$ttspace" ]; then
    ttn=$(printf '%s\n' "$ttspace" | wc -l | tr -d ' ')
    echo "  NOTE ($ttn): \\texttt{} block(s) with a literal space (can wrap mid-command — tie tokens with ~ if it's a shell command):"
    printf '%s\n' "$ttspace" | sed 's/^/      /'
  fi
fi

[ "$big"   -gt 0 ] && fail=1
[ "$undef" -gt 0 ] && { echo "  UNDEFINED refs/citations/control-seq: $undef line(s)"; fail=1; }
[ "$fatal" -gt 0 ] && { echo "  FATAL/error lines: $fatal"; fail=1; }
[ "$classwarn" -gt 0 ] && fail=1
[ "$blgerr" -gt 0 ] && fail=1

echo "-- summary: ${big} visible overfull(s) >=${THRESH}pt, ${small} sub-threshold, undef=${undef}, fatal=${fatal}, class-warnings=${classwarn}, class-advisory=${classadv}, bibtex=${blgerr}"
if [ "$fail" -eq 0 ]; then
  echo "PASS: no visible layout defects, no undefined refs."
else
  echo "FAIL: fix the items above before declaring the render clean."
fi
exit $fail
