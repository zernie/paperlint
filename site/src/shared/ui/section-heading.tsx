import type { ReactNode } from "react";

/** A section's label and headline, set in the grid's first four columns. */
export function SectionHeading({
  label,
  children,
  id,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly id?: string;
}) {
  return (
    <div className="lg:col-span-8">
      <p className="text-label font-medium text-muted-foreground uppercase">
        {label}
      </p>
      <h2
        id={id}
        className="mt-4 scroll-mt-24 font-display text-display text-foreground"
      >
        {children}
      </h2>
    </div>
  );
}
