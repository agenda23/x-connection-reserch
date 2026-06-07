# 要件定義

## 1. 背景と目的

X のトレンド情報を、公式 API キーなしで、地域・品質を指定して取得し、CLI および n8n から利用できるアプリケーションを構築する。

| 利用形態 | 説明 |
|---------|------|
| CLI | ターミナルから手動実行・スクリプト連携 |
| n8n | HTTP API 経由でワークフローに組み込み |

技術基盤は pnpm で導入済みの **emusks** とし、TypeScript/JavaScript で実装する。

### 1.1 設計方針（検討結果）

| 方針 | 内容 |
|------|------|
| **トレンド中心** | メイン価値は `trends.explore` / `exploreSidebar` による一覧取得 |
| **高機能＝ノイズ除去** | 多く取るのではなく、正規化・フィルタ・差分で品質を上げる |
| **X 負荷最小化** | 1 操作あたりの emusks API 呼び出しを少数に抑える。並列禁止 |
| **ユーザー API 回避** | `relevantUsers`・フォロワー・ネットワーク系は実装しない |
| **検索はオプション** | トレンドの浅い深掘りのみ。厳格な件数・ページ上限 |
| **無理しない** | x-res 相当の大量取得・長期アーカイブ・ベンチマークは対象外 |

参考: [ref/x-res-emusks-feasibility.md](./ref/x-res-emusks-feasibility.md)

## 2. スコープ

### 2.1 対象（In Scope）

**Phase 1 — 必須（MVP）**

- トレンド一覧（`explore` / `sidebar` / `merge`）
- ノイズ除去（`promoted` 除外等のカテゴリフィルタ）
- 地域（WOEID）指定・地点一覧・地点名検索
- 正規化 JSON 出力（CLI / HTTP 共通）
- メモリキャッシュ・自己レート制限
- 前回結果との **diff**（新規トレンド・順位変動。追加 API 不要）
- `.env` の `TWITTER_AUTH_TOKEN` 自動読み込み
- n8n 向け REST API

**Phase 2 — オプション**

- トレンド 1 件の AI サマリー（`getById`、明示指定時のみ）
- 軽量検索（トレンド名の投稿サンプル、上限付き）

### 2.2 対象外（Out of Scope）

| カテゴリ | 具体例 | 理由 |
|---------|--------|------|
| **ユーザー周り** | `relevantUsers`、フォロワー、RT ネットワーク | 方針で回避。負荷・ノイズ大 |
| **書き込み** | トレンド save/report/dismiss、投稿・いいね | 読み取り専用 |
| **大量・長期分析** | x-res `archive` / `benchmark`、limit 5000 級 | emusks 非適合 |
| **高負荷パターン** | 並列リクエスト、深いページネーション、1 分未満ポーリング | BAN リスク |
| **個人向け API** | `trends.history`（閲覧履歴） | リサーチ用途に不適 |
| **その他** | XChat/DM、Web UI、公式 API v2 併用、マルチアカウント | スコープ外 |

## 3. ステークホルダーとユースケース

### UC-01: 日本のトレンド一覧（ノイズ除去）

```bash
x-trends list --woeid 23424856 --exclude-promoted --format json
```

**期待:** プロモーションを除いたトレンド名・投稿数・URL を JSON で出力。

### UC-02: n8n で新規トレンド検知

1. Schedule Trigger（**15 分以上**間隔）
2. `GET /api/v1/trends?woeid=23424856&exclude-promoted=true`
3. n8n Static Data または `?diff=true` で前回との差分
4. Slack 通知

### UC-03: 地点名から WOEID 解決

```bash
x-trends locations --search Tokyo
```

### UC-04: トレンドの浅い深掘り（Phase 2・任意）

```bash
x-trends search --query "#トレンド名" --count 20 --max-pages 1
```

### UC-05: 単一トレンドの AI サマリー（Phase 2・任意）

```bash
x-trends detail --id <trend_id>
```

## 4. 機能要件

### FR-01: 認証

| ID | 要件 |
|----|------|
| FR-01-1 | ルートの `.env` を起動時に **自動読み込み** し、`TWITTER_AUTH_TOKEN` を取得する |
| FR-01-2 | 解決順位: **`.env` 最優先**（`dotenv` `override: true`）→ `process.env`（CI 用） |
| FR-01-3 | `client.login(authToken)` で emusks セッション確立（`ct0` は不要・自動取得） |
| FR-01-4 | 認証失敗時は `AUTH_REQUIRED` / `AUTH_FAILED` を返す |
| FR-01-5 | トークンをログ・レスポンスに含めない |

### FR-02: トレンド一覧取得（コア）

| ID | 要件 |
|----|------|
| FR-02-1 | `explore` / `exploreSidebar` / **`merge`**（両方取得し名前で重複除去）から一覧を取得 |
| FR-02-2 | `woeid` 指定時は `setExploreSettings` で地域切り替え後に取得（変更時のみ 1 回） |
| FR-02-3 | `count` 指定（デフォルト 20、上限 50）。51 以上はバリデーションエラー（CLI exit 1 / HTTP 400 `INVALID_PARAMS`）。**深いページネーションは Phase 1 では 1 ページまで** |
| FR-02-4 | 生 GraphQL を正規化スキーマへ変換 |
| FR-02-5 | `--exclude-promoted`（デフォルト **true**）で `category: promoted` を除外 |
| FR-02-6 | `--categories` で `trending,event,topic` 等を明示フィルタ可能（未知のカテゴリ名はエラーにならず 0 件扱い。`meta.categories` には指定値をそのまま返す） |
| FR-02-7 | `--diff` で前回キャッシュとの差分（`new`, `dropped`, `rankChanged`）を `data.changes` に付与 |
| FR-02-8 | CLI 単発実行での `--diff` はスナップショットをファイルに永続化する（`~/.cache/x-trends/snapshot-{cacheKey}.json`）。メモリキャッシュのみでは単発実行ごとに消えるため機能しない |

**1 回の `list` における X API 呼び出し上限:**

| source | 最大呼び出し |
|--------|------------|
| `explore` | 2（setExploreSettings + explore） |
| `sidebar` | 2 |
| `merge` | 3（setExploreSettings + explore + sidebar） |

### FR-03: 地域管理

| ID | 要件 |
|----|------|
| FR-03-1 | `trends.available()` で地点一覧 |
| FR-03-2 | `guide/explore_locations_with_auto_complete` で地点名検索（実装前に動作確認必須。フォールバック: `available()` 取得後にクライアント側で名前部分一致フィルタ） |
| FR-03-3 | `exploreSettings()` で現在地域を取得 |
| FR-03-4 | WOEID プリセット内蔵 |
| FR-03-5 | `--woeid` / `--preset` をともに省略した場合、`exploreSettings()` で現在地域を解決する（+1 API 呼び出し）。解決した WOEID を `meta.woeid` に返す |

**WOEID プリセット:**

| 名称 | WOEID |
|------|-------|
| Worldwide | 1 |
| Japan | 23424856 |
| United States | 23424977 |
| United Kingdom | 23424975 |
| Tokyo | 1118370 |

### FR-04: トレンド詳細（Phase 2・オプション）

| ID | 要件 |
|----|------|
| FR-04-1 | `--id` 指定時のみ `getById` で AI サマリー取得（**1 件ずつ**） |
| FR-04-2 | `list` 実行時に全トレンドへ自動取得しない |

### FR-05: 軽量検索（Phase 2・オプション）

| ID | 要件 |
|----|------|
| FR-05-1 | `search.tweets` / `search.latest` で投稿サンプル取得 |
| FR-05-2 | `count` 上限 **20**、`max-pages` 上限 **2**（合計最大 40 件） |
| FR-05-3 | 検索期間は **7 日以内**（`since:` / `until:` オペレーター） |
| FR-05-4 | リクエスト間 **3 秒以上**の間隔 |
| FR-05-5 | 結果はサンプルであることを `meta.sampled: true` で明示 |
| FR-05-6 | オプション: `-filter:nativeretweets` `min_faves:` `lang:ja` 等のクエリ拡張 |

### FR-06: CLI

| ID | 要件 |
|----|------|
| FR-06-1 | エントリ: `x-trends <command>` |
| FR-06-2 | Phase 1: `list`, `locations`, `settings`, `serve` |
| FR-06-3 | Phase 2: `search`, `detail` |
| FR-06-4 | 出力: `json`（デフォルト）, `table` |
| FR-06-5 | 終了コード: 0=成功, 1=一般, 2=認証, 3=レート制限 |
| FR-06-6 | `--raw` で emusks 生レスポンス |

### FR-07: HTTP API（n8n 連携）

| ID | 要件 |
|----|------|
| FR-07-1 | REST API（デフォルト `localhost:3920`） |
| FR-07-2 | Phase 1: `/health`, `/api/v1/trends`, `/api/v1/locations`, `/api/v1/settings` |
| FR-07-3 | Phase 2: `/api/v1/trends/:id`（detail）, `/api/v1/search` |
| FR-07-4 | OpenAPI 3.0 を `/openapi.json` で配信（**Phase 2 で実装**） |
| FR-07-5 | `X-API-Key` 認証（オプション） |

### FR-08: 設定

| ID | 要件 |
|----|------|
| FR-08-1 | ルート `.env` を `dotenv` で自動読み込み |
| FR-08-2 | `EMUSKS_CLIENT=web`（デフォルト固定推奨） |
| FR-08-3 | プロキシ指定可 |

### FR-09: X 負荷制御

| ID | 要件 |
|----|------|
| FR-09-1 | emusks へのリクエストは **直列**（並列禁止） |
| FR-09-2 | リクエスト間の最小間隔（デフォルト **3 秒**、`REQUEST_DELAY_MS`） |
| FR-09-3 | 429 / ロック検知時は即停止し `RATE_LIMITED` を返す |
| FR-09-4 | トレンド一覧キャッシュ TTL 5 分、検索キャッシュ TTL 15 分 |
| FR-09-5 | 1 プロセスあたりの emusks 呼び出しをログに記録（debug 時） |

## 5. 非機能要件

### NFR-01: パフォーマンス・負荷

| ID | 要件 |
|----|------|
| NFR-01-1 | `list` 1 回の emusks 呼び出し ≤ 3 回 |
| NFR-01-2 | emusks セッションをプロセス内で再利用 |
| NFR-01-3 | キャッシュで同一条件の再取得を抑制 |

### NFR-02: 可用性・運用

| ID | 要件 |
|----|------|
| NFR-02-1 | 構造化ログ。認証情報は出力しない |
| NFR-02-2 | Docker 実行想定 |
| NFR-02-3 | 専用サブアカウント運用を README で推奨 |

### NFR-03: セキュリティ

| ID | 要件 |
|----|------|
| NFR-03-1 | `TWITTER_AUTH_TOKEN` は `.env`（git 除外） |
| NFR-03-2 | HTTP API は `API_KEY` で保護可能 |

### NFR-04: 保守性

| ID | 要件 |
|----|------|
| NFR-04-1 | TypeScript strict |
| NFR-04-2 | TrendParser を独立モジュール化 |
| NFR-04-3 | フィクスチャベースのパーサーテスト |

### NFR-05: ライセンス

| ID | 要件 |
|----|------|
| NFR-05-1 | emusks AGPL-3.0 を README に明記 |

## 6. 環境変数

### 6.1 読み込み方針

1. 起動時に `.env` を `override: true` で読み込み
2. CI では Secrets を `process.env` に注入（`.env` なし）

### 6.2 変数一覧

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `TWITTER_AUTH_TOKEN` | はい | — | X `auth_token`（`.env` 推奨） |
| `DOTENV_PATH` | いいえ | `.env` | env ファイルパス |
| `API_KEY` | HTTP 時推奨 | — | HTTP API キー |
| `PORT` | いいえ | `3920` | HTTP ポート |
| `EMUSKS_CLIENT` | いいえ | `web` | emusks クライアント |
| `CACHE_TTL_SECONDS` | いいえ | `300` | トレンドキャッシュ TTL |
| `SEARCH_CACHE_TTL_SECONDS` | いいえ | `900` | 検索キャッシュ TTL |
| `REQUEST_DELAY_MS` | いいえ | `3000` | emusks リクエスト間隔 |
| `LOG_LEVEL` | いいえ | `info` | ログレベル |

## 7. 実装フェーズ

| Phase | 内容 | 成果物 |
|-------|------|--------|
| **1** | トレンド一覧・地域・フィルタ・diff・CLI・HTTP | MVP |
| **2** | 軽量 search・detail（任意） | 深掘りオプション |

## 8. 受け入れ基準（Phase 1）

1. `.env` の `TWITTER_AUTH_TOKEN` のみで起動可能
2. `x-trends list -w 23424856 --exclude-promoted` で日本トレンドを JSON 取得
3. デフォルトで `promoted` が除外される
4. `--diff` で前回からの新規トレンドが取得できる
5. `GET /api/v1/trends?woeid=23424856` が n8n から呼び出せる
6. 1 回の `list` で emusks API 呼び出しが 3 回以下

## 9. 将来拡張（バックログ・慎重に）

- ローカル JSON/SQLite によるトレンド履歴（追加 API なしの diff 拡張）
- Webhook プッシュ
- 複数地域バッチ（順次実行・間隔空け）

**採用しない:** x-res 全面移植、ユーザーネットワーク、長期アーカイブ
