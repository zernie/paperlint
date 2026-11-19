import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";

// next/font downloads each font once, at build time, and serves it from this site: a visitor's
// browser never asks Google for anything. Each sets one variable on <html>; globals.css turns them
// into the `font-display`, `font-sans` and `font-mono` classes. Newsreader carries its optical-size
// axis, so the browser draws the 112px headline from the display cut, not the text cut.
const display = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
});
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

/** The class names that set the three font variables, for the root <html>. */
export const fontVariables = [display, sans, mono]
  .map((f) => f.variable)
  .join(" ");
