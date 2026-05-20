// Soft per-IP token bucket. Lives in module-level Map, persisting across
// requests within the same Worker instance. Cloudflare may spawn multiple
// isolates per colo and may recycle instances, so this is best-effort
// flood protection - NOT a security boundary. A determined attacker can
// bypass by hopping colos or waiting for instance recycle. Sized for
// "stops the F5-spamming kid" not "stops a botnet."

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

// Test-only: clear all state between tests.
export function _resetForTests(): void {
  buckets.clear();
  lastSweep = 0;
}

export function checkRate(
  ip: string,
  capacity: number,
  refillPerSec: number,
  now: number = Date.now(),
): boolean {
  // Periodic sweep: drop IPs idle > 5 minutes to bound memory growth.
  if (now - lastSweep > 60_000) {
    for (const [k, v] of buckets) {
      if (now - v.lastRefill > 300_000) buckets.delete(k);
    }
    lastSweep = now;
  }

  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: capacity, lastRefill: now };
    buckets.set(ip, b);
  } else {
    const elapsedSec = Math.max(0, (now - b.lastRefill) / 1000);
    b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
    b.lastRefill = now;
  }

  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
