import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * Fades its children up into place as they scroll into view. Pure CSS (the `reveal` utility in
 * globals.css, a scroll-driven animation), so the content is in the HTML and visible without
 * JavaScript, in a browser without scroll timelines, and for a reader who asks for less motion.
 */
export function Reveal({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("reveal", className)}>{children}</div>;
}
