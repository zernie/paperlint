"use client";

import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

/**
 * A word or a row with a short note: the note opens on hover, on keyboard focus and on a tap.
 * Radix's Tooltip and HoverCard never open on a touch screen, and half the readers are on a
 * phone, so this is a Popover that also follows the pointer.
 */
export function Hint({
  children,
  note,
  className,
}: {
  readonly children: ReactNode;
  readonly note: ReactNode;
  readonly className: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={className}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setOpen(false);
        }}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={8}
        collisionPadding={16}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
        className="z-50 max-w-xs rounded-md border border-border bg-surface px-4 py-3 text-sm text-copy data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      >
        {note}
      </PopoverContent>
    </Popover>
  );
}

/** A term a scientist may not know, underlined with dots; its meaning opens on hover or tap. */
export function Term({
  children,
  means,
}: {
  readonly children: ReactNode;
  readonly means: string;
}) {
  return (
    <Hint
      note={means}
      className="cursor-help underline decoration-muted-foreground decoration-dotted underline-offset-4"
    >
      {children}
    </Hint>
  );
}
