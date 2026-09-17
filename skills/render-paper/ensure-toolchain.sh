#!/usr/bin/env bash
# The LaTeX toolchain, made present instead of described.
#
# ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
# The knowledge "a fresh container has no TeX Live, here is the apt line" was written
# down THREE times — `render-paper/SKILL.md` §Toolchain, the `NEED_APT` preflight in
# `compile-rules-2026/repro/build-submission.sh`, and the setup block in HANDOFF.md —
# and executed by a human every single time. That is the repo's own thesis pointed at
# itself: prose that describes a mechanism is not the mechanism.
#
# 🔴 And three copies had already drifted into two DIFFERENT package lists:
#
#   render-paper      texlive-latex-recommended fonts-recommended latex-extra publishers
#   build-submission  texlive-latex-base latex-extra fonts-recommended bibtex-extra poppler-utils
#
# render-paper's list has no `poppler-utils`, so `pdfinfo` is missing and the page-count
# gate cannot run; build-submission's has no `texlive-publishers`, so `acmart.cls` is
# missing and an ACM paper does not compile at all. Each list is correct for the file it
# sits in and wrong for the other — the same defect shape as two parsers for one field.
# This is the union, in ONE place, and both callers now ask for it rather than restate it.
#
# ── THE DECISION THIS IMPLEMENTS ────────────────────────────────────────────────
# 2026-08-14 (`#134`) enumerated four codification forms and said to pick by context,
# naming this home explicitly: *"скрипт скилла — если это часть уже существующего
# пайплайна (как здесь: `render-paper` уже был подходящим домом, просто не полным)"*.
# It also set the search rule that points here: look for a home BY CLASS OF ACTION, and
# "TeX Live is missing" is a wider class than "this one paper". So the install does not
# belong in a per-paper build script.
#
# ── WHY IT IS LAZY, NOT A SessionStart HOOK ─────────────────────────────────────
# Measured 2026-08-17: 172 MB fetched, 482 MB on disk, 31 packages.
# 🔴 STALE — that measurement predates texlive-fonts-extra, which was added to the list on
# 2026-08-24, i.e. AFTER it. Re-measured 2026-09-01 via apt-cache Installed-Size over the
# nine packages below: 2.1 GB on disk, of which texlive-fonts-extra alone is 1.69 GB (80%).
# The old number was quoted as fact in .github/workflows/paper-gates.yml and was wrong by 4x.
# Lesson, not bookkeeping: a size comment goes stale the moment someone appends to the list,
# and nothing here notices — the list and its measurement are two files' worth of coupling
# living one line apart. A SessionStart hook
# would pay that in every session; papers are built in a small fraction of them. Here the
# cost lands only on a session that actually renders.
#
# ── WHY IT REFUSES OUTSIDE A CONTAINER ──────────────────────────────────────────
# Installing half a gigabyte of system packages unasked is fine in a disposable container
# and rude on someone's laptop. So: install only when running as root AND apt-get exists
# (i.e. the ephemeral Linux box); everywhere else print the exact command and exit 1, which
# is the behaviour the callers had before and still the right one on macOS.
#
# Usage:  bash .claude/skills/render-paper/ensure-toolchain.sh            # binaries only
#         bash .claude/skills/render-paper/ensure-toolchain.sh --acm      # + acmart.cls
#         AUTO_INSTALL_TEX=0 bash …                                       # never install, just report
set -uo pipefail

# The union of what any paper in this repo has needed. Kept as ONE list on purpose: a
# second list is how the two copies above drifted apart.
PACKAGES=(
  texlive-latex-base        # pdflatex
  texlive-latex-recommended
  texlive-latex-extra
  texlive-fonts-recommended
  texlive-bibtex-extra      # bibtex styles beyond the base set
  texlive-publishers        # acmart.cls — ACM venues
  # 🔴 The two below were added 2026-08-24 after a camera-ready build measured them missing.
  # Neither announces itself in the PDF, and that is the whole point of listing them here.
  texlive-fonts-extra       # libertine, inconsolata (zi4), newtx — the fonts acmart actually wants.
                            # WITHOUT it acmart does NOT fail: it prints "You do not have the
                            # libertine package installed" and silently falls back to Computer
                            # Modern, so the PDF compiles clean and is typeset in the wrong fonts.
                            # Correct fonts also change metrics — on agenticdev-2026 the switch
                            # surfaced an overfull box that the CM build did not have.
  # 🔴 Добавлено 2026-09-17: `eslint-rules/paper-texcount.harness.mjs` падал в свежем
  # контейнере, и его собственный отказ называл лекарство — «ставится вместе с TeX Live:
  # texlive-extra-utils». Знание было, оно просто не лежало в исполняемом файле.
  texlive-extra-utils       # texcount — счёт слов, которым меряется объём статьи
  texlive-plain-generic     # binhex.tex, pulled in by newtx. Missing it is the opposite failure:
                            # a HARD "! LaTeX Error: File `binhex.tex' not found" + emergency stop,
                            # i.e. installing texlive-fonts-extra alone BREAKS a build that worked.
                            # Install the pair, never just the first.
  poppler-utils             # pdfinfo, the page-count authority
)
APT_LINE="apt-get install -y --no-install-recommends ${PACKAGES[*]}"

# 🔴 КОНТРАКТ — ЭТОТ СПИСОК ФАЙЛОВ, А НЕ ИМЕНА ПАКЕТОВ ВЫШЕ (2026-09-01).
# Локально TeX ставится apt-ом (список выше), в CI — апстримным tlmgr по CTAN-именам
# (.github/workflows/paper-gates.yml, джоб `build`). Имена не совпадают и совпасть не могут:
# один texlive-fonts-extra — это libertine + inconsolata + newtx у tlmgr, один
# texlive-publishers — это acmart. Свести в один список нельзя.
#
# Свести можно РЕЗУЛЬТАТ: оба пути обязаны привести к одному и тому же набору файлов.
# Поэтому список ниже читается ОБОИМИ — этим скриптом и воркфлоу (тем же разбором sed) —
# и является единственным местом, где он объявлен. Разъехаться установкам можно;
# разъехаться незаметно — нет.
#
# Что здесь лежит и почему именно оно:
#   libertine/zi4/newtxmath — acmart.cls:776-784 проверяет ВСЕ ТРИ и при отсутствии ЛЮБОГО
#     выставляет \@ACM@newfontsfalse, молча уходя на Computer Modern: PDF собирается, выглядит
#     нормальным, набран не тем шрифтом, а другая метрика даёт другую пагинацию.
#   totpages/environ — их тянет САМ acmart, а не статья, поэтому греп по \usepackage в
#     paper.tex их не находит. Оба всплыли по одному, каждый ценой полного прогона CI.
#   balance — сведение колонок последней страницы, требование ACM (правило pdf/balance).
# 🔴 ТРЕТИЙ СЛОВАРЬ ТОГО ЖЕ НАБОРА — имена CTAN для tlmgr (2026-09-01).
# PACKAGES выше — имена apt (локальная разработка на Debian/Ubuntu).
# CTAN_PACKAGES ниже — имена tlmgr (CI, апстримный TeX Live).
# REQUIRED_FILES — контракт, который обязаны выполнить ОБА.
#
# Почему не один список: у apt минимальная единица — дистрибутивный пакет, и ради трёх
# шрифтовых семейств (71 МБ) он тянет texlive-fonts-extra целиком (1691 МБ, 96% мусора).
# У tlmgr единица — CTAN-пакет. Замер 2026-09-01: apt-путь 2100 МБ, tlmgr-путь 230 МБ.
# Разбор всех трёх способов с номерами прогонов — ci-tex-toolchain-decision.md рядом.
#
# 🔴 СПИСОК ВЫВЕДЕН СБОРКОЙ, А НЕ ЧТЕНИЕМ \usepackage. Девять пакетов ниже (xstring …
# doclicense) не назвала бы никакая сверка с исходником статьи: их тянет сам acmart.
# Найдены циклом «собрать → выдернуть недостающий файл → tlmgr search --file → поставить»,
# прогнанным ЛОКАЛЬНО. Это важно: в CLAUDE.md записано «ставить коллекциями, а не именами»,
# и причина там названа честно — «каждое имя стоит полного прогона CI (~25 мин квоты)».
# Локальный цикл стоит НОЛЬ, поэтому точный список снова выгоднее коллекции.
#
# ⚠️ И ловушка, на которой цикл споткнулся: недостающий шрифт даёт ДРУГУЮ форму ошибки —
# не «File `x.sty' not found», а «Font \aclhv=phvb not loadable: Metric (TFM) file not
# found». Грепать надо обе.
CTAN_PACKAGES=(
  scheme-basic              # pdflatex, kpsewhich, bibtex — база
  latex latex-bin bibtex

  # --- ACM (agenticdev-2026, acmart) ---
  acmart
  libertine inconsolata newtx   # 🔴 ВСЕ ТРИ: acmart.cls:776-784 проверяет каждый и при
                                # отсутствии ЛЮБОГО молча уходит на Computer Modern
  totpages environ preprint     # preprint несёт balance.sty
  seqsplit xurl enumitem booktabs hyperref geometry pgf
  caption natbib microtype xcolor

  # --- то, что тянет САМ acmart (найдено сборкой 2026-09-01) ---
  xstring everyshi hyperxmp ncctools cmap float comment upquote doclicense

  # --- ACL (compile-rules-2026, acl.sty) ---
  lineno
  psnfss helvetic times courier symbol zapfding   # Helvetica/Times: без них
                                # «Font ptmr8t not loadable», PDF не собирается вовсе.
                                # 🔴 `urw-base35` здесь СТОЯЛО И БЫЛО ВЫДУМАНО: tlmgr
                                # отвечает «package urw-base35 not present in repository».
                                # Поймал локальный прогон 01.09; на CI это стоило бы
                                # прогона. Пяти имён выше достаточно — ACL-статья
                                # собрана и проверена по встроенным шрифтам (Nimbus).

  # 🔴 cm-super — ЛОВИТ ТИХУЮ РАСТЕРИЗАЦИЮ, добавлен 2026-09-01 по находке гейта pdf/fonts.
  # Без него ACL-статья собиралась БЕЗ ОШИБОК и содержала шрифт «F277 · Type 3» — растровый.
  # pdflatex не жалуется: не найдя Type 1 для sftt (CM Sans Typewriter, это \texttt внутри
  # sans-контекста шаблона ACL), он молча генерирует битмап. PDF выглядит собранным, а ACM и
  # ACL такой PDF отбивают.
  # Замер: до — 1 шрифт Type 3, после — 0, заменён на sftt0800.pfb из cm-super.
  # lmodern пробовался в паре и НЕ является причиной починки: имена в PDF стали SFTT*, а не
  # LMTT*, то есть сработал именно cm-super. В список идёт один пакет, а не оба наугад.
  cm-super

  # --- инструменты проверок ---
  checkcites
  # 🔴 texcount — ДОБАВЛЕН 2026-09-17 ПО КРАСНОМУ CI ПОТРЕБИТЕЛЯ, и дыра была невидима.
  # `REQUIRED_BINS` ниже требует texcount, и apt-список выше его несёт
  # (`texlive-extra-utils`) — а этот, CTAN-список, не нёс. Значит инструмент приезжал
  # ровно по одному пути из двух, и какой сработает, решал не код, а КЭШ: пока
  # `~/texlive` попадал из кэша GitHub Actions, дерево уже содержало texcount и шаг был
  # зелёным. На первом промахе кэша холодная установка собрала TeX Live без него, и
  # `repro/build-submission.sh` упал с «missing: texcount».
  # 🔴 Урок не про имя пакета: ДВА СПИСКА ОДНОГО ИНСТРУМЕНТА расходятся молча, а
  # расхождение проявляется только в неудачный день. Тот же класс, что `urw-base35`
  # и `cm-super` выше — оба тоже найдены прогоном, а не чтением.
  texcount
)

REQUIRED_FILES=(
  acmart.cls
  seqsplit.sty
  xurl.sty
  enumitem.sty
  booktabs.sty
  hyperref.sty
  geometry.sty
  tikz.sty
  libertine.sty
  zi4.sty
  newtxmath.sty
  balance.sty
  totpages.sty
  environ.sty
)


# 🔴 ОДИН список, потому что копий было ДВЕ — здесь и в проверке после установки, — а файл
# сам предупреждает абзацем выше: «a second list is how the two copies above drifted apart».
# Добавление `texcount` в одну из них и было бы тем самым расхождением.
# 🔴 ЗА ДВОЕТОЧИЕМ — ПОСТАВЩИК, и он несущий. Проверки ниже ищут по `PATH` и потому
# поставщика не различают — этого достаточно, чтобы сказать «инструмента нет», и НЕ
# достаточно, чтобы сказать «установка TeX Live прошла успешно»: `pdfinfo` приезжает из
# poppler через apt, и требовать его в дереве TeX было бы ложным срабатыванием.
# Замер 2026-09-17: `texcount` отсутствовал в CTAN-списке, установщик проверял только
# REQUIRED_FILES (`.cls`/`.sty`, ищутся `kpsewhich`), бинарь файлом не ищется — и
# установщик отчитался «✅ TeX Live готов» над деревом без него. Красным стала сборка
# статьи двумя шагами позже, и виноватым выглядел потребитель.
#   tex — обязан оказаться в дереве TeX Live после установки; за это отвечает CTAN_PACKAGES
#   apt — приезжает отдельным пакетом системы, в дереве TeX его искать нельзя
REQUIRED_BINS=(pdflatex:tex bibtex:tex pdfinfo:apt texcount:tex)

# Имя без пометки — для проверок по `PATH`, которым поставщик безразличен.
bin_name() { printf '%s' "${1%%:*}"; }

want_acm=0
want_textidote=0
for arg in "$@"; do
  case "$arg" in
    --acm) want_acm=1 ;;
    --textidote) want_textidote=1 ;;
  esac
done

missing=()
for entry in "${REQUIRED_BINS[@]}"; do
  bin="$(bin_name "$entry")"
  command -v "$bin" >/dev/null || missing+=("$bin")
done
if [ "$want_acm" = 1 ] && command -v kpsewhich >/dev/null; then
  kpsewhich acmart.cls >/dev/null 2>&1 || missing+=("acmart.cls")
fi

if [ ${#missing[@]} -eq 0 ]; then
  echo "✓ LaTeX toolchain present (pdflatex, bibtex, pdfinfo$([ "$want_acm" = 1 ] && echo ", acmart.cls"))"
  exit 0
fi

echo "missing: ${missing[*]}"

if [ "${AUTO_INSTALL_TEX:-1}" = "0" ]; then
  echo "AUTO_INSTALL_TEX=0 — not installing. Command: $APT_LINE"
  exit 1
fi

# The two conditions together mean "disposable Linux container", which is the only place
# a half-gigabyte unattended install is the polite choice.
if [ "$(id -u)" != "0" ] || ! command -v apt-get >/dev/null; then
  echo "Not a root apt container (uid $(id -u)) — not installing anything."
  echo "Install it yourself with:  $APT_LINE"
  echo "On macOS: brew install --cask mactex-no-gui  (or basictex + tlmgr install for the rest)"
  exit 1
fi

echo "Installing TeX Live — ~172 MB download, ~482 MB on disk, about a minute."
echo "  $APT_LINE"
# `update` is cheap when the lists are warm and is the difference between a working
# install and a 404 on a container whose lists are stale.
apt-get update -qq >/dev/null 2>&1 || true
# shellcheck disable=SC2086
if ! apt-get install -y --no-install-recommends ${PACKAGES[*]} >/tmp/ensure-toolchain.log 2>&1; then
  echo "🔴 apt-get failed. Last lines:"
  tail -15 /tmp/ensure-toolchain.log
  exit 1
fi

# 🔴 Verify what we came for, rather than trusting apt's exit code. A package set that
# installs cleanly and still leaves `pdfinfo` absent is exactly the silent half-success
# this script exists to end.
still=()
for entry in "${REQUIRED_BINS[@]}"; do
  bin="$(bin_name "$entry")"
  command -v "$bin" >/dev/null || still+=("$bin")
done
if [ "$want_acm" = 1 ] && ! kpsewhich acmart.cls >/dev/null 2>&1; then
  still+=("acmart.cls")
fi
if [ ${#still[@]} -gt 0 ]; then
  echo "🔴 apt reported success but these are STILL missing: ${still[*]}"
  echo "   The package list in this script is wrong for this base image — fix it here, not in a caller."
  exit 1
fi

echo "✓ LaTeX toolchain installed and verified"

# ─────────────────────────────────────────────────────────────────────────────
# textidote — НЕ apt-пакет, поэтому и стоит отдельно, а не строкой в PACKAGES.
#
# 🔴 ПРИЁМКА ЗДЕСЬ ДРУГАЯ, И ЭТО ГЛАВНОЕ. Для бинаря годится `command -v`; для jar-файла он
# бессмысленен — наличие файла ничего не говорит о том, запустится ли он. Проверка поэтому
# ЗАПУСКАЕТ его, ровно как требует правило «приёмка — не „установилось“, а „ЗАПУСКАЕТСЯ“».
# Скачанный битым jar (обрыв, страница ошибки вместо файла) лежит на диске и выглядит
# установленным; отличает его только попытка выполнить.
#
# ⚠️ Нужна Java. Её здесь НЕ ставим: `default-jre` тянет ещё сотни мегабайт, а отсутствие
# Java — это состояние, о котором надо сказать, а не молча вылечить.
if [ "$want_textidote" = 1 ]; then
  jar="${TEXTIDOTE_JAR:-/opt/textidote/textidote.jar}"
  if ! command -v java >/dev/null; then
    echo "🔴 textidote требует Java, а её нет. Поставить: apt-get install -y default-jre"
    exit 1
  fi
  if ! java -jar "$jar" --version >/dev/null 2>&1; then
    echo "Ставлю textidote — ~8 МБ, один файл."
    mkdir -p "$(dirname "$jar")"
    if ! curl -sSLf -o "$jar" https://github.com/sylvainhalle/textidote/releases/download/v0.9/textidote.jar; then
      echo "🔴 не удалось скачать textidote.jar"
      exit 1
    fi
  fi
  # Проверяем ПОСЛЕ скачивания, и тем же способом: запуском. Curl мог отдать 200 и страницу.
  if ! java -jar "$jar" --version >/dev/null 2>&1; then
    echo "🔴 textidote.jar на месте ($jar), но НЕ ЗАПУСКАЕТСЯ — файл битый или это не jar"
    exit 1
  fi
  echo "✓ textidote установлен и запускается ($jar)"
  echo "  харнессу нужна переменная:  export TEXTIDOTE_JAR=$jar"
fi
