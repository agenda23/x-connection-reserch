import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import {
  memGet,
  memSet,
  memExpiresAt,
  readSnapshot,
  writeSnapshot,
} from "../lib/cache.js";
import {
  resetApiCallCount,
  getApiCallCount,
  getExploreSettings,
  setLocation,
  fetchExplore,
  fetchExploreSidebar,
} from "../lib/emusks-client.js";
import {
  parseExploreTrends,
  filterPromoted,
  filterCategories,
  mergeTrends,
  computeDiff,
  PARSER_VERSION,
} from "../parsers/explore.js";
import { WOEID_PRESETS } from "../types/trend.js";
import type {
  TrendItem,
  TrendListResponse,
} from "../types/trend.js";

export interface ListTrendsParams {
  woeid?: number;
  preset?: string;
  count?: number;
  source?: "explore" | "sidebar" | "merge";
  excludePromoted?: boolean;
  categories?: string[];
  diff?: boolean;
  cursor?: string;
  raw?: boolean;
}

export async function listTrends(
  params: ListTrendsParams,
): Promise<TrendListResponse> {
  const requestedAt = new Date().toISOString();
  const count = params.count ?? 20;
  if (count > 50) {
    throw new AppError("INVALID_PARAMS", "--count must be 50 or less");
  }

  const source = params.source ?? "explore";
  const excludePromoted = params.excludePromoted ?? true;
  const categories = params.categories ?? [];

  // Resolve woeid
  let woeid: number | null = null;
  let resolvedPreset: string | null = params.preset ?? null;

  if (params.preset && WOEID_PRESETS[params.preset] !== undefined) {
    woeid = WOEID_PRESETS[params.preset];
  } else if (params.woeid != null) {
    woeid = params.woeid;
  }

  resetApiCallCount();

  // If no woeid specified, read current explore settings (+1 API call)
  if (woeid === null) {
    const settings = await getExploreSettings();
    const loc = (settings as Record<string, unknown>)?.["location"] as
      | Record<string, unknown>
      | undefined;
    woeid = loc?.["woeid"] != null ? Number(loc["woeid"]) : null;
  }

  const cacheKey = `trends:${woeid}:${source}`;

  // Memory cache
  const cached = memGet<TrendListResponse>(cacheKey);
  if (cached && !params.diff) {
    return { ...cached, meta: { ...cached.meta, cached: true } };
  }

  // Fetch
  if (woeid !== null) await setLocation(woeid);

  let exploreRaw: unknown;
  let sidebarRaw: unknown;

  if (source === "explore" || source === "merge") {
    exploreRaw = await fetchExplore({ count, cursor: params.cursor });
  }
  if (source === "sidebar" || source === "merge") {
    sidebarRaw = await fetchExploreSidebar({ count, cursor: params.cursor });
  }

  const apiCalls = getApiCallCount();

  // Parse
  const exploreResult = exploreRaw
    ? parseExploreTrends(exploreRaw)
    : { trends: [], cursor: null, nextCursor: null, partial: false };
  const sidebarResult = sidebarRaw
    ? parseExploreTrends(sidebarRaw)
    : { trends: [], cursor: null, nextCursor: null, partial: false };

  let trends: TrendItem[] =
    source === "merge"
      ? mergeTrends(exploreResult.trends, sidebarResult.trends)
      : (exploreResult.trends.length > 0
          ? exploreResult.trends
          : sidebarResult.trends);

  const partial = exploreResult.partial || sidebarResult.partial;
  const cursor = exploreResult.cursor ?? sidebarResult.cursor;
  const nextCursor = exploreResult.nextCursor ?? sidebarResult.nextCursor;

  // Filter
  if (excludePromoted) trends = filterPromoted(trends);
  if (categories.length > 0) trends = filterCategories(trends, categories);
  trends = trends.slice(0, count);

  // Diff
  let changes = undefined;
  if (params.diff) {
    const previous = readSnapshot<TrendItem[]>(cacheKey);
    if (previous) {
      changes = computeDiff(trends, previous);
    }
    writeSnapshot(cacheKey, trends);
  }

  const expiresAt = new Date(
    Date.now() + config.cacheTtlSeconds * 1000,
  ).toISOString();

  const response: TrendListResponse = {
    ok: true,
    data: {
      trends,
      ...(changes !== undefined && { changes }),
      ...(params.raw && {
        _raw: source === "merge" ? { explore: exploreRaw, sidebar: sidebarRaw } : (exploreRaw ?? sidebarRaw),
      }),
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
      apiCalls,
      parserVersion: PARSER_VERSION,
      partial,
    },
  };

  memSet(cacheKey, response, config.cacheTtlSeconds);
  return response;
}
