---
name: prospect-discover
description: Really discover Portuguese companies into the Prospector store from free sources — OpenStreetMap (Overpass), Wikidata (SPARQL), Google Maps + Páginas Amarelas scraping, and an agent web-research path. Use when the user says "find/discover companies", "add prospects in <city>", "pull more leads", or wants to grow the candidate pool. Writes company dossiers (name, location, website, category — NOT website quality, NOT revenue). Multi-adapter: runs enabled sources and merges/dedupes.
---

# Prospect · discover

Discovery is a **multi-adapter** system. Each `adapters/<src>.mjs` exports `discover(scope) →
PartialCompany[]`; `discover.mjs` runs the enabled ones, **dedupes** (domain → name+city) and **merges**
provenance, then writes `companies/<id>.json`. Free sources don't carry revenue, so `revenueKnown:false`
is set honestly (scoring then uses a neutral can-pay prior — never "can't pay").

## Script sources (run by the loop / directly)

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
# OSM is the default + most reliable; pick sources + area + vertical + count explicitly:
node "$PLUGIN/scripts/discover.mjs" '{"action":"discover","payload":{"sources":["osm"],"area":"Sintra, Lisboa","district":"Lisboa","vertical":"restaurants","count":25,"onlyWithWebsite":true}}'
node "$PLUGIN/scripts/discover.mjs" '{"action":"discover","payload":{"sources":["osm","gmaps"],"area":"Porto","vertical":"beauty","count":40}}'

# verticals: restaurants · cafes · bars · hotels · beauty · fitness · dental · clinics · veterinary ·
#            legal · realEstate · automotive · photography · events · trades · other (legacy: hospitality)
# payload.count = target companies to add (cap); payload.onlyWithWebsite = keep only sites to redesign;
# payload.district threads into location. OSM also captures email + all phones + social (contact:* tags).
```

| source | how | yields | notes |
| --- | --- | --- | --- |
| `osm` | Overpass + Nominatim (free API) | name, lat/lng, **website?**, phone | best SME coverage + cleanest "no website" signal |
| `wikidata` | SPARQL (free API) | name, website, sometimes employees/revenue | skews large/notable; noisy (no vertical filter) |
| `gmaps` | Playwright scrape | name, website (ads filtered) | ToS-gray, brittle; needs the capture `npm install` |
| `paginas` | PAI.pt JSON-LD scrape | name, website, phone | brittle; the search-URL pattern may need upkeep |

Prints `{added, updated, skipped, bySource}`. Re-running is safe — it updates + dedupes, never duplicates.

## Agent source (you)

`payload.sources:["agent"]` is a request for **you** to research. Use WebSearch/WebFetch to find real
companies for the niche/region, extract `{name, website, city, phone, vertical}`, and write each via the
same path — build a `discover` payload by hand-constructing the company, or extend `discover.mjs` to read
an `payload.items[]` array. Best for deep-enriching the top leads, not bulk discovery.

## Compliance

Adapters go through `lib/polite.mjs`: descriptive bot UA, per-host rate limiting, robots.txt respected
for scraped sites (Overpass/Wikidata/Nominatim are APIs called within their published usage policies).
Only public business contact data is collected. Outreach is B2B under GDPR legitimate-interest; honor the
scope's `suppress.domains` / `excludeContacted`. Don't crank volume — be a good citizen of free APIs.

## Contract (next phase)

Registry enrichment (Racius: tax id / CAE / founding / revenue) keyed by a discovered company, and the
`source:build` meta-skill that generates a new adapter from a source URL. Both keep the `discover(scope)
→ PartialCompany[]` contract.
