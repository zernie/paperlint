# skills/

The Claude Code skills this package ships, one directory per skill, each with its `SKILL.md`.
Start with `paper-pipeline/`: it routes to the stage skills.

`paperlint init` links each skill into the project's Claude Code skills directory
(`src/link-skills.ts`), because Claude Code finds project skills there and never inside the
installed package. The directory name is `SHIPPED_SKILLS_DIR` in
`paper-pipeline/scripts/consumer.mjs`; the linker and the install e2e both read that constant, and
`files` in `package.json` puts the directory in the tarball.

<!--
  In a public repository, reference private notes WITHOUT the repository's name. Keep the path
  itself — it is useful to the one person who has access, and tells everyone else nothing.
-->
