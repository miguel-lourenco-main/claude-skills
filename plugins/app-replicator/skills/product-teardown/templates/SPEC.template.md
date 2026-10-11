# Replication spec — {{product}}

<!-- teardown: keep this line ONLY in degraded mode, as the first line after the title; otherwise delete this comment and the line: -->
<!-- > **NOT A LIVE TEARDOWN** — behaviour rows are documented or unverified only. -->

<!-- teardown: evidence contract. Every table's last column is `ev`. Cell = class letter + space + ref, several refs separated by `;`.
M P07 (measured: a number must appear in the row) · O S03-mixer-1440.png (file under evidence/) · D <url> · I <reason> · U U-04 (row must exist in §11).
IDs: S-01 surfaces, F-01 features, P-01 probes, U-01 unverified, A-01 assets. Delete every teardown comment when done. -->

## 0 · Header

**Target:** {{url}}
**Captured:** {{date}}
**Account tier used:** {{tier}}
**Depth:** {{survey|full}}
**Viewports:** 1440×900, 390×844
**Mode:** {{live|degraded}}
**Evidence legend:** M measured · O observed · D documented · I inferred · U unverified
**Coverage:** {{n}} surfaces · {{n}} features · {{n}} probes · M {{n}} / O {{n}} / D {{n}} / I {{n}} / U {{n}}

## 1 · Product overview

<!-- teardown: prose. What it is, the job it does, users, platforms, business model. Each claim ends with an ev tag in brackets, e.g. [D https://…]. -->
{{overview}}

## 2 · Surface map

| ID | Surface | Route | Entry path | Auth | Screenshot | ev |
|---|---|---|---|---|---|---|
| S-01 | {{surface}} | {{route}} | {{entry path}} | {{auth}} | {{file.png}} | O {{file.png}} |

## 3 · Feature inventory

| ID | Feature | Surface | Controls | Tier (limit) | ev |
|---|---|---|---|---|---|
| F-01 | {{feature}} | S-01 | {{controls}} | {{tier (limit)}} | O {{file.png}} |

### Tier matrix

| Capability | Free | Pro | Business | ev |
|---|---|---|---|---|
| {{capability}} | {{yes/no/limit}} | {{yes/no/limit}} | {{yes/no/limit}} | D {{url}} |

## 4 · Behaviour specs

<!-- teardown: one `### F-NN · {{feature}}` block per feature with sub-bullets Trigger / State change / Visible effect / Persistence / Numbers / Edge cases / Evidence.
Category subsections #### Media, #### Timers, #### Editor, #### Accounts and limits are optional — delete when not applicable. -->

### F-01 · {{feature}}

- **Trigger:** {{trigger}}
- **State change:** {{state change}}
- **Visible effect:** {{visible effect}}
- **Persistence:** {{persistence}}
- **Numbers:** {{numbers with units}}
- **Edge cases:** {{edge cases}}
- **Evidence:** {{M P-01}}

#### Media

#### Timers

#### Editor

#### Accounts and limits

## 5 · Interaction details

### Shortcuts

| Key | Action | Surface | ev |
|---|---|---|---|
| {{key}} | {{action}} | S-01 | O {{file.png}} |

### Breakpoints

| Breakpoint | Change | Surface | ev |
|---|---|---|---|
| {{px}} | {{what changes}} | S-01 | M P-01 |

### States

<!-- teardown: empty / loading / error / limit-reached / upsell. -->

| State | Where | What is shown | ev |
|---|---|---|---|
| {{state}} | S-01 | {{what is shown}} | O {{file.png}} |

## 6 · State model

| Entity | Fields (name:type) | Stored where | ev |
|---|---|---|---|
| {{entity}} | {{name:type}} | {{localStorage/cookie/server}} | M P-01 |

### Persistence matrix

| Thing | Reload | New tab | Logout | Other device | ev |
|---|---|---|---|---|---|
| {{thing}} | {{kept/lost}} | {{kept/lost}} | {{kept/lost}} | {{kept/lost}} | M P-01 |

## 7 · Data and API

{{summary}} See [api-map.md](api-map.md).

## 8 · Design layer

{{token summary}} See [design-tokens.json](design-tokens.json).

<!-- teardown: per-surface layout notes; motion; typography; icons. -->

| Surface | Layout | Motion | ev |
|---|---|---|---|
| S-01 | {{layout}} | {{motion}} | O {{file.png}} |

## 9 · Asset catalogue

{{summary and sourcing plan}} See [assets.md](assets.md).

## 10 · Clean-room rules and non-goals

- No brand name, logo, copy or media from the target.
- No copied source; mechanisms are named, not copied.
- Platforms out of scope: {{platforms}}
- Third-party services to substitute: {{services}}
- {{further rule}}

### Rebuild-effort honesty

<!-- teardown: one line each; mark unknown as unknown. -->
- Feature prototype: {{estimate}}
- Production hardening: {{estimate}}
- Asset rights: {{estimate}}
- Integrations: {{estimate}}
- Ops: {{estimate}}

## 11 · Unverified register

| ID | Claim | Why unverified | How to verify |
|---|---|---|---|
| U-01 | {{claim}} | {{why}} | {{how}} |

## 12 · Genesis hand-off

### Vision

{{vision}}

### Users

{{users}}

### v1 scope

<!-- teardown: ordered list of F-IDs, free tier first. -->
1. {{F-01}}

### Non-goals

<!-- teardown: from §10. -->
{{non-goals}}

### Open questions

<!-- teardown: from §11. -->
{{open questions}}

```
/project-genesis:genesis seed from replication/{{slug}}/SPEC.md — v1 = free-tier features (SPEC §3 rows tier=free); pro rows → Planned after v1; non-goals and clean-room rules from §10; assets per assets.md
```
