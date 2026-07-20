# Genesis interview — question bank

Run with `AskUserQuestion`: up to 4 questions per call, concrete options on every question, max
3 rounds total. Skip any question whose answer is already implied by what the user said. Every
technical question includes a "recommend for me" option so a non-technical user is never blocked.
Anything still unknown after round 3 is recorded under **Open questions** in `docs/PRODUCT.md` —
never a fourth round.

## Round 1 — Product (always)

1. **What is this app, and who is it for?** One or two sentences. (Free-form — if the user
   already described it, skip and paraphrase back in Phase 2 instead.)
2. **What is the single thing v1 must do well?** The walking-skeleton target: the one flow that,
   working end-to-end, makes this real.
3. **What is explicitly OUT of scope for now?** Non-goals. If the answer is "nothing", press
   once with candidates inferred from the product (e.g. "no accounts? no mobile? no payments?").
4. **Who works on it, and what are the stakes?** Solo or team; hobby, portfolio piece, or
   intended for real users/revenue. (Drives testing/CI rigor and how conservative restrictions
   should be.)

## Round 2 — Technical (always; each option list ends with "recommend for me")

5. **Stack preference?** Language/framework — or shall I recommend one based on the product and
   your stated experience?
6. **Where will it run?** Local only / a VPS or container host / serverless / mobile stores /
   desktop.
7. **What data does it store, and how sensitive is it?** None / local files / a database;
   personal or regulated data? (Drives DB choice and privacy restrictions.)
8. **External services?** Auth provider, payments, third-party APIs, AI APIs — anything with
   keys, quotas, or costs.

## Round 3 — Constraints & working style (skip questions already answered)

9. **Hard restrictions for agents working on this repo?** Things an agent must never do: add
   paid services, touch prod data, force-push, pick copyleft-licensed deps, exceed a cost
   ceiling…
10. **Testing appetite?** Minimal smoke tests / solid unit coverage on core logic / strict TDD.
11. **Version control & CI?** Not assumed — a scratch project may want none. Options:
    GitLab (remote + CI) / GitHub (remote + Actions) / local git only, no remote or CI /
    no git at all / recommend for me. The recommendation defaults to at least local git
    unless the user framed the project as throwaway. A remote answer means genesis creates
    the remote repo and pushes, so CI actually runs — CI without a remote is a config file
    that has never executed.
12. **Existing conventions to match?** A repo or style guide this project should feel like.

## Recording the answers

- Answers 1–4 → `docs/PRODUCT.md` (vision, v1 scope, non-goals, stakes).
- Answers 5–8 → `docs/DECISIONS.md` entries (stack, hosting, data, services) with the user's
  reasoning — or yours, marked as a recommendation the user accepted.
- Answers 9–12 → `CLAUDE.md` Restrictions + `docs/CONVENTIONS.md` (testing policy, style) + the
  version-control/CI setup in Phase 3. The Q11 answer also gets a `docs/DECISIONS.md` entry —
  especially "no git", so a future session doesn't "fix" the missing repo.
- "Don't know / decide later" → **Open questions** in `docs/PRODUCT.md`, verbatim enough that a
  future session can re-raise it with the user.
