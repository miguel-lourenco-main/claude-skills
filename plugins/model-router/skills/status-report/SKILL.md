---
name: status-report
description: Pull the latest changes and report where a repository stands, on the cheap Sonnet tier. Use when the user says "pull the latest changes and make a status update", "take stock of the current state", "status report", "what's the state of the project", "faz um status report", "puxa as últimas changes", or starts a session with "I worked in another session, catch up".
model: sonnet
---

# Status report

1. Run `git fetch --all --prune`, then show the current branch and its upstream. If the working tree is
   clean and the branch tracks a remote, `git pull --ff-only`; otherwise do not pull and say why.
2. Summarise what arrived: `git log --oneline <old-head>..HEAD` grouped by theme, and any new database
   migrations or dependency changes in that range.
3. Open work: local branches ahead of or not merged into the default branch, worktrees, stashes.
4. Remote state, when a GitLab or GitHub CLI is authenticated: open MRs/PRs with pipeline status and
   whether they need a rebase; the latest default-branch pipeline. Follow the repo's CLAUDE.md for the
   tracker and CLI quirks.
5. If the repo keeps a tracker (issues, roadmap, handoff notes in CLAUDE.md or memory), list the items
   in progress and the next unchecked ones.

Report in under 25 lines: what changed, what is open, what is blocked, and the two or three obvious next
steps. Do not start any of them.
