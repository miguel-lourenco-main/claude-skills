# work-items/v1 — classification rules and schema

Classification is deterministic and label-driven so the same backlog always ranks the same way. All
label matching is case-insensitive regex against the item's label names.

## Importance (first match wins)

| Tier | Triggers (any) |
|---|---|
| `critical` | label matches `security`, `vuln`, `critical`, `blocker`, `p0`, `severity::critical`, `priority::critical` |
| `high` | label matches `bug`, `regression`, `urgent`, `important`, `priority::high`, `p1`; OR has an assignee **and** a milestone; OR age > 30 days **and** labelled a bug |
| `medium` | has a milestone; OR label matches `feature`, `enhancement`, `improvement` |
| `low` | none of the above |

## Scope (first match wins)

| Tier | Triggers |
|---|---|
| `large` | label matches `epic`, `large`, `xl` |
| `small` | label matches `good first issue`, `trivial`, `small`, `xs`, `chore` |
| `medium` | default (including changes whose diff size wasn't enriched) |

For GitHub PRs the fetch includes `additions`/`deletions`/`changedFiles`; a future refinement can map
those to scope directly (≤10 lines/1 file → trivial; ≤50/≤3 → small; ≤300/≤10 → medium; else large).
GitLab MR diff sizes require a per-MR `glab mr view` call and are left un-enriched in v1 to avoid N API
round-trips.

## Ranking

Sort ascending by `[importance_weight, scope_weight, -age_days]`:
- importance weight: critical 0, high 1, medium 2, low 3
- scope weight: small 0, medium 1, large 2 (smaller surfaces first as a quick win)
- older items break ties ahead of newer ones.

## Normalized item / schema

```json
{
  "schema": "work-items/v1",
  "available": true,
  "repo": "../edgenchat",
  "project": "public-work4/edgenchat",
  "host": "gitlab",
  "counts": { "total": 2, "critical": 0, "high": 0, "medium": 0, "low": 2 },
  "items": [
    {
      "kind": "issue",            // or "change" (MR/PR)
      "number": 2,
      "title": "Improve connection to ollama feedback and flow",
      "state": "opened",
      "labels": [], "milestone": null, "assignees": [], "author": "…",
      "created_at": "…", "updated_at": "…", "web_url": "…",
      "draft": false, "source_branch": null,
      "age_days": 155, "importance": "low", "scope": "medium", "rank": 1
    }
  ]
}
```

When the forge is unreachable: `{ "schema":"work-items/v1", "available":false, "reason":"…",
"resolution":{…host-resolution/v1…}, "items":[] }`.
