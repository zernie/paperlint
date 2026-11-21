import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CommandLine } from "@/features/copy-command";
import { readRepo } from "@/shared/api";
import { GITHUB, INIT } from "@/shared/config";
import { highlightCommand } from "@/shared/lib/highlight";
import { readmeContent } from "@/shared/lib/readme";
import { SectionLabel } from "@/shared/ui/section-heading";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import { pluginSteps } from "../model/plugin.ts";
import { Replay } from "./replay.tsx";

const readme = readmeContent(readRepo("README.md"));
const packageName = (
  JSON.parse(readRepo("package.json")) as { readonly name: string }
).name;
const byHand = pluginSteps(GITHUB, packageName);

const link =
  "text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground";

const Code = ({ children }: { readonly children: ReactNode }) => (
  <code className="font-mono text-code text-foreground">{children}</code>
);

/** A command with its caption and Copy button, highlighted at build time. */
const Command = ({
  s,
}: {
  readonly s: { readonly command: string; readonly caption: string };
}) => (
  <CommandLine
    command={s.command}
    line={highlightCommand(s.command)}
    caption={s.caption}
  />
);

export const metadata: Metadata = {
  title: "paperlint and Claude Code — an optional plugin",
  description:
    "paperlint's checks are fixed rules and send nothing to an AI model. For Claude Code users, an optional plugin, off until you turn it on, adds skills and hooks that run paperlint.",
};

/** One part of the page: a serif title, then plain paragraphs. */
const Part = ({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <section
    data-test="integrations-part"
    data-test-meta={JSON.stringify({ id })}
    className="border-t border-border py-8"
  >
    <h2 className="font-display text-title text-foreground">{title}</h2>
    <div className="mt-4 flex max-w-prose flex-col gap-4 text-body text-copy">
      {children}
    </div>
  </section>
);

/**
 * paperlint.dev/integrations: the one place the Claude Code plugin is described (site/CLAUDE.md,
 * "The Linter First"). Written for a researcher who distrusts AI tools: the plugin is opt-in, then
 * one edit replayed with the hook's real output, what else it adds, what stays the same, how to
 * turn it on. Each sentence is checked against docs/install.md, docs/skills.md,
 * plugin/hooks/hooks.json and the hooks' own sources.
 */
export function IntegrationsPage() {
  return (
    <>
      <SiteHeader />
      <main data-test="integrations" className="py-band">
        <div className="mx-auto grid max-w-page grid-cols-1 gap-x-8 gap-y-12 px-6 md:px-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>Integrations</SectionLabel>
            <h1 className="mt-6 font-display text-display font-quiet text-foreground">
              paperlint and Claude Code.
            </h1>
            <p
              data-test="opt-in"
              className="mt-6 max-w-measure text-lead font-medium text-foreground"
            >
              Optional. It stays off until you turn it on.
            </p>
            <p className="mt-4 max-w-measure text-lead text-copy">
              paperlint works on its own. For people who use{" "}
              <a href="https://claude.com/claude-code" className={link}>
                Claude Code
              </a>
              , Anthropic&apos;s coding assistant, a plugin lets it run
              paperlint while it works on your paper.
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <Replay />
          </div>

          <div className="border-b border-border lg:col-span-7 lg:col-start-6">
            <Part id="adds" title="What else it adds">
              <p>
                Two more hooks: one refuses a new file in the wrong place in the
                paper folder, and one holds a submission to a venue&apos;s
                portal until you have said yes to that paper and its PDF.
              </p>
              <p>
                Skills: instructions Claude Code follows when you ask it for a
                step of the work, such as &ldquo;is it ready to submit?&rdquo;.{" "}
                <a href={`${GITHUB}/blob/main/docs/skills.md`} className={link}>
                  The list of skills
                </a>
                .
              </p>
            </Part>

            <Part id="same" title="What stays the same">
              <p>
                <Code>paperlint lint</Code> reports the same findings with the
                plugin installed, in your terminal and in CI. Nothing in
                paperlint sends your paper to an AI model, and the hooks run on
                your computer.
              </p>
            </Part>

            <Part id="turn-on" title="How to turn it on">
              <p>
                Run the install command from the{" "}
                <Link href="/#install" className={link}>
                  main page
                </Link>
                . When it finds Claude Code, it asks &ldquo;Enable the paperlint
                plugin for Claude Code?&rdquo;, with Yes preselected; answer No
                to leave it off. With <Code>--yes</Code> or in CI it asks
                nothing and leaves the plugin off, and{" "}
                <Code>npx paperlint init --plugin</Code> turns it on without
                asking.
              </p>
              <div className="mt-4">
                <Command s={INIT} />
              </div>
              <p className="mt-6 text-label font-medium text-muted-foreground uppercase">
                Or add it by hand, inside Claude Code
              </p>
              <p>
                The plugin runs the copy of paperlint that{" "}
                <Code>npx paperlint init</Code> adds to your project, so run
                that first.
              </p>
              <div className="mt-4 flex flex-col gap-8">
                {byHand.map((s) => (
                  <Command key={s.command} s={s} />
                ))}
              </div>
            </Part>
          </div>
        </div>
      </main>
      <SiteFooter disclaimer={readme.disclaimer} />
    </>
  );
}
