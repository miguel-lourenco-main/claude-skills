---
name: branch-scope
description: This skill should be used before creating a branch or opening an MR/PR, and whenever the user says "too many MRs", "reduce the number of merge requests", "should this be its own branch", "can these go together", "is this branch worth it", "split this up", or asks how to size a change for review. It decides what belongs on one branch, whether an existing branch should take the work instead, and when the branch has earned its MR. Read-only advice; it opens nothing.
version: 0.1.0
model: sonnet
---

# branch-scope

Deciding **what goes on a branch** before making one. A branch is not free and an MR is not free;
this skill is the check that the work about to be started is worth a queue entry, and the check
that an existing branch should not take it instead.

`class: core` — cheap, read-only, and the answer changes what every later skill does.

## Why this is a decision and not a habit

One item per branch feels tidy and is usually wrong. The cost of a branch is not the branch; it is
everything the branch drags behind it:

- **A pipeline per push**, on whatever runner the project has. A project with one runner serialises
  them, so two branches in flight is two queues, not two lanes.
- **A merge cycle.** On a project that merges with `rebase_merge` (semi-linear history), the moment
  one MR lands, **every other open MR flips to `need_rebase` and its in-flight pipeline becomes
  useless** — even one that was seconds from green. N open MRs therefore cost N *sequential*
  cycles, not N parallel ones.
- **A review context.** Each MR asks the reader to reload the same area of the codebase.

So the question is never "is this a separate work item" — it is "**is this separately
reviewable, separately revertable, and worth its own cycle**".

## The rule

> A branch earns its existence by the value it carries, not by the number of tracker items it
> closes. **One branch may close several items.** Keep committing often; it is the branch and MR
> count to reduce, never the commit count.

### Put it on the same branch when

- It touches the **same service, surface or component** as work already in flight.
- It shares a **root cause** with something already on the branch, even if the tracker filed the
  symptoms separately.
- It is small enough that its own MR would be mostly ceremony — a config knob, a one-function fix,
  a doc line the change implies.
- It is a **prerequisite** of the branch's work, or a defect that work uncovered.

### Give it its own branch when

- The parts differ in **risk**, and you would want to revert one without the other.
- They touch **unrelated surfaces** a reviewer cannot hold at once.
- One part is **uncertain or blocked** and would hold a finished part hostage.
- The change is **destructive or migration-bearing** and deserves to land alone.

Note what is *not* on that list: being a different issue number, being authored on a different day,
or having a different commit type.

## Before creating a branch

1. List what is already in flight — local branches ahead of the default, and open MRs/PRs.
2. For each, ask: same service, same surface, same root cause? If yes, **commit there instead**.
3. If a new branch is genuinely right, say in one line what it will carry *in total* — if that
   sentence is one small fix, it is probably a commit on something else.

```bash
git -C <repo> for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads \
  --no-merged <default-branch>
glab mr list -R <project>    # or: gh pr list -R <repo>
```

## Before opening the MR

Open it when the branch is worth a reviewer's pass and a queue slot — not at the first green
commit. A branch that is still growing is cheaper to keep growing than to re-queue. When it does
open, the description names **every** item it closes, and each commit references its own.

## What this does not mean

It is not an argument for one enormous branch. A branch nobody can review is worse than two that
someone can; the split rules above exist precisely for that. Nor is it licence to batch unrelated
work to save cycles — the reader pays for that, later and with interest.

## When the call is close

Most of the time the rules above settle it. When they genuinely do not — a change that touches an
adjacent surface, or a branch that has grown past what one reader can hold — the decision is
bounded, it repeats, and being wrong costs a full merge cycle. That is the shape
`model-router:decision-model` is for: one `noul` ("does this belong on the open branch?") and a
`score` for reviewability, answered in ~0.4s, combined with the rules here in your own arithmetic.
Keep the rules as the fallback; they are the reason, and a probability is not one.

## Additional resources

- **`${CLAUDE_PLUGIN_ROOT}/skills/work-items/SKILL.md`** — starting a tracker item; its apply mode
  consults this skill before creating anything.
- **`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`** — why pushing a branch and opening an MR is a gated,
  outward action.
