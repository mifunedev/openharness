import type { PrismTheme } from "prism-react-renderer";

/**
 * Prism themes mirroring GitHub's "Primer" syntax highlighting.
 * Color tokens match GitHub Dark Default and GitHub Light Default exactly.
 * Source: https://github.com/primer/primitives — syntax tokens.
 */

export const terminalDark: PrismTheme = {
  plain: {
    color: "#c9d1d9",
    backgroundColor: "#0d1117",
  },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "#8b949e", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "#c9d1d9" } },
    { types: ["operator", "entity"], style: { color: "#ff7b72" } },
    { types: ["keyword", "atrule", "attr-value"], style: { color: "#ff7b72" } },
    { types: ["string", "char", "url", "inserted"], style: { color: "#a5d6ff" } },
    { types: ["selector", "attr-name", "builtin"], style: { color: "#7ee787" } },
    { types: ["property", "tag", "boolean", "number", "constant", "symbol", "deleted"], style: { color: "#79c0ff" } },
    { types: ["variable"], style: { color: "#ffa657" } },
    { types: ["function", "class-name"], style: { color: "#d2a8ff" } },
    { types: ["function-name"], style: { color: "#d2a8ff" } },
    { types: ["regex", "important"], style: { color: "#ff7b72" } },
    { types: ["parameter"], style: { color: "#ffa657" } },
  ],
};

export const terminalLight: PrismTheme = {
  plain: {
    color: "#1f2328",
    /* GitHub-light canvas — bright white pops off the eggshell body */
    backgroundColor: "#ffffff",
  },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "#6a737d", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "#1f2328" } },
    { types: ["operator", "entity"], style: { color: "#cf222e" } },
    { types: ["keyword", "atrule", "attr-value"], style: { color: "#cf222e" } },
    { types: ["string", "char", "url", "inserted"], style: { color: "#0a3069" } },
    { types: ["selector", "attr-name", "builtin"], style: { color: "#116329" } },
    { types: ["property", "tag", "boolean", "number", "constant", "symbol", "deleted"], style: { color: "#0550ae" } },
    { types: ["variable"], style: { color: "#953800" } },
    { types: ["function", "class-name"], style: { color: "#8250df" } },
    { types: ["function-name"], style: { color: "#8250df" } },
    { types: ["regex", "important"], style: { color: "#cf222e" } },
    { types: ["parameter"], style: { color: "#953800" } },
  ],
};
