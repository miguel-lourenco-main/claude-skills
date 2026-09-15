---
source: https://lovable.dev/guides/how-to-build-a-chatbot-ui
title: "How to Build a Chatbot UI: Design Guide"
topic: conversational/chatbot interface design
value: 5
keep: yes
---
## Use when
Designing any chat-style conversational UI (support bot, AI assistant, onboarding chat) — component choices, trust signals, and AI-specific failure states.

## Rules
- Design for conversation rules, not page-layout rules: information must arrive sequentially, one turn at a time, in an order the user cannot preview or rearrange (no spatial scanning/comparison like a page allows) — per Nielsen Norman Group research cited in guide, chatbots display "only a very small amount of information at a time." This makes turn-ordering a primary architectural decision, not an afterthought.
- Every bot message implies a turn-taking obligation on the user. Never leave a message with no clear next action/turn — a bare confirmation screen that works on a webpage leaves a chat user stranded.
- Silence in chat reads as social failure (confusion/disengagement), not neutral loading — unlike a page spinner. Always show a typing indicator or stream text during any processing delay; its absence reads as a broken conversational contract.
- Give message bubbles a 3-tier visual distinction: user, bot, and system/status messages, each with distinct treatment (position + color). Break long bot responses into multiple shorter sequential bubbles rather than one long cramped block (bubbles have side margins that make long single blocks unpleasant).
- Support both free text and quick-reply buttons; do not offer only one. Removing free text makes users feel constrained; removing quick replies forces unnecessary typing (per NNGroup research cited in guide). Use quick replies for structured flows (intake, qualification); leave free text available whenever nuance is possible.
- Every error state must answer three things: what happened, why, and what to do next — and must never imply user fault. Distinguish comprehension errors ("I didn't understand that") from technical failures ("something went wrong") with different copy.
- Match avatar/persona humanlikeness to actual bot capability. A human-looking avatar paired with poor responses damages trust more than a clearly robotic one that performs reliably, because the expectation gap is larger (per an ACM peer-reviewed paper cited in guide). Anthropomorphized design risks parasocial trust — users inferring capabilities the system doesn't have (per ACM FAccT 2024, per guide).
- For consequential domains (health, finance, anything with real stakes), prioritize rational/transparency signals — tooltips, displayed credentials, process explanations — over personality/warmth cues (per ACM CUI 2025 research on healthcare chatbots, cited in guide).
- Streaming text (tokens appearing progressively) measurably improves perceived experience over an instant-or-nothing response: a peer-reviewed study cited in the guide found instant responses scored 5.67 satisfaction vs. 4.40 for long waits with no indicator, and adding a typing indicator significantly mitigated the negative effect of long latency (F(2,206)=4.02, p<0.05) (per the cited peer-reviewed study, per guide). Always add a stop/cancel control on any streaming response of non-trivial duration.
- When a backend action has no tokens to stream but is doing real work (search, tool call, DB query), show a named state ("Searching your documents…") instead of a generic spinner — real progress description outperforms an ambiguous spinner (per OpenAI's latency guidance, cited in guide).
- Hard-code deterministic responses (confirmations, refusals, standard prompts) rather than routing them through the model — reduces unpredictable latency/failure surface for the highest-frequency interactions.
- AI backends fail unpredictably (hallucination, refusal, timeout, context overflow) unlike rule-based bots. Design layered degradation: map API failures to plain human language, show partial output plus a clear "incomplete" flag and retry option when a stream is interrupted, and keep a human-escalation path always visible.
- Express model uncertainty in first person ("I'm not completely sure, but…") rather than vague hedging — first-person uncertainty phrasing outperforms vague hedging (per NNGroup hallucination research cited in guide). Show citations when sources exist; offer thumbs up/down feedback so users can calibrate trust actively.

## Patterns (name — when to use — when to avoid)
- Dual input (free text + quick replies) — use in nearly every chatbot; avoid quick-reply-only design once conversation depth requires nuance (becomes "boring" per a cessation study cited in guide).
- Named-state loading ("Searching…", "Running code…") — use whenever a backend call has real duration and identifiable steps; avoid a generic spinner in that case.
- Multi-bubble response splitting — use for any bot reply that would otherwise be a long single block; unnecessary for short (1–2 sentence) replies.

## Anti-patterns
- Silent pauses with no typing indicator or streaming — reads as the bot ignoring the user.
- A single generic spinner covering a multi-step backend process.
- A confirmation-only message with no next action, ported directly from page-based UI conventions.
- Human-photo avatars on a bot with narrow/unreliable conversational range — sets an expectation the bot can't meet.
- Routing simple deterministic replies (e.g., "yes, cancel your order?") through the LLM instead of hard-coding them.

## Checklist
- [ ] Every bot turn ends with an actionable next step, not a dead-end confirmation.
- [ ] Typing indicator or token streaming present for any response with real latency.
- [ ] Free text and quick replies both available.
- [ ] Error states specify what happened, why, and the next action — no user-blame language.
- [ ] Avatar/persona capability signal matches actual bot capability.
- [ ] Named progress states used instead of a generic spinner for tool/search calls.
- [ ] Stop/cancel control present on streaming responses.
- [ ] Escalation-to-human path visible at all times.
