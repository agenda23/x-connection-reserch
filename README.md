# ++**[x-connection-reserch](https://github.com/agenda23/x-connection-reserch)**++

[twitter-cli](https://github.com/jackwener/twitter-cli) と [emusks](https://emusks.tiago.zip) を検証・利用するためのワークスペースです。

## 構成

```
twitter-cli-test/
├── .env.example          # TWITTER_AUTH_TOKEN のテンプレート（本アプリは自動読み込み）
├── TWITTER-CLI-SPEC.md   # twitter-cli 動作仕様（日本語）
├── package.json          # Node.js 依存（emusks）
└── twitter-cli/          # 別途 clone（git 管理外）
```

## セットアップ

### 1. リポジトリのクローン

```bash
git clone <this-repo-url>
cd twitter-cli-test
```

### 2. twitter-cli の取得

`twitter-cli/` は `.gitignore` に含まれているため、手動で clone してください。

```bash
git clone https://github.com/jackwener/twitter-cli.git twitter-cli
cd twitter-cli
uv sync
```

### 3. Node.js 依存のインストール

```bash
pnpm install
```

### 4. 認証情報の設定

```bash
cp .env.example .env
# .env に TWITTER_AUTH_TOKEN を記入
```

**x-trends-app（emusks）** は起動時にルート `.env` を自動読み込みし、`TWITTER_AUTH_TOKEN` を最優先で使用します。手動 `export` は不要です。

**twitter-cli** は `.env` を自動読み込みしません。利用前に環境変数へ export してください。

```bash
set -a && source .env && set +a
```

## 使い方

### twitter-cli

```bash
cd twitter-cli
uv run twitter feed --max 10
uv run twitter -v whoami
```

詳細は [TWITTER-CLI-SPEC.md](./TWITTER-CLI-SPEC.md) を参照してください。

### x-trends-app（emusks・開発予定）

仕様は [spec/](./spec/) を参照。

- トレンド取得を中心に、プロモーション除外・地域指定・差分検知を提供
- 認証は `.env` の `TWITTER_AUTH_TOKEN` のみ（`ct0` 不要）
- ユーザー API・大量取得は対象外。軽量検索は Phase 2 オプション

### emusks（直接利用）

```bash
node -e "const { Emusks } = require('emusks'); console.log(Emusks);"
```

## セキュリティ

- `.env` やブラウザ Cookie の `auth_token` はログインセッション相当です
- 認証情報を Git にコミットしないでください
- トークン漏洩時は x.com でログアウト・再ログインして無効化してください

## 参考リンク

- [twitter-cli](https://github.com/jackwener/twitter-cli)
- [emusks](https://emusks.tiago.zip)

