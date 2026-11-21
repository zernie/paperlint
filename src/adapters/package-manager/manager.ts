/**
 * Which package manager a project uses, read from its lockfile, and how that manager adds a
 * devDependency saved at an exact version. npm when no lockfile is there: it ships with Node.
 */
import type { Argv } from "../../ports/project-install.ts";

export type Manager = "npm" | "pnpm" | "yarn" | "bun";

/** Each lockfile and its manager, in the order they are looked for. */
export const LOCKFILES: readonly (readonly [string, Manager])[] = [
  ["package-lock.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
];

/** The manager of the first lockfile `present` says is there; npm when none is. */
export const managerOf = (present: (file: string) => boolean): Manager =>
  LOCKFILES.find(([file]) => present(file))?.[1] ?? "npm";

const ADD: Readonly<Record<Manager, Argv>> = {
  npm: ["npm", "install", "--save-dev", "--save-exact"],
  pnpm: ["pnpm", "add", "--save-dev", "--save-exact"],
  yarn: ["yarn", "add", "--dev", "--exact"],
  bun: ["bun", "add", "--dev", "--exact"],
};

/** The command that adds `spec` to devDependencies with `manager`. */
export const addCommand = (manager: Manager, spec: string): Argv => {
  const [file, ...flags] = ADD[manager];
  return [file, ...flags, spec];
};
