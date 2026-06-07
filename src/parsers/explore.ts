import type { TrendItem, TrendChanges } from "../types/trend.js";

export const PARSER_VERSION = "1";

export function parseExploreTrends(raw: unknown): {
  trends: TrendItem[];
  cursor: string | null;
  nextCursor: string | null;
  partial: boolean;
} {
  try {
    const instructions = findInstructions(raw);
    if (!instructions) return { trends: [], cursor: null, nextCursor: null, partial: true };

    const addEntries = instructions.find(
      (i) => isRecord(i) && i["type"] === "TimelineAddEntries",
    ) as Record<string, unknown> | undefined;

    if (!addEntries) return { trends: [], cursor: null, nextCursor: null, partial: true };
    const entries = addEntries["entries"];
    if (!Array.isArray(entries)) return { trends: [], cursor: null, nextCursor: null, partial: true };

    const trends: TrendItem[] = [];
    let cursor: string | null = null;
    let nextCursor: string | null = null;
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
          if (t) { trends.push(t); rank++; }
        }
        // TimelineEventSummary → promoted event, skip (handled via promotedMetadata)
        continue;
      }

      if (typename === "TimelineTimelineModule") {
        const component = (content["clientEventInfo"] as Record<string, unknown> | undefined)?.["component"];
        if (component === "stories") {
          // AI-generated trend summaries (is_ai_trend: true)
          const items = content["items"];
          if (!Array.isArray(items)) continue;
          for (const moduleItem of items) {
            if (!isRecord(moduleItem)) continue;
            const item = moduleItem["item"];
            if (!isRecord(item)) continue;
            const ic = item["itemContent"];
            if (!isRecord(ic) || ic["__typename"] !== "TimelineTrend") continue;
            const t = parseTrendItem(ic, rank, item["clientEventInfo"], true);
            if (t) { trends.push(t); rank++; }
          }
        }
        // suggest_who_to_follow and other modules: skip
      }
    }

    return { trends, cursor, nextCursor, partial: false };
  } catch {
    return { trends: [], cursor: null, nextCursor: null, partial: true };
  }
}

function parseTrendItem(
  ic: Record<string, unknown>,
  rank: number,
  clientEventInfo?: unknown,
  isAiTrend = false,
): TrendItem | null {
  const name = ic["name"];
  if (typeof name !== "string" || !name) return null;

  // Promoted check: clientEventInfo on the content wrapper
  const eventComponent = isRecord(clientEventInfo)
    ? String(clientEventInfo["component"] ?? "")
    : "";
  const isPromoted = eventComponent.includes("promoted") || "promotedMetadata" in ic;

  // URL: trend_url.url or trend_metadata.url.url (DeepLink) → convert to web URL
  const trendUrl = ic["trend_url"];
  const trendMeta = ic["trend_metadata"];
  const deepLink =
    (isRecord(trendUrl) ? String(trendUrl["url"] ?? "") : "") ||
    (isRecord(trendMeta) && isRecord(trendMeta["url"]) ? String(trendMeta["url"]["url"] ?? "") : "");
  const webUrl = deepLinkToWeb(deepLink);

  // Tweet volume from social_context.text e.g. "6.8K posts", "116K posts"
  const socialContext = ic["social_context"];
  const tweetVolume = isRecord(socialContext)
    ? parseVolume(String(socialContext["text"] ?? ""))
    : null;

  // Category
  const domainContext = isRecord(trendMeta)
    ? String(trendMeta["domain_context"] ?? "")
    : "";
  const category: TrendItem["category"] = isPromoted
    ? "promoted"
    : isAiTrend
      ? "topic"
      : "trending";

  return {
    id: null,
    name,
    url: webUrl,
    tweetVolume,
    rank,
    category,
    description: domainContext || null,
    hashtags: name.startsWith("#") ? [name] : [],
    warnings: [],
  };
}

function deepLinkToWeb(url: string): string | null {
  if (!url) return null;
  // twitter://search/?query=%23foo → https://x.com/search?q=%23foo
  const m = url.match(/twitter:\/\/search\/\?query=(.+)/);
  if (m) return `https://x.com/search?q=${m[1]}`;
  // twitter://trending/<id> → treat as null (no direct web equivalent)
  return null;
}

function parseVolume(text: string): number | null {
  const m = text.match(/([\d.]+)\s*(K|M)?\s*posts/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mul = m[2] === "K" ? 1000 : m[2] === "M" ? 1_000_000 : 1;
  return Math.round(n * mul);
}

// Recursive search for the first `instructions` array anywhere in the response
function findInstructions(val: unknown, depth = 0): unknown[] | null {
  if (depth > 12 || !isRecord(val)) return null;
  for (const [key, child] of Object.entries(val)) {
    if (key === "instructions" && Array.isArray(child)) return child;
    const found = findInstructions(child, depth + 1);
    if (found) return found;
  }
  return null;
}

export function filterPromoted(trends: TrendItem[]): TrendItem[] {
  return trends.filter((t) => t.category !== "promoted");
}

export function filterCategories(trends: TrendItem[], categories: string[]): TrendItem[] {
  if (categories.length === 0) return trends;
  return trends.filter((t) => categories.includes(t.category));
}

export function mergeTrends(explore: TrendItem[], sidebar: TrendItem[]): TrendItem[] {
  const byName = new Map<string, TrendItem>();
  for (const t of explore) byName.set(normalizeName(t.name), t);
  for (const t of sidebar) {
    const key = normalizeName(t.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, t);
    } else if (
      t.tweetVolume !== null &&
      (existing.tweetVolume === null || t.tweetVolume > existing.tweetVolume)
    ) {
      byName.set(key, { ...t, rank: existing.rank });
    }
  }
  return [...byName.values()].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/^#/, "").trim();
}

export function computeDiff(current: TrendItem[], previous: TrendItem[]): TrendChanges {
  const prevByName = new Map(previous.map((t) => [t.name, t]));
  const currNames = new Set(current.map((t) => t.name));
  return {
    new: current.filter((t) => !prevByName.has(t.name)).map((t) => t.name),
    dropped: previous.filter((t) => !currNames.has(t.name)).map((t) => t.name),
    rankChanged: current.flatMap((t) => {
      const p = prevByName.get(t.name);
      return p && p.rank !== null && t.rank !== null && p.rank !== t.rank
        ? [{ name: t.name, from: p.rank, to: t.rank }]
        : [];
    }),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
