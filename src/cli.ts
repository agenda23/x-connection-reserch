import "./config.js";
import { Command } from "commander";
import { listTrends } from "./services/trends.js";
import { listLocations, getSettings } from "./services/locations.js";
import { searchTweets } from "./services/search.js";
import { getTrendDetail } from "./services/detail.js";
import { AppError, EXIT_CODES } from "./lib/errors.js";
import { WOEID_PRESETS } from "./types/trend.js";

const program = new Command();

program
  .name("x-trends")
  .description("X (Twitter) trend CLI")
  .version("0.1.0")
  .option("-f, --format <fmt>", "output format: json | table", "json")
  .option("--raw", "include raw emusks response")
  .option("-v, --verbose", "enable debug logging");

// ── list ──────────────────────────────────────────────────────────────────────

program
  .command("list")
  .description("fetch trend list")
  .option("-w, --woeid <number>", "region WOEID", parseInt)
  .option(
    "-p, --preset <name>",
    `preset name: ${Object.keys(WOEID_PRESETS).join(", ")}`,
  )
  .option("-n, --count <number>", "max trends to return (default 20, max 50)", parseInt)
  .option(
    "-s, --source <src>",
    "trend source: explore | sidebar | merge",
    "explore",
  )
  .option("--no-exclude-promoted", "include promoted trends")
  .option("--categories <list>", "comma-separated category filter (trending,event,topic)")
  .option("--diff", "compare with previous snapshot and show changes")
  .option("--cursor <cursor>", "pagination cursor")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    try {
      const categories = opts.categories
        ? String(opts.categories)
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

      const result = await listTrends({
        woeid: opts.woeid,
        preset: opts.preset,
        count: opts.count,
        source: opts.source,
        excludePromoted: opts.excludePromoted !== false,
        categories,
        diff: opts.diff ?? false,
        cursor: opts.cursor,
        raw: globalOpts.raw ?? false,
      });

      output(result, globalOpts.format);
    } catch (err) {
      handleError(err);
    }
  });

// ── locations ─────────────────────────────────────────────────────────────────

program
  .command("locations")
  .description("list available trend regions")
  .option("--search <query>", "filter by location name")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    try {
      const result = await listLocations(opts.search);
      if (globalOpts.format === "table") {
        printTable(
          result.data.locations.map((l) => ({
            name: l.name,
            woeid: l.woeid,
            country: l.country ?? "",
          })),
        );
      } else {
        output(result, "json");
      }
    } catch (err) {
      handleError(err);
    }
  });

// ── settings ──────────────────────────────────────────────────────────────────

program
  .command("settings")
  .description("show current Explore settings")
  .action(async (_opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    try {
      const result = await getSettings();
      if (globalOpts.format === "table") {
        const loc = result.data.settings.location;
        console.log(`woeid : ${loc?.woeid ?? "(not set)"}`);
        console.log(`name  : ${loc?.name ?? "(not set)"}`);
      } else {
        // omit raw field from JSON output unless --raw
        const out = globalOpts.raw
          ? result
          : {
              ...result,
              data: {
                settings: {
                  location: result.data.settings.location,
                },
              },
            };
        output(out, "json");
      }
    } catch (err) {
      handleError(err);
    }
  });

// ── search ────────────────────────────────────────────────────────────────────

program
  .command("search")
  .description("search tweets for a query (Phase 2, sampled)")
  .requiredOption("-q, --query <query>", "search query")
  .option("-m, --mode <mode>", "search mode: top | latest", "top")
  .option("-n, --count <number>", "max results per page (max 20)", parseInt)
  .option("--max-pages <number>", "max pages to fetch (max 2)", parseInt)
  .option("--since <date>", "filter tweets since date (YYYY-MM-DD, within 7 days)")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    try {
      if (opts.mode !== "top" && opts.mode !== "latest") {
        throw new AppError("INVALID_PARAMS", `--mode must be "top" or "latest"`);
      }
      const result = await searchTweets({
        query: opts.query,
        mode: opts.mode as "top" | "latest",
        count: opts.count,
        maxPages: opts.maxPages,
        since: opts.since,
        raw: globalOpts.raw ?? false,
      });
      if (globalOpts.format === "table") {
        printTable(
          result.data.tweets.map((t) => ({
            id: t.id,
            author: `@${t.author.username}`,
            text: t.text.slice(0, 60) + (t.text.length > 60 ? "…" : ""),
            likes: t.metrics.likes ?? "",
            retweets: t.metrics.retweets ?? "",
          })),
        );
      } else {
        output(result, "json");
      }
    } catch (err) {
      handleError(err);
    }
  });

// ── detail ────────────────────────────────────────────────────────────────────

program
  .command("detail")
  .description("get AI summary for a trend by ID (Phase 2)")
  .requiredOption("--id <trendId>", "trend ID (from list output)")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent!.opts();
    try {
      const result = await getTrendDetail(opts.id, globalOpts.raw ?? false);
      if (globalOpts.format === "table") {
        const d = result.data.detail;
        console.log(`id      : ${d.id}`);
        console.log(`name    : ${d.name ?? "(unknown)"}`);
        console.log(`summary : ${d.summary ?? "(none)"}`);
        console.log(`posts   : ${d.postsOverview ?? "(none)"}`);
      } else {
        output(result, "json");
      }
    } catch (err) {
      handleError(err);
    }
  });

// ── serve ─────────────────────────────────────────────────────────────────────

program
  .command("serve")
  .description("start HTTP server for n8n integration")
  .option("--port <number>", "port to listen on", parseInt)
  .option("--host <host>", "host to bind", "0.0.0.0")
  .action(async (opts) => {
    const { startServer } = await import("./index.js");
    startServer({ port: opts.port, host: opts.host });
  });

// ── helpers ───────────────────────────────────────────────────────────────────

function output(data: unknown, format: string): void {
  if (format === "table" && typeof data === "object" && data !== null) {
    const d = (data as Record<string, unknown>)["data"];
    if (d && typeof d === "object" && "trends" in d) {
      printTable(
        ((d as Record<string, unknown>)["trends"] as Record<string, unknown>[]).map(
          (t) => ({
            rank: t["rank"] ?? "",
            name: t["name"],
            tweetVolume: t["tweetVolume"] ?? "",
            category: t["category"],
          }),
        ),
      );
      return;
    }
  }
  console.log(JSON.stringify(data, null, 2));
}

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
  );
  const header = keys.map((k, i) => k.padEnd(widths[i])).join("  ");
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(keys.map((k, i) => String(row[k] ?? "").padEnd(widths[i])).join("  "));
  }
}

function handleError(err: unknown): never {
  if (err instanceof AppError) {
    console.error(`Error [${err.code}]: ${err.message}`);
    process.exit(EXIT_CODES[err.code]);
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const isServe = process.argv.includes("serve");

async function exitCli(code: 0 | 1): Promise<never> {
  if (!isServe) {
    try {
      const { closeEmusksSession } = await import("./lib/emusks-client.js");
      await Promise.race([
        closeEmusksSession(),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    } catch {
      // best-effort cleanup
    }
  }
  process.exit(code);
}

program
  .parseAsync(process.argv)
  .then(() => exitCli(0))
  .catch((err) => {
    handleError(err);
  });
