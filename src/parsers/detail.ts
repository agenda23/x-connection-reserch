import type { TrendDetail, TrendItem } from "../types/trend.js";

export function parseTrendDetail(raw: unknown, id: string): TrendDetail {
  if (!isRecord(raw)) {
    return { id, name: null, summary: null, postsOverview: null, createdAt: null, relatedTrends: [] };
  }

  // Try to find a trend object — look for objects with trend-like fields
  const trend = findTrendObject(raw);

  const name = trend ? getString(trend, ["name"]) : null;
  const summary = trend
    ? (getString(trend, ["trend_metadata", "meta_description"]) ??
       getString(trend, ["summary"]) ??
       getString(trend, ["description"]))
    : null;
  const postsOverview = trend ? getString(trend, ["social_context", "text"]) : null;
  const createdAt = trend ? getString(trend, ["created_at"]) : null;

  return { id, name, summary, postsOverview, createdAt, relatedTrends: [] };
}

// Look for an object that has a "name" and "trend_metadata" or similar
function findTrendObject(
  val: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 12 || !isRecord(val)) return null;

  if (
    (typeof val["name"] === "string" && val["name"]) &&
    ("trend_metadata" in val || "trend_url" in val || "social_context" in val)
  ) {
    return val;
  }

  for (const child of Object.values(val)) {
    const found = findTrendObject(child, depth + 1);
    if (found) return found;
  }
  return null;
}

// Get a string by traversing a dot-path from a record
function getString(
  obj: Record<string, unknown>,
  path: string[],
): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return null;
    cur = cur[key];
  }
  return typeof cur === "string" && cur ? cur : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
