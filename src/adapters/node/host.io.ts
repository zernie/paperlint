/**
 * What the host knows and the environment does not say — the home, the temp directory, the cwd —
 * read once. A composition root calls this and passes the value in; nothing below it reads the host
 * again. Which of these a tool cares about, and what it derives from them, is that tool's adapter's
 * business (banal's: `adapters/banal/settings.ts`).
 */
import { homedir, tmpdir } from "node:os";
import type { HostDirs } from "../../domain/host.ts";

export const hostDirs = (over: Partial<HostDirs> = {}): HostDirs => ({
  home: homedir(),
  tmp: tmpdir(),
  cwd: process.cwd(),
  ...over,
});
