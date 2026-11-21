import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CommandLine } from "@/features/copy-command";
import { readRepo } from "@/shared/api";
import { GITHUB } from "@/shared/config";
import { readmeContent } from "@/shared/lib/readme";
import { SectionLabel } from "@/shared/ui/section-heading";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import { pluginSteps } from "../model/plugin.ts";

const readme = readmeContent(readRepo("README.md"));
const packageName = (
  JSON.parse(readRepo("package.json")) as { readonly name: string }
).name;
const steps = pluginSteps(GITHUB, packageName);

const link =
  "text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground";

const Code = ({ children }: { readonly children: ReactNode }) => (
  <code className="font-mono text-code text-foreground">{children}</code>
);

export const metadata: Metadata = {
  title: "paperlint and Claude Code — an optional plugin",
  description:
    "paperlint's linter is deterministic and sends nothing to an AI model. For people who already use Claude Code, an optional plugin adds skills and hooks that run paperlint.",
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
 * "The Linter First"). Written for a researcher who distrusts AI tools: what the linter is without
 * it, what the plugin adds, what it never does, how to turn it on. Each sentence is checked against
 * docs/install.md, docs/skills.md, plugin/hooks/hooks.json and the hooks' own sources.
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
            <p className="mt-6 max-w-measure text-lead text-copy">
              The linter does not need Claude Code. If you already use{" "}
              <a href="https://claude.com/claude-code" className={link}>
                Claude Code
              </a>
              , Anthropic&apos;s coding assistant, an optional plugin lets it
              run paperlint while it works on your paper.
            </p>
          </div>

          <div className="border-b border-border lg:col-span-7 lg:col-start-6">
            <Part id="linter" title="The linter is deterministic">
              <p>
                paperlint&apos;s checks are fixed rules written as code, not a
                model: the same files give the same findings. Nothing in{" "}
                <Code>paperlint lint</Code> or <Code>paperlint build</Code>{" "}
                sends your paper to an AI model. Building sends only each
                reference&apos;s DOI, arXiv id or title to public catalogues, to
                check that the work exists.
              </p>
              <p>
                If you do not use Claude Code, you can stop reading here:
                nothing else on this site needs it.
              </p>
            </Part>

            <Part id="adds" title="What the plugin adds">
              <p>
                <span className="font-medium text-foreground">Skills.</span>{" "}
                Written instructions Claude Code follows when you ask it for a
                step of the work, such as &ldquo;where does my paper
                stand?&rdquo; or &ldquo;is it ready to submit?&rdquo;. Several
                of them run <Code>paperlint build</Code> or{" "}
                <Code>paperlint lint</Code> and start from what it reports.{" "}
                <a href={`${GITHUB}/blob/main/docs/skills.md`} className={link}>
                  The list of skills
                </a>
                .
              </p>
              <p>
                <span className="font-medium text-foreground">Hooks.</span>{" "}
                Small programs Claude Code runs around its own edits. After it
                edits a file in your paper, one runs paperlint on that file and
                shows Claude Code the errors the edit introduced, so it fixes
                them in the same turn. Others refuse a new file in the wrong
                place in the paper folder, and stop a submission to a
                venue&apos;s portal until you have said yes to that paper and
                its PDF.
              </p>
            </Part>

            <Part id="never" title="What it never does">
              <p>
                It never changes what <Code>paperlint lint</Code> reports. The
                hook that lints after an edit runs the same check with the same
                rules, so your findings in a terminal or in CI are the same with
                the plugin or without it.
              </p>
              <p>
                It calls no model on its own. The skills are text Claude Code
                reads when you ask it for something; the hooks are programs on
                your computer that call no model and send nothing anywhere.
              </p>
            </Part>

            <Part id="turn-on" title="How to turn it on">
              <p>
                Install paperlint in your project first, with the{" "}
                <Link href="/#install" className={link}>
                  two commands on the main page
                </Link>
                : the plugin&apos;s hooks run that copy.{" "}
                <Code>npx paperlint init</Code> then asks whether to add the
                plugin. Or add it yourself, inside Claude Code:
              </p>
              <div className="mt-4 flex flex-col gap-8">
                {steps.map((s) => (
                  <CommandLine
                    key={s.command}
                    lines={[s.command]}
                    caption={s.caption}
                  />
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
