import Link from "next/link";
import { CommandLine } from "@/features/copy-command";
import { INIT } from "@/shared/config";
import { highlightCommand } from "@/shared/lib/highlight";
import { Reveal } from "@/shared/ui/reveal";
import {
  Rubric,
  SectionHeading,
  SectionLabel,
} from "@/shared/ui/section-heading";

export interface Step {
  readonly command: string;
  readonly caption: string;
}

/** A command with its caption and Copy button, highlighted here, at build time. */
const Command = ({ s }: { readonly s: Step }) => (
  <CommandLine
    command={s.command}
    line={highlightCommand(s.command)}
    caption={s.caption}
  />
);

/**
 * Install, right after the road of checks: the one install command, then the commands for each
 * paper, each with its caption and a Copy button. The Claude Code plugin is one line at the end,
 * linked to /integrations (site/CLAUDE.md, "The Linter First").
 */
export function Install({ perPaper }: { readonly perPaper: readonly Step[] }) {
  return (
    <section data-test="install" className="py-band">
      <Reveal className="mx-auto grid max-w-page grid-cols-1 gap-x-8 gap-y-12 px-6 md:px-8 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <Rubric n="02" name="Install" />
        </div>
        <div className="lg:col-span-4">
          <SectionHeading id="install">One command to start.</SectionHeading>
          <p className="mt-6 max-w-measure text-body text-copy">
            In a terminal, in the folder that holds your papers.
          </p>
        </div>
        <div className="flex flex-col gap-10 lg:col-span-7 lg:col-start-6">
          <Command s={INIT} />
          <SectionLabel>Then, for each paper</SectionLabel>
          <div className="flex flex-col gap-8">
            {perPaper.map((s) => (
              <Command key={s.command} s={s} />
            ))}
          </div>
          <p
            data-test="integrations-link"
            className="border-t border-border pt-6 text-body text-copy"
          >
            For Claude Code users, an optional plugin runs paperlint while
            Claude Code edits your paper.{" "}
            <Link
              href="/integrations"
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              What the plugin adds and how to turn it on
            </Link>
            .
          </p>
        </div>
      </Reveal>
    </section>
  );
}
