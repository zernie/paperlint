// CLEAN: the same shapes as bad.tsx, written with the design tokens.
import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

export function Clean({ on }: { readonly on: boolean }) {
  const [count, setCount] = useState(0);
  return (
    <section className="max-w-page bg-background px-6 pt-band">
      <h1 className="font-display text-cover text-foreground">paperlint</h1>
      <p className={cn("text-lead text-copy", on && "text-muted-foreground")}>
        {count}
      </p>
      <Button
        className="rounded-md"
        onClick={() => {
          setCount(count + 1);
        }}
      >
        Count
      </Button>
    </section>
  );
}
