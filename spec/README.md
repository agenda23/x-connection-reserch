# X トレンド取得アプリ（x-trends）— 仕様ドキュメント

emusks を用いて X のトレンドを **低負荷・高品質（ノイズ除去）** で取得し、CLI および n8n から利用するアプリケーションの仕様集です。

## 設計方針（要約）

- **本体:** トレンド一覧（`explore` / `sidebar` / `merge`）+ 地域指定 + `promoted` 除外 + diff
- **高機能:** 大量取得ではなく、正規化・フィルタ・差分で品質を上げる
- **回避:** ユーザー API、高並列、深いページネーション、x-res 級の大量分析
- **任意（Phase 2）:** 軽量 search、単件 AI サマリー（detail）

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [01-emusks-research.md](./01-emusks-research.md) | emusks 調査（認証・API・ホスティング・BAN リスク） |
| [02-requirements.md](./02-requirements.md) | 要件・スコープ・フェーズ |
| [03-architecture.md](./03-architecture.md) | システム構成・負荷制御 |
| [04-api-spec.md](./04-api-spec.md) | CLI / HTTP API |
| [05-data-schema.md](./05-data-schema.md) | データモデル・パーサー |
| [ref/x-res-emusks-feasibility.md](./ref/x-res-emusks-feasibility.md) | x-res 参考仕様との適合性 |
| [ref/X (Twitter) Research CLI Tool x-res 設計仕様書.md](./ref/X%20(Twitter)%20Research%20CLI%20Tool%20x-res%20設計仕様書.md) | 参考ドキュメント（原文） |

## 前提

- **ランタイム:** Node.js 20+
- **依存:** emusks `^2.3.3`（pnpm）
- **認証:** `TWITTER_AUTH_TOKEN`（`process.env` 最優先、`~/.config/x-trends/.env` 等フォールバック、`ct0` 不要）
- **ライセンス:** emusks は AGPL-3.0-only

## 実装フェーズ

| Phase | 内容 |
|-------|------|
| **1** | `list` / `locations` / `settings` / `serve`、フィルタ・diff・HTTP |
| **2** | `search` / `detail`（任意） |
