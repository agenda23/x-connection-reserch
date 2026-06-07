# API 仕様（CLI / HTTP）

## 1. 共通仕様

### 1.1 設計方針

- **トレンド取得が本体**。検索・detail は Phase 2 オプション
- **ノイズ除去デフォルト**: `exclude-promoted=true`
- **X 負荷抑制**: 直列リクエスト、キャッシュ、呼び出し回数上限

### 1.2 レスポンスエンベロープ

成功時:

```json
{
  "ok": true,
  "data": { },
  "meta": {
    "requestedAt": "2026-06-07T12:00:00.000Z",
    "woeid": 23424856,
    "source": "explore",
    "excludePromoted": true,
    "cached": false,
    "apiCalls": 2,
    "parserVersion": "1"
  }
}
```

エラー時:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "TWITTER_AUTH_TOKEN is not set"
  }
}
```

### 1.3 認証

| 項目 | 内容 |
|------|------|
| X セッション | `.env` の `TWITTER_AUTH_TOKEN`（起動時自動読み込み、最優先） |
| `TWITTER_CT0` | **不要**（emusks が自動取得） |
| HTTP API キー | `X-API-Key`（`API_KEY` 設定時は必須） |

## 2. CLI 仕様

### 2.1 エントリポイント

```bash
pnpm x-trends <command> [options]
```

### 2.2 グローバルオプション

| オプション | 短縮 | デフォルト | 説明 |
|-----------|------|-----------|------|
| `--format` | `-f` | `json` | `json` \| `table` |
| `--raw` | — | false | emusks 生レスポンス |
| `--verbose` | `-v` | false | デバッグログ |

### 2.3 コマンド: `list`（Phase 1・メイン）

```bash
x-trends list [options]
```

| オプション | 短縮 | デフォルト | 説明 |
|-----------|------|-----------|------|
| `--woeid` | `-w` | アカウント設定 | 地域 WOEID |
| `--preset` | `-p` | — | プリセット名（`japan`, `us`, `worldwide` 等。`woeid` より優先しない） |
| `--count` | `-n` | 20 | 件数（最大 50） |
| `--source` | `-s` | `explore` | `explore` \| `sidebar` \| `merge` |
| `--exclude-promoted` | — | **true** | プロモーション除外 |
| `--categories` | — | — | カンマ区切り（例: `trending,event`） |
| `--diff` | — | false | 前回キャッシュとの差分を `data.changes` に含める |
| `--cursor` | — | — | ページネーション（Phase 1 は 1 ページ推奨） |

**バリデーション・注意事項:**

- `--count` に 51 以上を指定すると `INVALID_PARAMS`（exit 1 / HTTP 400）
- `--categories` に未知のカテゴリ名を指定してもエラーにならず 0 件扱い（`meta.categories` には指定値をそのまま返す）
- `--woeid` / `--preset` をともに省略した場合、`exploreSettings()` で現在地域を解決する（+1 API 呼び出し）
- `source=merge` では `REQUEST_DELAY_MS` が 2 回挟まり、デフォルト設定（3 秒）で最低 **6 秒** の待機が発生する

**例:**

```bash
x-trends list -w 23424856 --source merge --diff -f table
x-trends list --preset japan --exclude-promoted
```

**stdout（json）:**

```json
{
  "ok": true,
  "data": {
    "trends": [
      {
        "id": "trend:123456",
        "name": "#ExampleTrend",
        "url": "https://x.com/search?q=%23ExampleTrend",
        "tweetVolume": 12500,
        "rank": 1,
        "category": "trending"
      }
    ],
    "changes": {
      "new": ["#NewTrend"],
      "dropped": ["#OldTrend"],
      "rankChanged": [{ "name": "#ExampleTrend", "from": 3, "to": 1 }]
    }
  },
  "meta": {
    "woeid": 23424856,
    "source": "merge",
    "excludePromoted": true,
    "apiCalls": 3,
    "cached": false
  }
}
```

`--diff` 未指定時は `data.changes` を省略。

### 2.4 コマンド: `locations`（Phase 1）

```bash
x-trends locations [--search <query>]
```

### 2.5 コマンド: `settings`（Phase 1）

```bash
x-trends settings
```

### 2.6 コマンド: `search`（Phase 2・オプション）

トレンドの浅い深掘り用。**サンプル取得**であり完全集計ではない。

```bash
x-trends search --query <query> [options]
```

| オプション | 短縮 | デフォルト | 上限 |
|-----------|------|-----------|------|
| `--query` | `-q` | 必須 | — |
| `--mode` | `-m` | `top` | `top` \| `latest` |
| `--count` | `-n` | 20 | **20** |
| `--max-pages` | — | 1 | **2** |
| `--since` | — | — | 7 日以内 |

`meta.sampled: true` を常に付与。

`--mode` と emusks メソッドのマッピング:

| mode | emusks メソッド |
|------|----------------|
| `top` | `search.tweets(query, opts)` |
| `latest` | `search.latest(query, opts)` |

### 2.7 コマンド: `detail`（Phase 2・オプション）

単一トレンドの AI サマリー。**明示指定時のみ** 1 API 呼び出し。

```bash
x-trends detail --id <trendId>
```

### 2.8 コマンド: `serve`（Phase 1）

```bash
x-trends serve [--port 3920] [--host 0.0.0.0]
```

### 2.9 削除したコマンド

| コマンド | 理由 |
|---------|------|
| `users` | ユーザー API 回避方針 |

### 2.10 終了コード

| コード | 意味 |
|--------|------|
| 0 | 成功 |
| 1 | 一般エラー |
| 2 | 認証エラー |
| 3 | レート制限 / X 側制限 |

## 3. HTTP API 仕様

ベース URL: `http://<host>:<port>/api/v1`

### 3.1 `GET /health`

認証不要。レスポンス:

```json
{ "ok": true, "status": "healthy" }
```

### 3.2 `GET /api/v1/trends`（Phase 1）

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `woeid` | number | — | 地域 |
| `preset` | string | — | `japan` 等 |
| `count` | number | 20 | 最大 50 |
| `source` | string | `explore` | `explore` \| `sidebar` \| `merge` |
| `exclude-promoted` | boolean | **true** | プロモ除外 |
| `categories` | string | — | カンマ区切りフィルタ |
| `diff` | boolean | false | 差分付与 |
| `raw` | boolean | false | 生レスポンス |

### 3.3 `GET /api/v1/locations`（Phase 1）

`search` クエリで地点名検索。

### 3.4 `GET /api/v1/settings`（Phase 1）

現在の Explore 設定。

### 3.5 `GET /api/v1/trends/:trendId`（Phase 2）

AI サマリー。1 件あたり 1 emusks 呼び出し。

### 3.6 `GET /api/v1/search`（Phase 2）

| パラメータ | 上限 |
|-----------|------|
| `count` | 20 |
| `max-pages` | 2 |

`meta.sampled: true` 必須。

### 3.7 提供しないエンドポイント

- `GET /api/v1/trends/:name/users` — 削除（ユーザー API 回避）

## 4. n8n 連携

### 4.1 推奨ワークフロー

1. Schedule Trigger — **15 分以上**
2. `GET /api/v1/trends?woeid=23424856&exclude-promoted=true&diff=true`
3. 新規トレンドのみ通知

### 4.2 diff（アプリ内）

`diff=true` で `data.changes.new` を参照。n8n 側 Static Data との併用も可。

## 5. X 負荷制御（アプリ内）

| 設定 | デフォルト | 説明 |
|------|-----------|------|
| `REQUEST_DELAY_MS` | 3000 | emusks 呼び出し間隔 |
| `CACHE_TTL_SECONDS` | 300 | トレンドキャッシュ |
| 並列 | 禁止 | 直列のみ |

`meta.apiCalls` で 1 リクエストあたりの emusks 呼び出し回数を返す。

## 6. WOEID プリセット

| preset | WOEID |
|--------|-------|
| `worldwide` | 1 |
| `japan` | 23424856 |
| `us` | 23424977 |
| `uk` | 23424975 |
| `tokyo` | 1118370 |

## 7. OpenAPI（**Phase 2**）

`/openapi.json` で OpenAPI 3.0 仕様を配信する。Phase 1 MVP には含まない。

タグ: `trends` / `system`（Phase 1 相当）, `search` / `detail`（Phase 2 相当）
