import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function memGet<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function memSet<T>(key: string, value: T, ttlSeconds: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function memExpiresAt(key: string): string | null {
  const entry = memoryCache.get(key);
  return entry ? new Date(entry.expiresAt).toISOString() : null;
}

// ── Snapshot persistence for CLI --diff ──────────────────────────────────────
// HTTP server mode: memory only (process stays alive between calls)
// CLI one-shot mode: file-backed (process exits after each call)

const snapshotDir = resolve(homedir(), ".cache", "x-trends");

function snapshotPath(cacheKey: string): string {
  const safe = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return resolve(snapshotDir, `snapshot-${safe}.json`);
}

export function readSnapshot<T>(cacheKey: string): T | undefined {
  try {
    const raw = readFileSync(snapshotPath(cacheKey), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeSnapshot<T>(cacheKey: string, value: T): void {
  try {
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(snapshotPath(cacheKey), JSON.stringify(value), "utf8");
  } catch {
    // non-fatal: diff simply won't work on next run
  }
}
