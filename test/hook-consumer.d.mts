export function hookConsumer(
  dir: string,
  files?: Record<string, string>,
): string;
export function runShippedHook(
  name: string,
  input: unknown,
  dir: string,
): { exitCode: number; stdout: string; stderr: string; blocked: boolean };
export function onEdit(file_path: string): unknown;
export function onBash(command: string): unknown;
