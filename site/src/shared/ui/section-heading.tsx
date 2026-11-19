import type { ReactNode } from "react";

/**
 * A section's label, after a small square marker as on zernie.com, set uppercase. On night the
 * marker is sand and the label light; elsewhere the marker is the accent.
 */
export function SectionLabel({
  children,
  night = false,
}: {
  readonly children: ReactNode;
  readonly night?: boolean;
}) {
  return (
    <p
      className={
        night
          ? "flex items-center gap-3 text-label font-medium text-on-ink-muted uppercase"
          : "flex items-center gap-3 text-label font-medium text-muted-foreground uppercase"
      }
    >
      <span
        aria-hidden
        className={
          night ? "size-2 shrink-0 bg-sand" : "size-2 shrink-0 bg-primary"
        }
      />
      {children}
    </p>
  );
}

/** A section's label and headline, set in the grid's first eight columns. */
export function SectionHeading({
  label,
  children,
  id,
  night = false,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly id?: string;
  /** Set on the night band: light text, a sand marker. */
  readonly night?: boolean;
}) {
  return (
    <div className="lg:col-span-8">
      <SectionLabel night={night}>{label}</SectionLabel>
      <h2
        id={id}
        className={
          night
            ? "mt-4 scroll-mt-24 font-display text-display text-on-ink"
            : "mt-4 scroll-mt-24 font-display text-display text-foreground"
        }
      >
        {children}
      </h2>
    </div>
  );
}
