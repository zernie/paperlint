import type { Explained } from "../model/explain.ts";

const LEVEL = { error: "Must fix", warning: "Advice" } as const;

/**
 * What the terminal prints for the finding, shown open on a soft stone ground: the file and the
 * line muted, the level in its colour, the message, the rule id muted.
 */
const Terminal = ({ f }: { readonly f: Explained }) => (
  <div
    data-test="finding-output"
    data-test-meta={JSON.stringify({ rule: f.rule, level: f.level })}
    className="mt-4 rounded-md bg-stone px-4 py-3 font-mono text-code text-copy"
  >
    {f.file === undefined ? null : (
      <p className="break-all text-muted-foreground">{f.file}</p>
    )}
    <p className="wrap-break-word whitespace-pre-wrap">
      {f.at === undefined ? null : (
        <span className="text-muted-foreground">
          {f.at}
          {"  "}
        </span>
      )}
      <span className={f.level === "error" ? "text-signal" : "text-warn"}>
        {f.level}
      </span>
      {"  "}
      {f.message}
      {"  "}
      <span className="text-muted-foreground">{f.rule}</span>
    </p>
  </div>
);

/** One finding: its plain words first, then what the terminal says, open. */
export function FindingRow({ f }: { readonly f: Explained }) {
  return (
    <div
      data-test="finding"
      data-test-meta={JSON.stringify({ rule: f.rule })}
      className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-border py-6 sm:grid-cols-4 lg:grid-cols-1"
    >
      <p
        className={
          f.level === "error"
            ? "text-label font-medium text-error uppercase"
            : "text-label font-medium text-warn uppercase"
        }
      >
        {LEVEL[f.level]}
      </p>
      <div className="min-w-0 sm:col-span-3 lg:col-span-1">
        <h3 className="font-display text-subtitle text-foreground">
          {f.title}
        </h3>
        <p className="mt-2 max-w-prose text-body text-copy">{f.plain}</p>
        <Terminal f={f} />
      </div>
    </div>
  );
}
