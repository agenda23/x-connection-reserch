# API 仕様（CLI / HTTP）

## 1. 共通仕様

### 1.1 レスポンスエンベロープ

成功時:

```json
{
  "ok": true,
  "data": { },
  "meta": {
    "requestedAt": "2026-06-07T12:00:00.000Z",
    "woeid": 23424856,
    "source": "explore",
    "cursor": null,
    "nextCursor": "DAABCgAB...",
    "cached": false,
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

### 1.2 認証

#### X セッション（emusks）

| 項目 | 内容 |
|------|------|
| 設定場所 | プロジェクトルートの **`.env`**（開発標準） |
| 変数名 | `TWITTER_AUTH_TOKEN` |
| 読み込み | 起動時に `dotenv` で **自動読み込み**（手動 `source .env` 不要） |
| 優先順位 | **`.env` の値が最優先**（`override: true`）。`.env` が無い環境では `process.env`（CI Secrets 等） |

```env
# .env
TWITTER_AUTH_TOKEN=your_auth_token_here
```

#### HTTP API キー（本アプリの API 保護）

| 方式 | 対象 | ヘッダー / 設定 |
|------|------|----------------|
| API キー | HTTP API | `X-API-Key: <API_KEY>`（`API_KEY` 設定時は必須。`.env` で設定可） |

## 2. CLI 仕様

### 2.1 エントリポイント

```bash
pnpm x-trends <command> [options]
# または
npx x-trends <command> [options]
```

### 2.2 グローバルオプション

| オプション | 短縮 | 型 | デフォルト | 説明 |
|-----------|------|-----|-----------|------|
| `--format` | `-f` | `json` \| `table` | `json` | 出力形式 |
| `--raw` | — | flag | false | emusks 生レスポンスを含める |
| `--verbose` | `-v` | flag | false | デバッグログ |

### 2.3 コマンド: `list`

トレンド一覧を取得する。

```bash
x-trends list [options]
```

| オプション | 短縮 | 型 | デフォルト | 説明 |
|-----------|------|-----|-----------|------|
| `--woeid` | `-w` | number | アカウント設定 | 地域 WOEID |
| `--count` | `-n` | number | 20 | 取得件数（最大 100） |
| `--cursor` | — | string | — | ページネーション cursor |
| `--source` | `-s` | `explore` \| `sidebar` | `explore` | 取得元 API |

**例:**

```bash
x-trends list --woeid 23424856 --count 30 --format table
x-trends list -w 23424977 -s sidebar -f json
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
    ]
  },
  "meta": { "woeid": 23424856, "source": "explore", "nextCursor": null }
}
```

### 2.4 コマンド: `locations`

トレンド取得可能な地点一覧。

```bash
x-trends locations [options]
```

| オプション | 短縮 | 型 | 説明 |
|-----------|------|-----|------|
| `--search` | `-q` | string | 地点名の部分一致検索 |

**例:**

```bash
x-trends locations --search Tokyo
```

### 2.5 コマンド: `settings`

現在の Explore 設定を表示する。

```bash
x-trends settings
```

### 2.6 コマンド: `detail`

トレンドの AI サマリーを取得する。

```bash
x-trends detail --id <trendId> [options]
```

| オプション | 短縮 | 必須 | 説明 |
|-----------|------|------|------|
| `--id` | `-i` | はい | トレンド REST ID |

### 2.7 コマンド: `users`

トレンドに関連するユーザーを取得する。

```bash
x-trends users --name <trendName> [options]
```

| オプション | 短縮 | 必須 | 説明 |
|-----------|------|------|------|
| `--name` | `-n` | はい | トレンド名またはハッシュタグ |

### 2.8 コマンド: `search`

トレンド名で投稿を検索する。

```bash
x-trends search --query <query> [options]
```

| オプション | 短縮 | 型 | デフォルト | 説明 |
|-----------|------|-----|-----------|------|
| `--query` | `-q` | string | 必須 | 検索クエリ |
| `--mode` | `-m` | `top` \| `latest` | `top` | 検索モード |
| `--count` | `-n` | number | 20 | 件数 |
| `--cursor` | — | string | — | ページネーション |

### 2.9 コマンド: `serve`

HTTP API サーバーを起動する。

```bash
x-trends serve [options]
```

| オプション | 短縮 | 型 | デフォルト | 説明 |
|-----------|------|-----|-----------|------|
| `--port` | `-p` | number | 3920 | 待ち受けポート |
| `--host` | — | string | `0.0.0.0` | バインドアドレス |

### 2.10 終了コード

| コード | 意味 |
|--------|------|
| 0 | 成功 |
| 1 | 一般エラー（パース失敗、不正引数等） |
| 2 | 認証エラー |
| 3 | レート制限 |

## 3. HTTP API 仕様

ベース URL: `http://<host>:<port>/api/v1`

### 3.1 `GET /health`

ヘルスチェック。認証不要。

**レスポンス 200:**

```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "emusksSession": "active"
  }
}
```

`emusksSession` は `"inactive"` | `"active"` | `"error"`。

---

### 3.2 `GET /api/v1/trends`

トレンド一覧。

**クエリパラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `woeid` | number | いいえ | アカウント設定 | 地域 WOEID |
| `count` | number | いいえ | 20 | 件数（最大 100） |
| `cursor` | string | いいえ | — | ページネーション |
| `source` | string | いいえ | `explore` | `explore` \| `sidebar` |
| `raw` | boolean | いいえ | false | 生レスポンスを `data._raw` に含める |

**例:**

```http
GET /api/v1/trends?woeid=23424856&count=20
X-API-Key: your-api-key
```

**レスポンス 200:** CLI `list` と同一エンベロープ。

**エラー:**

| ステータス | code |
|-----------|------|
| 400 | `INVALID_WOEID` |
| 401 | `AUTH_REQUIRED` / `AUTH_FAILED` |
| 429 | `RATE_LIMITED` |
| 502 | `PARSE_ERROR` / `UPSTREAM_ERROR` |

---

### 3.3 `GET /api/v1/locations`

地点一覧。

**クエリパラメータ:**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `search` | string | 地点名検索（オートコンプリート API 使用） |

**レスポンス 200:**

```json
{
  "ok": true,
  "data": {
    "locations": [
      {
        "name": "Japan",
        "woeid": 23424856,
        "country": "Japan",
        "countryCode": "JP",
        "placeType": { "code": 3, "name": "Country" }
      }
    ]
  }
}
```

---

### 3.4 `GET /api/v1/settings`

Explore 設定（現在の地域等）。

**レスポンス 200:**

```json
{
  "ok": true,
  "data": {
    "exploreSettings": { }
  }
}
```

---

### 3.5 `GET /api/v1/trends/:trendId`

トレンド AI サマリー。

**パスパラメータ:**

| 名前 | 説明 |
|------|------|
| `trendId` | トレンド REST ID |

---

### 3.6 `GET /api/v1/trends/:trendName/users`

関連ユーザー。`trendName` は URL エンコード必須。

```http
GET /api/v1/trends/%23JavaScript/users
```

---

### 3.7 `GET /api/v1/search`

投稿検索。

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `q` | string | 必須 | 検索クエリ |
| `mode` | string | `top` | `top` \| `latest` |
| `count` | number | 20 | 件数 |
| `cursor` | string | — | ページネーション |

**レスポンス 200:**

```json
{
  "ok": true,
  "data": {
    "tweets": [
      {
        "id": "1234567890",
        "text": "...",
        "createdAt": "2026-06-07T10:00:00.000Z",
        "author": {
          "id": "...",
          "username": "example",
          "name": "Example User"
        },
        "metrics": {
          "likes": 100,
          "retweets": 20,
          "replies": 5
        }
      }
    ]
  },
  "meta": { "nextCursor": "..." }
}
```

## 4. n8n 連携ガイド

### 4.1 HTTP Request ノード設定例

| 項目 | 値 |
|------|-----|
| Method | GET |
| URL | `http://x-trends:3920/api/v1/trends` |
| Query Parameters | `woeid` = `23424856` |
| Headers | `X-API-Key` = `{{ $env.X_TRENDS_API_KEY }}` |
| Response Format | JSON |

### 4.2 ワークフロー例: 新規トレンド通知

1. **Schedule Trigger** — 15 分ごと
2. **HTTP Request** — `GET /api/v1/trends?woeid=23424856`
3. **Code** — 前回実行結果（Workflow Static Data）と diff
4. **IF** — 新規トレンドあり
5. **Slack** — 通知

### 4.3 Code ノード例（diff 検知）

```javascript
const prev = $getWorkflowStaticData('global').trendNames ?? [];
const current = $json.data.trends.map(t => t.name);
const newOnes = current.filter(n => !prev.includes(n));

$getWorkflowStaticData('global').trendNames = current;

return newOnes.map(name => ({ json: { name } }));
```

### 4.4 Execute Command ノード（代替）

| 項目 | 値 |
|------|-----|
| Command | `pnpm` |
| Arguments | `x-trends list --woeid 23424856 --format json` |
| Environment | `TWITTER_AUTH_TOKEN` を n8n の Credentials / Env で設定 |

## 5. OpenAPI

実装時に `src/openapi.ts` または `openapi.yaml` を生成し、`GET /openapi.json` で配信する。

主要タグ:

- `trends` — トレンド取得
- `locations` — 地点管理
- `search` — 投稿検索
- `system` — health / settings

## 6. レート制限（アプリ側）

HTTP API にオプションのレート制限を設ける（X API とは別）。

| 設定 | デフォルト |
|------|-----------|
| `RATE_LIMIT_WINDOW_MS` | 60000 |
| `RATE_LIMIT_MAX_REQUESTS` | 30 |

超過時: HTTP 429 + `RATE_LIMITED`。

## 7. WOEID リファレンス（よく使う値）

| 地域 | WOEID |
|------|-------|
| Worldwide | 1 |
| Japan | 23424856 |
| Tokyo | 1118370 |
| United States | 23424977 |
| New York | 2459115 |
| United Kingdom | 23424975 |
| London | 44418 |

地点名から WOEID を解決するには `GET /api/v1/locations?search=Tokyo` を使用する。
