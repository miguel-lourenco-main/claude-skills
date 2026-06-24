// Shared helpers for the stub action scripts. Each script is invoked by the
// dashboard watch-loop as:  node scripts/<action>.mjs '<request-json>'
// and prints a one-line JSON result to stdout.

/** Parse the request object from argv[2] (the queued request), tolerating absence. */
export function readRequest() {
  const raw = process.argv[2];
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function emit(result) {
  process.stdout.write(JSON.stringify(result) + "\n");
}

/** Report mid-run progress. Goes to STDERR as tagged NDJSON so it never pollutes the single
 *  stdout result line (the watch-loop parses these to update the live "now running" marker;
 *  direct callers that only read stdout are unaffected).
 *  event: { i, n, item, phase, message } — all optional. */
export function progress(event = {}) {
  try { process.stderr.write(JSON.stringify({ __progress: true, ...event }) + "\n"); } catch { /* ignore */ }
}

/** Tiny deterministic hash → unsigned int, so stub data is stable per company id. */
export function hashInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pick from an array using a string seed. */
export const pick = (arr, seed) => arr[hashInt(seed) % arr.length];
