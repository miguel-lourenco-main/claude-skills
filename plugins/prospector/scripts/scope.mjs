// scope — validate + merge a scope edit into scope.json. Shallow-merges top-level
// keys (revenue/employees/weights merged one level deeper). Next phase: an LLM
// "scope compiler" that turns free-text into this structured spec.

import { defaultScope, readScope, storeRoot, writeScope } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const patch = req.payload?.scope ?? req.payload ?? {};
const current = readScope(root);

const merged = { ...defaultScope(), ...current, ...patch };
for (const k of ["revenue", "employees", "companyAge", "weights", "suppress"]) {
  if (patch[k]) merged[k] = { ...(current[k] ?? {}), ...patch[k] };
}
// light validation
if (merged.revenue?.min > merged.revenue?.max) [merged.revenue.min, merged.revenue.max] = [merged.revenue.max, merged.revenue.min];
writeScope(merged, root);

emit({ action: "scope", ok: true, scope: merged });
