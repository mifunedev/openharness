const SOURCE_DOCS_BASE = "https://github.com/mifunedev/openharness/blob/main/";

export function sourceDocsUrl(docsPath: string): string {
  const segments = docsPath.split("/");
  if (
    segments[0] !== "docs" ||
    segments.length < 2 ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
    docsPath.includes("\\") ||
    docsPath.includes("?") ||
    docsPath.includes("#")
  ) {
    throw new Error(`source docs path must be a normalized docs/ path: ${docsPath}`);
  }
  return new URL(segments.map(encodeURIComponent).join("/"), SOURCE_DOCS_BASE).toString();
}
