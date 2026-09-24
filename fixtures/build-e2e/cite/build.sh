#!/usr/bin/env bash
# A leftover paper-supplied build script. `rpp build` must NOT run it — it compiles the paper
# itself — and must say that this file is ignored. Running it would leave a trace and fail.
touch "$(dirname "$0")/RAN"
exit 1
