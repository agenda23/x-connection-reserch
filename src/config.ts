import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

function resolvePackageRoot(moduleUrl: string): string {
  let dir = dirname(fileURLToPath(moduleUrl));
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    dir = resolve(dir, "..");
  }
  return dir;
}

function resolveUserConfigPath(): string {
  if (process.env.DOTENV_PATH) return process.env.DOTENV_PATH;
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return resolve(configHome, "x-trends", ".env");
}

/**
 * Load .env files from lowest to highest file priority, then restore any
 * variables that were already set in the process environment (highest priority).
 */
function loadEnvFiles(paths: readonly string[]): void {
  const presetEnv = { ...process.env };
  for (const path of paths) {
    if (!existsSync(path)) continue;
    loadEnv({ path, override: true });
  }
  for (const [key, value] of Object.entries(presetEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

const packageRoot = resolvePackageRoot(import.meta.url);

loadEnvFiles([
  resolve(packageRoot, ".env"),
  resolve(process.cwd(), ".env"),
  resolveUserConfigPath(),
]);

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
