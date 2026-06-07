# システムアーキテクチャ

## 1. 全体構成

```
┌─────────────────────────────────────────────────────────────┐
│                        利用者                                │
├──────────────┬──────────────────────┬───────────────────────┤
│   CLI        │   n8n HTTP Request   │   スクリプト (curl)    │
│  x-trends    │   ノード              │                       │
└──────┬───────┴──────────┬───────────┴───────────┬───────────┘
       │                  │                       │
       ▼                  ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│              x-trends-app（本アプリケーション）               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ CLI Layer   │  │ HTTP Server  │  │ Config / Logger  │  │
│  │ (commander) │  │    (Hono)     │  │                  │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────┘  │
│         │                │                                   │
│         └────────┬───────┘                                   │
│                  ▼                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Service Layer                            │   │
│  │  TrendsService / LocationsService / SearchService*    │   │
│  │  (*SearchService は Phase 2 のみ)                     │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Adapter Layer                            │   │
│  │  EmusksClient（セッション管理・リトライ）              │   │
│  │  TrendParser / LocationParser                         │   │
│  └────────────────────────┬─────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            ▼
              ┌─────────────────────────┐
              │   emusks (npm package)   │
              │   cycletls / GraphQL     │
              └────────────┬────────────┘
                           ▼
              ┌─────────────────────────┐
              │   X (Twitter) API        │
              │   x.com / api.x.com      │
              └─────────────────────────┘
```

## 2. 推奨技術スタック

| レイヤー | 技術 | 理由 |
|---------|------|------|
| 言語 | TypeScript 5.x | 型安全・emusks 連携の補完 |
| ランタイム | Node.js 20+ | emusks ESM 互換 |
| パッケージ管理 | pnpm | 既存構成と一致 |
| CLI | commander | サブコマンド・ヘルプ生成 |
| HTTP サーバー | Hono | 軽量・TypeScript 親和性・n8n 向け JSON API に適する |
| バリデーション | zod | リクエスト/レスポンススキーマ検証 |
| 環境変数 | dotenv | `.env` の起動時自動読み込み（`override: true`） |
| ビルド | tsx（開発）/ tsup（本番） | ESM 出力 |

## 3. ディレクトリ構成（案）

```
twitter-cli-test/
├── spec/                    # 本ドキュメント群
├── src/
│   ├── index.ts             # HTTP サーバーエントリ
│   ├── cli.ts               # CLI エントリ
│   ├── config.ts            # .env 自動読み込み・設定解決
│   ├── lib/
│   │   ├── emusks-client.ts # emusks ラッパー（シングルトンセッション）
│   │   ├── cache.ts         # メモリキャッシュ・diff 用スナップショット（CLI 時はファイル永続化 ~/.cache/x-trends/）
│   │   ├── rate-limiter.ts  # 直列化・REQUEST_DELAY_MS
│   │   └── errors.ts        # エラーコード定義
│   ├── parsers/
│   │   ├── explore.ts       # ExplorePage レスポンスパーサー
│   │   └── location.ts      # 地点一覧パーサー
│   ├── services/
│   │   ├── trends.ts
│   │   ├── locations.ts
│   │   └── search.ts
│   ├── routes/
│   │   └── api/v1/          # HTTP ルート
│   └── types/
│       └── trend.ts         # 正規化型定義
├── package.json
├── tsconfig.json
└── .env.example
```

## 4. コンポーネント設計

### 4.0 Config（設定読み込み）

**責務:**

- 起動直後にルート `.env` を `dotenv` で読み込む（`override: true` で **`.env` 最優先**）
- `TWITTER_AUTH_TOKEN` 等の設定値を型付きで提供
- CLI / HTTP の両エントリで **必ず最初に import** する

```ts
// src/config.ts（概念）
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

const envPath = process.env.DOTENV_PATH ?? resolve(process.cwd(), ".env");
loadEnv({ path: envPath, override: true });

export const config = {
  twitterAuthToken: process.env.TWITTER_AUTH_TOKEN ?? "",
  port: Number(process.env.PORT ?? 3920),
  // ...
};
```

**読み込みフロー:**

```
プロセス起動
    │
    ▼
config.ts が import される
    │
    ├─► dotenv: .env を読み込み（override: true）
    │
    ├─► TWITTER_AUTH_TOKEN 取得
    │       ├─ .env にあり → その値を使用（最優先）
    │       └─ .env なし → process.env（CI Secrets 等）
    │
    └─► 後続モジュールが config を参照
```

**CI / GitHub Actions:** `.env` をリポジトリに含めない。`env: TWITTER_AUTH_TOKEN: ${{ secrets... }}` で注入する（`.env` 不在時は `process.env` のみ）。

### 4.1 EmusksClient（Adapter）

**責務:**

- emusks インスタンスのライフサイクル管理
- 初回 `login()` の実行とセッション保持
- **直列実行**と `REQUEST_DELAY_MS` による呼び出し間隔制御（並列禁止）
- 429 / ロック検知時はリトライせず即 `RATE_LIMITED`
- `woeid` 変更時のみ `setExploreSettings` を 1 回呼ぶ
- `woeid` 未指定時は `exploreSettings()` で現在地域を解決（+1 API 呼び出し）
- `apiCalls` カウンタをメタ情報に返す

```ts
class EmusksClient {
  private client: Emusks | null;
  private currentWoeid: number | null;

  async ensureSession(): Promise<Emusks>;
  async setLocation(woeid: number): Promise<void>;
  async getTrends(opts: TrendFetchOptions): Promise<RawExploreResponse>;
}
```

**セッション戦略:**

- プロセス起動時に遅延初期化（最初のリクエスト時に login）
- HTTP サーバーではシングルトンとして保持
- CLI ではコマンド 1 回につき login → 処理 → exit（`--keep-alive` でサーバーモードも可）

### 4.2 TrendsService

**責務:**

- ビジネスロジック（地域切り替え → 取得 → 正規化）
- キャッシュ制御（キー: `trends:{woeid}:{source}:{count}`）
- ページネーション cursor の透過的返却
- diff スナップショット保存先: CLI 単発実行は **ファイル**（`~/.cache/x-trends/snapshot-{cacheKey}.json`）、HTTP サーバーはメモリ。CLI でメモリのみにすると単発実行のたびに消えて `--diff` が機能しない

```ts
class TrendsService {
  async listTrends(params: ListTrendsParams): Promise<TrendListResponse>;
  // Phase 2 のみ:
  async getTrendDetail(trendId: string): Promise<TrendDetail>;
}

// listTrends 内部処理:
// 1. fetch (explore/sidebar/merge)
// 2. TrendParser.parse + filterPromoted + filterCategories
// 3. optional: diffWithPrevious(cacheKey)
```

### 4.3 TrendParser

**責務:**

- emusks 生 GraphQL JSON → `TrendItem[]` への変換
- **`promoted` / ツイートカード等の除外**（ノイズ除去の要）
- `merge` 時は `name` で重複除去し better rank を採用
- パース失敗時は `partial: true`

### 4.4 HTTP Server

**責務:**

- REST エンドポイント提供
- API キー認証ミドルウェア
- エラーレスポンスの統一形式
- OpenAPI 仕様の配信

### 4.5 CLI

**責務:**

- サブコマンドのルーティング
- stdout への JSON / table 出力
- 終了コードのマッピング

## 5. データフロー

### 5.1 トレンド一覧取得（woeid 指定あり）

```
CLI/HTTP Request
    │
    ▼
TrendsService.listTrends({ woeid: 23424856 })
    │
    ├─► Cache hit? → 返却
    │
    ├─► EmusksClient.ensureSession()
    │
    ├─► woeid 未指定? → client.trends.exploreSettings() で現在地域を取得（+1 API 呼び出し）
    │
    ├─► EmusksClient.setLocation(23424856)  ※ currentWoeid と異なる場合のみ
    │       └─► client.trends.setExploreSettings({ location: { woeid } })
    │
    ├─► source に応じて explore / sidebar / 両方（merge）
    │
    ├─► TrendParser.parse → filterPromoted（デフォルト on）
    │
    ├─► diff? → 前回スナップショットと比較 → data.changes
    │
    ├─► Cache set (TTL 5min) + スナップショット更新
    │
    └─► TrendListResponse（meta.apiCalls 付き）
```

> **merge source 時の待機コスト:** setExploreSettings → [REQUEST_DELAY_MS] → explore → [REQUEST_DELAY_MS] → exploreSidebar の順で直列実行されるため、デフォルト設定（3 秒）では最低 **6 秒** の待機が発生する。タイムアウトを設ける場合は 15 秒以上を推奨。

### 5.2 n8n 連携パターン

#### パターン A: HTTP API（推奨）

```
[n8n Schedule Trigger]
        │
        ▼
[HTTP Request: GET .../trends?woeid=23424856&exclude-promoted=true&diff=true]
  Headers: X-API-Key: ***
        │
        ▼
[IF / Code: 新規トレンド検知]
        │
        ▼
[Slack / Discord / DB]
```

**利点:** セッション再利用、キャッシュ、エラーハンドリングをアプリ側に集約。

#### パターン B: Execute Command

```
[n8n Execute Command]
  command: pnpm x-trends list --woeid 23424856 --format json
        │
        ▼
[JSON Parse ノード]
```

**利点:** 追加サーバー不要。  
**欠点:** 毎回 login のオーバーヘッド、環境変数の n8n 側設定が必要。

**推奨:** 定期実行・本番運用は **パターン A（HTTP サーバー常駐）**。

## 6. エラーハンドリング方針

| 層 | 方針 |
|----|------|
| emusks | try/catch でメッセージを分類（auth / rate / unknown） |
| Service | ドメインエラー `AppError` に変換 |
| HTTP | `{ error: { code, message } }` + 適切な HTTP ステータス |
| CLI | stderr にメッセージ、終了コードで分類 |

| エラーコード | HTTP | CLI exit | 説明 |
|-------------|------|----------|------|
| `AUTH_REQUIRED` | 401 | 2 | トークン未設定 |
| `AUTH_FAILED` | 401 | 2 | ログイン失敗 |
| `RATE_LIMITED` | 429 | 3 | レート制限 |
| `INVALID_WOEID` | 400 | 1 | 不正な WOEID |
| `PARSE_ERROR` | 502 | 1 | X レスポンスのパース失敗 |
| `UPSTREAM_ERROR` | 502 | 1 | X API エラー |

## 7. デプロイ構成

### 7.1 ローカル開発

```bash
# HTTP サーバー
pnpm dev:server

# CLI
pnpm x-trends list --woeid 23424856
```

### 7.2 Docker（案）

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY dist ./dist
ENV PORT=3920
EXPOSE 3920
CMD ["node", "dist/index.js"]
```

### 7.3 n8n セルフホストとの同居

```
docker-compose.yml
├── n8n
├── x-trends-app   # 内部ネットワークで http://x-trends:3920
└── (optional) reverse-proxy
```

## 8. emusks 固有の設計判断

| 判断 | 選択 | 理由 |
|------|------|------|
| 地域切り替え | `setExploreSettings` | emusks が公式ドキュメントで推奨 |
| トレンド取得元 | `explore` デフォルト、`merge` で高機能化 | API 増は最大 +1。ノイズはフィルタで除去 |
| ユーザー API | **使わない** | `relevantUsers` 等は回避 |
| 地点一覧 | `available()` | v1.1 で安定 |
| 投稿検索 | Phase 2 のみ・上限付き | トレンドの浅い深掘り専用 |
| クライアント | `web` 固定推奨 | BAN リスク低減 |
| 高機能の定義 | パーサー・フィルタ・diff | 大量取得ではない |

## 9. セキュリティアーキテクチャ

```
Internet / n8n
      │
      ▼
[Reverse Proxy + TLS]  ← 本番必須
      │
      ▼
[API Key Middleware]   ← X-API-Key 検証
      │
      ▼
[x-trends-app]
      │
      ▼
[emusks] ──► X API
  TWITTER_AUTH_TOKEN（.env 最優先で自動読み込み）
```

## 10. 実装フェーズ

| Phase | 内容 | 成果物 |
|-------|------|--------|
| **1** | login・list（explore/sidebar/merge）・フィルタ・diff・locations・settings・HTTP・キャッシュ | MVP / n8n 連携 |
| **2** | 軽量 search・detail（任意）・OpenAPI・Docker | 深掘りオプション |

**Phase 1 でやらないこと:** `users`、`relevantUsers`、深いページネーション、並列取得
