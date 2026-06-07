# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A workspace for building **x-trends-app**: a TypeScript CLI + HTTP API that fetches X (Twitter) trend data via [emusks](https://emusks.tiago.zip) without the official API. Also contains `twitter-cli/` (a separately-cloned Python tool, git-ignored).

The app is currently in **spec/planning phase** — `src/` does not yet exist. The spec documents in `spec/` are the source of truth for what to build.

## Setup

```bash
# Node.js (x-trends-app)
pnpm install

# Auth — copy and fill in TWITTER_AUTH_TOKEN
cp .env.example .env

# twitter-cli (Python, optional, cloned separately)
git clone https://github.com/jackwener/twitter-cli.git twitter-cli
cd twitter-cli && uv sync
```

## Development commands (once src/ exists)

```bash
pnpm dev:server          # HTTP server (tsx watch)
pnpm x-trends list -w 23424856 --exclude-promoted   # CLI
```

## twitter-cli (Python subproject)

```bash
cd twitter-cli
set -a && source ../.env && set +a   # twitter-cli does NOT auto-load .env
uv run twitter feed --max 10
uv run twitter -v whoami
```

## Architecture (x-trends-app)

**Primary interface:** CLI (`x-trends <command>`)。HTTP server (`serve`) は n8n 連携向けのサブ用途。

**Tech stack:** TypeScript 5.x, Node.js 20+, pnpm, **commander** (CLI), **Hono** (HTTP), Zod (validation), dotenv, tsx (dev), tsup (prod)

**Planned `src/` layout:**
```
src/
├── index.ts             # HTTP server entry
├── cli.ts               # CLI entry
├── config.ts            # dotenv auto-load (must be imported first)
├── lib/
│   ├── emusks-client.ts # Singleton session wrapper, serialized requests
│   ├── cache.ts         # Memory cache + diff snapshots
│   ├── rate-limiter.ts  # REQUEST_DELAY_MS enforcement
│   └── errors.ts        # AppError codes
├── parsers/
│   ├── explore.ts       # Raw GraphQL → TrendItem[]
│   └── location.ts
├── services/
│   ├── trends.ts        # Business logic: fetch → parse → filter → diff → cache
│   └── locations.ts
└── routes/api/v1/       # Hono HTTP routes
```

**Layer flow:** CLI/HTTP → Service → EmusksClient → emusks (npm) → X API

## Critical constraints

- **Serial requests only** — parallel emusks calls are forbidden (BAN risk). `EmusksClient` enforces this.
- **`config.ts` must be imported first** in both `cli.ts` and `index.ts`; it loads `.env` with `override: true`.
- **`ct0` is not needed** — emusks auto-obtains it from `TWITTER_AUTH_TOKEN`.
- **`source=merge`** fetches from both explore + sidebar (max 3 emusks calls per `list`). Never exceed this.
- **`exclude-promoted` defaults to `true`** — the parser filters `category: promoted` at the `TrendParser` layer, not the service layer.
- **No user APIs** — `relevantUsers`, followers, RT networks are out of scope.
- **Polling interval ≥ 15 min** in n8n workflows.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `TWITTER_AUTH_TOKEN` | yes | — | X `auth_token` cookie value |
| `API_KEY` | HTTP recommended | — | `X-API-Key` header auth |
| `PORT` | no | `3920` | HTTP server port |
| `REQUEST_DELAY_MS` | no | `3000` | Min ms between emusks calls |
| `CACHE_TTL_SECONDS` | no | `300` | Trend cache TTL |
| `EMUSKS_CLIENT` | no | `web` | Keep as `web` to reduce BAN risk |

## Key design decisions (from spec)

- **WOEID presets:** worldwide=1, japan=23424856, us=23424977, uk=23424975, tokyo=1118370
- **diff** is computed in-process from the previous cache snapshot — no extra API call
- **HTTP 200 on parse failure** with `meta.partial: true` (keeps n8n workflows running); 502 only on complete failure
- **Phase 2 only:** `search` (max 20 results, 2 pages), `detail` (AI summary, explicit `--id` required)
- **Parser test strategy:** save fixture JSONs from live emusks calls, snapshot-test the normalized output

## Spec documents

| File | Contents |
|---|---|
| `spec/02-requirements.md` | Full requirements, scoping, env vars |
| `spec/03-architecture.md` | System diagram, component design, error codes |
| `spec/04-api-spec.md` | CLI commands + HTTP endpoints |
| `spec/05-data-schema.md` | TypeScript types, Zod schemas, parser guide |
