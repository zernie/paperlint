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

/** One stop's page: its number and when it runs, its title, what it checks, then a real finding. */
export function Panel({ s }: { readonly s: Stop }) {
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
      <p className="mt-4 max-w-prose text-body text-copy">{s.text}</p>
      <div className="mt-8">{s.example}</div>
    </div>
  );
}
