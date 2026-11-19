import { cn } from "@/shared/lib/utils";

/**
 * The tool's name as the logo sets it: the serif, at its regular weight, in ink. The nav's logo and
 * the hero's first mention both use it, so the two cannot drift apart; each sets only its size.
 */
export function Wordmark({ className }: { readonly className: string }) {
  return (
    <span className={cn("font-display text-foreground", className)}>
      paperlint
    </span>
  );
}
