import React, { useEffect, useState } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import CodeBlock from "@theme/CodeBlock";
import styles from "./index.module.css";

const GITHUB_REPO = "mifunedev/openharness";
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
const FALLBACK_STARS = 18;

const QUICKSTART = `# install (only host dep: Docker)
curl -fsSL https://oh.mifune.dev/install.sh | bash

# review-first install, no extra dependency
curl -fsSL -o openharness-install.sh https://oh.mifune.dev/install.sh
# Review openharness-install.sh in your editor or pager, then:
bash openharness-install.sh

# enter the isolated sandbox
cd ~/.openharness && make shell

# inside the sandbox, pick your agent
claude        # or codex, opencode, pi, deepagents, hermes, grok`;

const AGENTS: Array<{
  name: string;
  description: string;
  href: string;
  icon: React.ReactElement;
}> = [
  {
    name: "Claude Code",
    description: "Anthropic's terminal coding agent.",
    href: "/docs/harnesses/claude-code",
    icon: <img src="/img/agents/claude-code.png" alt="" width={28} height={28} />,
  },
  {
    name: "Codex",
    description: "OpenAI's CLI coding agent.",
    href: "/docs/harnesses/codex",
    icon: <img src="/img/agents/codex.png" alt="" width={28} height={28} />,
  },
  {
    name: "OpenCode",
    description: "Terminal agent with OpenAI OAuth support.",
    href: "/docs/harnesses/opencode",
    icon: <OpenCodeIcon />,
  },
  {
    name: "Pi",
    description: "A lightweight, customizable agent.",
    href: "/docs/harnesses/pi",
    icon: <PiIcon />,
  },
  {
    name: "DeepAgents",
    description: "LangChain's multi-provider terminal agent.",
    href: "/docs/harnesses/deepagents",
    icon: (
      <img
        src="https://avatars.githubusercontent.com/u/126733545?s=200&v=4"
        alt=""
        width={28}
        height={28}
      />
    ),
  },
  {
    name: "Hermes",
    description: "Nous Research's self-improving agent CLI.",
    href: "/docs/harnesses/hermes",
    icon: <img src="https://hermes-agent.nousresearch.com/favicon.ico" alt="" width={28} height={28} />,
  },
  {
    name: "Grok Build",
    description: "xAI's terminal coding agent and CLI.",
    href: "/docs/harnesses/grok-build",
    icon: <img src="https://x.ai/favicon.ico" alt="" width={28} height={28} />,
  },
  {
    name: "T3 Code",
    description: "Browser UI over Claude/Codex/OpenCode (port 3773).",
    href: "/docs/harnesses/t3code",
    icon: (
      <img
        src="https://github.com/pingdotgg.png"
        alt=""
        width={28}
        height={28}
      />
    ),
  },
];

const WHY: Array<{ title: string; body: string }> = [
  {
    title: "Isolation by default",
    body: "Your project's agent lives in a Docker-isolated sandbox. No leaked env vars, no host pollution, no toolchain rot on your laptop.",
  },
  {
    title: "Persistent and patient",
    body: "The sandbox is long-lived. Authenticate once, restart never. A markdown-defined cron runtime keeps the agent working while you sleep.",
  },
  {
    title: "Composable substrate",
    body: "Postgres ships as an opt-in compose overlay; add tunnels, reverse proxies, or multi-agent setups as harness packs.",
  },
];

export default function Home(): React.ReactElement {
  const stars = useGitHubStars(FALLBACK_STARS);
  const starLabel = formatStars(stars);

  return (
    <Layout description="Open Harness is a portable harness — one repo per sandbox — that wraps your project in an isolated Docker container and versions its state. Run coding agents like Claude Code, Codex, OpenCode, or Pi inside, never straight on your machine.">
      <main>
        <section className={styles.hero}>
          <div className={styles.heroBg} aria-hidden="true" />
          <div className={`${styles.container} ${styles.heroLayout}`}>
            <div className={styles.heroCopy}>
              <p className={styles.heroEyebrow}>
                <span className={styles.heroEyebrowDot} aria-hidden="true" />
                Portable agent harness
              </p>
              <h1 className={styles.heroTitle}>
                Run coding agents in a sandbox, not on your machine.
              </h1>
              <p className={styles.heroSubtitle}>
                Open Harness is a portable harness: one repo per sandbox that wraps your project in an isolated Docker container and versions its state. Bring your agent — Claude Code, Codex, OpenCode, Pi — and let it work while you sleep.
              </p>
              <div className={styles.heroButtons}>
                <Link
                  className="button button--primary button--lg"
                  to="/docs/quickstart"
                >
                  Get started
                </Link>
                <Link
                  className="button button--secondary button--lg"
                  href={GITHUB_URL}
                  aria-label={`Star Open Harness on GitHub, ${starLabel} stars`}
                >
                  ★ Star on GitHub
                </Link>
              </div>
              <div className={styles.heroMeta}>
                <span>{starLabel} GitHub stars</span>
                <span aria-hidden="true">·</span>
                <span>MIT licensed</span>
                <span aria-hidden="true">·</span>
                <span>Self-hosted</span>
                <span aria-hidden="true">·</span>
                <span>Only Docker on your host</span>
              </div>
            </div>
            <aside className={styles.heroTerminal} aria-label="Quickstart commands">
              <div className={styles.terminalChrome}>
                <span className={`${styles.terminalDot} ${styles.terminalDotR}`} aria-hidden="true" />
                <span className={`${styles.terminalDot} ${styles.terminalDotY}`} aria-hidden="true" />
                <span className={`${styles.terminalDot} ${styles.terminalDotG}`} aria-hidden="true" />
                <span className={styles.terminalLabel}>~/open-harness — zsh</span>
              </div>
              <CodeBlock language="bash" children={QUICKSTART} />
            </aside>
          </div>
        </section>

        <section className={styles.starSection} aria-labelledby="github-stars-title">
          <div className={`${styles.container} ${styles.starBand}`}>
            <div className={styles.starCopy}>
              <p className={styles.starEyebrow}>Open source signal</p>
              <h2 id="github-stars-title" className={styles.starTitle}>
                Help more agent builders find Open Harness.
              </h2>
              <p className={styles.starBody}>
                If the sandbox model saves you from one broken local agent setup,
                star the repo so the next Claude Code, Codex, OpenCode, or Hermes user can find it faster.
              </p>
            </div>
            <div className={styles.starPanel} aria-label={`${starLabel} GitHub stars for ${GITHUB_REPO}`}>
              <span className={styles.starPanelLabel}>GitHub stars</span>
              <span className={styles.starPanelValue}>★ {starLabel}</span>
              <span className={styles.starPanelRepo}>{GITHUB_REPO}</span>
              <Link
                className={styles.starPanelCta}
                href={GITHUB_URL}
                aria-label={`Star Open Harness on GitHub, ${starLabel} stars`}
              >
                Star on GitHub →
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Pick your agent.</h2>
            <p className={styles.sectionLede}>
              Claude Code, Codex, and Pi ship preinstalled. OpenCode, DeepAgents, Hermes, and Grok Build are opt-in image installs. Switch between them inside the sandbox — or add your own by editing the Dockerfile.
            </p>
            <div className={styles.agentGrid}>
              {AGENTS.map((agent) => (
                <Link key={agent.name} className={styles.agentCard} to={agent.href}>
                  <span className={styles.agentIcon} aria-hidden="true">
                    {agent.icon}
                  </span>
                  <span className={styles.agentText}>
                    <h3 className={styles.agentName}>{agent.name}</h3>
                    <p className={styles.agentDescription}>{agent.description}</p>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.sectionAlt}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Why a sandbox instead of running it on your laptop?</h2>
            <div className={styles.whyGrid}>
              {WHY.map((item) => (
                <article key={item.title} className={styles.whyCard}>
                  <span className={styles.whyMarker} aria-hidden="true">
                    ⌘
                  </span>
                  <h3 className={styles.whyTitle}>{item.title}</h3>
                  <p className={styles.whyBody}>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>One repo. One sandbox.</h2>
            <div className={styles.archCard}>
              <p>
                Open Harness is one repo — your portable harness — that boots a single long-lived Docker sandbox. The repo tracks and versions the agent's whole setup in git: identity, skills, crons, memory. Your project lives in the bind-mounted <code>workspace/</code> — one repo or several, side-by-side branches, scratch dirs. The agent owns its workspace; your machine stays clean, never running agents straight on your host.
              </p>
              <p>
                A markdown cron runtime reads <code>crons/*.md</code> and wakes the agent on a schedule — issue triage, PR review, background grooming, anything you want running while you sleep. Configure the sandbox via <code>.devcontainer/.env</code>; Postgres ships as an opt-in compose overlay, and additional infra (tunnels, reverse proxies) is registered via harness-pack overlays in <code>config.json</code>.
              </p>
              <p>
                Multi-agent setups — like a Pi+Mom Slack bot — ship as separate harness packs you <code>git clone</code> into the workspace.
              </p>
              <Link className={styles.archLink} to="/docs/quickstart">
                Read the quickstart →
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.sectionFinal}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Get involved</h2>
            <div className={styles.linkGrid}>
              <Link
                className={styles.linkCard}
                href={GITHUB_URL}
              >
                <span className={styles.linkCardLabel}>Star Open Harness</span>
                <span className={styles.linkCardSub}>
                  Help others discover the project on GitHub
                </span>
              </Link>
              <Link
                className={styles.linkCard}
                href="https://github.com/mifunedev/openharness/blob/main/LICENSE"
              >
                <span className={styles.linkCardLabel}>License</span>
                <span className={styles.linkCardSub}>MIT — use freely</span>
              </Link>
              <Link className={styles.linkCard} to="/docs">
                <span className={styles.linkCardLabel}>Documentation</span>
                <span className={styles.linkCardSub}>
                  Quickstart, architecture, agents
                </span>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

function formatStars(stars: number): string {
  if (stars >= 1000) {
    return `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k`;
  }

  return new Intl.NumberFormat("en-US").format(stars);
}

function useGitHubStars(fallback: number): number {
  const [stars, setStars] = useState(fallback);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((repo: { stargazers_count?: number }) => {
        if (typeof repo.stargazers_count === "number") {
          setStars(repo.stargazers_count);
        }
      })
      .catch(() => {
        // Keep the committed fallback if GitHub is rate-limited or unavailable.
      });

    return () => controller.abort();
  }, []);

  return stars;
}

/* ---------- Inline agent icons ----------
 * Inlined so `currentColor` adapts to light/dark theme. */

function PiIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 800 800" width="28" height="28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z"
      />
      <path fill="currentColor" d="M517.36 400 H634.72 V634.72 H517.36 Z" />
    </svg>
  );
}

function OpenCodeIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="3" width="22" height="22" rx="5" fill="currentColor" opacity="0.14" />
      <path
        fill="currentColor"
        d="M8 14c0-3.6 2.5-6.2 6-6.2s6 2.6 6 6.2-2.5 6.2-6 6.2-6-2.6-6-6.2Zm3.1 0c0 2 1.1 3.4 2.9 3.4s2.9-1.4 2.9-3.4-1.1-3.4-2.9-3.4-2.9 1.4-2.9 3.4Z"
      />
    </svg>
  );
}
