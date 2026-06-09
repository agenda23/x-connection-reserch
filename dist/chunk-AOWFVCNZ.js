#!/usr/bin/env node

// src/lib/emusks-client.ts
import { createRequire } from "module";
import { dirname as dirname2 } from "path";
import { pathToFileURL } from "url";

// src/config.ts
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
function resolvePackageRoot(moduleUrl) {
  let dir = dirname(fileURLToPath(moduleUrl));
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    dir = resolve(dir, "..");
  }
  return dir;
}
function resolveUserConfigPath() {
  if (process.env.DOTENV_PATH) return process.env.DOTENV_PATH;
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return resolve(configHome, "x-trends", ".env");
}
function loadEnvFiles(paths) {
  const presetEnv = { ...process.env };
  for (const path of paths) {
    if (!existsSync(path)) continue;
    loadEnv({ path, override: true });
  }
  for (const [key, value] of Object.entries(presetEnv)) {
    if (value !== void 0) {
      process.env[key] = value;
    }
  }
}
var packageRoot = resolvePackageRoot(import.meta.url);
loadEnvFiles([
  resolve(packageRoot, ".env"),
  resolve(process.cwd(), ".env"),
  resolveUserConfigPath()
]);
var config = {
  twitterAuthToken: process.env.TWITTER_AUTH_TOKEN ?? "",
  apiKey: process.env.API_KEY ?? "",
  port: Number(process.env.PORT ?? 3920),
  emusksClient: process.env.EMUSKS_CLIENT ?? "web",
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 300),
  searchCacheTtlSeconds: Number(process.env.SEARCH_CACHE_TTL_SECONDS ?? 900),
  requestDelayMs: Number(process.env.REQUEST_DELAY_MS ?? 3e3),
  logLevel: process.env.LOG_LEVEL ?? "info"
};

// src/lib/errors.ts
var EXIT_CODES = {
  AUTH_REQUIRED: 2,
  AUTH_FAILED: 2,
  RATE_LIMITED: 3,
  INVALID_WOEID: 1,
  INVALID_PARAMS: 1,
  INVALID_TREND_ID: 1,
  PARSE_ERROR: 1,
  UPSTREAM_ERROR: 1
};
var HTTP_STATUS = {
  AUTH_REQUIRED: 401,
  AUTH_FAILED: 401,
  RATE_LIMITED: 429,
  INVALID_WOEID: 400,
  INVALID_PARAMS: 400,
  INVALID_TREND_ID: 400,
  PARSE_ERROR: 502,
  UPSTREAM_ERROR: 502
};
var AppError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
  code;
};

// src/lib/rate-limiter.ts
var queue = Promise.resolve();
var isFirstCall = true;
function serialized(fn) {
  const run = async () => {
    if (!isFirstCall) await delay(config.requestDelayMs);
    isFirstCall = false;
    return fn();
  };
  const next = queue.then(run);
  queue = next;
  return next;
}
function delay(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// src/lib/emusks-client.ts
var require2 = createRequire(import.meta.url);
var client = null;
var currentWoeid = null;
var apiCalls = 0;
function resetApiCallCount() {
  apiCalls = 0;
}
function getApiCallCount() {
  return apiCalls;
}
async function applyAuthCookiesFromResponse(c, res) {
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
      const parts = String(c.auth.client.headers.cookie).split("; ").filter((p) => p && !p.startsWith(`${name}=`));
      parts.push(cookiePair);
      c.auth.client.headers.cookie = parts.join("; ");
    }
  }
}
function mapUpstreamError(err, context) {
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
      `Empty or invalid response during ${context}. The session may have expired \u2014 refresh TWITTER_AUTH_TOKEN and retry.`
    );
  }
  return new AppError("UPSTREAM_ERROR", `${context} failed: ${msg}`);
}
async function runSerialized(fn) {
  try {
    return await serialized(fn);
  } catch (err) {
    throw mapUpstreamError(err, "API call");
  }
}
async function ensureSession() {
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
        client: config.emusksClient
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
async function getExploreSettings() {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.exploreSettings();
  });
}
async function setLocation(woeid) {
  if (currentWoeid === woeid) return;
  const c = await ensureSession();
  try {
    await runSerialized(async () => {
      apiCalls++;
      const res = await c.v2("guide/set_explore_settings", {
        body: JSON.stringify({ location: { woeid } })
      });
      await applyAuthCookiesFromResponse(c, res);
      const text = await res.text();
      if (text.trim()) {
        try {
          JSON.parse(text);
        } catch {
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
  }
  currentWoeid = woeid;
}
async function fetchExplore(opts) {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.explore({ count: opts.count, cursor: opts.cursor });
  });
}
async function fetchExploreSidebar(opts) {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.exploreSidebar({ count: opts.count, cursor: opts.cursor });
  });
}
async function fetchAvailableLocations() {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.available();
  });
}
async function fetchLocationAutoComplete(query) {
  const c = await ensureSession();
  return runSerialized(async () => {
    apiCalls++;
    const res = await c.v2("guide/explore_locations_with_auto_complete", {
      params: { q: query }
    });
    return res.json();
  });
}
async function fetchSearch(query, opts) {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.search.tweets(query, { count: opts.count, cursor: opts.cursor });
  });
}
async function fetchSearchLatest(query, opts) {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.search.latest(query, { count: opts.count, cursor: opts.cursor });
  });
}
async function fetchTrendById(trendId) {
  const c = await ensureSession();
  return runSerialized(() => {
    apiCalls++;
    return c.trends.getById(trendId);
  });
}
async function closeEmusksSession() {
  client = null;
  currentWoeid = null;
  try {
    const emusksRoot = dirname2(require2.resolve("emusks/package.json"));
    const { default: getCycleTLS } = await import(pathToFileURL(`${emusksRoot}/src/cycletls.js`).href);
    const cycleTLS = await getCycleTLS();
    await cycleTLS.exit();
  } catch {
  }
}

export {
  config,
  EXIT_CODES,
  HTTP_STATUS,
  AppError,
  resetApiCallCount,
  getApiCallCount,
  getExploreSettings,
  setLocation,
  fetchExplore,
  fetchExploreSidebar,
  fetchAvailableLocations,
  fetchLocationAutoComplete,
  fetchSearch,
  fetchSearchLatest,
  fetchTrendById,
  closeEmusksSession
};
