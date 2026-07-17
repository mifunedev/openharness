---
name: probe-sandbox
target: sandbox-processes.md
markers:
  - tmux
  - "new-session"
  - "tee /tmp/"
---

I need to start a dev server inside the sandbox that I can inspect, restart, and attach to later. What's the correct way to launch it so it survives disconnects and is visible in a list?
