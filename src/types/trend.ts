export interface TrendItem {
  id: string | null;
  name: string;
  url: string | null;
  tweetVolume: number | null;
  rank: number | null;
  category: "trending" | "promoted" | "event" | "topic" | "unknown";
  description: string | null;
  hashtags: string[];
  warnings: string[];
}

export interface TrendChanges {
  new: string[];
  dropped: string[];
  rankChanged: Array<{ name: string; from: number; to: number }>;
}

export interface TrendMeta {
  requestedAt: string;
  woeid: number | null;
  preset: string | null;
  source: "explore" | "sidebar" | "merge";
  excludePromoted: boolean;
  categories: string[] | null;
  count: number;
  cached: boolean;
  cacheExpiresAt: string | null;
  cursor: string | null;
  nextCursor: string | null;
  apiCalls: number;
  parserVersion: string;
  partial: boolean;
}

export interface TrendListResponse {
  ok: true;
  data: {
    trends: TrendItem[];
    changes?: TrendChanges;
    _raw?: unknown;
  };
  meta: TrendMeta;
}

export interface LocationItem {
  name: string;
  woeid: number;
  country: string | null;
  countryCode: string | null;
  placeType: { code: number | null; name: string | null };
  url: string | null;
  parentid: number | null;
}

export interface ExploreSettings {
  location: { woeid: number | null; name: string | null } | null;
  raw: unknown;
}

export interface SettingsResponse {
  ok: true;
  data: { settings: ExploreSettings };
  meta: { requestedAt: string; apiCalls: number };
}

export interface LocationsResponse {
  ok: true;
  data: { locations: LocationItem[] };
  meta: { requestedAt: string; apiCalls: number; count: number };
}

export interface ErrorResponse {
  ok: false;
  error: { code: string; message: string };
}

// ── Phase 2 ───────────────────────────────────────────────────────────────────

export interface TrendDetail {
  id: string;
  name: string | null;
  summary: string | null;
  postsOverview: string | null;
  createdAt: string | null;
  relatedTrends: TrendItem[];
  _raw?: unknown;
}

export interface SearchTweet {
  id: string;
  text: string;
  createdAt: string | null;
  lang: string | null;
  author: {
    id: string;
    username: string;
    name: string;
    verified: boolean;
  };
  metrics: {
    likes: number | null;
    retweets: number | null;
    replies: number | null;
    views: number | null;
  };
  urls: string[];
  hashtags: string[];
}

export interface DetailResponse {
  ok: true;
  data: { detail: TrendDetail };
  meta: { requestedAt: string; apiCalls: number };
}

export interface SearchResponse {
  ok: true;
  data: { tweets: SearchTweet[]; _raw?: unknown };
  meta: {
    requestedAt: string;
    query: string;
    mode: "top" | "latest";
    count: number;
    pages: number;
    sampled: true;
    apiCalls: number;
    nextCursor: string | null;
  };
}

export const WOEID_PRESETS: Record<string, number> = {
  worldwide: 1,
  japan: 23424856,
  us: 23424977,
  uk: 23424975,
  tokyo: 1118370,
};
