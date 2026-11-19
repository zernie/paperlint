import { CommandLine } from "@/features/copy-command";
import { NODE } from "@/shared/config";
import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";

export interface Step {
  readonly command: string;
  readonly caption: string;
}

/** Install and first run: Node first, then each README command with its plain caption. */
export function GetStarted({
  install,
  perPaper,
}: {
  readonly install: readonly Step[];
  readonly perPaper: readonly Step[];
}) {
  return (
    <section className="mx-auto max-w-page px-6 pt-section md:px-8">
      <Reveal className="grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-12">
        <SectionHeading label="Get started" id="get-started">
          A few commands, once.
        </SectionHeading>
        <div className="lg:col-span-8 lg:col-start-5">
          <div className="max-w-prose rounded-md bg-card p-8">
            <p className="font-display text-subtitle text-foreground">
              New to the terminal?
            </p>
            <p className="mt-2 text-body text-copy">
              paperlint runs on{" "}
              <a
                href={NODE}
                className="underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                Node.js
              </a>
              , version 22.13 or newer. Type the commands one at a time in a
              terminal opened in the folder that holds, or will hold, your
              papers. To build PDFs you also need TeX Live:{" "}
              <code className="font-mono text-code">
                npx paperlint toolchain
              </code>{" "}
              installs it on Linux and macOS (about 270 MB, once). On Windows,
              install TeX Live yourself.
            </p>
          </div>
          <ol className="mt-16 flex flex-col gap-12">
            {install.map((s, i) => (
              <li key={s.command} className="grid grid-cols-8 gap-x-8">
                <span className="col-span-1 font-display text-title text-muted-foreground">
                  {i + 1}
                </span>
                <div className="col-span-7">
                  <CommandLine {...s} />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-20 text-label font-medium text-muted-foreground uppercase">
            Then, for each paper
          </p>
          <div className="mt-8 flex flex-col gap-12">
            {perPaper.map((s) => (
              <CommandLine key={s.command} {...s} />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
