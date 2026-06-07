import type { SearchTweet } from "../types/trend.js";

// emusks search.tweets() / search.latest() returns a pre-normalized object:
// { tweets: TweetObj[], cursor?: string, next_cursor?: string, ... }
// Each TweetObj has: id, text, created_at, user.{id,name,username,verification}, stats.{likes,retweets,replies,views}, urls[], hashtags[]

export function parseSearchTweets(raw: unknown): {
  tweets: SearchTweet[];
  nextCursor: string | null;
} {
  try {
    if (!isRecord(raw)) return { tweets: [], nextCursor: null };

    // emusks returns { tweets: [...] }
    const tweetsArr = Array.isArray(raw["tweets"]) ? raw["tweets"] : [];
    const tweets: SearchTweet[] = [];

    for (const item of tweetsArr) {
      const t = parseTweet(item);
      if (t) tweets.push(t);
    }

    // Cursor may be at raw.cursor or raw.next_cursor
    const nextCursor =
      typeof raw["next_cursor"] === "string"
        ? raw["next_cursor"]
        : typeof raw["cursor"] === "string"
          ? raw["cursor"]
          : null;

    return { tweets, nextCursor };
  } catch {
    return { tweets: [], nextCursor: null };
  }
}

function parseTweet(item: unknown): SearchTweet | null {
  if (!isRecord(item)) return null;

  const id = typeof item["id"] === "string" ? item["id"] : null;
  if (!id) return null;

  const text = typeof item["text"] === "string" ? item["text"] : "";

  const createdAt =
    typeof item["created_at"] === "string"
      ? parseTwitterDate(item["created_at"])
      : null;

  const lang = typeof item["lang"] === "string" ? item["lang"] : null;

  // Author — emusks puts user data in item.user
  const user = isRecord(item["user"]) ? item["user"] : null;
  const authorId = user && typeof user["id"] === "string" ? user["id"] : "unknown";
  const username = user && typeof user["username"] === "string" ? user["username"] : "unknown";
  const name = user && typeof user["name"] === "string" ? user["name"] : username;
  const verification = user && isRecord(user["verification"]) ? user["verification"] : null;
  const verified =
    (verification && verification["verified"] === true) ||
    (verification && verification["premium_verified"] === true) ||
    false;

  // Metrics — emusks puts them in item.stats
  const stats = isRecord(item["stats"]) ? item["stats"] : {};
  const metrics = {
    likes: toInt(stats["likes"]),
    retweets: toInt(stats["retweets"]),
    replies: toInt(stats["replies"]),
    views: toInt(stats["views"]),
  };

  // URLs
  const rawUrls = Array.isArray(item["urls"]) ? item["urls"] : [];
  const urls = rawUrls
    .map((u: unknown) =>
      isRecord(u) && typeof u["expanded_url"] === "string" ? u["expanded_url"] : null,
    )
    .filter((u): u is string => u !== null);

  // Hashtags
  const rawHashtags = Array.isArray(item["hashtags"]) ? item["hashtags"] : [];
  const hashtags = rawHashtags
    .map((h: unknown) => {
      if (isRecord(h) && typeof h["text"] === "string") return `#${h["text"]}`;
      if (typeof h === "string") return h.startsWith("#") ? h : `#${h}`;
      return null;
    })
    .filter((h): h is string => h !== null);

  return {
    id,
    text,
    createdAt,
    lang,
    author: { id: authorId, username, name, verified: Boolean(verified) },
    metrics,
    urls,
    hashtags,
  };
}

function parseTwitterDate(s: string): string | null {
  try {
    return new Date(s).toISOString();
  } catch {
    return null;
  }
}

function toInt(v: unknown): number | null {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
