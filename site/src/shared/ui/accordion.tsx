"use client";

import { Accordion as AccordionPrimitive } from "radix-ui";

// The Radix parts, unstyled: each use sets its own classes from the design tokens. The shadcn
// registry's copy ships raw values and lucide icons, which site/eslint.config.mjs refuses.

function Accordion(
  props: React.ComponentProps<typeof AccordionPrimitive.Root>,
) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem(
  props: React.ComponentProps<typeof AccordionPrimitive.Item>,
) {
  return <AccordionPrimitive.Item data-slot="accordion-item" {...props} />;
}

function AccordionTrigger(
  props: React.ComponentProps<typeof AccordionPrimitive.Trigger>,
) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger data-slot="accordion-trigger" {...props} />
    </AccordionPrimitive.Header>
  );
}

function AccordionContent(
  props: React.ComponentProps<typeof AccordionPrimitive.Content>,
) {
  return (
    <AccordionPrimitive.Content data-slot="accordion-content" {...props} />
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
