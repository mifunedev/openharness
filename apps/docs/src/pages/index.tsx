import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import CodeBlock from "@theme/CodeBlock";
import styles from "./index.module.css";

const QUICKSTART = `# install — auto-detects Node 20+ and configures accordingly
curl -fsSL https://oh.mifune.dev/install.sh | bash

# authenticate Claude, Codex, Gemini
oh onboard

# drop into your isolated sandbox
oh shell`;

const AGENTS: Array<{
  name: string;
  description: string;
  href: string;
  icon: React.ReactElement;
}> = [
  {
    name: "Claude Code",
    description: "Anthropic's terminal coding agent.",
    href: "/docs/agents/claude-code",
    icon: <img src="/img/agents/claude-code.png" alt="" width={28} height={28} />,
  },
  {
    name: "Codex",
    description: "OpenAI's CLI coding agent.",
    href: "/docs/agents/codex",
    icon: <img src="/img/agents/codex.png" alt="" width={28} height={28} />,
  },
  {
    name: "Gemini",
    description: "Google's command-line agent.",
    href: "/docs/agents/gemini",
    icon: <img src="/img/agents/gemini.png" alt="" width={28} height={28} />,
  },
];

const WHY: Array<{ title: string; body: string }> = [
  {
    title: "Isolation by default",
    body: "Each agent gets its own Docker-isolated worktree. No shared filesystem, no leaked env vars, no host pollution.",
  },
  {
    title: "Parallel, not serialized",
    body: "Claude, Codex, and Gemini run side-by-side. One container, N worktrees, all working at once.",
  },
  {
    title: "Per-agent state",
    body: "Identity, memory, and skills live with each agent. Restart-safe, branch-aware, agent-owned.",
  },
];

export default function Home(): React.ReactElement {
  return (
    <Layout description="Give every AI coding agent its own sandbox. Open Harness runs Claude, Codex, Gemini, and Pi in Docker-isolated worktrees — parallel, persistent, and never touching your host.">
      <main>
        <section className={styles.hero}>
          <div className={styles.heroBg} aria-hidden="true" />
          <div className={`${styles.container} ${styles.heroLayout}`}>
            <div className={styles.heroCopy}>
              <p className={styles.heroEyebrow}>
                <span className={styles.heroEyebrowDot} aria-hidden="true" />
                Multi-agent dev infrastructure
              </p>
              <h1 className={styles.heroTitle}>
                Give every AI coding agent its own sandbox.
              </h1>
              <p className={styles.heroSubtitle}>
                Open Harness runs Claude, Codex, Gemini, and Pi in Docker-isolated
                worktrees — parallel, persistent, and never touching your host.
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
                  href="https://github.com/ryaneggz/open-harness"
                >
                  View on GitHub
                </Link>
              </div>
              <div className={styles.heroMeta}>
                <span>MIT licensed</span>
                <span aria-hidden="true">·</span>
                <span>Self-hosted</span>
                <span aria-hidden="true">·</span>
                <span>One container, N worktrees</span>
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

        <section className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Bring any agent. Or all of them.</h2>
            <p className={styles.sectionLede}>
              Every supported coding agent runs in its own worktree, with its own
              identity and memory.
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
            <h2 className={styles.sectionTitle}>Why a harness instead of running them on your laptop?</h2>
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
            <h2 className={styles.sectionTitle}>One container. N worktrees. One daemon.</h2>
            <div className={styles.archCard}>
              <p>
                Open Harness runs as a single long-lived Docker container hosting
                an arbitrary number of git worktrees. Each worktree is a complete,
                isolated workspace — its own branch, its own filesystem, its own
                agent state.
              </p>
              <p>
                A single orchestrator daemon manages provisioning, shells, and
                cleanup. A heartbeat scheduler runs background work on a cron
                inside each worktree. Caddy handles ingress when you need to
                expose a service.
              </p>
              <p>
                The result is a reproducible, auditable, multi-agent workspace
                you can spin up in one command and tear down just as fast.
              </p>
              <Link className={styles.archLink} to="/docs/architecture/overview">
                Read the architecture docs →
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
                href="https://github.com/ryaneggz/open-harness"
              >
                <span className={styles.linkCardLabel}>GitHub</span>
                <span className={styles.linkCardSub}>
                  Source, issues, and discussions
                </span>
              </Link>
              <Link
                className={styles.linkCard}
                href="https://github.com/ryaneggz/open-harness/blob/main/LICENSE"
              >
                <span className={styles.linkCardLabel}>License</span>
                <span className={styles.linkCardSub}>MIT — use freely</span>
              </Link>
              <Link className={styles.linkCard} to="/docs">
                <span className={styles.linkCardLabel}>Documentation</span>
                <span className={styles.linkCardSub}>
                  Quickstart, CLI, architecture
                </span>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

