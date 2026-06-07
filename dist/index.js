#!/usr/bin/env node
import {
  AppError,
  HTTP_STATUS,
  config,
  getSettings,
  listLocations,
  listTrends
} from "./chunk-TTJ32JPF.js";

// src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
var app = new Hono();
app.use("/api/*", async (c, next) => {
  if (!config.apiKey) return next();
  const key = c.req.header("X-API-Key");
  if (key !== config.apiKey) {
    return c.json(
      { ok: false, error: { code: "AUTH_REQUIRED", message: "Invalid or missing X-API-Key" } },
      401
    );
  }
  return next();
});
app.get("/health", (c) => c.json({ ok: true, status: "healthy" }));
app.get("/api/v1/trends", async (c) => {
  try {
    const q = c.req.query();
    const categories = q["categories"] ? q["categories"].split(",").map((s) => s.trim()).filter(Boolean) : [];
    const result = await listTrends({
      woeid: q["woeid"] ? Number(q["woeid"]) : void 0,
      preset: q["preset"],
      count: q["count"] ? Number(q["count"]) : void 0,
      source: q["source"] ?? "explore",
      excludePromoted: q["exclude-promoted"] !== "false",
      categories,
      diff: q["diff"] === "true",
      cursor: q["cursor"],
      raw: q["raw"] === "true"
    });
    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});
app.get("/api/v1/locations", async (c) => {
  try {
    const search = c.req.query("search");
    const result = await listLocations(search);
    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});
app.get("/api/v1/settings", async (c) => {
  try {
    const result = await getSettings();
    const includeRaw = c.req.query("raw") === "true";
    if (!includeRaw) {
      return c.json({
        ...result,
        data: { settings: { location: result.data.settings.location } }
      });
    }
    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});
function handleApiError(c, err) {
  if (err instanceof AppError) {
    return c.json(
      { ok: false, error: { code: err.code, message: err.message } },
      HTTP_STATUS[err.code]
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return c.json(
    { ok: false, error: { code: "UPSTREAM_ERROR", message: msg } },
    502
  );
}
function startServer(opts) {
  const port = opts?.port ?? config.port;
  const hostname = opts?.host ?? "0.0.0.0";
  console.log(`x-trends server listening on http://${hostname}:${port}`);
  serve({ fetch: app.fetch, port, hostname });
}
if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  startServer();
}
export {
  startServer
};
