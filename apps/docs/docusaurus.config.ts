import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import { terminalDark, terminalLight } from "./src/theme/prism-terminal";

// To deploy via GitHub Pages without custom domain, swap to:
// url: "https://ryaneggz.github.io"
// baseUrl: "/open-harness/"

const config: Config = {
  title: "Open Harness",
  tagline:
    "A Docker sandbox for Claude, Codex, OpenCode, or Pi.",
  favicon: "img/favicon.svg",

  url: "https://oh.mifune.dev",
  baseUrl: "/",

  organizationName: "ryaneggz",
  projectName: "open-harness",

  trailingSlash: false,

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  markdown: {
    mermaid: true,
  },

  headTags: [
    {
      tagName: "link",
      attributes: { rel: "preconnect", href: "https://fonts.googleapis.com" },
    },
    {
      tagName: "link",
      attributes: {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "anonymous",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    },
  ],

  themes: [
    "@docusaurus/theme-mermaid",
    [
      "@easyops-cn/docusaurus-search-local",
      {
        hashed: true,
        indexDocs: true,
        indexBlog: true,
        indexPages: true,
        docsDir: "../../docs",
        blogDir: "../../blog",
        docsRouteBasePath: "/docs",
        highlightSearchTermsOnTargetPage: true,
        searchBarShortcut: true,
        searchBarShortcutHint: true,
        searchResultLimits: 8,
      },
    ],
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          path: "../../docs",
          sidebarPath: "./sidebars.ts",
          editUrl: ({ docPath }) =>
            `https://github.com/ryaneggz/open-harness/edit/main/docs/${docPath}`,
          routeBasePath: "docs",
          showLastUpdateTime: true,
        },
        blog: {
          path: "../../blog",
          showReadingTime: true,
          blogTitle: "Open Harness Blog",
          blogDescription: "Notes from building Open Harness",
          postsPerPage: 10,
          feedOptions: { type: ["rss", "atom"], title: "Open Harness Blog" },
          editUrl: ({ blogPath }) =>
            `https://github.com/ryaneggz/open-harness/edit/main/blog/${blogPath}`,
          routeBasePath: "blog",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: "dark",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    image: "img/social-card.png",
    metadata: [
      { name: "theme-color", content: "#0b1220" },
      { property: "og:type", content: "website" },
    ],
    mermaid: {
      theme: { light: "neutral", dark: "dark" },
    },
    prism: {
      theme: terminalLight,
      darkTheme: terminalDark,
      additionalLanguages: [
        "bash",
        "json",
        "yaml",
        "docker",
        "diff",
        "tsx",
        "toml",
      ],
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
    navbar: {
      title: "Open Harness",
      hideOnScroll: true,
      logo: {
        alt: "Open Harness Logo",
        src: "img/logo.svg",
        srcDark: "img/logo-dark.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs",
        },
        {
          to: "/blog",
          label: "Blog",
          position: "left",
        },
        {
          href: "https://github.com/ryaneggz/open-harness",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "light",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Introduction",
              to: "/docs",
            },
          ],
        },
        {
          title: "Project",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/ryaneggz/open-harness",
            },
            {
              label: "License",
              href: "https://github.com/ryaneggz/open-harness/blob/main/LICENSE",
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Open Harness Contributors.`,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
