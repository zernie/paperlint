"use client";

import { useCopyToClipboard } from "usehooks-ts";
import { useState } from "react";
import { Button } from "@/shared/ui/button";

/** Commands to paste into a terminal: a plain caption first, then one command per line and a Copy button that copies them joined with `&&`. */
export function CommandLine({
  lines,
  caption,
}: {
  readonly lines: readonly string[];
  readonly caption: string;
}) {
  const command = lines.join(" && ");
  const [, copy] = useCopyToClipboard();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-body text-copy">{caption}</p>
      <div className="mt-4 flex items-center gap-4 rounded-md border border-border bg-surface py-3 pr-3 pl-5">
        <code className="flex min-w-0 flex-1 flex-col overflow-x-auto font-mono text-code whitespace-nowrap text-foreground">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </code>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Copy ${command}`}
          onClick={() => {
            void copy(command).then((ok) => {
              setCopied(ok);
            });
          }}
          onBlur={() => {
            setCopied(false);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
