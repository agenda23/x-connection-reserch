# emusks 調査レポート

## 1. 概要

emusks は X（Twitter）の非公式 API クライアント（JavaScript / ESM）です。公式 API キー不要で、ブラウザセッションの `auth_token` またはユーザー名・パスワードでログインし、GraphQL / v1.1 / v2 の各レイヤーにアクセスできます。

| 項目 | 値 |
|------|-----|
| パッケージ名 | `emusks` |
| バージョン | 2.3.3 |
| ライセンス | AGPL-3.0-only |
| モジュール形式 | ESM（`"type": "module"`） |
| エントリポイント | `import Emusks from "emusks"` |
| HTTP 実装 | cycletls（TLS フィンガープリント偽装） |
| 公式ドキュメント | https://emusks.tiago.zip |

## 2. インストールと依存関係

```bash
pnpm add emusks
```

### 直接依存

| パッケージ | 用途 |
|-----------|------|
| `cycletls` | Chrome 相当の TLS/JA3 フィンガープリントで HTTP 通信 |
| `linkedom` | パスワードログイン時の JS instrumentation 実行 |
| `tweetnacl` | XChat 暗号化（本プロジェクトでは未使用） |
| `x-client-transaction-id` | `x-client-transaction-id` ヘッダー生成 |

### ランタイム要件

- Node.js 20+ 推奨（ESM、`fetch` 相当の動作）
- `cycletls` はネイティブバイナリを起動するため、サーバーレス環境では制約あり
- 環境変数 `CYCLETLS_PORT` で CycleTLS のポートを指定可能

## 3. 認証

### 3.1 auth_token ログイン（推奨）

```js
import Emusks from "emusks";

const client = new Emusks();
await client.login("your_auth_token");
// または
await client.login({ auth_token: "...", client: "web", proxy: "..." });
```

**動作フロー（ソース `src/index.js` より）:**

1. `https://x.com/` に `auth_token` Cookie 付きでアクセス
2. レスポンスの `Set-Cookie` から `ct0`（CSRF トークン）を抽出
3. `web` クライアント使用時は `x-client-transaction-id` 生成器を初期化
4. `window.__INITIAL_STATE__` からログインユーザー情報をパース
5. `client.user` にユーザー情報、`client.auth` にセッション情報を保持

**注意:**

- `auth_token` の長さは 20〜50 文字（それ以外はエラー）
- emusks は **`ct0` を自動取得**するため、呼び出し側は `auth_token` のみ渡せばよい
- 本プロジェクトはルート `.env` の `TWITTER_AUTH_TOKEN` を起動時に **自動読み込み・最優先** で使用（`TWITTER_CT0` は emusks では不要。twitter-cli 用として共存可）

### 3.2 パスワードログイン

```js
await client.login({
  type: "password",
  username: "...",
  password: "...",
  email: "...",
  phone: "...",
  onRequest: async (type) => { /* 2FA / メール認証 */ },
});
```

本プロジェクトでは **auth_token 方式を標準**とする（n8n / サーバー運用の単純さのため）。

### 3.3 クライアント選択

| クライアント | 用途 | 備考 |
|------------|------|------|
| `web`（デフォルト） | 一般 Web クライアント | transaction ID 必須、最も無難 |
| `android` / `iphone` / `ipad` / `mac` | モバイル偽装 | 投稿時にアカウントロックのリスクあり |
| `main` | api.x.com GraphQL | rate limit 挙動が異なる場合あり |
| `tweetdeck` | X Pro | Premium アカウント前提 |

```js
await client.login({ auth_token: "...", client: "web" });
// GraphQL エンドポイント変更
await client.login({ auth_token: "...", endpoint: "main" });
```

### 3.4 プロキシ

```js
await client.login({ auth_token: "...", proxy: "http://user:pass@host:port" });
```

セッション単位で固定。IP ローテーションは非推奨（公式ドキュメント記載）。

## 4. API レイヤー

emusks は 3 つの低レベル API と、それをラップしたヘルパー名前空間を提供します。

| レイヤー | メソッド | 用途 |
|---------|---------|------|
| GraphQL | `client.graphql(queryName, opts)` | トレンド・検索・タイムライン等の大半 |
| v1.1 REST | `client.v1_1(path, opts)` | レガシー REST（トレンド地点一覧等） |
| v2 REST | `client.v2(path, opts)` | guide 設定・adaptive search 等 |

**重要:** トレンド系ヘルパーは **生の GraphQL / JSON レスポンスをそのまま返す**。`search.tweets()` のようにパース済みオブジェクトにはならない。

## 5. トレンド関連 API（`client.trends.*`）

ソース: `src/helpers/trends.js`  
公式: https://emusks.tiago.zip/discovery/trends

### 5.1 API 一覧

| メソッド | 内部 API | HTTP | 用途 |
|---------|---------|------|------|
| `available()` | `trends/available` | v1.1 GET | トレンド取得可能な地点（WOEID）一覧 |
| `explore(opts?)` | `ExplorePage` | GraphQL GET | Explore ページ本体（トレンド・イベント等） |
| `exploreSidebar(opts?)` | `ExploreSidebar` | GraphQL GET | Explore サイドバー（右カラム相当） |
| `exploreSettings()` | `guide/get_explore_settings` | v2 GET | 現在の Explore 設定（地域等） |
| `setExploreSettings(params?)` | `guide/set_explore_settings` | v2 POST | Explore 設定の更新（地域変更） |
| `getById(trendId)` | `AiTrendByRestId` | GraphQL GET | AI 生成トレンドサマリー |
| `relevantUsers(trendName, opts?)` | `TrendRelevantUsers` | GraphQL GET | トレンド関連ユーザー |
| `history(opts?)` | `TrendHistory` | GraphQL GET | ユーザーのトレンド閲覧履歴 |
| `save(trendId)` | `SaveTrend` | GraphQL POST | トレンド保存 |
| `report(trendId)` | `ReportTrend` | GraphQL POST | トレンド報告 |
| `action(trendId, action)` | `ActionTrend` | GraphQL POST | トレンド操作（dismiss 等） |

### 5.2 共通オプション

```js
// ページネーション・件数
await client.trends.explore({ count: 40, cursor: "DAABCgAB..." });

// GraphQL variables の直接指定（地域・フィルタ等の拡張用）
await client.trends.explore({
  variables: { /* 追加の GraphQL 変数 */ },
});
```

`opts.variables` はヘルパー内で既存 variables にマージされる。

### 5.3 地域（WOEID）によるトレンド切り替え

公式ドキュメントの推奨フロー:

```js
// 1. 利用可能な地点一覧
const locations = await client.trends.available();
// → [{ name, country, woeid, ... }, ...]

// 2. 現在の設定確認
const settings = await client.trends.exploreSettings();

// 3. 地域を変更（例: 日本 23424856、米国 23424977、ロンドン 44418）
await client.trends.setExploreSettings({
  location: { woeid: 23424856 },
});

// 4. 変更後のトレンド取得
const explore = await client.trends.explore();
const sidebar = await client.trends.exploreSidebar();
```

**制約:**

- emusks の v1.1 静的定義には `trends/place` / `trends/closest` が **未登録**
- 地点別トレンドは **`setExploreSettings` → `explore` / `exploreSidebar`** の組み合わせが主経路
- 地点検索用の v2 エンドポイント `guide/explore_locations_with_auto_complete` は静的定義に存在するが、ヘルパー未実装 → `client.v2()` で直接呼び出し可能

```js
const res = await client.v2("guide/explore_locations_with_auto_complete", {
  params: { q: "Tokyo" },
});
```

### 5.4 補助 API（トレンド周辺）

| 名前空間 | メソッド | 用途 |
|---------|---------|------|
| `search.tweets(query)` | GraphQL SearchTimeline | トレンド名・ハッシュタグで投稿検索 |
| `search.typeahead(query)` | v1.1 search/typeahead | イベント・トピックのオートコンプリート |
| `topics.landingPage(topicId)` | GraphQL TopicLandingPage | トピック別ランディング |
| `client.v2("guide")` | v2 guide.json | Guide タイムライン（未検証、生 API） |

## 6. レスポンスの特性

### 6.1 パースの有無

| API | 返却形式 |
|-----|---------|
| `trends.explore()` 等 | 生 GraphQL JSON（`{ data, errors }`） |
| `trends.available()` | v1.1 JSON 配列（地点オブジェクト） |
| `search.tweets()` | パース済み `{ tweets, users, nextCursor, raw }` |

→ **本アプリではトレンド用の正規化レイヤーが必須**（`05-data-schema.md` 参照）。

### 6.2 GraphQL レスポンス構造（ExplorePage）

典型的な構造（変更されうる）:

```
data
└── explore_page または類似キー
    └── timeline
        └── instructions[]
            └── entries[]
                └── content
                    └── itemContent
                        └── trend / tweet / event 等
```

実装時は実レスポンスをサンプリングし、パーサーをバージョン管理すること。

### 6.3 エラーハンドリング

- GraphQL: `data` が空のときのみ `throw`。部分エラーは `errors` 配列に残る
- v1.1: `errors` 配列があると `throw`
- 典型エラー: 認証失敗、アカウントロック、レート制限

## 7. 本プロジェクトへの影響

### 7.1 メリット

- 公式 API キー不要
- トレンド・地域切り替え・AI サマリー・関連ユーザーまで一通りカバー
- TypeScript/JavaScript で CLI・HTTP サーバーを統一実装可能
- n8n の HTTP Request ノードと相性が良い

### 7.2 制約・リスク

| 項目 | 内容 |
|------|------|
| AGPL-3.0 | ネットワーク経由提供時はソース公開義務の可能性 |
| 非公式 API | エンドポイント・スキーマが予告なく変更される |
| 生レスポンス | トレンド API はパーサー未提供のため自前実装が必要 |
| CycleTLS | 常駐プロセス前提。Lambda 等のコールドスタートには不向き |
| アカウントリスク | 過度なリクエストでロック・レート制限の可能性 |
| `trends/place` 未対応 | 地点 ID 直接指定の v1.1 経路は emusks 静的定義に無い |

### 7.3 twitter-cli との比較

| 観点 | emusks | twitter-cli |
|------|--------|-------------|
| 言語 | JavaScript (ESM) | Python |
| トレンド API | `client.trends.*` あり | 仕様書にトレンド専用コマンドなし |
| 認証 | auth_token のみで可 | auth_token + ct0 またはブラウザ Cookie |
| 出力 | 生 JSON / 一部パース済み | YAML/JSON/Compact の構造化出力 |
| n8n 連携 | Node サーバー / CLI が自然 | subprocess + Python 環境が必要 |

本プロジェクトの主スタックは **emusks + TypeScript/JavaScript** とする。

## 8. 最小動作確認コード（参考）

```js
import Emusks from "emusks";

const client = new Emusks();
await client.login(process.env.TWITTER_AUTH_TOKEN);

// 地点一覧
const locations = await client.trends.available();
console.log(locations.slice(0, 3));

// 現在の Explore 設定
const settings = await client.trends.exploreSettings();
console.log(settings);

// トレンド（アカウントの Explore 設定に依存）
const explore = await client.trends.explore({ count: 20 });
console.log(JSON.stringify(explore, null, 2).slice(0, 2000));
```

## 9. ホスティング・実行環境の適合性

emusks は **通常の Node.js プロセス上で Go ネイティブバイナリを子プロセス起動する** 構成のため、実行環境の制約が厳しい。以下は本プロジェクト向けの調査結論（emusks 2.3.3 / cycletls 2.0.5 時点）。

### 9.1 技術的制約（全環境共通）

| 制約 | 詳細 | 影響 |
|------|------|------|
| **CycleTLS 子プロセス** | `cycletls` が `child_process.spawn()` で Go 実行ファイル（各 17〜18MB）を常駐起動 | `child_process` 非対応環境では動作不可 |
| **プラットフォームバイナリ** | linux/darwin/freebsd/windows の amd64・arm64 等に対応。未対応 arch では起動時エラー | ランタイム OS/arch が一致する必要あり |
| **長寿命プロセス前提** | CycleTLS は WebSocket 経由で Go サーバーと通信。`process.on("exit")` で明示終了 | サーバーレス短寿命実行では毎回起動コスト大 |
| **ネットワーク必須** | `x.com` への HTTPS（TLS フィンガープリント偽装含む） | 外向き通信がブロックされた環境では不可 |
| **認証情報** | `auth_token` 等の秘密情報が必要 | CI/ホストの Secrets 管理が必須 |

**結論:** emusks は「エッジ Functions」「静的ホスティング」ではなく、**フル Node.js ランタイム（子プロセス・ネイティブバイナリ実行可）** が前提。

### 9.2 環境別の適合性

| 環境 | 実行可否 | 評価 | 理由 |
|------|---------|------|------|
| **GitHub Pages** | ❌ 不可 | 静的ホストのみ | HTML/JS/CSS の配信のみ。サーバー側 Node.js 実行なし。emusks を動かす場所がない |
| **Cloudflare Pages（静的）** | ❌ 不可 | 静的ホストのみ | GitHub Pages と同様。ビルド成果物の CDN 配信のみ |
| **Cloudflare Pages Functions** | ❌ 不可 | Workers ランタイム | Pages Functions は Cloudflare Workers 上で動作。`child_process`・Go バイナリ実行不可 |
| **Cloudflare Workers** | ❌ 不可 | V8 Isolate | `nodejs_compat` でも `child_process.spawn` は非対応。ネイティブバイナリの配置・実行不可。CPU/メモリ制限も CycleTLS 常駐に不向き |
| **GitHub Actions** | ✅ 可能 | **推奨（バッチ用途）** | `ubuntu-latest` 等の Linux x64 ランナーで Go バイナリ起動可。定期実行・成果物出力に適する |
| **VPS / Docker** | ✅ 可能 | **推奨（API 常駐）** | n8n 連携用 HTTP サーバーの本番想定先 |
| **Fly.io / Railway / Render** | ✅ 可能 | 常駐 API 向け | コンテナまたは Node ランタイムで子プロセス実行可（プランによる） |
| **AWS Lambda** | △ 困難 | 非推奨 | カスタムレイヤーでバイナリ同梱は理論上可能だが、コールドスタート・実行時間・`/tmp` 制約で CycleTLS 常駐が不安定 |
| **Vercel Serverless Functions** | ❌ 不可 | 非推奨 | 実行時間制限・`child_process` 制限。ネイティブバイナリ常駐に不向き |

### 9.3 GitHub Actions での実行

**用途:** トレンド定期取得、JSON 成果物の生成、S3/Gist/Artifact への保存、後続ワークフローへの入力。

**動作する理由:**

- `ubuntu-latest` は linux x64 → cycletls の `dist/index` が利用可能
- `macos-latest`（Apple Silicon）は `index-mac-arm64` が利用可能
- ランナーは `child_process.spawn` と外向き HTTPS が利用可能
- `TWITTER_AUTH_TOKEN` を Repository Secrets で安全に渡せる

**ワークフロー例（概念）:**

```yaml
name: fetch-x-trends
on:
  schedule:
    - cron: "*/15 * * * *"   # 15 分ごと（レート制限に注意）
  workflow_dispatch:

jobs:
  trends:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm x-trends list --woeid 23424856 --format json > trends.json
        env:
          TWITTER_AUTH_TOKEN: ${{ secrets.TWITTER_AUTH_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: trends
          path: trends.json
```

**注意点:**

| 項目 | 内容 |
|------|------|
| コールドスタート | ジョブごとに `pnpm install` + CycleTLS 起動 + login。1 ジョブ数秒〜数十秒のオーバーヘッド |
| セッション非永続 | ラン間で emusks セッションは保持されない（毎回 login） |
| 実行時間制限 | ジョブ最大 6 時間（通常のトレンド取得では十分） |
| レート制限 | 高頻度 cron は X 側でアカウント制限のリスク。間隔は 15 分以上を目安 |
| ネットワーク | `permissions` デフォルトで外向き通信可。Enterprise で制限されている場合は例外設定が必要 |
| AGPL | プライベートリポジトリ内の Actions 実行は一般的に問題になりにくいが、成果物の再配布時はライセンス確認 |

**結論:** GitHub Actions は **スケジュール実行・CI パイプライン用途では現実的な選択肢**。n8n 代替の常時 API には向かない。

### 9.4 Cloudflare / GitHub Pages でやりたい場合の代替構成

エッジや静的ホストだけでは emusks を直接動かせない。以下の **分離構成** が現実的:

```
┌─────────────────────┐     HTTPS      ┌──────────────────────────┐
│ Cloudflare Workers  │ ─────────────► │ VPS / Docker / GHA 成果物 │
│ （API ゲートウェイ）  │                │ emusks を実際に実行する側  │
│ 認証・キャッシュのみ  │                └──────────────────────────┘
└─────────────────────┘
```

| パターン | 説明 |
|---------|------|
| **A. Workers → 自前 API** | emusks は VPS/Fly.io 上の Node サーバーで常駐。Workers は認証・レート制限・キャッシュのみ |
| **B. GHA → R2/KV** | Actions でトレンド JSON を生成し Cloudflare R2 / KV に書き込み。Workers/Pages はその JSON を読むだけ |
| **C. GHA → GitHub Pages** | Actions が `docs/trends.json` をコミットまたは Pages 用 artifact をデプロイ。フロントは静的 JSON を表示 |
| **D. n8n 自ホスト** | spec/03 の HTTP サーバーを n8n と同居 Docker で運用（Workers 不要） |

**Cloudflare Containers**（Docker コンテナを Cloudflare 上で実行）が利用可能な場合は、フル Node.js + CycleTLS をコンテナ内で動かす選択肢もあるが、コスト・レイテンシ・運用複雑度が増す。標準 Workers とは別物として扱う。

### 9.5 本プロジェクトへの推奨

| 用途 | 推奨環境 |
|------|---------|
| n8n からのリアルタイム API 呼び出し | VPS / Docker / Fly.io 等での Node 常駐サーバー |
| 定期トレンド収集（インフラ最小） | **GitHub Actions**（schedule + artifact または R2 連携） |
| トレンドダッシュボード（閲覧のみ） | **GitHub Pages / Cloudflare Pages**（GHA が生成した静的 JSON を配信） |
| エッジでの動的 API | emusks 直接は不可。Workers はキャッシュ層または BFF に留める |

### 9.6 アカウントリスク（BAN・ロック・制限）

emusks 利用時の X アカウント停止リスクは **ゼロではない** が、**用途と運用次第で大きく変わる**。本プロジェクト想定の **トレンド読み取りのみ** であれば、投稿ボット等と比べ **中〜やや低め** と評価できる。ただし **安全が保証されるわけではない**。

#### 前提: 非公式 API であること

- emusks は X から **DMCA を受けた** リバースエンジニアリング製クライアント
- 利用規約上もグレーゾーン。「読み取りだけなら公式に許可されている」とは言えない
- X 側の検知ロジックは非公開で、将来変更されうる

#### 措置の段階（エスカレーション）

いきなり永久 BAN になるとは限らず、だいたい次の順で進む。

| 段階 | 症状 | 頻度感 |
|------|------|--------|
| 1. レート制限 | HTTP 429、一時的な API 拒否 | 比較的よくある |
| 2. 一時ロック | `TwitterUserNotSuspended` 等。ブラウザで本人確認が必要 | emusks 公式ドキュメントでも言及 |
| 3. CAPTCHA / チャレンジ | ログインやクライアント変更時 | 中程度 |
| 4. 書き込み拒否（226） | 自動化判定。投稿・いいね等が失敗 | 書き込み時に顕著（twitter-cli 仕様書でも言及） |
| 5. アカウント停止 | 一時〜永久 suspend | 利用パターン次第 |

emusks 公式のエラー例:

```
Authorization: Denied by access control: Missing TwitterUserNotSuspended;
To protect our users from spam and other malicious activity,
this account is temporarily locked. Please log in to https://twitter.com to unlock your account.
```

#### トレンド読み取りのみの場合（本プロジェクト）

比較的リスクが低いとされる理由:

- ブラウザで Explore を開くのと **同種の読み取り API** に近い
- 投稿・フォロー・DM など **スパム判定されやすい書き込みをしない**
- デフォルト `web` クライアントは公式ドキュメントで **「最も疑われにくい（least likely to raise suspicion）」** とされている

#### リスクを上げる要因

| 要因 | 影響度 | 補足 |
|------|--------|------|
| **高頻度リクエスト** | 高 | 15 分未満の cron、連続ページネーション、無制限の API 呼び出し |
| **書き込み操作** | 非常に高 | 投稿・いいね・RT・フォロー。`android` クライアントはソースに「投稿でロックの可能性」と明記 |
| **不自然なクライアント** | 高 | 漏洩 bearer（`advertisers`, `corporate_cms` 等）。公式: 「suspend の可能性あり」 |
| **IP の不整合** | 高 | プロキシのローテーションは公式非推奨（同一セッションで IP が変わると疑われる） |
| **データセンター IP** | 中 | GitHub Actions / VPS からのアクセスは自宅ブラウザと挙動が異なる |
| **最小 Cookie のみ** | 中 | `auth_token` のみはブラウザセッションより「薄い」指紋（書き込みで影響大） |
| **新規・弱いアカウント** | 中 | フォロワー少・電話未認証などは制限されやすい |

#### リスクを下げる運用指針

1. **専用サブアカウント** を使う（メインアカウントは使わない）
2. **`web` クライアント固定**（デフォルトのまま）
3. **読み取りのみ** に限定（`trends.*` / `search.*` の取得系）
4. **リクエスト間隔** を空ける（目安: 15 分以上。連続呼び出しは 2〜3 秒以上）
5. **キャッシュ** で X への実リクエストを減らす（spec 想定の TTL 5 分は妥当）
6. **固定 IP**（自宅 VPS 1 台）。プロキシローテは避ける
7. **異常検知で即停止** — ロック・429 メッセージを検知したらポーリングを止める

#### 用途別リスク評価（主観的）

| 用途 | BAN リスク |
|------|-----------|
| 手動 CLI で 1 日数回トレンド確認 | 低〜中 |
| HTTP API 常駐 + n8n で 15 分ごと（キャッシュあり） | 中 |
| GitHub Actions で 15 分ごと（毎回 login） | 中（DC IP + 定期 login） |
| 1 分ごとの高頻度ポーリング | 高 |
| トレンド取得 + 自動投稿・自動いいね | 非常に高 |

#### emusks / 公式ドキュメントの関連記述

| 出典 | 内容 |
|------|------|
| Configuration | 一部クライアントは **suspend の可能性** あり。`web` が最も無難 |
| Configuration | プロキシローテは非推奨。単一セッションから複数 IP は疑われる |
| Configuration | 長時間稼働アプリはロック・レート制限の通知機構を推奨 |
| `clients.js` | `android`: 「beware! this might get your account locked when tweeting」 |
| TWITTER-CLI-SPEC | 書き込み時、`auth_token`+`ct0` のみだと **226（自動化判定）** になりやすい |

#### 本プロジェクトへの結論

- 永久 BAN より先に **レート制限・一時ロック** が来ることが多い
- トレンド取得用途・低頻度・`web` クライアント・サブアカウント運用なら **実用上そこそこ使える** ケースは多い
- いずれにせよ **リスクゼロではない** ため、本番運用では専用アカウントと監視を前提とする

## 10. 未検証・追加調査項目

実装フェーズで以下を実 API レスポンスで確認する:

- [ ] `setExploreSettings` 後の `explore` が期待地域のトレンドを返すか
- [ ] `explore` と `exploreSidebar` の内容差分
- [ ] `AiTrendByRestId` の trendId の取得方法（explore レスポンスからの抽出）
- [ ] `guide/explore_locations_with_auto_complete` のパラメータとレスポンス形式
- [ ] レート制限の目安（連続リクエスト時の HTTP ステータス / エラーメッセージ）
- [ ] `endpoint: "main"` 切り替え時のトレンド API 互換性
