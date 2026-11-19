import type { ReactNode } from "react";

export interface Stop {
  readonly n: string;
  /** The stop's name on the road, one or two words. */
  readonly short: string;
  readonly when: string;
  readonly title: string;
  readonly text: ReactNode;
  readonly badge: string;
  /** Whether the stop's checks run without the author turning them on. */
  readonly on: boolean;
  readonly example: ReactNode;
}

const Badge = ({ s }: { readonly s: Stop }) => (
  <p
    className={
      s.on
        ? "inline-block rounded-full border border-primary px-3 py-1 text-sm text-primary"
        : "inline-block rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
    }
  >
    {s.badge}
  </p>
);

/**
 * One stop's page: its number and when it runs, its title, what it checks, and a real finding.
 * `split` sets the words and the example side by side under the title from a laptop up; otherwise
 * the example follows the words.
 */
export function Panel({
  s,
  split = false,
}: {
  readonly s: Stop;
  readonly split?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-label font-medium text-muted-foreground uppercase">
          {s.n} · {s.when}
        </p>
        <Badge s={s} />
      </div>
      <h3 className="mt-4 font-display text-title text-foreground">
        {s.title}
      </h3>
      <div
        className={
          split
            ? "mt-6 grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-12"
            : "mt-4 grid grid-cols-1 gap-y-8"
        }
      >
        <p
          className={
            split
              ? "max-w-prose text-body text-copy lg:col-span-4"
              : "max-w-prose text-body text-copy"
          }
        >
          {s.text}
        </p>
        <div className={split ? "lg:col-span-8" : ""}>{s.example}</div>
      </div>
    </div>
  );
}
