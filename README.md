# x-trends-app

emusks を使って X（Twitter）のトレンドを **公式 API キーなし** で取得する CLI ツールです。プロモーション除外・地域指定・差分検知を標準搭載します。

> **ステータス:** 仕様策定済み・実装前。`src/` はまだ存在しません。

## 構成

```
twitter-cli-test/
├── .env.example          # TWITTER_AUTH_TOKEN のテンプレート
├── package.json          # Node.js 依存（emusks）
├── spec/                 # x-trends-app 仕様ドキュメント
└── twitter-cli/          # 参考ツール（別途 clone・git 管理外）
```

## セットアップ

```bash
# 1. このリポジトリをクローン
git clone <this-repo-url>
cd twitter-cli-test

# 2. 依存をインストール
pnpm install

# 3. 認証情報を設定
cp .env.example .env
# .env を開き TWITTER_AUTH_TOKEN を記入
# （x.com にログイン後 DevTools → Application → Cookies → auth_token）
```

`.env` は起動時に自動読み込みされます（`dotenv` `override: true`）。手動 `export` は不要です。

## CLI の使い方（Phase 1 実装後）

```bash
# 日本のトレンドを取得（プロモーション自動除外）
pnpm x-trends list --woeid 23424856

# プリセット指定・表形式で表示
pnpm x-trends list --preset japan --format table

# explore + sidebar をマージして取得し、前回との差分も表示
pnpm x-trends list --preset japan --source merge --diff

# 利用可能な地域一覧
pnpm x-trends locations

# 地域名で WOEID を調べる
pnpm x-trends locations --search Tokyo

# 現在の Explore 設定を確認
pnpm x-trends settings

# HTTP サーバーを起動（n8n 連携用）
pnpm x-trends serve --port 3920
```

### グローバルオプション

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `--format` / `-f` | `json` | `json` \| `table` |
| `--raw` | false | emusks 生レスポンスを出力 |
| `--verbose` / `-v` | false | デバッグログを表示 |

### WOEID プリセット

| preset | 地域 |
|--------|------|
| `worldwide` | 全世界 |
| `japan` | 日本 |
| `us` | 米国 |
| `uk` | 英国 |
| `tokyo` | 東京 |

## 参考ツール: twitter-cli

Python 製の X 操作 CLI です。emusks との比較・動作検証に使用します。

```bash
# 別途クローンが必要（git 管理外）
git clone https://github.com/jackwener/twitter-cli.git twitter-cli
cd twitter-cli && uv sync

# .env を手動で読み込む（自動読み込みなし）
set -a && source ../.env && set +a

uv run twitter feed --max 10
uv run twitter -v whoami
```

詳細は [`spec/ref/TWITTER-CLI-SPEC.md`](./spec/ref/TWITTER-CLI-SPEC.md) を参照してください。

## 仕様ドキュメント

[`spec/`](./spec/) に設計・要件・API 仕様をまとめています。

| ファイル | 内容 |
|---------|------|
| [spec/02-requirements.md](./spec/02-requirements.md) | 要件・スコープ・フェーズ |
| [spec/03-architecture.md](./spec/03-architecture.md) | システム構成・負荷制御 |
| [spec/04-api-spec.md](./spec/04-api-spec.md) | CLI コマンド・HTTP API |
| [spec/05-data-schema.md](./spec/05-data-schema.md) | データ型・Zod スキーマ |

## セキュリティ

- `auth_token` はログインセッションと同等です。`.env` は Git にコミットしないでください
- 漏洩時は x.com でログアウト・再ログインしてトークンを無効化してください
- 本番運用では専用サブアカウントの使用を推奨します（`spec/01-emusks-research.md` 参照）

## ライセンス

emusks は **AGPL-3.0-only** です。ネットワーク経由で提供する場合はソース公開義務が生じる可能性があります。

## 参考リンク

- [emusks](https://emusks.tiago.zip)
- [twitter-cli](https://github.com/jackwener/twitter-cli)
