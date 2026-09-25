# Why compact deliberately, and what "compact even at a low %" means — measured

A `UserPromptSubmit` hook (`scripts/context_checkpoint.py`, wired by `hooks/hooks.json`) that reads
the live context size from the session transcript and, at set moments, injects a short note asking
the model to decide **keep or compact** before doing the task. The model answers in one line
(`Context NN%: keep — …` / `Context NN%: compact — …; suggest /compact <focus>`); the person
runs `/compact`. The model cannot compact by itself.

Why a hook: no hook event receives the context percentage, and Fable 5.1 does not get the
`<system_warning>Token usage…` tags that Sonnet/Haiku get (platform docs, context-windows page), so
the model is blind to its own context size unless something tells it. The transcript JSONL carries
`message.usage` on every assistant entry; `input + cache_creation + cache_read` of the last one is
the same formula the statusline's `used_percentage` documents. The JSONL schema itself is not a
documented interface — if it changes, the hook goes silent (it never blocks a prompt).

## When it fires (config: `~/.claude/context-checkpoint/config.json`)

| trigger | default | why |
|---|---|---|
| context crossed a new band | every 15% (150k of 1M) | the periodic check the rule asks for |
| cold cache | idle ≥ 55 min | the 1h prompt cache has expired: the next turn re-reads the whole context at full price anyway, so compacting now costs nothing extra |
| boundary-looking prompt | regex (commit / push / pull / status / "nova tarefa" / "outra sessão" / "vamos agora…") | the moment the old context most likely stopped being load-bearing; at most once per 5% |
| floor | never below 120k | post-compaction context is 55–85k (summary + CLAUDE.md + system prompt), so below ~120k there is nothing to gain |

Right after a compaction the hook stays silent for one turn (the usage line is stale) and resets
its band. `/autocompact 500k` (setting `autoCompactWindow`) is a complementary knob — it moves the
automatic compaction earlier, but still to an arbitrary point, which is the thing this rule avoids.

## The measured shape of this machine's sessions (2026-09-25, 12 largest transcripts)

| observation | value |
|---|---|
| window | 1M (Fable 5.1 native) |
| compactions that were deliberate | 0 — every one fired at 962–968k (≈96%), i.e. auto or the "context full" prompt |
| what a compaction at 970k cost | 126 s stall; summary 13k tokens; context restarts at 55–85k |
| idle gaps > 1h inside one session | frequent: 1.1h, 3.5h, 10.8h, 20.8h, **34.1h at 920k**, 38h at 266–378k |
| tool_result share at peak | 160–240k tokens per big session, plus subagent notification floods (one session: ~30 consecutive Monitor notifications, then "your stuck in a loop") |
| topic switches with no compaction | e.g. one session: repo clean-up (301k) → source validation (367k) → report artifact (514k) → deck edits (525–777k) → "vamos continuar com os carros de lado, cria um agente" (791k) → commit (919k) → **"Eu estive a trabalhar numa sessão diferente. Puxa as últimas changes" (920k, after 34h idle)** |

That last row is the whole argument in one line: 920k of context, paid in full because the cache
was cold, for a task whose premise was that the files had changed under it.

## Why "compact even at a low %" is a real instinct, and what it decomposes into

Size is the wrong variable. Context earns its cost only while it is **load-bearing** for the next
task, and it starts costing more than tokens the moment it stops being that. The instinct is
detecting one of these:

1. **Relevance density dropped.** The last task closed (committed, pushed, reported) and the next
   one is unrelated. Git and RUNLOG now hold what mattered; the 300k of reads and diffs behind it
   are dead weight that every later turn still re-reads and still attends to.
2. **Staleness.** Files in context changed elsewhere (another session, a pull, a worktree merge).
   This is worse than useless: the model will confidently reason from a version that no longer
   exists. Strongest reason of all, and independent of size.
3. **Poison.** Failed approaches, a wrong hypothesis chased for 50k tokens, a notification loop, a
   2,000-line file read once. These pull attention toward the wrong path ("anchoring"); a summary
   that says "X was tried and was wrong because Y" is cleaner than the 50k trace.
4. **Cache economics.** With a 1h cache, cost per turn ≈ context size × cache-read rate; after an
   idle hour, or a model switch, the next call is a full uncached read regardless. That is the one
   moment compaction is effectively free — do it then, not mid-flow.
5. **Runway.** A long autonomous phase (agent waves, sweeps, workflows) needs room; if it hits
   ~96% mid-run, auto-compaction fires at an arbitrary point, stalls ~2 min, and the summary loses
   in-flight coordination state. Compact deliberately *before* the phase, not accidentally during it.

And the counter-signals, which are why a blanket "compact at N%" is wrong:

6. **Precision in flight.** Exact strings to edit, an error trace being chased, the chronology of
   what was tried, an operator's nuanced answer — summaries lose exactly this. Keep, or first move
   it to its durable home (decision files, run logs, memory) and then compact.
7. **Below the floor.** Under ~120k there is little to gain and the summary costs a full read.

So the rule is: **the periodic check is a prompt to ask "how much of this does the next task need,
and is any of it now wrong?" — not a threshold.** The %-cadence only guarantees the question gets
asked; the answer comes from the relationship between tasks.
