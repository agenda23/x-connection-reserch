import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { memGet, memSet } from "../lib/cache.js";
import {
  resetApiCallCount,
  getApiCallCount,
  fetchSearch,
  fetchSearchLatest,
} from "../lib/emusks-client.js";
import { parseSearchTweets } from "../parsers/search.js";
import type { SearchResponse } from "../types/trend.js";

const MAX_COUNT = 20;
const MAX_PAGES = 2;
const MAX_SINCE_DAYS = 7;

export interface SearchParams {
  query: string;
  mode?: "top" | "latest";
  count?: number;
  maxPages?: number;
  since?: string;
  raw?: boolean;
}

export async function searchTweets(params: SearchParams): Promise<SearchResponse> {
  const requestedAt = new Date().toISOString();

  if (!params.query?.trim()) {
    throw new AppError("INVALID_PARAMS", "--query is required");
  }

  const mode = params.mode ?? "top";
  const count = Math.min(params.count ?? MAX_COUNT, MAX_COUNT);
  const maxPages = Math.min(params.maxPages ?? 1, MAX_PAGES);

  // Build query string
  let query = params.query.trim();
  if (params.since) {
    const sinceDate = new Date(params.since);
    if (isNaN(sinceDate.getTime())) {
      throw new AppError("INVALID_PARAMS", `--since must be a valid date: ${params.since}`);
    }
    const diffDays = (Date.now() - sinceDate.getTime()) / 86_400_000;
    if (diffDays > MAX_SINCE_DAYS) {
      throw new AppError("INVALID_PARAMS", `--since must be within the last ${MAX_SINCE_DAYS} days`);
    }
    query += ` since:${sinceDate.toISOString().slice(0, 10)}`;
  }

  const cacheKey = `search:${mode}:${query}:${count}`;
  const cached = memGet<SearchResponse>(cacheKey);
  if (cached) return cached;

  resetApiCallCount();

  const fetchFn = mode === "latest" ? fetchSearchLatest : fetchSearch;
  const allTweets: SearchResponse["data"]["tweets"] = [];
  let nextCursor: string | null = null;
  let currentCursor: string | undefined = undefined;
  let pages = 0;
  let rawPages: unknown[] = [];

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

  const apiCalls = getApiCallCount();

  const response: SearchResponse = {
    ok: true,
    data: {
      tweets: allTweets,
      ...(params.raw && { _raw: rawPages.length === 1 ? rawPages[0] : rawPages }),
    },
    meta: {
      requestedAt,
      query: params.query,
      mode,
      count: allTweets.length,
      pages,
      sampled: true,
      apiCalls,
      nextCursor,
    },
  };

  memSet(cacheKey, response, config.searchCacheTtlSeconds);
  return response;
}
