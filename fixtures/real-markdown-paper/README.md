# `real-markdown-paper` — a fixture that is an actual published document

Every other fixture here is written to trigger one rule, which means each contains exactly what its
author thought to put in it. This one is a real article — *"Caveman Promises 65% Fewer Tokens. My
Bill Didn't Move."*, published 2026-07-07, 225 lines after stripping the blog's own HTML comments
and widget markers. It exists because a rule that behaves well on an eleven-line stub can still be
unusable on a document with nine tables, six sections and prose nobody wrote for a linter.

**Provenance and licence.** The article text (`paper.md`) is © 2026 zernie, first published at
zernie.com, and is **not** covered by this repository's MIT licence. It is included only as a test
fixture for this repository's own checks. It is NOT part of the package's API, carries no promise of
stability, and will be replaced the moment a better real document is available.

**The article does not ship.** `package.json` excludes this directory from the npm tarball
(`!fixtures/real-markdown-paper` in `files`) and re-includes only `baseline.mjs` and
`baseline.json`: `test/e2e/install.mjs` ships and imports the comparator, and a shipped file
whose relative import points outside the tarball is a broken file. The install e2e copies the
article itself from the repository into the consumer, the same way it copies
`fixtures/build-e2e/acmart`.

**It is deliberately NOT a clean corpus.** Findings on this fixture are measurements, not defects to
be tuned away: the article states no research question, because blog posts do not, and that is the
sort of fact only a real document surfaces.
