import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";

// next/font downloads each font once, at build time, and serves it from this site: a visitor's
// browser never asks Google for anything. Each sets one variable on <html>; globals.css turns them
// into the `font-display`, `font-sans` and `font-mono` classes.
const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
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
