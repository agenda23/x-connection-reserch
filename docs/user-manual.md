# x-trends-app ユーザーマニュアル

## 目次

1. [セットアップ](#1-セットアップ)
2. [環境変数](#2-環境変数)
3. [CLI リファレンス](#3-cli-リファレンス)
4. [HTTP API リファレンス](#4-http-api-リファレンス)
5. [n8n 連携](#5-n8n-連携)
6. [トラブルシューティング](#6-トラブルシューティング)
7. [既知の制限](#7-既知の制限)

---

## 1. セットアップ

### 必要なもの

- Node.js 20+
- pnpm
- X（Twitter）のアカウント

### インストール

```bash
git clone <repo-url>
cd twitter-cli-test
pnpm install
```

### 認証情報の設定

```bash
cp .env.example .env
```

`.env` を開き `TWITTER_AUTH_TOKEN` を記入します。

**`auth_token` の確認方法:**

1. x.com にブラウザでログイン
2. DevTools を開く（F12）
3. Application タブ → Cookies → `https://x.com`
4. `auth_token` の値をコピー

> セキュリティ注意: `auth_token` はログインセッションと同等の権限を持ちます。`.env` は絶対に Git にコミットしないでください。漏洩した場合は x.com でログアウトして無効化してください。

### 動作確認

```bash
pnpm x-trends settings
# → {"ok":true,"data":{"settings":{"location":null}},...}
```

---

## 2. 環境変数

`.env` ファイルで設定します（起動時に自動読み込み）。

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `TWITTER_AUTH_TOKEN` | **はい** | — | X の `auth_token` Cookie 値 |
| `API_KEY` | HTTP 時推奨 | — | HTTP API の認証キー（`X-API-Key` ヘッダー） |
| `PORT` | いいえ | `3920` | HTTP サーバーのポート |
| `REQUEST_DELAY_MS` | いいえ | `3000` | emusks リクエスト間の最小待機時間（ms） |
| `CACHE_TTL_SECONDS` | いいえ | `300` | トレンドキャッシュの有効期間（秒） |
| `SEARCH_CACHE_TTL_SECONDS` | いいえ | `900` | 検索キャッシュの有効期間（秒） |
| `EMUSKS_CLIENT` | いいえ | `web` | emusks クライアント種別（変更非推奨） |
| `LOG_LEVEL` | いいえ | `info` | ログレベル |

---

## 3. CLI リファレンス

### グローバルオプション

すべてのコマンドで使えます。

| オプション | 短縮 | デフォルト | 説明 |
|-----------|------|-----------|------|
| `--format <fmt>` | `-f` | `json` | 出力形式: `json` \| `table` |
| `--raw` | — | false | emusks の生レスポンスを `_raw` フィールドに含める |
| `--verbose` | `-v` | false | デバッグログを出力 |

---

### `list` — トレンド一覧取得

```bash
pnpm x-trends list [オプション]
```

| オプション | 短縮 | デフォルト | 説明 |
|-----------|------|-----------|------|
| `--woeid <number>` | `-w` | アカウント設定 | 地域 WOEID（数値） |
| `--preset <name>` | `-p` | — | WOEID プリセット名（下表参照） |
| `--count <number>` | `-n` | 20 | 取得件数（最大 50） |
| `--source <src>` | `-s` | `explore` | `explore` \| `sidebar` \| `merge` |
| `--no-exclude-promoted` | — | — | プロモーション込みで取得 |
| `--categories <list>` | — | — | カテゴリフィルタ（カンマ区切り） |
| `--diff` | — | false | 前回との差分を表示 |
| `--cursor <cursor>` | — | — | ページネーションカーソル |

**WOEID プリセット:**

| preset | 地域 | WOEID |
|--------|------|-------|
| `worldwide` | 全世界 | 1 |
| `japan` | 日本 | 23424856 |
| `us` | 米国 | 23424977 |
| `uk` | 英国 | 23424975 |
| `tokyo` | 東京 | 1118370 |

**`--source` の違い:**

| source | API 呼び出し | 説明 |
|--------|------------|------|
| `explore` | 2回 | Explore タブのトレンド |
| `sidebar` | 2回 | サイドバーのトレンド |
| `merge` | 3回 | 両方取得して名前で重複除去（最大 6 秒待機） |

**`--diff` の動作:**

差分データは `~/.cache/x-trends/` にスナップショットとして保存されます。初回実行時はベースラインを作成するのみで `changes` フィールドは付きません。2回目以降から差分が表示されます。

**使用例:**

```bash
# 日本のトレンドを表形式で
pnpm x-trends list --preset japan --format table

# 前回からの変化を確認
pnpm x-trends list --preset japan --diff

# ハッシュタグのみ表示
pnpm x-trends list --preset japan --categories trending

# トピック（AI要約）のみ
pnpm x-trends list --preset japan --categories topic

# プロモーション込みで全世界のトレンドを50件
pnpm x-trends list --preset worldwide --no-exclude-promoted --count 50
```

**出力例（JSON）:**

```json
{
  "ok": true,
  "data": {
    "trends": [
      {
        "id": null,
        "name": "#トレンド名",
        "url": "https://x.com/search?q=%23%E3%83%88%E3%83%AC%E3%83%B3%E3%83%89%E5%90%8D",
        "tweetVolume": 45200,
        "rank": 1,
        "category": "trending",
        "description": null,
        "hashtags": ["#トレンド名"],
        "warnings": []
      }
    ],
    "changes": {
      "new": ["#新トレンド"],
      "dropped": ["#消えたトレンド"],
      "rankChanged": [{ "name": "#上昇トレンド", "from": 5, "to": 2 }]
    }
  },
  "meta": {
    "woeid": 23424856,
    "source": "explore",
    "excludePromoted": true,
    "count": 9,
    "cached": false,
    "apiCalls": 2,
    "parserVersion": "1",
    "partial": false
  }
}
```

---

### `locations` — 地域一覧・検索

```bash
pnpm x-trends locations [--search <query>]
```

| オプション | 説明 |
|-----------|------|
| `--search <query>` | 地域名で絞り込み（部分一致） |

**使用例:**

```bash
# 全地域一覧
pnpm x-trends locations

# 東京の WOEID を調べる
pnpm x-trends locations --search Tokyo

# 表形式で
pnpm x-trends locations --search Japan --format table
```

---

### `settings` — Explore 設定確認

```bash
pnpm x-trends settings
```

現在の Explore ロケーション設定を表示します。`setExploreSettings` で変更された場合にアカウントに保存されている地域が確認できます。

---

### `search` — ツイート検索（Phase 2）

トレンドの浅い深掘り用です。**サンプル取得**であり完全集計ではありません。

```bash
pnpm x-trends search --query <query> [オプション]
```

| オプション | 短縮 | デフォルト | 上限 | 説明 |
|-----------|------|-----------|------|------|
| `--query <query>` | `-q` | **必須** | — | 検索クエリ |
| `--mode <mode>` | `-m` | `top` | — | `top`（人気順）\| `latest`（新着順） |
| `--count <number>` | `-n` | 20 | 20 | 1ページあたりの取得件数 |
| `--max-pages <number>` | — | 1 | 2 | 取得ページ数（最大 40 件） |
| `--since <date>` | — | — | 7日以内 | この日以降を検索（`YYYY-MM-DD`） |

> `meta.sampled: true` が常に付与されます。サンプルデータである点にご注意ください。

**使用例:**

```bash
# "#AI" の人気ツイートを10件
pnpm x-trends search --query "#AI" --count 10

# 最新順で2ページ取得（最大40件）
pnpm x-trends search --query "#AI" --mode latest --max-pages 2

# 直近3日分に絞る
pnpm x-trends search --query "#AI" --since 2026-06-05

# 日本語ツイートのみ（クエリで lang: を使う）
pnpm x-trends search --query "#AI lang:ja"

# 表形式で確認
pnpm x-trends search --query "#AIニュース" --format table
```

**出力例（JSON）:**

```json
{
  "ok": true,
  "data": {
    "tweets": [
      {
        "id": "2062417630674243968",
        "text": "ツイート本文",
        "createdAt": "2026-06-04T06:14:15.000Z",
        "lang": "en",
        "author": {
          "id": "1222769455",
          "username": "David_Gunkel",
          "name": "David J. Gunkel",
          "verified": false
        },
        "metrics": {
          "likes": 151,
          "retweets": 9,
          "replies": 34,
          "views": 12466
        },
        "urls": ["https://example.com/article"],
        "hashtags": ["#AI", "#LLMs"]
      }
    ]
  },
  "meta": {
    "query": "#AI",
    "mode": "top",
    "count": 1,
    "pages": 1,
    "sampled": true,
    "apiCalls": 2
  }
}
```

---

### `detail` — トレンド AI サマリー（Phase 2）

emusks の `trends.getById()` を使ってトレンドの詳細情報・AI サマリーを取得します。**明示的に `--id` を指定した場合のみ** API 呼び出しが発生します。

```bash
pnpm x-trends detail --id <trendId>
```

> **注意:** `list` コマンドが返すトレンドの `id` は現在 `null` です（emusks が探索ページのトレンドにID付きURLを返さないため）。emusks `getById` に渡せる ID は、X の Web UI や他の手段で取得した Trend REST ID です。

---

### `serve` — HTTP サーバー起動

```bash
pnpm x-trends serve [--port 3920] [--host 0.0.0.0]
```

n8n などから HTTP 経由でアクセスする場合に使います。起動後は HTTP API（後述）が利用可能になります。

---

## 4. HTTP API リファレンス

ベース URL: `http://localhost:3920`

### 認証

`API_KEY` 環境変数が設定されている場合、`/api/*` エンドポイントへのリクエストには `X-API-Key` ヘッダーが必要です。

```
X-API-Key: your-api-key-here
```

### エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック（認証不要） |
| GET | `/api/v1/trends` | トレンド一覧 |
| GET | `/api/v1/trends/:trendId` | トレンド詳細（Phase 2） |
| GET | `/api/v1/locations` | 地域一覧 |
| GET | `/api/v1/settings` | Explore 設定 |
| GET | `/api/v1/search` | ツイート検索（Phase 2） |
| GET | `/openapi.json` | OpenAPI 3.0 スペック |

---

### `GET /health`

```bash
curl http://localhost:3920/health
# → {"ok":true,"status":"healthy"}
```

---

### `GET /api/v1/trends`

| クエリパラメータ | 型 | デフォルト | 説明 |
|----------------|-----|-----------|------|
| `woeid` | number | — | 地域 WOEID |
| `preset` | string | — | `japan`, `us` 等 |
| `count` | number | 20 | 最大 50 |
| `source` | string | `explore` | `explore` \| `sidebar` \| `merge` |
| `exclude-promoted` | boolean | `true` | プロモーション除外 |
| `categories` | string | — | カンマ区切り |
| `diff` | boolean | `false` | 差分付与 |
| `raw` | boolean | `false` | 生レスポンス含む |

```bash
# 日本のトレンド
curl "http://localhost:3920/api/v1/trends?preset=japan"

# 差分つき
curl "http://localhost:3920/api/v1/trends?preset=japan&diff=true"
```

---

### `GET /api/v1/locations`

| クエリパラメータ | 説明 |
|----------------|------|
| `search` | 地域名で絞り込み |

```bash
curl "http://localhost:3920/api/v1/locations?search=Tokyo"
```

---

### `GET /api/v1/search`

| クエリパラメータ | 型 | デフォルト | 上限 | 説明 |
|----------------|-----|-----------|------|------|
| `query` | string | **必須** | — | 検索クエリ |
| `mode` | string | `top` | — | `top` \| `latest` |
| `count` | number | 20 | 20 | 件数 |
| `max-pages` | number | 1 | 2 | ページ数 |
| `since` | string | — | 7日以内 | `YYYY-MM-DD` |

```bash
curl "http://localhost:3920/api/v1/search?query=%23AI&count=10"
```

---

### `GET /openapi.json`

OpenAPI 3.0 仕様を JSON で返します。Swagger UI 等に読み込めます。

```bash
curl http://localhost:3920/openapi.json
```

---

### エラーレスポンス

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Invalid or missing X-API-Key"
  }
}
```

| コード | HTTP | 説明 |
|--------|------|------|
| `AUTH_REQUIRED` | 401 | 認証なし・無効な API キー |
| `AUTH_FAILED` | 401 | Twitter 認証失敗 |
| `RATE_LIMITED` | 429 | レート制限 |
| `INVALID_PARAMS` | 400 | 不正なパラメータ |
| `INVALID_TREND_ID` | 400 | 無効なトレンド ID |
| `UPSTREAM_ERROR` | 502 | emusks / X 側のエラー |

---

## 5. n8n 連携

### 推奨ワークフロー

```
Schedule Trigger（15分以上）
  ↓
HTTP Request: GET /api/v1/trends?preset=japan&diff=true
  ↓
IF: {{ $json.data.changes.new.length > 0 }}
  ↓
Slack（または通知ノード）: 新規トレンドを通知
```

### 設定例

**HTTP Request ノード:**
- Method: `GET`
- URL: `http://localhost:3920/api/v1/trends`
- Query Parameters: `preset=japan`, `diff=true`, `exclude-promoted=true`
- Headers: `X-API-Key: your-api-key`（`API_KEY` 設定時）

**新規トレンドを取り出す（Code ノード）:**

```javascript
const changes = $json.data.changes;
if (!changes || changes.new.length === 0) return [];

return changes.new.map(name => ({ json: { trend: name } }));
```

**全トレンドをアイテム展開（Split In Batches 前）:**

```javascript
return $json.data.trends.map(trend => ({ json: trend }));
```

### ポーリング間隔について

`REQUEST_DELAY_MS`（デフォルト 3 秒）× 呼び出し回数 = 最短応答時間です。`source=merge` では最低 6 秒かかります。n8n の Schedule Trigger は **15 分以上**の間隔を設定してください。

---

## 6. トラブルシューティング

### `TWITTER_AUTH_TOKEN is not set`

`.env` ファイルが存在しないか、`TWITTER_AUTH_TOKEN` が設定されていません。

```bash
cat .env   # ファイルと値を確認
```

### `Login failed`

トークンが無効または期限切れです。x.com で再ログインして新しい `auth_token` を取得してください。

### `Rate limited`

X 側のレート制限に達しました。数分待ってから再試行してください。`REQUEST_DELAY_MS` を増やすと発生しにくくなります。

```bash
REQUEST_DELAY_MS=5000 pnpm x-trends list --preset japan
```

### トレンドが 0 件返る / `partial: true`

emusks の GraphQL レスポンス構造が変わった可能性があります。`--raw` フラグで生レスポンスを確認してください。

```bash
pnpm x-trends list --preset japan --raw | head -100
```

### `--diff` で `changes` フィールドが出ない

初回実行時はスナップショットを作成するだけです。2回目以降から差分が表示されます。スナップショットは `~/.cache/x-trends/` に保存されています。

```bash
ls ~/.cache/x-trends/
# snapshot-trends_23424856_explore.json 等
```

異なるパラメータ（`--source merge` と `--source explore` 等）では別スナップショットが使われます。

---

## 7.既知の制限

| 項目 | 説明 |
|------|------|
| `id` フィールドが `null` | Explore ページのトレンドは emusks から REST ID が取得できないため。`detail` コマンドは現状使用困難 |
| `search` はサンプル | 完全集計ではなく X が返す上位ツイートのサンプルです |
| 並列リクエスト禁止 | emusks の仕様上、同時に複数リクエストを送ると BAN リスクがあります |
| 検索期間 7 日以内 | `--since` に 7 日を超える日付は指定できません |
| `detail --id` | 有効な Trend REST ID が必要ですが、`list` からは取得できません |
