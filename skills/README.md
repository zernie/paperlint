# skills/

Still empty — skills arrive in Stage 3 of the migration.

The directory exists because `.claude-plugin/plugin.json` points at it
(`"skills": "./skills/"`), and a manifest pointing into a void is a broken pointer.

A temporary probe skill, `rpp-probe`, lived here (2026-09-10). It was written for a single
measurement — is a private repository's skill visible in the listing — and deleted as soon
as the measurement gave its answer. The answer turned out to be about something else
entirely: the plugin channel in the remote environment doesn't come up at all, neither for a
private marketplace nor for a public one (`installed_plugins.json` is empty, there is no
marketplace catalog). The full breakdown with the runs is in the author's private notes
(`idei/paper-pipeline-extraction/05-plan-perenosa-2026-09-10.md`, the "MEASUREMENT 09-10" block).

<!--
  ⚠️ A private repository's NAME used to stand here, removed 2026-09-12. Found by the
  package's own `pre-public-audit` — but only after an external review forced it to scan
  PATHS and names, not just file contents.

  On its own this isn't a data leak: the private repository stays unreachable no matter what
  you call it. But a public file has no business confirming that such a repository exists and
  that a document at such a path lives in it — that's metadata the reader was never given.

  Rule in one line: in a public repository, reference private notes WITHOUT the repository's
  name. Keep the path itself — it's useful to the one person who has access, and tells
  everyone else nothing.
-->
