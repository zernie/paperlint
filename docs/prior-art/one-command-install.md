# How an initializer adds its own package to the project

`npx paperlint init` adds paperlint to the project it runs in, so the install is one command. The
model is ESLint's initializer, `npm init @eslint/config`.

## What `@eslint/create-config` does

Read from the published package, `@eslint/create-config` 3.2.0 (`npm pack @eslint/create-config`,
2026-11-22; source at https://github.com/eslint/create-config):

| step                | what it does                                                                                                                                           | where                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| no `package.json`   | stops: "A package.json file is necessary to initialize ESLint. Run `npm init` to create a package.json file and try again."                            | `bin/create-config.js`                              |
| what it installs    | `eslint` and the plugins the answers chose, unpinned, into devDependencies                                                                             | `lib/config-generator.js`, `result.devDependencies` |
| asking              | a toggle "Would you like to install them now?" with Yes preselected (`initial: 1`), then "Which package manager do you want to use?" npm/yarn/pnpm/bun | `lib/questions.js`, `installationQuestions`         |
| the package manager | asked, never read from a lockfile; default npm                                                                                                         | the same                                            |
| the command         | `spawn.sync(<manager>, [yarn ? "add" : "install", "-D", ...packages])`                                                                                 | `lib/utils/npm-utils.js`, `installSyncSaveDev`      |
| No                  | writes the config anyway and warns "You will need to install the dependencies yourself."                                                               | `lib/config-generator.js`, `output()`               |
| Ctrl+C              | "Operation canceled", exit 1                                                                                                                           | `bin/create-config.js`                              |
| without a terminal  | no flag skips the questions                                                                                                                            |                                                     |

## What paperlint does differently, and why

- **The version is pinned to the running one** (`paperlint@<version>`, saved exact). The command
  that ran and the package it installed cannot drift; ESLint installs whatever is latest.
- **The package manager comes from the lockfile** (`package-lock.json`, `pnpm-lock.yaml`,
  `yarn.lock`, `bun.lock` or `bun.lockb`), npm when there is none: the project already chose one.
- **A missing `package.json` is created** (`private: true`, the folder's name), and said in one
  line: the paper repositories this is for are often not JavaScript projects.
- **Without a terminal it installs without asking**, printing the command: that is what running
  `init` asked for. ESLint has no such path.
- **Already installed at another version**: said, and kept. Nothing is upgraded or downgraded
  silently.
