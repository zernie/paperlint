/** The project's package manager (npm, pnpm, yarn, bun), as the `ProjectInstall` port. */
export { projectInstall } from "./install.io.ts";
export { addCommand, managerOf, LOCKFILES, type Manager } from "./manager.ts";
