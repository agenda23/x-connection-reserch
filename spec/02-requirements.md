# 要件定義

## 1. 背景と目的

X のトレンド情報を、公式 API キーなしで、ある程度自由に（地域・件数・詳細度を指定して）取得し、以下の利用形態を満たすアプリケーションを構築する。

| 利用形態 | 説明 |
|---------|------|
| CLI | ターミナルから手動実行・スクリプト連携 |
| n8n | HTTP API 経由でワークフローに組み込み |

技術基盤は pnpm で導入済みの **emusks** とし、TypeScript/JavaScript で実装する。

## 2. スコープ

### 2.1 対象（In Scope）

- X トレンド一覧の取得（Explore ベース）
- 地域（WOEID）指定によるトレンドの切り替え
- トレンド地点一覧の取得
- トレンド詳細（AI サマリー）の取得
- トレンド関連ユーザーの取得
- トレンド名に基づく投稿検索（補助機能）
- JSON 形式の構造化出力（CLI / HTTP 共通）
- 認証トークンによるセッション管理
- n8n から呼び出し可能な REST API

### 2.2 対象外（Out of Scope）— 初期版

- トレンドの保存・報告・dismiss 等の書き込み操作
- XChat / DM / 投稿作成
- 公式 Twitter API v2 との併用
- Web UI（ダッシュボード）
- マルチアカウントの同時管理
- トレンド履歴の永続化・DB 保存（キャッシュ除く）

## 3. ステークホルダーとユースケース

### UC-01: 日本のトレンド一覧を CLI で取得

```bash
x-trends list --woeid 23424856 --format json
```

**期待:** 日本向けのトレンド名・投稿数・URL 等を JSON で出力。

### UC-02: n8n で定期ポーリング

1. n8n の Schedule Trigger（例: 15 分間隔）
2. HTTP Request → `GET /api/v1/trends?woeid=23424856`
3. 差分検知・Slack 通知

### UC-03: 特定トレンドの AI サマリー取得

```bash
x-trends detail --id <trend_id> --format json
```

### UC-04: トレンドに関連する投稿を収集

```bash
x-trends search --query "#トレンド名" --mode latest --count 50
```

### UC-05: 利用可能な地域一覧の参照

```bash
x-trends locations --format json
```

## 4. 機能要件

### FR-01: 認証

| ID | 要件 |
|----|------|
| FR-01-1 | ルートの `.env` を起動時に **自動読み込み** し、`TWITTER_AUTH_TOKEN` を取得する（手動 `source .env` は不要） |
| FR-01-2 | `TWITTER_AUTH_TOKEN` の解決順位: **(1) `.env` の値（最優先）→ (2) 既存の `process.env`**。`.env` に値がある場合は常にそれを使う（`dotenv` の `override: true`） |
| FR-01-3 | 取得したトークンで emusks セッションを確立する（`client.login(authToken)`） |
| FR-01-4 | 起動時にセッション有効性を検証する（`account.viewer()` 等） |
| FR-01-5 | 認証失敗時は明確なエラーコードとメッセージを返す |
| FR-01-6 | トークンをログ・レスポンスに含めない |

**`.env` の例（プロジェクトルート）:**

```env
TWITTER_AUTH_TOKEN=your_auth_token_here
```

**注意:** emusks は `ct0` を自動取得するため、本アプリでは `TWITTER_CT0` は **不要**。`TWITTER_CT0` は twitter-cli 用として `.env` に共存してもよいが、本アプリの認証には使わない。

### FR-02: トレンド一覧取得

| ID | 要件 |
|----|------|
| FR-02-1 | `explore` または `exploreSidebar` からトレンド一覧を取得する |
| FR-02-2 | `woeid` 指定時は `setExploreSettings` で地域を切り替えてから取得する |
| FR-02-3 | `count` で取得件数を指定可能（デフォルト 20、上限 100） |
| FR-02-4 | `cursor` によるページネーションをサポートする |
| FR-02-5 | 生 GraphQL レスポンスを正規化スキーマに変換して返す |
| FR-02-6 | `source` パラメータで `explore` / `sidebar` を選択可能 |

### FR-03: 地域管理

| ID | 要件 |
|----|------|
| FR-03-1 | `trends.available()` で地点一覧を返す |
| FR-03-2 | 地点名の部分一致検索（`guide/explore_locations_with_auto_complete`）を提供する |
| FR-03-3 | 現在の Explore 設定（地域）を取得できる |
| FR-03-4 | よく使う WOEID をプリセットとして内蔵する（日本・米国・グローバル等） |

**WOEID プリセット（初期版）:**

| 名称 | WOEID |
|------|-------|
| Worldwide | 1 |
| Japan | 23424856 |
| United States | 23424977 |
| United Kingdom | 23424975 |
| Worldwide (Trending) | アカウント設定依存 |

### FR-04: トレンド詳細

| ID | 要件 |
|----|------|
| FR-04-1 | `trendId` を指定して AI サマリーを取得する（`getById`） |
| FR-04-2 | トレンド名を指定して関連ユーザーを取得する（`relevantUsers`） |
| FR-04-3 | 詳細取得失敗時は raw レスポンスを `debug` モードで返せる |

### FR-05: トレンド関連投稿検索

| ID | 要件 |
|----|------|
| FR-05-1 | トレンド名・ハッシュタグで `search.tweets` / `search.latest` を実行する |
| FR-05-2 | 検索結果は emusks のパース済みタイムライン形式を正規化して返す |
| FR-05-3 | ページネーション（cursor）をサポートする |

### FR-06: CLI

| ID | 要件 |
|----|------|
| FR-06-1 | 単一バイナリ相当の CLI エントリポイントを提供する |
| FR-06-2 | サブコマンド: `list`, `locations`, `detail`, `users`, `search`, `settings` |
| FR-06-3 | 出力形式: `json`（デフォルト）, `table`（人間可読） |
| FR-06-4 | 終了コード: 0=成功, 1=一般エラー, 2=認証エラー, 3=レート制限 |
| FR-06-5 | `--raw` で emusks 生レスポンスを出力可能 |

### FR-07: HTTP API（n8n 連携）

| ID | 要件 |
|----|------|
| FR-07-1 | REST API サーバーを提供する（デフォルト `localhost:3920`） |
| FR-07-2 | 全エンドポイントが JSON を返す |
| FR-07-3 | OpenAPI 3.0 仕様を `/openapi.json` で提供する |
| FR-07-4 | ヘルスチェック `GET /health` を提供する |
| FR-07-5 | API キー認証（`X-API-Key` ヘッダー）をオプションで有効化可能 |
| FR-07-6 | CORS を設定可能（n8n Cloud / セルフホスト両対応） |

### FR-08: 設定

| ID | 要件 |
|----|------|
| FR-08-1 | 設定は **ルート `.env` を正** とし、起動時に `dotenv` で自動読み込みする |
| FR-08-2 | `.env` のパスは `DOTENV_PATH` 環境変数で上書き可能（デフォルト: プロジェクトルートの `.env`） |
| FR-08-3 | emusks クライアント種別（`web` / `main`）を切り替え可能 |
| FR-08-4 | HTTP プロキシを指定可能 |

## 5. 非機能要件

### NFR-01: パフォーマンス

| ID | 要件 |
|----|------|
| NFR-01-1 | トレンド一覧 API の P95 応答時間 < 10 秒（X API 依存部分除く自前処理 < 500ms） |
| NFR-01-2 | emusks クライアントのセッションをプロセス内で再利用する（ログインは初回のみ） |
| NFR-01-3 | 同一 `woeid` のトレンド一覧を TTL 5 分のメモリキャッシュ可能 |

### NFR-02: 可用性・運用

| ID | 要件 |
|----|------|
| NFR-02-1 | ログは構造化 JSON（レベル: debug/info/warn/error） |
| NFR-02-2 | 認証情報をログに出力しない |
| NFR-02-3 | Docker コンテナでの実行を想定した設計 |
| NFR-02-4 | graceful shutdown（進行中リクエスト完了後に終了） |

### NFR-03: セキュリティ

| ID | 要件 |
|----|------|
| NFR-03-1 | `TWITTER_AUTH_TOKEN` は `.env` に記載する運用を標準とする（`.env` は git 除外。コミット禁止） |
| NFR-03-2 | HTTP API の API キーは環境変数 `API_KEY` で設定 |
| NFR-03-3 | 本番では HTTPS リバースプロキシ前提（アプリ単体は HTTP） |

### NFR-04: 保守性

| ID | 要件 |
|----|------|
| NFR-04-1 | TypeScript で実装（strict mode） |
| NFR-04-2 | emusks の生レスポンスパーサーは独立モジュール化 |
| NFR-04-3 | GraphQL スキーマ変更時にパーサー単体テストで検知可能 |

### NFR-05: ライセンス

| ID | 要件 |
|----|------|
| NFR-05-1 | emusks（AGPL-3.0）のライセンス要件を README に明記する |
| NFR-05-2 | ネットワーク経由で第三者に提供する場合のソース公開方針を決定する |

## 6. 環境変数

### 6.1 読み込み方針

1. CLI / HTTP サーバー起動の **最初** に `src/config.ts` が `.env` を読み込む
2. `.env` の値を `override: true` で `process.env` に反映する（**`.env` 最優先**）
3. CI（GitHub Actions）など `.env` を同梱しない環境では、実行前に `process.env` へ注入された Secrets が使われる（`.env` が無ければそのまま `process.env` を参照）

### 6.2 変数一覧

| 変数名 | 必須 | デフォルト | 設定場所 | 説明 |
|--------|------|-----------|---------|------|
| `TWITTER_AUTH_TOKEN` | はい | — | **`.env`（推奨）** | X の `auth_token` Cookie 値 |
| `DOTENV_PATH` | いいえ | `.env` | `process.env` | 読み込む `.env` ファイルのパス |
| `API_KEY` | HTTP 時推奨 | — | `.env` | HTTP API 認証キー |
| `PORT` | いいえ | `3920` | `.env` | HTTP サーバーポート |
| `EMUSKS_CLIENT` | いいえ | `web` | `.env` | emusks クライアント種別 |
| `EMUSKS_ENDPOINT` | いいえ | `web` | `.env` | GraphQL エンドポイント |
| `HTTP_PROXY` | いいえ | — | `.env` | プロキシ URL |
| `CACHE_TTL_SECONDS` | いいえ | `300` | `.env` | トレンドキャッシュ TTL |
| `LOG_LEVEL` | いいえ | `info` | `.env` | ログレベル |

## 7. 受け入れ基準（初期版）

1. ルート `.env` に `TWITTER_AUTH_TOKEN` を記載するだけで CLI / HTTP サーバーが起動できる（手動 `export` 不要）
2. `x-trends list --woeid 23424856` で日本のトレンドが JSON 配列として取得できる
3. `x-trends locations` で WOEID 付き地点一覧が取得できる
4. HTTP `GET /api/v1/trends?woeid=23424856` が n8n から呼び出せる
5. `.env` も `process.env` も未設定時にエラーコード `AUTH_REQUIRED` が返る
6. 正規化されたトレンドオブジェクトに `name`, `url`, `tweetVolume`（取得可能な場合）が含まれる
7. `--raw` 指定時に emusks 生レスポンスが確認できる

## 8. 将来拡張（バックログ）

- Webhook プッシュ（新規トレンド検知時に n8n へ POST）
- トレンド時系列の DB 保存・可視化
- `trends/place` の raw v1.1 直呼び出しサポート
- 複数地域の一括取得（バッチ API）
- Prometheus メトリクスエンドポイント
