// Syntax highlighting at build time. Shiki tokenises a command or a JSON file with the grammars VS
// Code uses; the page receives the tokens, each with a named tone, and renders them as spans whose
// class is a design token (src/shared/ui/code-line.tsx). No highlighter reaches the browser: only
// server components call this, and `next build` writes the result into the static HTML.
//
// Shiki's own `css-variables` theme colours a shell command's options like its other arguments
// (measured on shiki 4.6.0: `--venue` and `my-paper` both get `--shiki-token-string`), so the theme
// below names the few scopes the page tells apart. Its "colours" are tone names, not colours: Shiki
// passes them through untouched, and the tone picks the token.

import { createHighlighterCoreSync, type ThemeRegistration } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import json from "shiki/langs/json.mjs";
import shellscript from "shiki/langs/shellscript.mjs";

/** What a token is, for the reader: each tone is one colour token in globals.css. */
export type Tone = "plain" | "command" | "flag" | "string" | "comment";

export interface Token {
  readonly content: string;
  readonly tone: Tone;
}

/** One line of highlighted code. */
export type Line = readonly Token[];

export type Lang = "shellscript" | "json";

const TONES: readonly Tone[] = [
  "plain",
  "command",
  "flag",
  "string",
  "comment",
];

const THEME = "paperlint-tones";

const theme: ThemeRegistration = {
  name: THEME,
  type: "light",
  colors: { "editor.foreground": "plain", "editor.background": "plain" },
  tokenColors: [
    { settings: { foreground: "plain" } },
    { scope: ["entity.name.command"], settings: { foreground: "command" } },
    { scope: ["constant.other.option"], settings: { foreground: "flag" } },
    {
      scope: ["string.quoted", "string.quoted.double.json"],
      settings: { foreground: "string" },
    },
    { scope: ["comment"], settings: { foreground: "comment" } },
  ],
};

const highlighter = createHighlighterCoreSync({
  themes: [theme],
  langs: [shellscript, json],
  engine: createJavaScriptRegexEngine(),
});

/** The tone a theme colour names; anything else (Shiki's default) reads as plain. */
export const toTone = (color: string | undefined): Tone =>
  TONES.find((t) => t === color?.toLowerCase()) ?? "plain";

/** `code`'s lines as tokens, each with its tone. */
export const highlight = (code: string, lang: Lang): readonly Line[] =>
  highlighter
    .codeToTokens(code, { lang, theme: THEME })
    .tokens.map((line) =>
      line.map((t) => ({ content: t.content, tone: toTone(t.color) })),
    );

/** A one-line shell command as one line of tokens. */
export const highlightCommand = (command: string): Line =>
  highlight(command, "shellscript").flat();
