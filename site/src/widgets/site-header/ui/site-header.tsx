import { GITHUB } from "@/shared/config";
import { Wordmark } from "@/shared/ui/wordmark";

const LINKS = [
  { href: "#journey", label: "How it works" },
  { href: "#venues", label: "Venues" },
  { href: "#get-started", label: "Get started" },
] as const;

/** The top bar: the wordmark, three anchors and the repository. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-6 md:px-8">
        <a href="#top" className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 rounded-xs bg-primary" />
          <Wordmark className="text-xl" />
        </a>
        <nav className="flex items-center gap-8 text-sm text-muted-foreground">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hidden transition-colors hover:text-foreground md:inline"
            >
              {l.label}
            </a>
          ))}
          <a
            href={GITHUB}
            className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
