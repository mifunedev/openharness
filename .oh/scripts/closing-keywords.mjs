
const CLOSING_REFERENCE =
  /(?<![\w/-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;

export function parseClosingRefs(title, body) {
  const text = [title, body].filter((part) => typeof part === "string").join("\n");
  const found = new Set();

  for (const match of text.matchAll(CLOSING_REFERENCE)) {
    const number = Number(match[1]);
    if (Number.isSafeInteger(number) && number > 0) {
      found.add(number);
    }
  }

  return [...found].sort((a, b) => a - b);
}

export default parseClosingRefs;
