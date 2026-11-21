import type { Line, Tone } from "@/shared/lib/highlight";

/** Each tone's colour, a token of globals.css (`--color-syntax-*`). */
const TONE: Readonly<Record<Tone, string>> = {
  plain: "text-foreground",
  command: "text-syntax-command",
  flag: "text-syntax-flag",
  string: "text-syntax-string",
  comment: "text-syntax-comment",
};

/** One line of code highlighted at build time: spans, no script. */
export function CodeLine({ line }: { readonly line: Line }) {
  return (
    <span>
      {line.map((t, i) => (
        <span key={i} className={TONE[t.tone]}>
          {t.content}
        </span>
      ))}
    </span>
  );
}
