import Link from "next/link";
import { GITHUB } from "@/shared/config";
import { Wordmark } from "@/shared/ui/wordmark";

// Absolute, so the same bar works on /integrations: on the home page "/#venues" scrolls in place.
const LINKS = [
  { href: "/#install", label: "Install" },
  { href: "/#venues", label: "Venues" },
  { href: "/integrations", label: "Integrations" },
] as const;

/** The top bar: the wordmark, two anchors on the home page, the integrations page and the repository. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-6 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 rounded-xs bg-primary" />
          <Wordmark className="text-xl" />
        </Link>
        <nav className="flex items-center gap-8 text-sm text-muted-foreground">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              data-test="nav-link"
              data-test-meta={JSON.stringify({ href: l.href })}
              className="hidden transition-colors hover:text-foreground md:inline"
            >
              {l.label}
            </Link>
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
