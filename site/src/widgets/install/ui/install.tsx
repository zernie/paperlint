import Link from "next/link";
import { CommandLine } from "@/features/copy-command";
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

const Commands = ({ steps }: { readonly steps: readonly Step[] }) => (
  <div className="flex flex-col gap-8">
    {steps.map((s) => (
      <CommandLine key={s.command} lines={[s.command]} caption={s.caption} />
    ))}
  </div>
);

/**
 * Install, right after the road of checks: the README's install commands, then the commands for
 * each paper, each with its caption and a Copy button. The Claude Code plugin is one line at the
 * end, linked to /integrations (site/CLAUDE.md, "The Linter First").
 */
export function Install({
  install,
  perPaper,
}: {
  readonly install: readonly Step[];
  readonly perPaper: readonly Step[];
}) {
  return (
    <section data-test="install" className="py-band">
      <Reveal className="mx-auto grid max-w-page grid-cols-1 gap-x-8 gap-y-12 px-6 md:px-8 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <Rubric n="02" name="Install" />
        </div>
        <div className="lg:col-span-4">
          <SectionHeading id="install">Two commands to start.</SectionHeading>
          <p className="mt-6 max-w-measure text-body text-copy">
            In a terminal, in the folder that holds your papers.
          </p>
        </div>
        <div className="flex flex-col gap-10 lg:col-span-7 lg:col-start-6">
          <Commands steps={install} />
          <SectionLabel>Then, for each paper</SectionLabel>
          <Commands steps={perPaper} />
          <p
            data-test="integrations-link"
            className="border-t border-border pt-6 text-body text-copy"
          >
            If you already use Claude Code, an optional plugin connects it to
            paperlint.{" "}
            <Link
              href="/integrations"
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              What it adds, and what it never does
            </Link>
            .
          </p>
        </div>
      </Reveal>
    </section>
  );
}
