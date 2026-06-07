import "./config.js";
import { Command } from "commander";
import { listTrends } from "./services/trends.js";
import { listLocations, getSettings } from "./services/locations.js";
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

program.parseAsync(process.argv);
