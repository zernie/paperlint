#!/usr/bin/env bash
# ensure-checkers.sh — ставит ВСЕ внешние чекеры статьи одной командой и ДОКАЗЫВАЕТ, что
# каждый запускается. Идемпотентно: повторный запуск ничего не ломает.
#
#   bash node_modules/research-paper-pipeline/skills/render-paper/ensure-checkers.sh
#
# ЗАЧЕМ ОН СУЩЕСТВУЕТ (2026-09-04). Раньше установка жила КОММЕНТАРИЕМ в requirements.txt:
# пять команд, включая `cp -r … site-packages/`. Тот блок был неверен по трём осям сразу,
# и все три обнаружились при попытке им воспользоваться:
#   1. НЕ НУЖЕН — у bibtexparser 1.3.0 есть готовая сборка, хватает пина `<2`;
#   2. НЕПОЛОН  — молчал про cffi и unidecode, оба нужны, оба всплыли падением;
#   3. ВРЕДЕН   — копирование в site-packages оставляет метаданные pip врущими
#                 (`pip list` показывал 2.0.0b9 поверх файлов 1.4.4).
# Проза не исполняется и потому не проверяется. Скрипт — исполняется.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JAR_DIR="${TEXTIDOTE_DIR:-/opt/textidote}"
JAR="$JAR_DIR/textidote.jar"
JAR_URL="https://github.com/sylvainhalle/textidote/releases/download/v0.9/textidote.jar"
JAR_SHA="3ad1aaa0922709f8"     # префикс sha256, сверен 2026-09-04

echo "== python-зависимости =="
# `--only-binary :all:` НЕСУЩИЙ: он превращает «зависимость без готовой сборки (.whl)» из невнятного
# провала сборки в отказ, называющий пакет. Ровно так 17.09 нашёлся `tsv` — до этого
# установка падала стеком из недр setuptools, и виноватым выглядел bibtexparser.
pip install -q --only-binary :all: -r "$HERE/checkers-requirements.txt"
# Сам чекер — БЕЗ его зависимостей: они перечислены в requirements.txt поимённо, минус
# несобираемый `tsv`, который он не импортирует. Причина — в шапке requirements.txt.
pip install -q --no-deps aclpubcheck

echo "== TeXtidote (jar, не pip-пакет) =="
if [ -f "$JAR" ]; then
  echo "   уже на месте: $JAR"
else
  mkdir -p "$JAR_DIR"
  curl -sSL --max-time 300 -o "$JAR" "$JAR_URL"
fi
got="$(sha256sum "$JAR" | cut -c1-16)"
if [ "$got" != "$JAR_SHA" ]; then
  echo "🔴 sha256 не сошёлся: ждали $JAR_SHA…, получили $got…" >&2
  echo "   Файл НЕ тот, что проверяли. Не пользоваться, разобраться." >&2
  exit 1
fi

# 🔴 ГЛАВНАЯ ЧАСТЬ. Установщику верить нельзя — верить можно только тому, что инструмент
# ЗАПУСКАЕТСЯ. «Установлен» и «работает» отличаются, и в этой репе на этой разнице уже
# записан отдельный отказ: handoff зафиксировал «aclpubcheck: All Clear» для проверки,
# которая ни разу не выполнялась. Отсутствующий чекер и прошедший выглядят одинаково.
echo "== проверка, что каждый чекер РАБОТАЕТ =="
fail=0
# 🔴 ИМПОРТ МОДУЛЯ, А НЕ `--help`. Замер 17.09: `--help` печатает usage и выходит НУЛЁМ
# на интерпретаторе, где pandas не импортируется вовсе (numpy/pandas собраны друг против
# друга: «numpy.dtype size changed»). То есть приёмка, стоявшая здесь, пропускала ровно тот
# отказ, ради которого написана. `import aclpubcheck.formatchecker` тянет numpy и pandas на
# 15-й и 20-й строках самого чекера и потому падает честно.
python3 -c "import aclpubcheck.formatchecker" >/dev/null 2>&1 \
  && echo "   ✅ aclpubcheck" || { echo "   ❌ aclpubcheck установлен, но не запускается"; fail=1; }
python3 -c "import rebiber" >/dev/null 2>&1 \
  && echo "   ✅ rebiber" || { echo "   ❌ rebiber не импортируется"; fail=1; }
python3 -c "import jinja2" >/dev/null 2>&1 \
  && echo "   ✅ jinja2" || { echo "   ❌ jinja2 не импортируется"; fail=1; }
java -jar "$JAR" --version >/dev/null 2>&1 \
  && echo "   ✅ textidote ($JAR)" || { echo "   ❌ textidote не запускается (нужна JRE; java 21 подходит)"; fail=1; }

[ "$fail" -eq 0 ] || { echo; echo "🔴 не всё работает — см. выше" >&2; exit 1; }
echo
echo "✅ все чекеры установлены И запускаются"
