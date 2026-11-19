import type { ReactNode } from "react";

/** A small, letter-spaced label: a field's name, a caption, a note's title. */
export function SectionLabel({ children }: { readonly children: ReactNode }) {
  return (
    <p className="text-label font-medium text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/**
 * A section's rubric, as in a magazine: a thin rule across the page, the section's number and name
 * on the left, and a short deck on the right from a tablet up.
 */
export function Rubric({
  n,
  name,
  deck,
}: {
  readonly n: string;
  readonly name: string;
  readonly deck: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-8 border-t border-foreground pt-4 text-label font-medium text-muted-foreground uppercase">
      <p>
        <span className="text-foreground">{n}</span> — {name}
      </p>
      <p className="hidden md:block">{deck}</p>
    </div>
  );
}

/** A section's headline: the serif, large and light. */
export function SectionHeading({
  children,
  id,
}: {
  readonly children: ReactNode;
  readonly id?: string;
}) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 font-display text-display font-quiet text-foreground"
    >
      {children}
    </h2>
  );
}
