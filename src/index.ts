import "./config.js";
import { Hono } from "hono";
import type { Context } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { listTrends } from "./services/trends.js";
import { listLocations, getSettings } from "./services/locations.js";
import { searchTweets } from "./services/search.js";
import { getTrendDetail } from "./services/detail.js";
import { AppError, HTTP_STATUS } from "./lib/errors.js";
import { openApiSpec } from "./openapi.js";
import type { ErrorResponse } from "./types/trend.js";

const app = new Hono();

// ── auth middleware ───────────────────────────────────────────────────────────

app.use("/api/*", async (c, next) => {
  if (!config.apiKey) return next();
  const key = c.req.header("X-API-Key");
  if (key !== config.apiKey) {
    return c.json<ErrorResponse>(
      { ok: false, error: { code: "AUTH_REQUIRED", message: "Invalid or missing X-API-Key" } },
      401,
    );
  }
  return next();
});

// ── health ────────────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ ok: true, status: "healthy" }));

// ── trends ────────────────────────────────────────────────────────────────────

app.get("/api/v1/trends", async (c) => {
  try {
    const q = c.req.query();
    const categories = q["categories"]
      ? q["categories"].split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const result = await listTrends({
      woeid: q["woeid"] ? Number(q["woeid"]) : undefined,
      preset: q["preset"],
      count: q["count"] ? Number(q["count"]) : undefined,
      source: (q["source"] as "explore" | "sidebar" | "merge") ?? "explore",
      excludePromoted: q["exclude-promoted"] !== "false",
      categories,
      diff: q["diff"] === "true",
      cursor: q["cursor"],
      raw: q["raw"] === "true",
    });

    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// ── locations ─────────────────────────────────────────────────────────────────

app.get("/api/v1/locations", async (c) => {
  try {
    const search = c.req.query("search");
    const result = await listLocations(search);
    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// ── settings ──────────────────────────────────────────────────────────────────

app.get("/api/v1/settings", async (c) => {
  try {
    const result = await getSettings();
    // omit raw field by default
    const includeRaw = c.req.query("raw") === "true";
    if (!includeRaw) {
      return c.json({
        ...result,
        data: { settings: { location: result.data.settings.location } },
      });
    }
    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// ── trend detail (Phase 2) ────────────────────────────────────────────────────

app.get("/api/v1/trends/:trendId", async (c) => {
  try {
    const trendId = c.req.param("trendId");
    const raw = c.req.query("raw") === "true";
    const result = await getTrendDetail(trendId, raw);
    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// ── search (Phase 2) ──────────────────────────────────────────────────────────

app.get("/api/v1/search", async (c) => {
  try {
    const q = c.req.query();
    const mode = (q["mode"] ?? "top") as "top" | "latest";
    if (mode !== "top" && mode !== "latest") {
      return c.json<ErrorResponse>(
        { ok: false, error: { code: "INVALID_PARAMS", message: 'mode must be "top" or "latest"' } },
        400,
      );
    }
    const result = await searchTweets({
      query: q["query"] ?? "",
      mode,
      count: q["count"] ? Number(q["count"]) : undefined,
      maxPages: q["max-pages"] ? Number(q["max-pages"]) : undefined,
      since: q["since"],
      raw: q["raw"] === "true",
    });
    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});

// ── openapi ───────────────────────────────────────────────────────────────────

app.get("/openapi.json", (c) => c.json(openApiSpec));

// ── error helper ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleApiError(c: Context<any>, err: unknown) {
  if (err instanceof AppError) {
    return c.json<ErrorResponse>(
      { ok: false, error: { code: err.code, message: err.message } },
      HTTP_STATUS[err.code] as 400 | 401 | 429 | 502,
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return c.json<ErrorResponse>(
    { ok: false, error: { code: "UPSTREAM_ERROR", message: msg } },
    502,
  );
}

// ── server start ──────────────────────────────────────────────────────────────

export function startServer(opts?: { port?: number; host?: string }): void {
  const port = opts?.port ?? config.port;
  const hostname = opts?.host ?? "0.0.0.0";
  console.log(`x-trends server listening on http://${hostname}:${port}`);
  serve({ fetch: app.fetch, port, hostname });
}

// Direct execution
if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  startServer();
}
