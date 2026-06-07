import { config } from "../config.js";
import { AppError } from "./errors.js";
import { serialized } from "./rate-limiter.js";

// emusks is ESM-only with no type declarations bundled
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmusksInstance = any;

let client: EmusksInstance | null = null;
let currentWoeid: number | null = null;
let apiCalls = 0;

export function resetApiCallCount(): void {
  apiCalls = 0;
}

export function getApiCallCount(): number {
  return apiCalls;
}

async function ensureSession(): Promise<EmusksInstance> {
  if (client) return client;

  if (!config.twitterAuthToken) {
    throw new AppError("AUTH_REQUIRED", "TWITTER_AUTH_TOKEN is not set");
  }

  const { default: Emusks } = await import("emusks");
  const instance = new Emusks();

  try {
    await serialized(() => {
      apiCalls++;
      return instance.login({
        auth_token: config.twitterAuthToken,
        client: config.emusksClient,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("rate") || msg.includes("429")) {
      throw new AppError("RATE_LIMITED", `Rate limited during login: ${msg}`);
    }
    throw new AppError("AUTH_FAILED", `Login failed: ${msg}`);
  }

  client = instance;
  return client;
}

export async function getExploreSettings(): Promise<unknown> {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.trends.exploreSettings();
  });
}

export async function setLocation(woeid: number): Promise<void> {
  if (currentWoeid === woeid) return;
  const c = await ensureSession();
  try {
    await serialized(() => {
      apiCalls++;
      return c.trends.setExploreSettings({ location: { woeid } });
    });
  } catch (err) {
    // setExploreSettings sometimes returns an empty body (no JSON) even on success.
    // Re-throw only for auth/rate errors.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("rate") || msg.includes("429")) {
      throw new AppError("RATE_LIMITED", `Rate limited: ${msg}`);
    }
    if (msg.toLowerCase().includes("auth") || msg.includes("401")) {
      throw new AppError("AUTH_FAILED", `Auth error: ${msg}`);
    }
    // JSON parse or empty body — setting was likely applied, continue
  }
  currentWoeid = woeid;
}

export async function fetchExplore(opts: {
  count: number;
  cursor?: string;
}): Promise<unknown> {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.trends.explore({ count: opts.count, cursor: opts.cursor });
  });
}

export async function fetchExploreSidebar(opts: {
  count: number;
  cursor?: string;
}): Promise<unknown> {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.trends.exploreSidebar({ count: opts.count, cursor: opts.cursor });
  });
}

export async function fetchAvailableLocations(): Promise<unknown> {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.trends.available();
  });
}

export async function fetchLocationAutoComplete(query: string): Promise<unknown> {
  const c = await ensureSession();
  return serialized(async () => {
    apiCalls++;
    const res = await c.v2("guide/explore_locations_with_auto_complete", {
      params: { q: query },
    });
    return res.json();
  });
}

export async function fetchSearch(
  query: string,
  opts: { count: number; cursor?: string },
): Promise<unknown> {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.search.tweets(query, { count: opts.count, cursor: opts.cursor });
  });
}

export async function fetchSearchLatest(
  query: string,
  opts: { count: number; cursor?: string },
): Promise<unknown> {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.search.latest(query, { count: opts.count, cursor: opts.cursor });
  });
}

export async function fetchTrendById(trendId: string): Promise<unknown> {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.trends.getById(trendId);
  });
}
