#!/usr/bin/env bash
# Ставит апстримный TeX Live с ровно теми CTAN-пакетами, которые нужны статьям этой базы.
#
# ЗАЧЕМ ЭТО ВМЕСТО ЭКШЕНА. Правильный по классу инструмент — teatimeguest/setup-texlive-action —
# у нас ЗАБЛОКИРОВАН белым списком сторонних Actions аккаунта («##[error]Repository access
# blocked», прогон 33457399377). Он не отклонён, он недоступен, и если его когда-нибудь добавят
# в белый список — переходить на него. Пока: actions/cache первопартийный и разрешён при любой
# политике, а установку делаем сами. Полный разбор трёх способов с замерами —
# ci-tex-toolchain-decision.md рядом.
#
# ЗАМЕР 2026-09-01 (локально, контейнер сессии): 230 МБ на диске, ~2 мин вхолодную.
# Против контейнера texlive/texlive:latest — 2700 МБ и 2m01s пула НА КАЖДОМ прогоне, потому
# что GitHub образ джоба не кэширует ни при каких условиях. 230 МБ кэшируются.
#
# Обе статьи базы собраны этой установкой и проверены по встроенным шрифтам:
#   agenticdev-2026 (acmart) → LinLibertineT + Inconsolatazi4 + LibertineMathMI, 6 стр.
#   compile-rules-2026 (acl) → NimbusRomNo9L + NimbusSanL, 0 ошибок
#
# Usage:  bash ci-install-texlive.sh [TEXDIR]     (по умолчанию $HOME/texlive)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEXDIR="${1:-$HOME/texlive}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 🔴 Список читается из ensure-toolchain.sh — там он объявлен рядом с apt-именами и с
# контрактом REQUIRED_FILES. Вторая копия здесь воспроизвела бы ровно тот дефект, от которого
# тот файл и защищает («a second list is how the two copies above drifted apart»).
mapfile -t PKGS < <(
  sed -n '/^CTAN_PACKAGES=(/,/^)/p' "$HERE/ensure-toolchain.sh" \
    | sed -e '1d' -e '$d' -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -v '^$' | tr ' ' '\n' | grep -v '^$'
)
# Ассерт на непустоту: пустой разбор поставил бы голый scheme-basic (или ничего) и уронил бы
# сборку позже с невнятной ошибкой про acmart вместо внятной про разбор. Скан, вернувший ноль,
# — это либо «нечего делать», либо «я искал не там», и различить обязан код.
if [ "${#PKGS[@]}" -lt 20 ]; then
  echo "🔴 CTAN_PACKAGES разобрался пустым или подозрительно коротким (${#PKGS[@]}) — сломан разбор" >&2
  printf '%s\n' "${PKGS[@]}" >&2
  exit 1
fi
echo "пакетов к установке: ${#PKGS[@]}"

# В агентском контейнере этой базы исходящий HTTPS идёт через прокси со своим CA, и без
# него curl падает «unable to get local issuer certificate». На раннере GitHub этого файла
# нет и блок ничего не делает. Записано, потому что на этом уже дважды терялось время:
# помнить про экспорт — не работает, пусть скрипт разбирается сам.
if [ -z "${CURL_CA_BUNDLE:-}" ] && [ -r /root/.ccr/ca-bundle.crt ]; then
  export CURL_CA_BUNDLE=/root/.ccr/ca-bundle.crt
  export SSL_CERT_FILE=/root/.ccr/ca-bundle.crt
  echo "(локальный прокси: подставил CA-бандл)"
fi

cd "$WORK"

# 🔴 НЕСКОЛЬКО ЗЕРКАЛ, И ЭТО НЕ ПЕРЕСТРАХОВКА — ЗАМЕР 2026-09-02.
#
# Первая редакция брала только `mirror.ctan.org`, и прогон 33650803245 упал так:
#
#     == скачиваю install-tl ==
#     curl: (60) SSL certificate problem: unable to get local issuer certificate
#
# Дело НЕ в CA-бандле прокси (блок выше на раннере не срабатывает, и это верно):
# `mirror.ctan.org` — РЕДИРЕКТОР на случайное зеркало сообщества, и в тот раз он увёл
# на зеркало с неполной цепочкой сертификатов. Повтор тут не спасает: `--retry` пойдёт
# по тому же редиректу и может попасть на то же зеркало.
#
# ⚠️ ЧЕСТНАЯ ГРАНИЦА МОЕГО ЗАМЕРА: проверить цепочки зеркал из агентского контейнера
# НЕЛЬЗЯ — прокси переподписывает TLS своим сертификатом, поэтому все четыре URL отдали
# 200 независимо от того, что предъявляет само зеркало. Отсюда решение: не выбирать
# «правильное» зеркало (нечем проверить), а пережить любое битое.
#
# Порядок: сначала редиректор (обычно ближайшее и быстрое зеркало), потом три
# ИМЕНОВАННЫХ зеркала университетов — у них цепочки стабильные, потому что за ними
# следят те же люди, что за самим CTAN.
TL_MIRRORS="
https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz
https://ctan.math.illinois.edu/systems/texlive/tlnet/install-tl-unx.tar.gz
https://mirrors.mit.edu/CTAN/systems/texlive/tlnet/install-tl-unx.tar.gz
https://ftp.tu-chemnitz.de/pub/tex/systems/texlive/tlnet/install-tl-unx.tar.gz
"
echo "== скачиваю install-tl =="
got=""
for url in $TL_MIRRORS; do
  if curl -sSL --retry 2 --retry-delay 2 --max-time 180 -o install-tl.tar.gz "$url" 2>/tmp/tlcurl.err; then
    # Скачанный файл проверяется РАСПАКОВКОЙ, а не размером: усечённый архив и страница
    # ошибки зеркала оба весят «что-то», и оба прошли бы проверку на непустоту.
    if tar tzf install-tl.tar.gz >/dev/null 2>&1; then
      got="$url"
      echo "   зеркало: $url"
      break
    fi
    echo "   ⚠️ $url отдал не архив, пробую следующее"
  else
    echo "   ⚠️ $url: $(tr -d '\n' </tmp/tlcurl.err | cut -c1-120)"
  fi
done
if [ -z "$got" ]; then
  echo "🔴 ни одно из зеркал CTAN не отдало install-tl. Список — TL_MIRRORS в этом файле." >&2
  exit 1
fi
tar xzf install-tl.tar.gz

cat > tl.profile <<EOF
selected_scheme scheme-basic
TEXDIR $TEXDIR
TEXMFLOCAL $TEXDIR/texmf-local
TEXMFSYSVAR $TEXDIR/texmf-var
TEXMFSYSCONFIG $TEXDIR/texmf-config
TEXMFVAR $TEXDIR/user-var
TEXMFCONFIG $TEXDIR/user-config
TEXMFHOME $TEXDIR/texmf-home
instopt_adjustpath 0
instopt_adjustrepo 1
tlpdbopt_install_docfiles 0
tlpdbopt_install_srcfiles 0
EOF

echo "== install-tl (scheme-basic) =="
./install-tl-*/install-tl --profile=tl.profile --no-interaction

# Каталог бинарей зависит от архитектуры; не хардкодим x86_64-linux, а находим.
BIN="$(find "$TEXDIR/bin" -maxdepth 1 -mindepth 1 -type d | head -1)"
[ -n "$BIN" ] || { echo "🔴 не нашёл каталог бинарей в $TEXDIR/bin" >&2; exit 1; }
export PATH="$BIN:$PATH"

echo "== tlmgr install (${#PKGS[@]} пакетов) =="
# 🔴 КОД ВОЗВРАТА tlmgr ЗДЕСЬ НЕ КРИТЕРИЙ, и это не небрежность, а замер 2026-09-01.
# `tlmgr install` возвращает 1, если ХОТЯ БЫ ОДНО имя ему не понравилось, — и в тот же
# единственный код сваливаются два совершенно разных случая:
#   «package already present: acmart»          — норма, scheme-basic его уже принёс
#   «package X not present in repository»      — настоящая ошибка, имя выдумано или устарело
# Первый случай возникает на КАЖДОМ прогоне (профиль install-tl ставит часть списка сам),
# поэтому `set -e` на этой строке убивал бы скрипт всегда. Проверено вживую: так и было,
# и умирал он ДО блока проверки файлов, то есть терялась единственная честная проверка.
#
# Поэтому: код игнорируем, а в выводе ищем именно ту строку, которая означает настоящую
# поломку. Это тот же принцип, что дальше по файлу — судить по результату, а не по коду
# возврата установщика.
tlmgr install "${PKGS[@]}" 2>&1 | tee "$WORK/tlmgr.log" || true
if grep -q "not present in repository" "$WORK/tlmgr.log"; then
  echo "🔴 tlmgr не знает таких пакетов — имя выдумано или переименовано в CTAN:" >&2
  grep "not present in repository" "$WORK/tlmgr.log" >&2
  echo "Проверить имя:  tlmgr search --global --file <файл>  или  tlmgr info <имя>" >&2
  exit 1
fi

# 🔴 ПРОВЕРКА ПОСЛЕ УСТАНОВКИ, А НЕ КОД ВОЗВРАТА УСТАНОВЩИКА. 2026-09-01 apt-экшен вернул
# outcome=success, поставив НОЛЬ пакетов (404 на протухшей версии JRE), и шаг был зелёный.
# Установщику верить нельзя — верить можно только тому, что файлы на месте.
mapfile -t NEED < <(
  sed -n '/^REQUIRED_FILES=(/,/^)/p' "$HERE/ensure-toolchain.sh" \
    | sed -e '1d' -e '$d' -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -v '^$'
)
[ "${#NEED[@]}" -ge 10 ] || { echo "🔴 REQUIRED_FILES разобрался пустым" >&2; exit 1; }
missing=""
for f in "${NEED[@]}"; do kpsewhich "$f" >/dev/null 2>&1 || missing="$missing $f"; done
if [ -n "$missing" ]; then
  echo "🔴 после установки НЕ ХВАТАЕТ:$missing" >&2
  echo "Добавь несущий пакет в CTAN_PACKAGES ($HERE/ensure-toolchain.sh)." >&2
  echo "Найти пакет по файлу:  tlmgr search --global --file <имя>" >&2
  exit 1
fi

# 🔴 И БИНАРИ ТОЖЕ, А НЕ ТОЛЬКО ФАЙЛЫ. Проверка выше ищет `.cls`/`.sty` через `kpsewhich` —
# файлом. `texcount` файлом не ищется, он ИСПОЛНЯЕМЫЙ, поэтому его отсутствие проходило мимо
# и всплывало двумя шагами позже, красной сборкой статьи (замер 2026-09-17).
# Берём из REQUIRED_BINS только помеченные `:tex` — `pdfinfo` приезжает из poppler через apt,
# и искать его здесь было бы ложным срабатыванием.
mapfile -t NEED_BINS < <(
  sed -n '/^REQUIRED_BINS=(/,/)$/p' "$HERE/ensure-toolchain.sh" \
    | tr ' ' '\n' | sed -e 's/^REQUIRED_BINS=(//' -e 's/)$//' \
    | grep ':tex$' | sed 's/:tex$//' | grep -v '^$'
)
[ "${#NEED_BINS[@]}" -ge 1 ] || { echo "🔴 REQUIRED_BINS разобрался пустым — сломан разбор" >&2; exit 1; }
missing_bins=""
for b in "${NEED_BINS[@]}"; do [ -x "$BIN/$b" ] || missing_bins="$missing_bins $b"; done
if [ -n "$missing_bins" ]; then
  echo "🔴 после установки НЕТ БИНАРЕЙ:$missing_bins" >&2
  echo "Добавь несущий пакет в CTAN_PACKAGES ($HERE/ensure-toolchain.sh)." >&2
  echo "Найти пакет по файлу:  tlmgr search --global --file <имя>" >&2
  exit 1
fi

echo "✅ TeX Live готов: ${#NEED[@]} требуемых файлов и ${#NEED_BINS[@]} бинарей на месте, $(du -sh --block-size=1M "$TEXDIR" | cut -f1) МБ"
echo "PATH: $BIN"
