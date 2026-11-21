"use client";

import { useCopyToClipboard } from "usehooks-ts";
import { useState } from "react";
import type { Line } from "@/shared/lib/highlight";
import { Button } from "@/shared/ui/button";
import { CodeLine } from "@/shared/ui/code-line";

/**
 * A command to paste into a terminal: a plain caption first, then the command, highlighted at build
 * time (`line`, from src/shared/lib/highlight), and a Copy button that copies `command`.
 */
export function CommandLine({
  command,
  line,
  caption,
}: {
  readonly command: string;
  readonly line: Line;
  readonly caption: string;
}) {
  const [, copy] = useCopyToClipboard();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-body text-copy">{caption}</p>
      <div className="mt-4 flex items-center gap-4 rounded-md border border-border bg-surface py-3 pr-3 pl-5">
        <code
          data-test="command"
          data-test-meta={JSON.stringify({ command })}
          className="min-w-0 flex-1 overflow-x-auto font-mono text-code whitespace-nowrap"
        >
          <CodeLine line={line} />
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
