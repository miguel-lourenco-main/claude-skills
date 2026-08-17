---
name: plain-report
description: Turn a technical analysis, run, or dataset into a report that a reader with zero
  context and no technical knowledge can follow — concepts explained before use, internal codes
  renamed to human labels, every claim backed by one concrete result, honest limits, and a
  glossary that grows when readers ask questions. Use when writing or rewriting findings for
  non-technical readers. Trigger phrases — "make it less technical", "explain the technical
  details using general language", "assume the reader has no idea what it is about", "use
  examples of results to sustain the affirmations", "make a report anyone can read", "rewrite
  for non-technical readers", "add a glossary", "is this report readable / review this report
  for a non-technical reader" (audit mode: flags issues without rewriting). NOT for sentence-level de-AI-ing of finished
  prose (use humanizer) and NOT for status updates to a known business audience (exec/manager
  templates are a different job).
---

# Plain report — findings anyone can read

The failure this skill prevents: a technically correct report that only its author can read.
The fix is not "dumb it down" — it is *explain before you use*, *show one real result per
claim*, and *never make the reader decode a code*. Numbers and evidence stay exact; only the
language changes.

## 0 · Inputs and outputs

Read the source material first: the technical report or run output, plus whatever evidence
artifacts exist (result files, queue JSONs, scripts, logs). Never write a claim you cannot
point to in an artifact.

Write ONE deliverable — the plain report (`.md`, location the user names; default: beside the
technical artifacts). The full detail does not go in it: keep raw evidence in the companion
files and say so in the report ("the complete list lives in `<file>` beside this report").
If a technical version already exists, the plain report REPLACES it as the readable surface;
don't maintain two prose versions of the same content.

## 1 · Find the three anchors before writing

From the material, extract and write down:

1. **The one question** the work answers, stated in one sentence a stranger understands.
2. **The core concept** everything hinges on (there is usually exactly one — a key, a grouping,
   a threshold). It gets a plain-language name and a 2–3 sentence explanation up front.
3. **The reader's action** — what someone does differently after reading. If nothing, the
   report is a diary, not a report; say so to the user.

## 2 · The writing rules

These are the aspects that make it readable; apply all of them.

- **R1 Define before use.** Every term of art is explained in general language the first time
  it appears — in the sentence itself, not a footnote. If you can't explain it in one
  sentence, it needs its own paragraph in "What this is".
- **R2 Rename internal codes.** Class codes, flags, and enum values (C1a, QUAR, quality=0)
  never reach the reader. Give each a human label that states its meaning ("Trusted match",
  "Can't be matched yet") and use the label consistently everywhere.
- **R3 Plain handles for structures.** A composite key or record becomes a counted phrase:
  "the seven facts", "the three checks". The handle is then usable everywhere without
  re-explaining.
- **R4 One real example per claim.** Every finding carries exactly one concrete example from
  the actual results — real names, real numbers, told as a two-to-three-line story
  (">Example: the Mercedes Sprinter van ... 74 versions wait on that one check"). An
  unsupported generalization is a defect; an invented example is worse.
- **R5 Findings are headline sentences.** Each section title states the takeaway, not the
  topic: "vans show why grouping matters, and where it's riskiest" — never "Van analysis".
- **R6 Tables answer "so what".** Any results table gets a "what it means" column and, where
  applicable, a "what to do" column. A table of bare numbers is unfinished.
- **R7 Name the risks in plain words.** Technical risk jargon becomes a named plain risk with
  its mechanism spelled out ("silent-mismatch risk: a wrong fact quietly lands the car on the
  wrong profile, with no error shown anywhere").
- **R8 Numbers travel in pairs.** Percentages come with absolutes ("187 of 498 — 38%");
  big numbers get a comparison the reader can hold ("~33 hours instead of ~5× that").
- **R9 Honest limits section.** State plainly what the run cannot claim, in the same
  no-jargon register. Limits build trust; omitting them reads as salesmanship.
- **R10 Glossary at the end.** One line per term, plain definitions, covering every term the
  body still needed. It is the safety net, not an excuse to skip R1.

## 3 · Assemble in this order

Use `templates/report-skeleton.md` beside this file as the starting frame (if missing, follow
the order below from prose). Title as a finding → "What this is" (context from zero: what the
data is, why the work happened, the one question) → the core concept (R3 handle) → results
table (R6) → 3–6 findings (R4/R5) → honest limits (R9) → next steps as plain actions →
glossary (R10).

The order is an inverted pyramid and that is load-bearing: **the report must survive
truncation**. A reader who stops after the results table still leaves with the answer and
their action; every section below it only deepens, never completes, the message. When cutting
for length, cut from the bottom.

## 4 · Two verification passes before delivering

1. **Traceability pass** — every number and example in the report must be findable in the
   evidence artifacts. Fix or cut anything you cannot trace. At most one regeneration of the
   evidence per report; if it still can't be traced, cut the claim.
2. **Stranger pass** — reread only headers and first sentences. A person with no context must
   be able to retell: what this is about, the main result, and what happens next. If any
   header needs its section's body to be understood, rewrite the header.

For a final sentence-level polish of tone (AI tics, flabby prose), invoke the `humanizer`
skill on the finished draft rather than restating its rules here.

## 5 · Reader questions are defects — patch, don't just answer

When a reader asks "what is X?" about the delivered report, treat it as a found defect:
answer, AND add/extend the glossary entry (or the first-use explanation) in the document, in
the same edit. One patch per question; if the same section draws three questions, restructure
that section instead of patching a fourth time.

## 6 · Audit mode — check, don't rewrite

When asked to *review* a report's readability rather than write one, do not rewrite. Report
violations per rule tag, one line each — `[R4] Finding 2 has no example → cite one row from
<artifact>` — ordered by reader impact (missing context/R1 > structure > polish), and end
with the three highest-leverage fixes. Apply fixes only if the user then asks.
