"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible";

interface FindingRowProps {
  readonly level: "error" | "warning";
  readonly title: string;
  readonly plain: string;
  readonly rule: string;
  /** The exact output, folded under the plain words. */
  readonly raw: string;
}

const LEVEL = { error: "Must fix", warning: "Advice" } as const;

/** One finding: its plain words first, the exact output one click away. */
export function FindingRow({
  level,
  title,
  plain,
  rule,
  raw,
}: FindingRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-border py-8 sm:grid-cols-4"
    >
      <p
        className={
          level === "error"
            ? "text-label font-medium text-error uppercase"
            : "text-label font-medium text-warn uppercase"
        }
      >
        {LEVEL[level]}
      </p>
      <div className="sm:col-span-3">
        <h3 className="font-display text-subtitle text-foreground">{title}</h3>
        <p className="mt-3 max-w-prose text-body text-copy">{plain}</p>
        <CollapsibleTrigger className="mt-4 text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground">
          {open ? "Hide what the terminal says" : "Show what the terminal says"}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 overflow-x-auto rounded-md bg-card px-4 py-3 font-mono text-code text-copy">
          <p className="whitespace-pre">{raw}</p>
          <p className="mt-1 text-muted-foreground">{rule}</p>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
