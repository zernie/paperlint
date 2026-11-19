"use client";

import { useCopyToClipboard } from "usehooks-ts";
import { useState } from "react";
import { Button } from "@/shared/ui/button";

/** One command to paste into a terminal: a plain caption first, then the command and a Copy button. */
export function CommandLine({
  command,
  caption,
}: {
  readonly command: string;
  readonly caption: string;
}) {
  const [, copy] = useCopyToClipboard();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-body text-copy">{caption}</p>
      <div className="mt-4 flex items-center gap-4 rounded-md border border-border bg-surface py-3 pr-3 pl-5">
        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-code whitespace-nowrap text-foreground">
          {command}
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
