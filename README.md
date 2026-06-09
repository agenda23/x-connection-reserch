# x-trends-app

emusks を使って X（Twitter）のトレンドを **公式 API キーなし** で取得する TypeScript CLI ツールです。プロモーション除外・地域指定・差分検知を標準搭載します。

> **ステータス:** Phase 1 / Phase 2 実装済み。`src/` に全ソースが揃っています。

## セットアップ

```bash
pnpm install
cp .env.example .env
# .env を開き TWITTER_AUTH_TOKEN を記入（ローカル開発向け）
```

`auth_token` は x.com にログイン後、DevTools → Application → Cookies → `auth_token` で確認できます。

**認証の優先順位（高→低）:** `process.env` → `~/.config/x-trends/.env`（または `DOTENV_PATH`）→ カレントの `.env` → パッケージルート `.env`

グローバルインストール時は `export TWITTER_AUTH_TOKEN=...` または `~/.config/x-trends/.env` を推奨します。

## CLI クイックスタート

```bash
# 日本のトレンド（表形式）
pnpm x-trends list --preset japan --format table

# 前回との差分つきで取得
pnpm x-trends list --preset japan --diff

# "#AI" を含むツイートを検索（サンプル）
pnpm x-trends search --query "#AI" --count 10

# WOEID で地域を調べる
pnpm x-trends locations --search Tokyo

# HTTP サーバーを起動（n8n 連携用）
pnpm x-trends serve
```

詳細は以下を参照してください。

- **[docs/local-setup.md](./docs/local-setup.md)** — この Mac 向けセットアップ・CLI リファレンス
- **[docs/user-manual.md](./docs/user-manual.md)** — HTTP API・n8n・全般リファレンス

## ビルド

```bash
pnpm build        # dist/ に出力
pnpm dev:server   # HTTP サーバー開発起動（tsx watch）
```

## 実装フェーズ

| Phase | 内容 | 状態 |
|-------|------|------|
| **1** | トレンド一覧・地域指定・diff・CLI・HTTP API | 完了 |
| **2** | 軽量検索（`search`）・AI サマリー（`detail`）・OpenAPI | 完了 |

## ファイル構成

```
├── src/
│   ├── cli.ts              # CLI エントリ（commander）
│   ├── index.ts            # HTTP サーバーエントリ（Hono）
│   ├── config.ts           # dotenv 読み込み・設定
│   ├── openapi.ts          # OpenAPI 3.0 スペック
│   ├── lib/
│   │   ├── emusks-client.ts
│   │   ├── cache.ts
│   │   ├── rate-limiter.ts
│   │   └── errors.ts
│   ├── parsers/
│   │   ├── explore.ts      # トレンド GraphQL パーサー
│   │   ├── search.ts       # 検索結果パーサー
│   │   ├── detail.ts       # トレンド詳細パーサー
│   │   └── location.ts
│   ├── services/
│   │   ├── trends.ts
│   │   ├── search.ts
│   │   ├── detail.ts
│   │   └── locations.ts
│   └── types/
│       ├── trend.ts
│       └── emusks.d.ts
├── spec/                   # 設計ドキュメント
├── docs/                   # ユーザーマニュアル
└── dist/                   # ビルド成果物
```

## 制約事項

- emusks へのリクエストは必ず **直列**（並列呼び出しは BAN リスクあり）
- n8n ポーリングは **15 分以上**の間隔を推奨
- `search` / `detail` はサンプル取得であり完全集計ではない
- 本番運用では専用サブアカウントの使用を推奨

## ライセンス

emusks は **AGPL-3.0-only** です。ネットワーク経由で提供する場合はソース公開義務が生じる可能性があります。

## 参考リンク

- [emusks](https://emusks.tiago.zip)
- [仕様ドキュメント](./spec/)
- [ユーザーマニュアル](./docs/user-manual.md)
- [ローカル PC 利用ガイド](./docs/local-setup.md)
