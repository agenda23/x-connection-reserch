import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const envPath = process.env.DOTENV_PATH ?? resolve(repoRoot, ".env");
loadEnv({ path: envPath, override: true });

export const config = {
  twitterAuthToken: process.env.TWITTER_AUTH_TOKEN ?? "",
  apiKey: process.env.API_KEY ?? "",
  port: Number(process.env.PORT ?? 3920),
  emusksClient: (process.env.EMUSKS_CLIENT ?? "web") as string,
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 300),
  searchCacheTtlSeconds: Number(process.env.SEARCH_CACHE_TTL_SECONDS ?? 900),
  requestDelayMs: Number(process.env.REQUEST_DELAY_MS ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? "info",
} as const;
