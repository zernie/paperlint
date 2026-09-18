#!/usr/bin/env bash
# Падающая сборка: `rpp build` обязан сообщить статус failed И НАЗВАТЬ код возврата.
echo "pdflatex: something went wrong" >&2
exit 3
