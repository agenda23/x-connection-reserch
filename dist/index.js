#!/usr/bin/env node
import {
  getSettings,
  getTrendDetail,
  listLocations,
  listTrends,
  searchTweets
} from "./chunk-NYSQNTS4.js";
import {
  AppError,
  HTTP_STATUS,
  config
} from "./chunk-AOWFVCNZ.js";

// src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";

// src/openapi.ts
var openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "x-trends API",
    version: "0.1.0",
    description: "X (Twitter) trend data via emusks \u2014 no official API key required.",
    license: { name: "AGPL-3.0", url: "https://www.gnu.org/licenses/agpl-3.0.html" }
  },
  servers: [{ url: "http://localhost:3920", description: "Local server" }],
  tags: [
    { name: "trends", description: "Trend operations" },
    { name: "system", description: "System" },
    { name: "search", description: "Search (Phase 2)" },
    { name: "detail", description: "Trend detail (Phase 2)" }
  ],
  components: {
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" }
    },
    schemas: {
      TrendItem: {
        type: "object",
        required: ["id", "name", "url", "tweetVolume", "rank", "category", "description", "hashtags", "warnings"],
        properties: {
          id: { type: "string", nullable: true },
          name: { type: "string" },
          url: { type: "string", nullable: true },
          tweetVolume: { type: "integer", nullable: true },
          rank: { type: "integer", nullable: true },
          category: { type: "string", enum: ["trending", "promoted", "event", "topic", "unknown"] },
          description: { type: "string", nullable: true },
          hashtags: { type: "array", items: { type: "string" } },
          warnings: { type: "array", items: { type: "string" } }
        }
      },
      TrendChanges: {
        type: "object",
        properties: {
          new: { type: "array", items: { type: "string" } },
          dropped: { type: "array", items: { type: "string" } },
          rankChanged: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                from: { type: "integer" },
                to: { type: "integer" }
              }
            }
          }
        }
      },
      LocationItem: {
        type: "object",
        properties: {
          name: { type: "string" },
          woeid: { type: "integer" },
          country: { type: "string", nullable: true },
          countryCode: { type: "string", nullable: true },
          placeType: {
            type: "object",
            properties: {
              code: { type: "integer", nullable: true },
              name: { type: "string", nullable: true }
            }
          },
          url: { type: "string", nullable: true },
          parentid: { type: "integer", nullable: true }
        }
      },
      SearchTweet: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          createdAt: { type: "string", format: "date-time", nullable: true },
          lang: { type: "string", nullable: true },
          author: {
            type: "object",
            properties: {
              id: { type: "string" },
              username: { type: "string" },
              name: { type: "string" },
              verified: { type: "boolean" }
            }
          },
          metrics: {
            type: "object",
            properties: {
              likes: { type: "integer", nullable: true },
              retweets: { type: "integer", nullable: true },
              replies: { type: "integer", nullable: true },
              views: { type: "integer", nullable: true }
            }
          },
          urls: { type: "array", items: { type: "string" } },
          hashtags: { type: "array", items: { type: "string" } }
        }
      },
      TrendDetail: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", nullable: true },
          summary: { type: "string", nullable: true },
          postsOverview: { type: "string", nullable: true },
          createdAt: { type: "string", nullable: true },
          relatedTrends: { type: "array", items: { $ref: "#/components/schemas/TrendItem" } }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" }
            }
          }
        }
      }
    }
  },
  security: [{ apiKey: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["system"],
        summary: "Health check",
        security: [],
        responses: {
          "200": {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" }, status: { type: "string" } }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/trends": {
      get: {
        tags: ["trends"],
        summary: "Fetch trend list",
        parameters: [
          { name: "woeid", in: "query", schema: { type: "integer" }, description: "Region WOEID" },
          { name: "preset", in: "query", schema: { type: "string", enum: ["worldwide", "japan", "us", "uk", "tokyo"] } },
          { name: "count", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
          { name: "source", in: "query", schema: { type: "string", enum: ["explore", "sidebar", "merge"], default: "explore" } },
          { name: "exclude-promoted", in: "query", schema: { type: "boolean", default: true } },
          { name: "categories", in: "query", schema: { type: "string" }, description: "Comma-separated: trending,event,topic" },
          { name: "diff", in: "query", schema: { type: "boolean", default: false } },
          { name: "raw", in: "query", schema: { type: "boolean", default: false } }
        ],
        responses: {
          "200": {
            description: "Trend list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        trends: { type: "array", items: { $ref: "#/components/schemas/TrendItem" } },
                        changes: { $ref: "#/components/schemas/TrendChanges" }
                      }
                    },
                    meta: { type: "object" }
                  }
                }
              }
            }
          },
          "400": { description: "Invalid parameters" },
          "401": { description: "Unauthorized" },
          "502": { description: "Upstream error" }
        }
      }
    },
    "/api/v1/trends/{trendId}": {
      get: {
        tags: ["detail"],
        summary: "Get trend detail with AI summary (Phase 2)",
        parameters: [
          { name: "trendId", in: "path", required: true, schema: { type: "string" } },
          { name: "raw", in: "query", schema: { type: "boolean", default: false } }
        ],
        responses: {
          "200": {
            description: "Trend detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: { type: "object", properties: { detail: { $ref: "#/components/schemas/TrendDetail" } } },
                    meta: { type: "object" }
                  }
                }
              }
            }
          },
          "400": { description: "Invalid trend ID" },
          "401": { description: "Unauthorized" },
          "502": { description: "Upstream error" }
        }
      }
    },
    "/api/v1/locations": {
      get: {
        tags: ["trends"],
        summary: "List available trend regions",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" }, description: "Filter by location name" }
        ],
        responses: {
          "200": {
            description: "Location list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        locations: { type: "array", items: { $ref: "#/components/schemas/LocationItem" } }
                      }
                    },
                    meta: { type: "object" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/settings": {
      get: {
        tags: ["system"],
        summary: "Get current Explore settings",
        parameters: [
          { name: "raw", in: "query", schema: { type: "boolean", default: false } }
        ],
        responses: {
          "200": {
            description: "Explore settings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: { type: "object" },
                    meta: { type: "object" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/search": {
      get: {
        tags: ["search"],
        summary: "Search tweets for a query (Phase 2, sampled)",
        parameters: [
          { name: "query", in: "query", required: true, schema: { type: "string" } },
          { name: "mode", in: "query", schema: { type: "string", enum: ["top", "latest"], default: "top" } },
          { name: "count", in: "query", schema: { type: "integer", default: 20, maximum: 20 } },
          { name: "max-pages", in: "query", schema: { type: "integer", default: 1, maximum: 2 } },
          { name: "since", in: "query", schema: { type: "string", format: "date" }, description: "Within last 7 days (YYYY-MM-DD)" },
          { name: "raw", in: "query", schema: { type: "boolean", default: false } }
        ],
        responses: {
          "200": {
            description: "Search results (sampled)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        tweets: { type: "array", items: { $ref: "#/components/schemas/SearchTweet" } }
                      }
                    },
                    meta: {
                      type: "object",
                      properties: {
                        sampled: { type: "boolean", enum: [true] },
                        query: { type: "string" },
                        mode: { type: "string" },
                        count: { type: "integer" },
                        pages: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": { description: "Invalid parameters" },
          "401": { description: "Unauthorized" },
          "502": { description: "Upstream error" }
        }
      }
    }
  }
};

// src/index.ts
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
app.get("/api/v1/search", async (c) => {
  try {
    const q = c.req.query();
    const mode = q["mode"] ?? "top";
    if (mode !== "top" && mode !== "latest") {
      return c.json(
        { ok: false, error: { code: "INVALID_PARAMS", message: 'mode must be "top" or "latest"' } },
        400
      );
    }
    const result = await searchTweets({
      query: q["query"] ?? "",
      mode,
      count: q["count"] ? Number(q["count"]) : void 0,
      maxPages: q["max-pages"] ? Number(q["max-pages"]) : void 0,
      since: q["since"],
      raw: q["raw"] === "true"
    });
    return c.json(result);
  } catch (err) {
    return handleApiError(c, err);
  }
});
app.get("/openapi.json", (c) => c.json(openApiSpec));
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
