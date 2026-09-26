---
name: ship
description: Commit and push the current work on the cheap Sonnet tier, following the repo's commit conventions. Use when the user says "commit and push", "faz commit e push", "commit this", "push the latest", "commit and push any pending work".
model: sonnet
effort: low
---

# Ship

1. Read `git status` and `git diff --stat`. Never stage secrets (`.env*` with real values, tokens, keys)
   or large generated artifacts; if any are modified, leave them out and say so.
2. If the changes cover unrelated topics, split them into separate commits by topic.
3. Match the repo's message style from `git log --oneline -15` (conventional prefixes, scope, issue
   references such as `(#N)`). Follow any commit rules and attribution lines in CLAUDE.md or the system
   context.
4. If a pre-commit hook fails, report the failure output. Do not bypass it with `--no-verify`, and do not
   try to fix code beyond trivial formatting; hand the failure back.
5. Never commit directly to the default branch if the repo's rules say to branch first; create a branch
   named after the change instead and say so.
6. Push to the tracked upstream (set it with `-u` on first push). Never force-push unless the user asked.

Report the commits (hash + subject), the branch and remote pushed to, and any files left out.
