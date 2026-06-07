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
│  │ (commander) │  │ (Hono/Express)│  │                  │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────┘  │
│         │                │                                   │
│         └────────┬───────┘                                   │
│                  ▼                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Service Layer                            │   │
│  │  TrendsService / LocationsService / SearchService     │   │
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
| CLI | commander または citty | サブコマンド・ヘルプ生成 |
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
│   │   ├── cache.ts         # メモリキャッシュ
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
- レート制限・一時エラー時のリトライ（指数バックオフ、最大 3 回）
- `woeid` 変更時の `setExploreSettings` 呼び出し

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

```ts
class TrendsService {
  async listTrends(params: ListTrendsParams): Promise<TrendListResponse>;
  async getTrendDetail(trendId: string): Promise<TrendDetail>;
  async getRelevantUsers(trendName: string): Promise<RelevantUsersResponse>;
}
```

### 4.3 TrendParser

**責務:**

- emusks 生 GraphQL JSON → `TrendItem[]` への変換
- パース失敗時は `partial: true` フラグと raw 断片を返す
- バージョンタグ付き（`parserVersion: "1"`）で将来の互換性を確保

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
    ├─► EmusksClient.setLocation(23424856)  ※ currentWoeid と異なる場合のみ
    │       └─► client.trends.setExploreSettings({ location: { woeid } })
    │
    ├─► client.trends.explore({ count, cursor })
    │
    ├─► TrendParser.parse(exploreResponse)
    │
    ├─► Cache set (TTL 5min)
    │
    └─► TrendListResponse
```

### 5.2 n8n 連携パターン

#### パターン A: HTTP API（推奨）

```
[n8n Schedule Trigger]
        │
        ▼
[HTTP Request: GET http://host:3920/api/v1/trends?woeid=23424856]
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
| トレンド取得元 | `explore` をデフォルト、`sidebar` をオプション | 情報量の多い方をデフォルトに |
| 地点一覧 | `available()` | v1.1 で安定 |
| 地点検索 | `v2("guide/explore_locations_with_auto_complete")` | ヘルパー未実装のため raw 呼び出し |
| 投稿検索 | `search.tweets` / `search.latest` | パース済みで利用しやすい |
| クライアント | `web` デフォルト | 最も無難 |

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

## 10. 実装フェーズ案

| フェーズ | 内容 | 成果物 |
|---------|------|--------|
| Phase 1 | emusks 接続・トレンド一覧・地点一覧・CLI `list`/`locations` | 動作する最小 CLI |
| Phase 2 | 正規化パーサー・キャッシュ・HTTP API | n8n 連携可能 |
| Phase 3 | detail / users / search・OpenAPI・Docker | 本番運用可能 |
| Phase 4 | 監視・Webhook・テスト拡充 | 安定運用 |
