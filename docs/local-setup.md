# x-trends ローカル PC 利用ガイド

この Mac 上で **個人利用** するためのセットアップ手順と CLI コマンドリファレンスです。npm 公開は想定していません。

> 汎用的な説明（HTTP API・n8n 連携・詳細仕様）は [user-manual.md](./user-manual.md) を参照してください。

---

## 目次

1. [推奨構成](#1-推奨構成)
2. [初回セットアップ](#2-初回セットアップ)
3. [認証設定](#3-認証設定)
4. [グローバル CLI として使う](#4-グローバル-cli-として使う)
5. [日常運用](#5-日常運用)
6. [他プロジェクトから使う](#6-他プロジェクトから使う)
7. [CLI コマンドリファレンス](#7-cli-コマンドリファレンス)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. 推奨構成

| 項目 | この PC での推奨 |
|------|------------------|
| 配布方法 | リポジトリ clone + `pnpm add -g <絶対パス>`（npm 公開不要） |
| コマンド | `x-trends`（どのディレクトリからでも） |
| 認証 | `~/.config/x-trends/.env` または `export TWITTER_AUTH_TOKEN=...` |
| ソース | `/Volumes/SSD/workspace/twitter-cli-test`（外付け SSD） |

---

## 2. 初回セットアップ

```bash
cd /Volumes/SSD/workspace/twitter-cli-test
pnpm install
cp .env.example .env
# .env に TWITTER_AUTH_TOKEN を記入（リポジトリ内開発用）
pnpm build
```

### `auth_token` の取得

1. x.com にブラウザでログイン
2. DevTools（F12）→ Application → Cookies → `https://x.com`
3. `auth_token` の値をコピー

> `auth_token` はログインセッションと同等の権限を持ちます。Git にコミットしないでください。

---

## 3. 認証設定

`TWITTER_AUTH_TOKEN` は次の優先順位（高→低）で自動解決されます。

| 順位 | ソース |
|------|--------|
| 1 | `process.env.TWITTER_AUTH_TOKEN`（シェル export） |
| 2 | `DOTENV_PATH` または `~/.config/x-trends/.env` |
| 3 | カレントディレクトリの `.env` |
| 4 | パッケージルートの `.env` |

### グローバル CLI 向け（推奨）

```bash
mkdir -p ~/.config/x-trends
cat > ~/.config/x-trends/.env <<'EOF'
TWITTER_AUTH_TOKEN=ここにトークン
EOF
chmod 600 ~/.config/x-trends/.env
```

または `~/.zshrc` に追記:

```bash
export TWITTER_AUTH_TOKEN="ここにトークン"
```

### 動作確認

```bash
x-trends settings
# → {"ok":true,"data":{"settings":{"location":null}},...}
```

---

## 4. グローバル CLI として使う

**重要:** `pnpm add -g .`（相対パス）は使わないでください。リンク先が壊れ、`x-trends: command not found` になることがあります。

```bash
cd /Volumes/SSD/workspace/twitter-cli-test
pnpm build
pnpm add -g /Volumes/SSD/workspace/twitter-cli-test
```

成功時の表示例:

```
+ x-trends 0.1.0 <- ../../../../../../Volumes/SSD/workspace/twitter-cli-test
```

確認:

```bash
which x-trends    # ~/Library/pnpm/x-trends
x-trends --help
```

### PATH が通らない場合

```bash
pnpm setup   # 未実行なら
# ~/.zshrc に以下があることを確認
export PNPM_HOME="$HOME/Library/pnpm"
export PATH="$PNPM_HOME:$PATH"
```

---

## 5. 日常運用

### よく使うコマンド

```bash
# 日本のトレンド（JSON）
x-trends list --preset japan --format json

# 表形式
x-trends list --preset japan --format table

# 前回との差分
x-trends list --preset japan --diff

# 検索（サンプル）
x-trends search --query "#AI" --count 10
```

### コードを更新したあと

```bash
cd /Volumes/SSD/workspace/twitter-cli-test
git pull          # 必要なら
pnpm build        # 必須（グローバル CLI は dist/ を実行）
```

グローバルリンクはそのままで OK です。再インストールは通常不要です。

### 実行時間の目安

`list --preset japan` は emusks への API 呼び出しが **3 回**（login → 地域設定 → explore）発生します。`REQUEST_DELAY_MS`（デフォルト 3 秒）の待機を含め、**おおよそ 10〜15 秒** で完了します。出力後すぐプロンプトに戻ります。

---

## 6. 他プロジェクトから使う

グローバルインストール済みなら、任意のディレクトリから `x-trends` を実行できます。

```bash
cd ~/projects/my-app
x-trends list --preset japan --format json
```

### プロジェクトごとに別トークンを使う場合

`~/.config/x-trends/.env` にトークンを書いていると、そちらが優先されます。プロジェクトの `.env` を使うには:

- ユーザー設定ファイルにトークンを置かない、または
- そのプロジェクトだけ `direnv` 等で `TWITTER_AUTH_TOKEN` を export

### npm スクリプトから呼ぶ例

```json
{
  "scripts": {
    "trends": "x-trends list --preset japan --format json"
  }
}
```

### キャッシュ・diff スナップショット

`--diff` のスナップショットは `~/.cache/x-trends/` に保存され、**プロジェクト横断で共有**されます。

---

## 7. CLI コマンドリファレンス

### グローバルオプション

| オプション | 短縮 | デフォルト | 説明 |
|-----------|------|-----------|------|
| `--format <fmt>` | `-f` | `json` | `json` \| `table` |
| `--raw` | — | false | 生 emusks レスポンスを `_raw` に含める |
| `--verbose` | `-v` | false | デバッグログ |
| `--version` | `-V` | — | バージョン表示 |
| `--help` | `-h` | — | ヘルプ |

---

### `list` — トレンド一覧

```bash
x-trends list [オプション]
```

| オプション | 短縮 | デフォルト | 説明 |
|-----------|------|-----------|------|
| `--woeid <number>` | `-w` | — | 地域 WOEID |
| `--preset <name>` | `-p` | — | プリセット（下表） |
| `--count <number>` | `-n` | 20 | 件数（最大 50） |
| `--source <src>` | `-s` | `explore` | `explore` \| `sidebar` \| `merge` |
| `--no-exclude-promoted` | — | — | プロモーションを含める |
| `--categories <list>` | — | — | `trending,event,topic` 等（カンマ区切り） |
| `--diff` | — | false | 前回との差分 |
| `--cursor <cursor>` | — | — | ページネーション |

**プリセット:**

| preset | 地域 | WOEID |
|--------|------|-------|
| `worldwide` | 全世界 | 1 |
| `japan` | 日本 | 23424856 |
| `us` | 米国 | 23424977 |
| `uk` | 英国 | 23424975 |
| `tokyo` | 東京 | 1118370 |

**API 呼び出し回数（`meta.apiCalls`）:**

| 条件 | 回数 |
|------|------|
| `--preset` / `--woeid` 指定あり | 3（login + setLocation + fetch） |
| 地域未指定 | 2〜3 |

**例:**

```bash
x-trends list --preset japan --format table
x-trends list --preset japan --diff
x-trends list --preset japan --categories topic,trending
x-trends list --source merge --preset japan
```

---

### `locations` — 地域一覧・検索

```bash
x-trends locations [--search <query>] [--format table]
```

```bash
x-trends locations --search Tokyo
x-trends locations --search Japan --format table
```

---

### `settings` — Explore 設定確認

```bash
x-trends settings [--format table]
```

---

### `search` — ツイート検索（Phase 2・サンプル）

```bash
x-trends search --query <query> [オプション]
```

| オプション | 短縮 | デフォルト | 上限 |
|-----------|------|-----------|------|
| `--query <query>` | `-q` | **必須** | — |
| `--mode <mode>` | `-m` | `top` | `top` \| `latest` |
| `--count <number>` | `-n` | 20 | 20 |
| `--max-pages <number>` | — | 1 | 2 |
| `--since <date>` | — | — | 7 日以内（`YYYY-MM-DD`） |

```bash
x-trends search --query "#AI" --count 10
x-trends search --query "#AI lang:ja" --mode latest --max-pages 2
```

---

### `detail` — トレンド AI サマリー（Phase 2）

```bash
x-trends detail --id <trendId>
```

> `list` が返す `id` は通常 `null` です。有効な Trend REST ID が別途必要です。

---

### `serve` — HTTP サーバー（n8n 連携用）

```bash
x-trends serve [--port 3920] [--host 0.0.0.0]
```

常駐プロセスです。詳細は [user-manual.md §4](./user-manual.md#4-http-api-リファレンス) を参照。

---

### 環境変数（参考）

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `TWITTER_AUTH_TOKEN` | — | **必須** |
| `DOTENV_PATH` | `~/.config/x-trends/.env` | ユーザー設定パス |
| `REQUEST_DELAY_MS` | `3000` | API 呼び出し間隔（ms） |
| `CACHE_TTL_SECONDS` | `300` | トレンドキャッシュ TTL |
| `PORT` | `3920` | HTTP サーバーポート（`serve` 時） |
| `API_KEY` | — | HTTP API キー（`serve` 時推奨） |

---

## 8. トラブルシューティング

### `command not found: x-trends`

```bash
pnpm add -g /Volumes/SSD/workspace/twitter-cli-test   # . ではなく絶対パス
echo $PATH | tr ':' '\n' | grep pnpm
```

### `TWITTER_AUTH_TOKEN is not set`

```bash
echo "$TWITTER_AUTH_TOKEN"
cat ~/.config/x-trends/.env
```

### `Error [UPSTREAM_ERROR]: Empty or invalid response...`

`--preset` 指定時の地域切り替え後に X API が空レスポンスを返した可能性があります。数分待って再試行するか、トークンを更新してください。

```bash
x-trends list --preset japan --raw   # 生レスポンス確認
```

### 出力後にプロンプトが戻らない（旧バージョン）

最新版では CLI 完了後に自動終了します。古いビルドを使っている場合:

```bash
cd /Volumes/SSD/workspace/twitter-cli-test && pnpm build
```

### 外付け SSD 未マウント

グローバル CLI は SSD 上のリポジトリをリンク参照しているため、SSD がマウントされていないと `x-trends` は動きません。内蔵ディスクに clone するか、マウント後に使ってください。

### 壊れたグローバルインストール（`+ 5 <- ???`）

```bash
pnpm remove -g 5
pnpm add -g /Volumes/SSD/workspace/twitter-cli-test
```

---

## 関連ドキュメント

- [user-manual.md](./user-manual.md) — HTTP API・n8n・全般リファレンス
- [../README.md](../README.md) — プロジェクト概要
- [../spec/](../spec/) — 設計仕様
