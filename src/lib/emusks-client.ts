import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "../config.js";
import { AppError } from "./errors.js";
import { serialized } from "./rate-limiter.js";

const require = createRequire(import.meta.url);

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

async function applyAuthCookiesFromResponse(
  c: EmusksInstance,
  res: { headers?: Record<string, string | string[] | undefined> },
): Promise<void> {
  const raw = res.headers?.["Set-Cookie"] ?? res.headers?.["set-cookie"] ?? [];
  const setCookies = Array.isArray(raw) ? raw : raw ? [raw] : [];

  for (const setCookie of setCookies) {
    const cookiePair = String(setCookie).split(";")[0];
    if (!cookiePair) continue;

    if (cookiePair.startsWith("ct0=") && c.auth) {
      c.auth.csrfToken = cookiePair.slice("ct0=".length);
    }

    if (c.auth?.client?.headers) {
      const name = cookiePair.split("=")[0];
      const parts = String(c.auth.client.headers.cookie)
        .split("; ")
        .filter((p) => p && !p.startsWith(`${name}=`));
      parts.push(cookiePair);
      c.auth.client.headers.cookie = parts.join("; ");
    }
  }
}

function mapUpstreamError(err: unknown, context: string): AppError {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes("rate") || msg.includes("429")) {
    return new AppError("RATE_LIMITED", `Rate limited during ${context}: ${msg}`);
  }
  if (msg.toLowerCase().includes("auth") || msg.includes("401")) {
    return new AppError("AUTH_FAILED", `Auth error during ${context}: ${msg}`);
  }
  if (msg.includes("JSON")) {
    return new AppError(
      "UPSTREAM_ERROR",
      `Empty or invalid response during ${context}. The session may have expired — refresh TWITTER_AUTH_TOKEN and retry.`,
    );
  }
  return new AppError("UPSTREAM_ERROR", `${context} failed: ${msg}`);
}

async function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await serialized(fn);
  } catch (err) {
    throw mapUpstreamError(err, "API call");
  }
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
  return runSerialized(() => {
    apiCalls++;
    return c.trends.exploreSettings();
  });
}

export async function setLocation(woeid: number): Promise<void> {
  if (currentWoeid === woeid) return;
  const c = await ensureSession();
  try {
    await runSerialized(async () => {
      apiCalls++;
      const res = await c.v2("guide/set_explore_settings", {
        body: JSON.stringify({ location: { woeid } }),
      });
      await applyAuthCookiesFromResponse(c, res);
      // set_explore_settings often returns 200 with an empty body on success
      const text = await res.text();
      if (text.trim()) {
        try {
          JSON.parse(text);
        } catch {
          // non-fatal: location change may still have been applied
        }
      }
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("rate") || msg.includes("429")) {
      throw new AppError("RATE_LIMITED", `Rate limited: ${msg}`);
    }
    if (msg.toLowerCase().includes("auth") || msg.includes("401")) {
      throw new AppError("AUTH_FAILED", `Auth error: ${msg}`);
    }
    // Other failures: location change may still have been applied
  }
  currentWoeid = woeid;
}

export async function fetchExplore(opts: {
  count: number;
  cursor?: string;
}): Promise<unknown> {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.explore({ count: opts.count, cursor: opts.cursor });
  });
}

export async function fetchExploreSidebar(opts: {
  count: number;
  cursor?: string;
}): Promise<unknown> {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.exploreSidebar({ count: opts.count, cursor: opts.cursor });
  });
}

export async function fetchAvailableLocations(): Promise<unknown> {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.available();
  });
}

export async function fetchLocationAutoComplete(query: string): Promise<unknown> {
  const c = await ensureSession();
  return runSerialized(async () => {
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
  return runSerialized(() => {
    apiCalls++;
    return c.search.tweets(query, { count: opts.count, cursor: opts.cursor });
  });
}

export async function fetchSearchLatest(
  query: string,
  opts: { count: number; cursor?: string },
): Promise<unknown> {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.search.latest(query, { count: opts.count, cursor: opts.cursor });
  });
}

export async function fetchTrendById(trendId: string): Promise<unknown> {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.getById(trendId);
  });
}

/** Tear down emusks/cycletls handles so one-shot CLI commands can exit. */
export async function closeEmusksSession(): Promise<void> {
  client = null;
  currentWoeid = null;
  try {
    const emusksRoot = dirname(require.resolve("emusks/package.json"));
    const { default: getCycleTLS } = await import(
      pathToFileURL(`${emusksRoot}/src/cycletls.js`).href
    );
    const cycleTLS = await getCycleTLS();
    await cycleTLS.exit();
  } catch {
    // session never started, or already closed
  }
}
