# twitter-cli 仕様書

本ドキュメントは、このプロジェクト（`twitter-cli-test`）に含まれる [twitter-cli](https://github.com/jackwener/twitter-cli) の動作仕様をまとめたものです。ソースコード（`twitter-cli/` 配下）と既存ドキュメント（`README.md`, `SCHEMA.md`, `AGENTS.md`）に基づいています。

**バージョン:** 0.8.6（`twitter-cli/pyproject.toml` 参照）  
**Python 要件:** 3.10+  
**CLI エントリポイント:** `twitter`（`twitter_cli.cli:cli`）

---

## 目次

1. [概要](#1-概要)
2. [プロジェクト構成](#2-プロジェクト構成)
3. [認証仕様](#3-認証仕様)
4. [環境変数一覧](#4-環境変数一覧)
5. [設定ファイル（config.yaml）](#5-設定ファイルconfigyaml)
6. [コマンド一覧](#6-コマンド一覧)
7. [出力モード](#7-出力モード)
8. [構造化出力スキーマ](#8-構造化出力スキーマ)
9. [データモデル](#9-データモデル)
10. [キャッシュ機構](#10-キャッシュ機構)
11. [フィルタ・スコアリング](#11-フィルタスコアリング)
12. [レート制限・反検知](#12-レート制限反検知)
13. [エラーコード](#13-エラーコード)
14. [ローカルファイル・パス](#14-ローカルファイルパス)
15. [このプロジェクトでの利用メモ](#15-このプロジェクトでの利用メモ)

---

## 1. 概要

twitter-cli は、Twitter/X の **公式 API キー不要** でタイムライン・検索・ユーザー情報の取得や投稿などを行うターミナル向け CLI です。

### 主な特徴


| カテゴリ | 内容                                            |
| ---- | --------------------------------------------- |
| 読み取り | ホームタイムライン、ブックマーク、検索、ツイート詳細、記事、リスト、ユーザー情報      |
| 書き込み | 投稿、返信、引用、削除、いいね、RT、ブックマーク、フォロー                |
| 認証   | ブラウザ Cookie 自動抽出 または 環境変数                     |
| 通信   | GraphQL API + `curl_cffi` による TLS フィンガープリント偽装 |
| 出力   | Rich テーブル（対話的）/ YAML / JSON / Compact（LLM 向け） |


### 依存パッケージ（主要）

- `browser-cookie3` — ブラウザ Cookie 抽出
- `curl_cffi` — HTTP クライアント（Chrome 偽装）
- `xclienttransaction` — `x-client-transaction-id` ヘッダー生成
- `click` — CLI フレームワーク
- `rich` — ターミナル表示
- `PyYAML` — 設定・出力

---

## 2. プロジェクト構成

### このワークスペースのディレクトリ

```
twitter-cli-test/
├── .env                    # 認証トークン（twitter-cli は自動読み込みしない）
├── TWITTER-CLI-SPEC.md     # 本ドキュメント
└── twitter-cli/            # twitter-cli ソース（git submodule / clone）
    ├── twitter_cli/        # メインパッケージ
    │   ├── cli.py          # CLI エントリポイント
    │   ├── auth.py         # 認証・Cookie 抽出
    │   ├── client.py       # Twitter GraphQL API クライアント
    │   ├── config.py       # config.yaml 読み込み
    │   ├── graphql.py      # GraphQL queryId 解決
    │   ├── parser.py       # レスポンスパース
    │   ├── models.py       # データモデル
    │   ├── filter.py       # スコアリング・フィルタ
    │   ├── formatter.py    # Rich 表示
    │   ├── serialization.py # JSON/YAML シリアライズ
    │   ├── output.py       # 構造化出力ヘルパー
    │   ├── cache.py        # show コマンド用キャッシュ
    │   ├── search.py       # 高度検索クエリ構築
    │   └── constants.py    # 定数・User-Agent
    ├── config.yaml         # デフォルト設定
    ├── tests/
    └── pyproject.toml
```

### モジュール責務


| モジュール        | 責務                             |
| ------------ | ------------------------------ |
| `auth.py`    | Cookie 取得（環境変数 → ブラウザ）、検証      |
| `client.py`  | API リクエスト、ページネーション、書き込み操作      |
| `graphql.py` | queryId の動的解決、JS バンドルスキャン      |
| `output.py`  | TTY 判定、YAML/JSON 切り替え、エンベロープ生成 |
| `cache.py`   | 直近リスト結果の一時保存（`show` 用）         |


---

## 3. 認証仕様

### 3.1 認証の優先順位

`auth.get_cookies()` が全コマンドの認証入口です（`cli._get_client()` 経由）。

```
1. 環境変数 TWITTER_AUTH_TOKEN + TWITTER_CT0（両方必須）
   ↓ 見つからない場合
2. ブラウザ Cookie 自動抽出（browser-cookie3）
   ↓ 見つからない場合
3. AuthenticationError を送出
```

**環境変数はブラウザより優先されます。** 両方設定されている場合、ブラウザ Cookie は使われません。

### 3.2 環境変数による認証

```python
# auth.load_from_env()
auth_token = os.environ.get("TWITTER_AUTH_TOKEN", "")
ct0 = os.environ.get("TWITTER_CT0", "")
```

- 両方が非空の場合のみ有効
- 片方だけの場合は `None` を返し、ブラウザ抽出にフォールバック
- `**.env` ファイルは自動読み込みされない**（`python-dotenv` 等は未使用）

リクエスト時の Cookie ヘッダー（最小構成）:

```
auth_token=<値>; ct0=<値>
```

### 3.3 ブラウザ Cookie 自動抽出

対応ブラウザ（デフォルト優先順）: **Arc → Chrome → Edge → Firefox → Brave**

#### 抽出戦略

1. **インプロセス抽出**（macOS Keychain アクセスに必要）
2. 失敗時 **サブプロセス抽出**（SQLite ロック対策。macOS Keychain では失敗しやすい）

#### macOS の Cookie ファイルパス（例）


| ブラウザ   | パス                                                                          |
| ------ | --------------------------------------------------------------------------- |
| Arc    | `~/Library/Application Support/Arc/User Data/Default/Cookies`               |
| Chrome | `~/Library/Application Support/Google/Chrome/Default/Cookies`               |
| Edge   | `~/Library/Application Support/Microsoft Edge/User Data/Default/Cookies`    |
| Brave  | `~/Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies` |


Chromium 系は `Default` および `Profile `* を自動走査します。

#### 抽出される Cookie

- 必須: `auth_token`, `ct0`（`x.com` / `twitter.com` ドメイン）
- 追加: 同一ドメインの**全 Cookie** を `cookie_string` として転送（ブラウザらしいフィンガープリント）

### 3.4 Cookie 検証

取得後、`verify_cookies()` で軽量検証を実施:

- エンドポイント: `account/verify_credentials.json`, `account/settings.json`
- `401/403` → `AuthenticationError`（認証失敗）
- その他のエラー → 検証スキップ（初回 API 呼び出しで判定）
- 検証失敗時 → ブラウザから再抽出してリトライ

### 3.5 API リクエスト時の認証ヘッダー

`TwitterClient._build_headers()` で以下を付与:


| ヘッダー                      | 内容                                          |
| ------------------------- | ------------------------------------------- |
| `Authorization`           | `Bearer <BEARER_TOKEN>`（固定の公開トークン）          |
| `Cookie`                  | フル `cookie_string` または `auth_token` + `ct0` |
| `X-Csrf-Token`            | `ct0` の値                                    |
| `X-Twitter-Active-User`   | `yes`                                       |
| `X-Twitter-Auth-Type`     | `OAuth2Session`                             |
| `User-Agent`              | 実行環境に合わせた Chrome UA                         |
| `x-client-transaction-id` | 動的生成（初回 x.com アクセス時に初期化）                    |


### 3.6 書き込み操作の注意

`auth_token` + `ct0` のみの環境変数認証では、**226 エラー**（自動化と判定）が発生しやすい場合があります。投稿・返信・引用などの書き込みでは、**ブラウザからの全 Cookie 抽出**が推奨されます。

---

## 4. 環境変数一覧


| 変数名                      | 必須   | 説明                                                  |
| ------------------------ | ---- | --------------------------------------------------- |
| `TWITTER_AUTH_TOKEN`     | 認証時* | ブラウザの `auth_token` Cookie 値                         |
| `TWITTER_CT0`            | 認証時* | ブラウザの `ct0` Cookie 値（CSRF トークン）                     |
| `TWITTER_BROWSER`        | 任意   | 優先ブラウザ（`arc`, `chrome`, `edge`, `firefox`, `brave`） |
| `TWITTER_CHROME_PROFILE` | 任意   | Chromium 系のプロファイル名（例: `Profile 2`）                  |
| `TWITTER_PROXY`          | 任意   | HTTP/SOCKS5 プロキシ（例: `http://127.0.0.1:7890`）        |
| `OUTPUT`                 | 任意   | 出力モード（`auto`, `yaml`, `json`, `rich`）               |
| `LC_ALL` / `LANG`        | 任意   | Accept-Language ヘッダー生成に使用                           |


 環境変数認証を使う場合は両方必須。未設定時はブラウザ抽出にフォールバック。

---

## 5. 設定ファイル（config.yaml）

### 探索順序

1. カレントディレクトリの `config.yaml`
2. パッケージ同梱の `twitter-cli/config.yaml`

### スキーマ

```yaml
fetch:
  count: 50              # --max 未指定時のデフォルト取得件数

filter:
  mode: "topN"           # "topN" | "score" | "all"
  topN: 20
  minScore: 50
  lang: []               # 空 = 言語フィルタなし
  excludeRetweets: false
  weights:
    likes: 1.0
    retweets: 3.0
    replies: 2.0
    bookmarks: 5.0
    views_log: 0.5

rateLimit:
  requestDelay: 2.5      # リクエスト間隔の基準（秒）
  maxRetries: 3        # 429 時のリトライ回数
  retryBaseDelay: 5.0    # 指数バックオフの基準（秒）
  maxCount: 200          # 1 回の取得上限（最大 500 でクランプ）
```

**認証情報は config.yaml には含まれません。**

---

## 6. コマンド一覧

### 6.1 グローバルオプション


| オプション       | 短縮   | 説明                    |
| ----------- | ---- | --------------------- |
| `--verbose` | `-v` | デバッグログ有効化             |
| `--compact` | `-c` | コンパクト JSON 出力（LLM 向け） |
| `--version` | —    | バージョン表示               |


### 6.2 読み取りコマンド


| コマンド                     | 説明             | 主なオプション                                                                                                                                |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `feed`                   | ホームタイムライン      | `-t for-you|following`, `--max`, `--cursor`, `--filter`, `--full-text`, `--json/--yaml`, `-o`                                          |
| `bookmarks`              | ブックマーク一覧       | `--max`, `--filter`, `--full-text`                                                                                                     |
| `bookmarks folders`      | ブックマークフォルダ一覧   | —                                                                                                                                      |
| `bookmarks folders <id>` | フォルダ内ツイート      | `--since YYYY-MM-DD`, `--max`                                                                                                          |
| `search <query>`         | ツイート検索         | `-t Top|Latest|Photos|Videos`, `--from`, `--to`, `--lang`, `--since`, `--until`, `--has`, `--exclude`, `--min-likes`, `--min-retweets` |
| `tweet <id>`             | ツイート詳細 + 返信    | `--max`（返信件数）, URL も可                                                                                                                  |
| `show <N>`               | 直前リストの N 番目を表示 | キャッシュ参照（後述）                                                                                                                            |
| `article <id>`           | Twitter 記事取得   | `--markdown`, `-o`                                                                                                                     |
| `list <id>`              | リストタイムライン      | `--cursor`, `--max`                                                                                                                    |
| `user <handle>`          | ユーザープロフィール     | —                                                                                                                                      |
| `user-posts <handle>`    | ユーザーのツイート      | `--max`                                                                                                                                |
| `likes <handle>`         | いいね一覧          | ⚠️ 2024年6月以降、自分のみ                                                                                                                      |
| `followers <handle>`     | フォロワー一覧        | `--max`                                                                                                                                |
| `following <handle>`     | フォロー中一覧        | `--max`                                                                                                                                |
| `whoami`                 | 認証中ユーザー情報      | —                                                                                                                                      |
| `status`                 | 認証状態確認         | `authenticated` + `user` を返す                                                                                                           |


#### 互換エイリアス

- `favorites` → `bookmarks` と同等

#### ページネーション

`feed`, `list` コマンドは `--cursor` で継続取得可能。構造化出力時は `pagination.nextCursor` に次カーソルが含まれる。

### 6.3 書き込みコマンド


| コマンド                | 説明                    | 主なオプション                       |
| ------------------- | --------------------- | ----------------------------- |
| `post <text>`       | 新規投稿                  | `--reply-to`, `-i`（画像、最大 4 枚） |
| `reply <id> <text>` | 返信                    | `-i`                          |
| `quote <id> <text>` | 引用ツイート                | `-i`                          |
| `delete <id>`       | 削除                    | 確認プロンプトあり                     |
| `like <id>`         | いいね                   | —                             |
| `unlike <id>`       | いいね解除                 | —                             |
| `retweet <id>`      | リツイート                 | —                             |
| `unretweet <id>`    | RT 解除                 | —                             |
| `bookmark <id>`     | ブックマーク                | —                             |
| `unbookmark <id>`   | ブックマーク解除              | —                             |
| `favorite <id>`     | `bookmark` の互換エイリアス   | —                             |
| `unfavorite <id>`   | `unbookmark` の互換エイリアス | —                             |
| `follow <handle>`   | フォロー                  | —                             |
| `unfollow <handle>` | フォロー解除                | —                             |


#### 画像添付

- 最大 **4 枚**（JPEG / PNG / GIF / WebP）
- `-i` / `--image` は繰り返し指定可能

---

## 7. 出力モード

### 7.1 モード決定ロジック（`output.default_structured_format()`）

```
--json と --yaml の同時指定 → エラー
--yaml 指定 → YAML
--json 指定 → JSON
OUTPUT=yaml → YAML
OUTPUT=json → JSON
OUTPUT=rich → Rich テーブル
stdout が TTY でない → YAML（デフォルト）
それ以外 → Rich テーブル
```

### 7.2 出力形式の比較


| 形式           | 用途              | トリガー                         |
| ------------ | --------------- | ---------------------------- |
| Rich テーブル    | 対話的閲覧           | デフォルト（TTY）                   |
| YAML         | スクリプト・AI エージェント | `--yaml`, パイプ, `OUTPUT=yaml` |
| JSON         | 厳密な JSON パーサー向け | `--json`, `OUTPUT=json`      |
| Compact JSON | LLM 向け最小フィールド   | `-c` / `--compact`           |


### 7.3 Compact モードのフィールド

```json
{
  "id": "1234567890",
  "author": "@handle",
  "text": "本文（140文字で切り詰め）",
  "likes": 100,
  "rts": 10,
  "time": "Mar 07 05:51"
}
```

`article` コマンドは `--compact` 非対応。

### 7.4 共通オプション（読み取り系）


| オプション             | 説明                         |
| ----------------- | -------------------------- |
| `--max` / `-n`    | 取得件数上限                     |
| `--full-text`     | テーブル表示で本文を切り詰めない           |
| `--filter`        | スコアリングフィルタを有効化             |
| `--output` / `-o` | 結果をファイル保存                  |
| `--input` / `-i`  | JSON ファイルから読み込み（`feed` のみ） |


---

## 8. 構造化出力スキーマ

スキーマバージョン: `"1"`

### 成功レスポンス

```yaml
ok: true
schema_version: "1"
data: ...
pagination:          # タイムライン系のみ（任意）
  nextCursor: "..."
```

### エラーレスポンス

```yaml
ok: false
schema_version: "1"
error:
  code: api_error
  message: "エラーメッセージ"
  details: ...       # 任意（書き込み操作時など）
```

### コマンド別 data の形状


| コマンド      | data の内容                                     |
| --------- | -------------------------------------------- |
| ツイートリスト系  | `Tweet[]`                                    |
| `user`    | `UserProfile`                                |
| `whoami`  | `{ user: UserProfile }`                      |
| `status`  | `{ authenticated: true, user: UserProfile }` |
| `article` | `Tweet`（`articleTitle`, `articleText` 付き）    |
| 書き込み系     | `{ success, action, id, url?, ... }`         |


---

## 9. データモデル

### Tweet


| フィールド          | 型            | 説明               |
| -------------- | ------------ | ---------------- |
| `id`           | string       | ツイート ID          |
| `text`         | string       | 本文               |
| `author`       | Author       | 投稿者              |
| `metrics`      | Metrics      | エンゲージメント指標       |
| `createdAt`    | string       | 投稿日時（Twitter 形式） |
| `media`        | TweetMedia[] | 添付メディア           |
| `urls`         | string[]     | 含まれる URL         |
| `isRetweet`    | bool         | RT かどうか          |
| `quotedTweet`  | Tweet?       | 引用元              |
| `articleTitle` | string?      | 記事タイトル           |
| `articleText`  | string?      | 記事本文（Markdown）   |
| `score`        | float?       | フィルタ適用時のスコア      |


### UserProfile


| フィールド                                       | 説明     |
| ------------------------------------------- | ------ |
| `id`, `name`, `screenName`                  | 基本情報   |
| `bio`, `location`, `url`                    | プロフィール |
| `followers`, `following`, `tweets`, `likes` | カウント   |
| `verified`, `profileImageUrl`, `createdAt`  | その他    |


---

## 10. キャッシュ機構

`show` コマンドは直前のリスト結果を参照します。


| 項目     | 値                                              |
| ------ | ---------------------------------------------- |
| 保存先    | `~/.twitter-cli/last_results.json`             |
| TTL    | 3600 秒（1 時間）                                   |
| 保存トリガー | `feed`, `search`, `bookmarks`, `list` 等のリスト表示後 |


### キャッシュ内容（例）

```json
{
  "created_at": 1717776000.0,
  "tweets": [
    { "index": 1, "id": "123...", "author": "handle", "text": "先頭80文字..." }
  ]
}
```

### 使用例

```bash
twitter feed --max 20
twitter show 3        # 上記リストの 3 番目の詳細を取得
```

---

## 11. フィルタ・スコアリング

`--filter` フラグ指定時のみ有効（デフォルトではフィルタなし）。

### スコア計算式

```
score = likes_w × likes
      + retweets_w × retweets
      + replies_w × replies
      + bookmarks_w × bookmarks
      + views_log_w × log10(max(views, 1))
```

デフォルト重み: likes=1.0, retweets=3.0, replies=2.0, bookmarks=5.0, views_log=0.5

### モード


| mode    | 動作                |
| ------- | ----------------- |
| `topN`  | スコア上位 N 件を保持      |
| `score` | `minScore` 以上のみ保持 |
| `all`   | 全件をスコア順ソートして返す    |


追加フィルタ: `lang`（言語コード）、`excludeRetweets`（RT 除外）

---

## 12. レート制限・反検知

### リクエスト間隔

- 基準: `rateLimit.requestDelay`（デフォルト 2.5 秒）
- 実際の待機: `delay × random(0.7, 1.5)` のジッター

### 429 リトライ

- 回数: `maxRetries`（デフォルト 3）
- バックオフ: `retryBaseDelay × 2^attempt + random(0, 2)`

### 書き込み操作の遅延

- 各書き込み後: `random.uniform(1.5, 4.0)` 秒のスリープ

### 反検知機能


| 機能                      | 実装                                |
| ----------------------- | --------------------------------- |
| TLS フィンガープリント           | `curl_cffi` で Chrome バージョン偽装      |
| User-Agent 同期           | 偽装 Chrome バージョンと UA/sec-ch-ua を一致 |
| x-client-transaction-id | `xclienttransaction` ライブラリ        |
| 全 Cookie 転送             | ブラウザ抽出時                           |
| プロキシ                    | `TWITTER_PROXY`                   |


### 取得件数の上限

- `rateLimit.maxCount`（デフォルト 200）
- 絶対上限: **500**（`_ABSOLUTE_MAX_COUNT`）

---

## 13. エラーコード


| コード                  | 例外クラス                 | 説明                      |
| -------------------- | --------------------- | ----------------------- |
| `not_authenticated`  | `AuthenticationError` | Cookie 未設定・期限切れ・401/403 |
| `not_found`          | `NotFoundError`       | ユーザー・ツイート未検出            |
| `rate_limited`       | `RateLimitError`      | HTTP 429                |
| `invalid_input`      | `InvalidInputError`   | 不正な入力・オプション             |
| `network_error`      | `NetworkError`        | ネットワーク障害                |
| `query_id_error`     | `QueryIdError`        | GraphQL queryId 解決失敗    |
| `media_upload_error` | `MediaUploadError`    | 画像アップロード失敗              |
| `api_error`          | `TwitterAPIError`     | その他 API エラー             |


---

## 14. ローカルファイル・パス


| パス                                                    | 用途             | 認証情報              |
| ----------------------------------------------------- | -------------- | ----------------- |
| `~/.twitter-cli/last_results.json`                    | show 用キャッシュ    | なし                |
| `~/Library/Application Support/<Browser>/.../Cookies` | ブラウザ Cookie DB | **auth_token 含む** |
| `./config.yaml`                                       | CLI 設定         | なし                |
| `./.env`（本プロジェクト）                                     | 手動管理用トークン      | **auth_token 含む** |


**twitter-cli は認証トークンをディスクに永続保存しません**（キャッシュは ID のみ）。

---

## 15. このプロジェクトでの利用メモ

### ディレクトリ構成

- `twitter-cli-test/` がプロジェクトルート
- `twitter-cli/` に CLI ソースが配置されている
- ルートの `.env` に `TWITTER_AUTH_TOKEN` と `TWITTER_CT0` が記載されている

### 環境変数の有効化

`.env` は twitter-cli が自動読み込みしないため、以下のいずれかが必要:

```bash
# 方法 1: 実行前に source
set -a && source .env && set +a
twitter feed

# 方法 2: .zshrc で読み込み
# if [ -f /path/to/twitter-cli-test/.env ]; then
#   set -a; source /path/to/twitter-cli-test/.env; set +a
# fi

# 方法 3: 環境変数を設定せずブラウザ Cookie に任せる（推奨・書き込み時）
twitter feed
```

### ソースから実行

```bash
cd twitter-cli-test/twitter-cli
uv sync
uv run twitter feed --max 10
```

### デバッグ

```bash
twitter -v whoami    # 認証ソースの確認
twitter status       # 認証状態の確認
```

`-v` 実行時のログ例:

- `Loaded cookies from environment variables` → 環境変数を使用
- `Found cookies in arc profile 'Default' (in-process)` → ブラウザを使用

### セキュリティ

- `.env` やブラウザ Cookie の `auth_token` はログインセッション相当
- Git へのコミット禁止（`twitter-cli/.gitignore` に `.env` あり。ルート `.env` は別途注意）
- トークン漏洩時は x.com でログアウト・再ログインして無効化

---

## 参考リンク

- リポジトリ: [https://github.com/jackwener/twitter-cli](https://github.com/jackwener/twitter-cli)
- 構造化出力: `twitter-cli/SCHEMA.m`
- AI エージェント向け: `twitter-cli/SKILL.md`
- 開発者向け: `twitter-cli/AGENTS.md`

