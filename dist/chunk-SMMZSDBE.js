#!/usr/bin/env node

// src/config.ts
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
var repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
var envPath = process.env.DOTENV_PATH ?? resolve(repoRoot, ".env");
loadEnv({ path: envPath, override: true });
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

// src/types/trend.ts
var WOEID_PRESETS = {
  worldwide: 1,
  japan: 23424856,
  us: 23424977,
  uk: 23424975,
  tokyo: 1118370
};

// src/lib/cache.ts
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve as resolve2 } from "path";
import { homedir } from "os";
var memoryCache = /* @__PURE__ */ new Map();
function memGet(key) {
  const entry = memoryCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return void 0;
  }
  return entry.value;
}
function memSet(key, value, ttlSeconds) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1e3 });
}
var snapshotDir = resolve2(homedir(), ".cache", "x-trends");
function snapshotPath(cacheKey) {
  const safe = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return resolve2(snapshotDir, `snapshot-${safe}.json`);
}
function readSnapshot(cacheKey) {
  try {
    const raw = readFileSync(snapshotPath(cacheKey), "utf8");
    return JSON.parse(raw);
  } catch {
    return void 0;
  }
}
function writeSnapshot(cacheKey, value) {
  try {
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(snapshotPath(cacheKey), JSON.stringify(value), "utf8");
  } catch {
  }
}

// src/lib/rate-limiter.ts
var queue = Promise.resolve();
function serialized(fn) {
  const next = queue.then(fn);
  queue = next.then(
    () => delay(config.requestDelayMs),
    () => delay(config.requestDelayMs)
  );
  return next;
}
function delay(ms) {
  return new Promise((resolve3) => setTimeout(resolve3, ms));
}

// src/lib/emusks-client.ts
var client = null;
var currentWoeid = null;
var apiCalls = 0;
function resetApiCallCount() {
  apiCalls = 0;
}
function getApiCallCount() {
  return apiCalls;
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
  return serialized(() => {
    apiCalls++;
    return c.trends.exploreSettings();
  });
}
async function setLocation(woeid) {
  if (currentWoeid === woeid) return;
  const c = await ensureSession();
  try {
    await serialized(() => {
      apiCalls++;
      return c.trends.setExploreSettings({ location: { woeid } });
    });
  } catch (err) {
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
  return serialized(() => {
    apiCalls++;
    return c.trends.explore({ count: opts.count, cursor: opts.cursor });
  });
}
async function fetchExploreSidebar(opts) {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.trends.exploreSidebar({ count: opts.count, cursor: opts.cursor });
  });
}
async function fetchAvailableLocations() {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.trends.available();
  });
}
async function fetchLocationAutoComplete(query) {
  const c = await ensureSession();
  return serialized(async () => {
    apiCalls++;
    const res = await c.v2("guide/explore_locations_with_auto_complete", {
      params: { q: query }
    });
    return res.json();
  });
}
async function fetchSearch(query, opts) {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.search.tweets(query, { count: opts.count, cursor: opts.cursor });
  });
}
async function fetchSearchLatest(query, opts) {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.search.latest(query, { count: opts.count, cursor: opts.cursor });
  });
}
async function fetchTrendById(trendId) {
  const c = await ensureSession();
  return serialized(() => {
    apiCalls++;
    return c.trends.getById(trendId);
  });
}

// src/parsers/explore.ts
var PARSER_VERSION = "1";
function parseExploreTrends(raw) {
  try {
    const instructions = findInstructions(raw);
    if (!instructions) return { trends: [], cursor: null, nextCursor: null, partial: true };
    const addEntries = instructions.find(
      (i) => isRecord(i) && i["type"] === "TimelineAddEntries"
    );
    if (!addEntries) return { trends: [], cursor: null, nextCursor: null, partial: true };
    const entries = addEntries["entries"];
    if (!Array.isArray(entries)) return { trends: [], cursor: null, nextCursor: null, partial: true };
    const trends = [];
    let cursor = null;
    let nextCursor = null;
    let rank = 1;
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const content = entry["content"];
      if (!isRecord(content)) continue;
      const typename = content["__typename"];
      if (typename === "TimelineTimelineCursor") {
        if (content["cursorType"] === "Top") cursor = String(content["value"] ?? "");
        if (content["cursorType"] === "Bottom") nextCursor = String(content["value"] ?? "");
        continue;
      }
      if (typename === "TimelineTimelineItem") {
        const itemContent = content["itemContent"];
        if (!isRecord(itemContent)) continue;
        if (itemContent["__typename"] === "TimelineTrend") {
          const t = parseTrendItem(itemContent, rank, content["clientEventInfo"]);
          if (t) {
            trends.push(t);
            rank++;
          }
        }
        continue;
      }
      if (typename === "TimelineTimelineModule") {
        const component = content["clientEventInfo"]?.["component"];
        if (component === "stories") {
          const items = content["items"];
          if (!Array.isArray(items)) continue;
          for (const moduleItem of items) {
            if (!isRecord(moduleItem)) continue;
            const item = moduleItem["item"];
            if (!isRecord(item)) continue;
            const ic = item["itemContent"];
            if (!isRecord(ic) || ic["__typename"] !== "TimelineTrend") continue;
            const t = parseTrendItem(ic, rank, item["clientEventInfo"], true);
            if (t) {
              trends.push(t);
              rank++;
            }
          }
        }
      }
    }
    return { trends, cursor, nextCursor, partial: false };
  } catch {
    return { trends: [], cursor: null, nextCursor: null, partial: true };
  }
}
function parseTrendItem(ic, rank, clientEventInfo, isAiTrend = false) {
  const name = ic["name"];
  if (typeof name !== "string" || !name) return null;
  const eventComponent = isRecord(clientEventInfo) ? String(clientEventInfo["component"] ?? "") : "";
  const isPromoted = eventComponent.includes("promoted") || "promotedMetadata" in ic;
  const trendUrl = ic["trend_url"];
  const trendMeta = ic["trend_metadata"];
  const deepLink = (isRecord(trendUrl) ? String(trendUrl["url"] ?? "") : "") || (isRecord(trendMeta) && isRecord(trendMeta["url"]) ? String(trendMeta["url"]["url"] ?? "") : "");
  const webUrl = deepLinkToWeb(deepLink);
  const socialContext = ic["social_context"];
  const tweetVolume = isRecord(socialContext) ? parseVolume(String(socialContext["text"] ?? "")) : null;
  const domainContext = isRecord(trendMeta) ? String(trendMeta["domain_context"] ?? "") : "";
  const category = isPromoted ? "promoted" : isAiTrend ? "topic" : "trending";
  return {
    id: null,
    name,
    url: webUrl,
    tweetVolume,
    rank,
    category,
    description: domainContext || null,
    hashtags: name.startsWith("#") ? [name] : [],
    warnings: []
  };
}
function deepLinkToWeb(url) {
  if (!url) return null;
  const m = url.match(/twitter:\/\/search\/\?query=(.+)/);
  if (m) return `https://x.com/search?q=${m[1]}`;
  return null;
}
function parseVolume(text) {
  const m = text.match(/([\d.]+)\s*(K|M)?\s*posts/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mul = m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : 1;
  return Math.round(n * mul);
}
function findInstructions(val, depth = 0) {
  if (depth > 12 || !isRecord(val)) return null;
  for (const [key, child] of Object.entries(val)) {
    if (key === "instructions" && Array.isArray(child)) return child;
    const found = findInstructions(child, depth + 1);
    if (found) return found;
  }
  return null;
}
function filterPromoted(trends) {
  return trends.filter((t) => t.category !== "promoted");
}
function filterCategories(trends, categories) {
  if (categories.length === 0) return trends;
  return trends.filter((t) => categories.includes(t.category));
}
function mergeTrends(explore, sidebar) {
  const byName = /* @__PURE__ */ new Map();
  for (const t of explore) byName.set(normalizeName(t.name), t);
  for (const t of sidebar) {
    const key = normalizeName(t.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, t);
    } else if (t.tweetVolume !== null && (existing.tweetVolume === null || t.tweetVolume > existing.tweetVolume)) {
      byName.set(key, { ...t, rank: existing.rank });
    }
  }
  return [...byName.values()].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
}
function normalizeName(name) {
  return name.toLowerCase().replace(/^#/, "").trim();
}
function computeDiff(current, previous) {
  const prevByName = new Map(previous.map((t) => [t.name, t]));
  const currNames = new Set(current.map((t) => t.name));
  return {
    new: current.filter((t) => !prevByName.has(t.name)).map((t) => t.name),
    dropped: previous.filter((t) => !currNames.has(t.name)).map((t) => t.name),
    rankChanged: current.flatMap((t) => {
      const p = prevByName.get(t.name);
      return p && p.rank !== null && t.rank !== null && p.rank !== t.rank ? [{ name: t.name, from: p.rank, to: t.rank }] : [];
    })
  };
}
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/services/trends.ts
async function listTrends(params) {
  const requestedAt = (/* @__PURE__ */ new Date()).toISOString();
  const count = params.count ?? 20;
  if (count > 50) {
    throw new AppError("INVALID_PARAMS", "--count must be 50 or less");
  }
  const source = params.source ?? "explore";
  const excludePromoted = params.excludePromoted ?? true;
  const categories = params.categories ?? [];
  let woeid = null;
  let resolvedPreset = params.preset ?? null;
  if (params.preset && WOEID_PRESETS[params.preset] !== void 0) {
    woeid = WOEID_PRESETS[params.preset];
  } else if (params.woeid != null) {
    woeid = params.woeid;
  }
  resetApiCallCount();
  if (woeid === null) {
    const settings = await getExploreSettings();
    const loc = settings?.["location"];
    woeid = loc?.["woeid"] != null ? Number(loc["woeid"]) : null;
  }
  const cacheKey = `trends:${woeid}:${source}`;
  const cached = memGet(cacheKey);
  if (cached && !params.diff) {
    return { ...cached, meta: { ...cached.meta, cached: true } };
  }
  if (woeid !== null) await setLocation(woeid);
  let exploreRaw;
  let sidebarRaw;
  if (source === "explore" || source === "merge") {
    exploreRaw = await fetchExplore({ count, cursor: params.cursor });
  }
  if (source === "sidebar" || source === "merge") {
    sidebarRaw = await fetchExploreSidebar({ count, cursor: params.cursor });
  }
  const apiCalls2 = getApiCallCount();
  const exploreResult = exploreRaw ? parseExploreTrends(exploreRaw) : { trends: [], cursor: null, nextCursor: null, partial: false };
  const sidebarResult = sidebarRaw ? parseExploreTrends(sidebarRaw) : { trends: [], cursor: null, nextCursor: null, partial: false };
  let trends = source === "merge" ? mergeTrends(exploreResult.trends, sidebarResult.trends) : exploreResult.trends.length > 0 ? exploreResult.trends : sidebarResult.trends;
  const partial = exploreResult.partial || sidebarResult.partial;
  const cursor = exploreResult.cursor ?? sidebarResult.cursor;
  const nextCursor = exploreResult.nextCursor ?? sidebarResult.nextCursor;
  if (excludePromoted) trends = filterPromoted(trends);
  if (categories.length > 0) trends = filterCategories(trends, categories);
  trends = trends.slice(0, count);
  let changes = void 0;
  if (params.diff) {
    const previous = readSnapshot(cacheKey);
    if (previous) {
      changes = computeDiff(trends, previous);
    }
    writeSnapshot(cacheKey, trends);
  }
  const expiresAt = new Date(
    Date.now() + config.cacheTtlSeconds * 1e3
  ).toISOString();
  const response = {
    ok: true,
    data: {
      trends,
      ...changes !== void 0 && { changes },
      ...params.raw && {
        _raw: source === "merge" ? { explore: exploreRaw, sidebar: sidebarRaw } : exploreRaw ?? sidebarRaw
      }
    },
    meta: {
      requestedAt,
      woeid,
      preset: resolvedPreset,
      source,
      excludePromoted,
      categories: categories.length > 0 ? categories : null,
      count: trends.length,
      cached: false,
      cacheExpiresAt: expiresAt,
      cursor: cursor ?? null,
      nextCursor: nextCursor ?? null,
      apiCalls: apiCalls2,
      parserVersion: PARSER_VERSION,
      partial
    }
  };
  memSet(cacheKey, response, config.cacheTtlSeconds);
  return response;
}

// src/parsers/location.ts
function parseLocations(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const r = item;
    const woeid = Number(r["woeid"]);
    if (!woeid) return [];
    const placeType = r["placeType"];
    return [
      {
        name: String(r["name"] ?? ""),
        woeid,
        country: r["country"] != null ? String(r["country"]) : null,
        countryCode: r["countryCode"] != null ? String(r["countryCode"]) : null,
        placeType: {
          code: typeof placeType === "object" && placeType !== null ? Number(placeType["code"]) || null : null,
          name: typeof placeType === "object" && placeType !== null ? String(placeType["name"] ?? "") : null
        },
        url: r["url"] != null ? String(r["url"]) : null,
        parentid: r["parentid"] != null ? Number(r["parentid"]) || null : null
      }
    ];
  });
}
function parseAutoCompleteLocations(raw) {
  if (Array.isArray(raw)) return parseLocations(raw);
  if (typeof raw === "object" && raw !== null) {
    const r = raw;
    if (Array.isArray(r["locations"])) return parseLocations(r["locations"]);
    if (Array.isArray(r["data"])) return parseLocations(r["data"]);
  }
  return [];
}
function filterLocationsByName(locations, query) {
  const q = query.toLowerCase();
  return locations.filter(
    (l) => l.name.toLowerCase().includes(q) || (l.country ?? "").toLowerCase().includes(q)
  );
}

// src/services/locations.ts
async function listLocations(search) {
  const requestedAt = (/* @__PURE__ */ new Date()).toISOString();
  resetApiCallCount();
  let locations;
  if (search) {
    try {
      const raw = await fetchLocationAutoComplete(search);
      locations = parseAutoCompleteLocations(raw);
      if (locations.length === 0) {
        const allRaw = await fetchAvailableLocations();
        locations = filterLocationsByName(parseLocations(allRaw), search);
      }
    } catch {
      const allRaw = await fetchAvailableLocations();
      locations = filterLocationsByName(parseLocations(allRaw), search);
    }
  } else {
    const raw = await fetchAvailableLocations();
    locations = parseLocations(raw);
  }
  return {
    ok: true,
    data: { locations },
    meta: {
      requestedAt,
      apiCalls: getApiCallCount(),
      count: locations.length
    }
  };
}
async function getSettings() {
  const requestedAt = (/* @__PURE__ */ new Date()).toISOString();
  resetApiCallCount();
  const raw = await getExploreSettings();
  const r = raw;
  const loc = r?.["location"];
  const settings = {
    location: loc ? {
      woeid: loc["woeid"] != null ? Number(loc["woeid"]) : null,
      name: loc["name"] != null ? String(loc["name"]) : null
    } : null,
    raw
  };
  return {
    ok: true,
    data: { settings },
    meta: { requestedAt, apiCalls: getApiCallCount() }
  };
}

// src/parsers/search.ts
function parseSearchTweets(raw) {
  try {
    if (!isRecord2(raw)) return { tweets: [], nextCursor: null };
    const tweetsArr = Array.isArray(raw["tweets"]) ? raw["tweets"] : [];
    const tweets = [];
    for (const item of tweetsArr) {
      const t = parseTweet(item);
      if (t) tweets.push(t);
    }
    const nextCursor = typeof raw["next_cursor"] === "string" ? raw["next_cursor"] : typeof raw["cursor"] === "string" ? raw["cursor"] : null;
    return { tweets, nextCursor };
  } catch {
    return { tweets: [], nextCursor: null };
  }
}
function parseTweet(item) {
  if (!isRecord2(item)) return null;
  const id = typeof item["id"] === "string" ? item["id"] : null;
  if (!id) return null;
  const text = typeof item["text"] === "string" ? item["text"] : "";
  const createdAt = typeof item["created_at"] === "string" ? parseTwitterDate(item["created_at"]) : null;
  const lang = typeof item["lang"] === "string" ? item["lang"] : null;
  const user = isRecord2(item["user"]) ? item["user"] : null;
  const authorId = user && typeof user["id"] === "string" ? user["id"] : "unknown";
  const username = user && typeof user["username"] === "string" ? user["username"] : "unknown";
  const name = user && typeof user["name"] === "string" ? user["name"] : username;
  const verification = user && isRecord2(user["verification"]) ? user["verification"] : null;
  const verified = verification && verification["verified"] === true || verification && verification["premium_verified"] === true || false;
  const stats = isRecord2(item["stats"]) ? item["stats"] : {};
  const metrics = {
    likes: toInt(stats["likes"]),
    retweets: toInt(stats["retweets"]),
    replies: toInt(stats["replies"]),
    views: toInt(stats["views"])
  };
  const rawUrls = Array.isArray(item["urls"]) ? item["urls"] : [];
  const urls = rawUrls.map(
    (u) => isRecord2(u) && typeof u["expanded_url"] === "string" ? u["expanded_url"] : null
  ).filter((u) => u !== null);
  const rawHashtags = Array.isArray(item["hashtags"]) ? item["hashtags"] : [];
  const hashtags = rawHashtags.map((h) => {
    if (isRecord2(h) && typeof h["text"] === "string") return `#${h["text"]}`;
    if (typeof h === "string") return h.startsWith("#") ? h : `#${h}`;
    return null;
  }).filter((h) => h !== null);
  return {
    id,
    text,
    createdAt,
    lang,
    author: { id: authorId, username, name, verified: Boolean(verified) },
    metrics,
    urls,
    hashtags
  };
}
function parseTwitterDate(s) {
  try {
    return new Date(s).toISOString();
  } catch {
    return null;
  }
}
function toInt(v) {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}
function isRecord2(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/services/search.ts
var MAX_COUNT = 20;
var MAX_PAGES = 2;
var MAX_SINCE_DAYS = 7;
async function searchTweets(params) {
  const requestedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!params.query?.trim()) {
    throw new AppError("INVALID_PARAMS", "--query is required");
  }
  const mode = params.mode ?? "top";
  const count = Math.min(params.count ?? MAX_COUNT, MAX_COUNT);
  const maxPages = Math.min(params.maxPages ?? 1, MAX_PAGES);
  let query = params.query.trim();
  if (params.since) {
    const sinceDate = new Date(params.since);
    if (isNaN(sinceDate.getTime())) {
      throw new AppError("INVALID_PARAMS", `--since must be a valid date: ${params.since}`);
    }
    const diffDays = (Date.now() - sinceDate.getTime()) / 864e5;
    if (diffDays > MAX_SINCE_DAYS) {
      throw new AppError("INVALID_PARAMS", `--since must be within the last ${MAX_SINCE_DAYS} days`);
    }
    query += ` since:${sinceDate.toISOString().slice(0, 10)}`;
  }
  const cacheKey = `search:${mode}:${query}:${count}`;
  const cached = memGet(cacheKey);
  if (cached) return cached;
  resetApiCallCount();
  const fetchFn = mode === "latest" ? fetchSearchLatest : fetchSearch;
  const allTweets = [];
  let nextCursor = null;
  let currentCursor = void 0;
  let pages = 0;
  let rawPages = [];
  for (let page = 0; page < maxPages; page++) {
    const raw = await fetchFn(query, { count, cursor: currentCursor });
    pages++;
    if (params.raw) rawPages.push(raw);
    const { tweets, nextCursor: nc } = parseSearchTweets(raw);
    allTweets.push(...tweets);
    nextCursor = nc;
    if (!nc || tweets.length === 0) break;
    currentCursor = nc;
  }
  const apiCalls2 = getApiCallCount();
  const response = {
    ok: true,
    data: {
      tweets: allTweets,
      ...params.raw && { _raw: rawPages.length === 1 ? rawPages[0] : rawPages }
    },
    meta: {
      requestedAt,
      query: params.query,
      mode,
      count: allTweets.length,
      pages,
      sampled: true,
      apiCalls: apiCalls2,
      nextCursor
    }
  };
  memSet(cacheKey, response, config.searchCacheTtlSeconds);
  return response;
}

// src/parsers/detail.ts
function parseTrendDetail(raw, id) {
  if (!isRecord3(raw)) {
    return { id, name: null, summary: null, postsOverview: null, createdAt: null, relatedTrends: [] };
  }
  const trend = findTrendObject(raw);
  const name = trend ? getString(trend, ["name"]) : null;
  const summary = trend ? getString(trend, ["trend_metadata", "meta_description"]) ?? getString(trend, ["summary"]) ?? getString(trend, ["description"]) : null;
  const postsOverview = trend ? getString(trend, ["social_context", "text"]) : null;
  const createdAt = trend ? getString(trend, ["created_at"]) : null;
  return { id, name, summary, postsOverview, createdAt, relatedTrends: [] };
}
function findTrendObject(val, depth = 0) {
  if (depth > 12 || !isRecord3(val)) return null;
  if (typeof val["name"] === "string" && val["name"] && ("trend_metadata" in val || "trend_url" in val || "social_context" in val)) {
    return val;
  }
  for (const child of Object.values(val)) {
    const found = findTrendObject(child, depth + 1);
    if (found) return found;
  }
  return null;
}
function getString(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (!isRecord3(cur)) return null;
    cur = cur[key];
  }
  return typeof cur === "string" && cur ? cur : null;
}
function isRecord3(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/services/detail.ts
async function getTrendDetail(id, raw) {
  const requestedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!id?.trim()) {
    throw new AppError("INVALID_PARAMS", "--id is required");
  }
  resetApiCallCount();
  let rawData;
  try {
    rawData = await fetchTrendById(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("rate") || msg.includes("429")) {
      throw new AppError("RATE_LIMITED", `Rate limited: ${msg}`);
    }
    if (msg.toLowerCase().includes("auth") || msg.includes("401")) {
      throw new AppError("AUTH_FAILED", `Auth error: ${msg}`);
    }
    throw new AppError("INVALID_PARAMS", `Could not fetch trend "${id}": ${msg}`);
  }
  const apiCalls2 = getApiCallCount();
  const detail = parseTrendDetail(rawData, id);
  if (raw) detail._raw = rawData;
  return {
    ok: true,
    data: { detail },
    meta: { requestedAt, apiCalls: apiCalls2 }
  };
}

export {
  config,
  EXIT_CODES,
  HTTP_STATUS,
  AppError,
  WOEID_PRESETS,
  listTrends,
  listLocations,
  getSettings,
  searchTweets,
  getTrendDetail
};
