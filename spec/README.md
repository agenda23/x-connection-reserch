# X トレンド取得アプリ — 仕様ドキュメント

emusks を用いて X（Twitter）のトレンドを取得し、CLI および n8n から利用できるアプリケーションを開発するための要件・仕様集です。

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [01-emusks-research.md](./01-emusks-research.md) | emusks の調査結果（認証・API・制約） |
| [02-requirements.md](./02-requirements.md) | 機能要件・非機能要件・ユースケース |
| [03-architecture.md](./03-architecture.md) | システム構成・コンポーネント設計 |
| [04-api-spec.md](./04-api-spec.md) | CLI / HTTP API のインターフェース仕様 |
| [05-data-schema.md](./05-data-schema.md) | 正規化データモデル・レスポンス形式 |

## 前提

- **ランタイム:** Node.js 20+（emusks は ESM のみ）
- **依存ライブラリ:** emusks `^2.3.3`（pnpm 管理）
- **認証:** ルート `.env` の `TWITTER_AUTH_TOKEN` を起動時に自動読み込み（最優先）
- **ライセンス注意:** emusks は AGPL-3.0-only。本アプリを配布・公開する場合はライセンス要件を満たす必要あり

## 調査対象バージョン

- emusks: **2.3.3**（`node_modules/emusks`）
- 調査日: 2026-06-07

## 関連リソース

- [emusks 公式ドキュメント](https://emusks.tiago.zip)
- [emusks Trends API](https://emusks.tiago.zip/discovery/trends)
- [TWITTER-CLI-SPEC.md](../TWITTER-CLI-SPEC.md)（twitter-cli 側の仕様、参考用）
