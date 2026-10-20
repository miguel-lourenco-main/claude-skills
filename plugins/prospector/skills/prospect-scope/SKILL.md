---
name: prospect-scope
description: View or edit the Prospector scope — the query that bounds discovery and weights lead scoring. Use when the user says "change the scope", "target a different vertical/region", "only companies over €1M", "adjust the lead weights", or describes who to go after. Merges a JSON patch into scope.json. Next phase: an LLM scope-compiler that turns free-text into the structured spec.
---

# Prospect · scope

The scope is the system's query. It controls **discovery** (geography, verticals, revenue/employee
bands, company age, website presence, suppression) and **scoring** (the `weights` blend of can-pay,
site-matters, opportunity). Constraints the scope can express:

- **Geography** — `country`, `districts[]`, `cities[]`, `radius{lat,lng,km}`
- **Industry** — `verticals[]` (hospitality/clinics/legal/realEstate/trades), `caeCodes[]`, `keywords[]`
- **Size** — `revenue{min,max,currency}`, `employees{min,max}`, `companyAge{min,max}`
- **Digital** — `hasWebsite: true|false|any`
- **Operational** — `maxCompanies`, `freshnessDays`, `sources{allow,deny}`
- **Suppression** — `excludeContacted`, `suppress{domains[],taxIds[]}`
- **Scoring** — `weights{canPay,siteMatters,opportunity}`

## Run

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/workspace/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
# patch is shallow-merged (revenue/employees/weights merged one level deeper)
node "$PLUGIN/scripts/scope.mjs" '{"action":"scope","payload":{"scope":{"verticals":["hospitality"],"revenue":{"min":1000000}}}}'
```

Prints `{scope}` with the merged result. To view the current scope, read `scope.json` in the store
root. The default scope encodes the SME-where-website-matters strategy (PT, €250k–10M, 5–100 staff,
hospitality/clinics/legal/realEstate).
