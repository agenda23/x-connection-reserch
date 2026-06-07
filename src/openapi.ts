export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "x-trends API",
    version: "0.1.0",
    description: "X (Twitter) trend data via emusks — no official API key required.",
    license: { name: "AGPL-3.0", url: "https://www.gnu.org/licenses/agpl-3.0.html" },
  },
  servers: [{ url: "http://localhost:3920", description: "Local server" }],
  tags: [
    { name: "trends", description: "Trend operations" },
    { name: "system", description: "System" },
    { name: "search", description: "Search (Phase 2)" },
    { name: "detail", description: "Trend detail (Phase 2)" },
  ],
  components: {
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
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
          warnings: { type: "array", items: { type: "string" } },
        },
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
                to: { type: "integer" },
              },
            },
          },
        },
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
              name: { type: "string", nullable: true },
            },
          },
          url: { type: "string", nullable: true },
          parentid: { type: "integer", nullable: true },
        },
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
              verified: { type: "boolean" },
            },
          },
          metrics: {
            type: "object",
            properties: {
              likes: { type: "integer", nullable: true },
              retweets: { type: "integer", nullable: true },
              replies: { type: "integer", nullable: true },
              views: { type: "integer", nullable: true },
            },
          },
          urls: { type: "array", items: { type: "string" } },
          hashtags: { type: "array", items: { type: "string" } },
        },
      },
      TrendDetail: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", nullable: true },
          summary: { type: "string", nullable: true },
          postsOverview: { type: "string", nullable: true },
          createdAt: { type: "string", nullable: true },
          relatedTrends: { type: "array", items: { $ref: "#/components/schemas/TrendItem" } },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
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
                  properties: { ok: { type: "boolean" }, status: { type: "string" } },
                },
              },
            },
          },
        },
      },
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
          { name: "raw", in: "query", schema: { type: "boolean", default: false } },
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
                        changes: { $ref: "#/components/schemas/TrendChanges" },
                      },
                    },
                    meta: { type: "object" },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid parameters" },
          "401": { description: "Unauthorized" },
          "502": { description: "Upstream error" },
        },
      },
    },
    "/api/v1/trends/{trendId}": {
      get: {
        tags: ["detail"],
        summary: "Get trend detail with AI summary (Phase 2)",
        parameters: [
          { name: "trendId", in: "path", required: true, schema: { type: "string" } },
          { name: "raw", in: "query", schema: { type: "boolean", default: false } },
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
                    meta: { type: "object" },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid trend ID" },
          "401": { description: "Unauthorized" },
          "502": { description: "Upstream error" },
        },
      },
    },
    "/api/v1/locations": {
      get: {
        tags: ["trends"],
        summary: "List available trend regions",
        parameters: [
          { name: "search", in: "query", schema: { type: "string" }, description: "Filter by location name" },
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
                        locations: { type: "array", items: { $ref: "#/components/schemas/LocationItem" } },
                      },
                    },
                    meta: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/settings": {
      get: {
        tags: ["system"],
        summary: "Get current Explore settings",
        parameters: [
          { name: "raw", in: "query", schema: { type: "boolean", default: false } },
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
                    meta: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
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
          { name: "raw", in: "query", schema: { type: "boolean", default: false } },
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
                        tweets: { type: "array", items: { $ref: "#/components/schemas/SearchTweet" } },
                      },
                    },
                    meta: {
                      type: "object",
                      properties: {
                        sampled: { type: "boolean", enum: [true] },
                        query: { type: "string" },
                        mode: { type: "string" },
                        count: { type: "integer" },
                        pages: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid parameters" },
          "401": { description: "Unauthorized" },
          "502": { description: "Upstream error" },
        },
      },
    },
  },
} as const;
