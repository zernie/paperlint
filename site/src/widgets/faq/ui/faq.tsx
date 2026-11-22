"use client";

import type { ReactNode } from "react";
import { glossary, NODE } from "@/shared/config";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion";
import { Term } from "@/shared/ui/hint";
import { Reveal } from "@/shared/ui/reveal";
import { Rubric, SectionHeading } from "@/shared/ui/section-heading";

/**
 * The questions a scientist who does not program asks first, folded. Each answer is checked
 * against README.md, docs/install.md and docs/references.md.
 */
export function Faq() {
  const questions: readonly { readonly q: string; readonly a: ReactNode }[] = [
    {
      q: "What do I need on my computer?",
      a: (
        <p>
          <a
            href={NODE}
            className="underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Node.js
          </a>{" "}
          22.13 or newer, which runs paperlint. To build PDFs you also need{" "}
          <Term means={glossary.texLive}>TeX Live</Term>:{" "}
          <code className="font-mono text-code">npx paperlint toolchain</code>{" "}
          installs it on Linux and macOS (about 270 MB, once). On Windows,
          install TeX Live yourself.
        </p>
      ),
    },
    {
      q: "Do I need to know how to program?",
      a: <p>No. You copy a few commands into a terminal.</p>,
    },
    {
      q: "Does it change my paper?",
      a: (
        <p>
          Not unless you ask. Checking only reads your paper and reports. If you
          turn on the writing set, a fix command can rewrite three small
          typographic slips (§ to “Section”, .05 to 0.05, one style of figure
          reference) and nothing else. Building writes the PDF and its records
          next to your paper; creating a paper never touches a paper.tex that
          already exists.
        </p>
      ),
    },
    {
      q: "Is my paper sent anywhere?",
      a: (
        <p>
          Checking runs on your computer and works offline. Building looks up
          each reference in public catalogues (Crossref, OpenAlex, Semantic
          Scholar, arXiv, doi.org and DBLP), sending only that reference&apos;s
          DOI, arXiv id or title. The answers are kept for 30 days.
        </p>
      ),
    },
  ];
  return (
    <section data-test="faq" className="py-band">
      <Reveal className="mx-auto grid max-w-page grid-cols-1 gap-x-8 gap-y-12 px-6 md:px-8 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <Rubric n="04" name="Questions" />
        </div>
        <div className="lg:col-span-4">
          <SectionHeading id="questions">What people ask first.</SectionHeading>
        </div>
        <Accordion
          type="multiple"
          className="border-b border-border lg:col-span-7 lg:col-start-6"
        >
          {questions.map(({ q, a }) => (
            <AccordionItem key={q} value={q} className="border-t border-border">
              <AccordionTrigger className="group flex w-full items-baseline justify-between gap-6 py-6 text-left font-display text-subtitle text-foreground hover:text-primary">
                {q}
                <span
                  aria-hidden
                  className="shrink-0 font-sans text-xl text-muted-foreground transition-transform group-data-open:rotate-45"
                >
                  +
                </span>
              </AccordionTrigger>
              <AccordionContent className="overflow-hidden data-open:animate-accordion-down data-closed:animate-accordion-up">
                <div className="max-w-prose pb-8 text-body text-copy">{a}</div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}
