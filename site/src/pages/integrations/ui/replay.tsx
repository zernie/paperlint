import type { ReactNode } from "react";
import { Reveal } from "@/shared/ui/reveal";
import { hookExample, type HookLine } from "../model/hook-output.ts";

/**
 * One edit in Claude Code, replayed: the person's ask, Claude Code's edit, what the lint-edited hook
 * showed it (the hook's real text, hook-example.json, held by a test at the repository root), and
 * the fix. The ask, the edit and the fix are an example. Each line fades up as it scrolls in, with
 * the site's CSS reveal: in the HTML without a script, and still under reduced motion.
 */
export function Replay() {
  return (
    <figure data-test="replay" className="flex flex-col gap-4">
      <figcaption className="text-body text-copy">
        One edit, as Claude Code shows it. The paperlint lines are what the hook
        prints; the other lines are an example.
      </figcaption>
      <div className="rounded-md border border-border bg-surface">
        <p className="border-b border-border px-5 py-3 text-label font-medium text-muted-foreground uppercase">
          Claude Code
        </p>
        <ol className="flex flex-col">
          <Turn who="you">
            <p className="text-body text-foreground">
              Cut half a page from the paper.
            </p>
          </Turn>
          <Turn who="claude">
            <p className="font-mono text-code break-all text-copy">
              <span className="font-medium text-foreground">Edit</span>{" "}
              {hookExample.file}
            </p>
          </Turn>
          <Turn who="paperlint">
            <div
              data-test="replay-hook"
              className="rounded-md bg-stone px-4 py-3 font-mono text-code text-copy"
            >
              {hookExample.lines.map((l, i) => (
                <Line key={i} l={l} />
              ))}
            </div>
          </Turn>
          <Turn who="claude">
            <p className="text-body text-foreground">
              The edit removed the Data Availability Statement, which ASE
              requires. I put it back and cut the half page from Results
              instead.
            </p>
          </Turn>
        </ol>
      </div>
    </figure>
  );
}

const WHO = {
  you: "You",
  claude: "Claude Code",
  paperlint: "paperlint",
} as const;

/** One line of the conversation: who speaks, in a narrow column, then what. */
const Turn = ({
  who,
  children,
}: {
  readonly who: keyof typeof WHO;
  readonly children: ReactNode;
}) => (
  <li
    data-test="replay-turn"
    data-test-meta={JSON.stringify({ who })}
    className="border-b border-border px-5 py-4 last:border-b-0"
  >
    <Reveal className="flex flex-col gap-2 sm:flex-row sm:gap-6">
      <p
        className={
          who === "paperlint"
            ? "shrink-0 text-label font-medium text-primary uppercase sm:w-24 sm:pt-1"
            : "shrink-0 text-label font-medium text-muted-foreground uppercase sm:w-24 sm:pt-1"
        }
      >
        {WHO[who]}
      </p>
      <div className="min-w-0 flex-1">{children}</div>
    </Reveal>
  </li>
);

/** A line of the hook's output: file and position muted, the level in its colour, the rule muted. */
const Line = ({ l }: { readonly l: HookLine }) =>
  l.kind === "blank" ? (
    <p aria-hidden>&nbsp;</p>
  ) : l.kind === "finding" ? (
    <p className="wrap-break-word whitespace-pre-wrap">
      <span className="text-muted-foreground">{l.at} </span>
      <span className={l.level === "error" ? "text-error" : "text-warn"}>
        {l.level}
      </span>{" "}
      <Quoted text={l.message} />{" "}
      <span className="text-muted-foreground">{l.rule}</span>
    </p>
  ) : (
    <p
      className={
        l.kind === "file"
          ? "break-all text-muted-foreground"
          : "wrap-break-word text-copy"
      }
    >
      {l.text}
    </p>
  );

/** A message with its `quoted` names in the string colour. */
const Quoted = ({ text }: { readonly text: string }) => (
  <>
    {text.split("`").map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} className="text-syntax-string">
          `{part}`
        </span>
      ) : (
        part
      ),
    )}
  </>
);
