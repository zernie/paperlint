# Which library draws `paperlint init`'s questions

`paperlint init` asked its questions through `node:readline` until 2026-11-22, typed as
`[Y/n]` text. They now go through one port (`src/ports/prompts.ts`: a yes/no, a choice, a line of
text), drawn by `@clack/prompts` in `src/adapters/clack/`.

## The candidates, measured 2026-11-22

Each package installed alone into an empty directory with npm; downloads from api.npmjs.org for the
week 2026-11-14 to 2026-11-20.

| package             | version | packages installed | on disk | downloads a week | last release |
| ------------------- | ------- | ------------------ | ------- | ---------------- | ------------ |
| `@clack/prompts`    | 1.9.0   | 6                  | 336 KB  | 48.6 M           | 2026-11-09   |
| `@inquirer/prompts` | 8.8.0   | 27                 | 1900 KB | 66.4 M           |              |
| `@inquirer/confirm` | 6.4.0   | 13                 | 672 KB  |                  |              |
| `prompts`           | 2.4.2   | 3                  | 476 KB  | 98.2 M           | 2023-10      |
| `enquirer`          | 2.4.1   | 4                  | 424 KB  | 50.9 M           | 2023-07      |

**Chosen: `@clack/prompts`**, pinned. The smallest on disk of the maintained ones (`prompts` and
`enquirer` have not released since 2023), and it has the three questions init asks
(`confirm`, `select`, `text`) plus a cancel value (`isCancel`).

## Two behaviours, measured on a pseudo-terminal

- **Ctrl+C.** Under readline, Ctrl+C at a question rejected it, the rejection was read as "no
  answer", and the question's default was taken: a Ctrl+C at the hooks question wired the hooks,
  and the run went on and exited 0. Under clack it is a cancel: init prints one line, writes nothing
  after that question, and exits 130 (`CANCELLED_CODE` in `src/init.ts`).
- **Width.** Clack redraws a question by moving the cursor up as many lines as it drew. On a
  pseudo-terminal with no size set it counted every character as a line (`ESC[2280A`), so a test
  that drives it on a pseudo-terminal sets the window size first.
