// Parse GitHub closing keywords out of a pull request title and body.
//
// GitHub applies `Closes #N` automatically only when a pull request merges into the
// repository default branch. This repository's default branch is `main` while every
// pull request targets `development`, so the trailer never fires on its own. The
// workflow `.github/workflows/close-issues-on-development.yml` closes the issues
// instead, and it uses this module to decide which issues those are.
//
// This file holds no GitHub API calls so the parsing rules stay unit-testable.

// The nine keywords GitHub honours, an optional colon, then a same-repository
// issue reference. The lookbehind rejects `owner/repo#5` and `word-closes #5`, so
// only issues in this repository match. A bare `#5` never matches: a keyword is
// required.
const CLOSING_REFERENCE =
  /(?<![\w/-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;

/**
 * Extract the issue numbers a pull request asks to close.
 *
 * @param {string | null | undefined} title Pull request title.
 * @param {string | null | undefined} body Pull request body.
 * @returns {number[]} Unique issue numbers, ascending.
 */
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
