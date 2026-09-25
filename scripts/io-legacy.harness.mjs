/**
 * The hexagonal gate in `eslint.config.mjs` (CLAUDE.md rule 10, issue #76): I/O only in
 * `src/adapters/` and the composition root, `src/core/` imports neither adapters nor the app layer,
 * and the list of files grandfathered in only shrinks.
 *
 * Every half is asserted with ESLint itself, on the REAL config blocks exported from
 * `eslint.config.mjs` — not on a copy of them and not by reading source text.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import config, {
  IO_BAN,
  IO_LEGACY,
  layerBoundaries,
} from "../eslint.config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Guards: the grandfather list can only shrink. Adding a file here is the one move this gate exists
// to make visible — it has to be done in two places, and review sees both.
const FROZEN = [
  "src/build-engine.ts",
  "src/build.ts",
  "src/doctor.ts",
  "src/engine.ts",
  "src/facts-file.ts",
  "src/hooks-settings.ts",
  "src/init.ts",
  "src/link-skills.ts",
  "src/new-paper.ts",
  "src/pdf-facts.ts",
  "src/structure.ts",
  "src/tex-requirements.ts",
  "src/toolchain.ts",
];
const grown = IO_LEGACY.filter((f) => !FROZEN.includes(f));
assert.deepEqual(
  grown,
  [],
  `IO_LEGACY grew: ${grown.join(", ")} — a new module that does I/O is an adapter`,
);

const tsBlock = {
  files: ["**/*.ts"],
  languageOptions: { parser: tseslint.parser },
};
const ioErrors = (results) =>
  results
    .flatMap((r) => r.messages)
    .filter(
      (m) =>
        m.ruleId === "no-restricted-imports" ||
        m.ruleId === "no-restricted-globals",
    );

// Guards: an entry that no longer does I/O must LEAVE the list, or the list stops meaning anything.
// Lint each entry with the ban applied to it (the real rules, minus the exemption).
{
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: true,
    overrideConfig: [tsBlock, { files: ["src/**/*.ts"], rules: IO_BAN.rules }],
  });
  for (const file of IO_LEGACY) {
    const found = ioErrors(await eslint.lintFiles([join(ROOT, file)]));
    assert.ok(
      found.length > 0,
      `${file} does no I/O any more — remove it from IO_LEGACY`,
    );
  }
}

// Guards: the ban fires on a NEW module and stays quiet where effects belong. The full config,
// as `npm run lint` loads it; lintText needs no file on disk, so nothing is planted in src/.
{
  const eslint = new ESLint({ cwd: ROOT });
  const fsImport =
    'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n';
  const lint = async (filePath, code = fsImport) =>
    ioErrors(await eslint.lintText(code, { filePath: join(ROOT, filePath) }));

  assert.ok(
    (await lint("src/brand-new.ts")).length > 0,
    "a new src/ module importing node:fs must fail",
  );
  assert.ok(
    (await lint("src/core/probe.ts")).length > 0,
    "core importing node:fs must fail",
  );
  assert.ok(
    (await lint("src/core/env.ts", "export const home = process.env.HOME;\n"))
      .length > 0,
    "core reading process.env must fail — the environment is an input",
  );
  assert.ok(
    (
      await lint(
        "src/core/net.ts",
        'export const get = () => fetch("https://example.org");\n',
      )
    ).length > 0,
    "core calling fetch must fail",
  );
  assert.deepEqual(
    await lint("src/adapters/fs.ts"),
    [],
    "an adapter may import node:fs",
  );
  assert.deepEqual(
    await lint("src/cli.ts"),
    [],
    "the composition root may import node:fs",
  );
  assert.ok(
    Array.isArray(config),
    "eslint.config.mjs still exports the flat config array",
  );
}

// Guards: core ⊄ adapters, core ⊄ app, adapter ⊄ app — and adapter → core, app → anything are
// allowed. boundaries classifies by resolving each import to a file, so this half needs real files:
// a throwaway tree, linted with the real block rooted there. The process stays in the repository,
// so this also proves `root-path` works: without it the plugin would read process.cwd() and pass.
{
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "rpp-layers-")));
  try {
    const put = (rel, code) => {
      mkdirSync(dirname(join(tmp, rel)), { recursive: true });
      writeFileSync(join(tmp, rel), code);
    };
    put("src/core/port.ts", "export interface Port { read(): string }\n");
    put(
      "src/core/uses-adapter.ts",
      'import { a } from "../adapters/disk.ts";\nexport const x = a;\n',
    );
    put(
      "src/core/uses-app.ts",
      'import { b } from "../app.ts";\nexport const y = b;\n',
    );
    put(
      "src/adapters/disk.ts",
      'import type { Port } from "../core/port.ts";\nexport const a: Port = { read: () => "" };\n',
    );
    put(
      "src/adapters/uses-app.ts",
      'import { b } from "../app.ts";\nexport const z = b;\n',
    );
    put(
      "src/app.ts",
      'import { a } from "./adapters/disk.ts";\nexport const b = a;\n',
    );

    const eslint = new ESLint({
      cwd: tmp,
      overrideConfigFile: true,
      overrideConfig: [tsBlock, layerBoundaries(tmp)],
    });
    const errorsIn = async (rel) =>
      (await eslint.lintFiles([join(tmp, rel)]))
        .flatMap((r) => r.messages)
        .filter((m) => m.ruleId === "boundaries/dependencies");

    assert.ok(
      (await errorsIn("src/core/uses-adapter.ts")).length > 0,
      "core importing an adapter must fail",
    );
    assert.ok(
      (await errorsIn("src/core/uses-app.ts")).length > 0,
      "core importing the app layer must fail",
    );
    assert.ok(
      (await errorsIn("src/adapters/uses-app.ts")).length > 0,
      "an adapter importing the app layer must fail",
    );
    assert.deepEqual(
      await errorsIn("src/adapters/disk.ts"),
      [],
      "an adapter implementing a core port is allowed",
    );
    assert.deepEqual(
      await errorsIn("src/app.ts"),
      [],
      "the app layer wiring an adapter is allowed",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(
  `✓ hexagonal gate: I/O banned outside adapters and the composition root (process, fetch included), ` +
    `core ⊄ adapter/app and adapter ⊄ app, ${IO_LEGACY.length} grandfathered files each still doing I/O, list not grown`,
);
