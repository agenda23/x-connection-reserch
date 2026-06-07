# データスキーマ

## 1. 設計方針

emusks のトレンド API は **生 GraphQL JSON** を返すため、本アプリケーションで正規化レイヤーを設ける。正規化スキーマは CLI と HTTP API で共通とし、n8n が安定してパースできるフラットな JSON を目指す。

### 原則

1. **必須フィールドは最小限** — X 側の仕様変更に強い
2. **取得できない値は `null`** — フィールド自体は省略しない
3. **生データは `_raw` に格納** — `raw=true` 時のみ（デバッグ・パーサー開発用）
4. **バージョン管理** — `meta.parserVersion` でパーサー世代を明示

## 2. TrendItem（正規化トレンド）

`list` / `GET /api/v1/trends` の `data.trends[]` 要素。

```ts
interface TrendItem {
  /** トレンド識別子（REST ID または合成 ID） */
  id: string | null;

  /** 表示名（例: "#Python", "選挙"） */
  name: string;

  /** X 上の検索 URL */
  url: string | null;

  /** 投稿数（取得可能な場合） */
  tweetVolume: number | null;

  /** ランキング（1 始まり、取得可能な場合） */
  rank: number | null;

  /**
   * カテゴリ
   * - trending: 通常トレンド
   * - promoted: プロモーション
   * - event: イベント
   * - topic: トピック
   * - unknown: 分類不能
   */
  category: "trending" | "promoted" | "event" | "topic" | "unknown";

  /** トレンドの説明（取得可能な場合） */
  description: string | null;

  /** 関連ハッシュタグ */
  hashtags: string[];

  /** パース時の注意（例: 部分パース） */
  warnings: string[];
}
```

### JSON 例

```json
{
  "id": "trend:199588448",
  "name": "#例のハッシュタグ",
  "url": "https://x.com/search?q=%23%E4%BE%8B%E3%81%AE%E3%83%8F%E3%82%A7%E3%82%B7%E3%82%B7%E3%83%A5%E3%82%BF%E3%82%B0&src=trend_click",
  "tweetVolume": 45200,
  "rank": 1,
  "category": "trending",
  "description": null,
  "hashtags": ["#例のハッシュタグ"],
  "warnings": []
}
```

## 3. TrendListResponse

```ts
interface TrendListResponse {
  ok: true;
  data: {
    trends: TrendItem[];
    /** raw=true 時のみ */
    _raw?: unknown;
  };
  meta: {
    requestedAt: string;       // ISO 8601
    woeid: number | null;
    source: "explore" | "sidebar";
    count: number;
    cursor: string | null;
    nextCursor: string | null;
    cached: boolean;
    cacheExpiresAt: string | null;
    parserVersion: string;
    partial: boolean;            // 一部パース失敗
  };
}
```

## 4. LocationItem（地点）

`locations` / `GET /api/v1/locations` の `data.locations[]` 要素。

`client.trends.available()` の v1.1 レスポンスを正規化。

```ts
interface LocationItem {
  name: string;
  woeid: number;
  country: string | null;
  countryCode: string | null;
  placeType: {
    code: number | null;
    name: string | null;
  };
  url: string | null;
  parentid: number | null;
}
```

### v1.1 生レスポンスとの対応（参考）

| v1.1 フィールド | LocationItem |
|----------------|--------------|
| `name` | `name` |
| `woeid` | `woeid` |
| `country` | `country` |
| `countryCode` | `countryCode` |
| `placeType` | `placeType` |
| `url` | `url` |
| `parentid` | `parentid` |

## 5. TrendDetail（AI サマリー）

`detail` / `GET /api/v1/trends/:trendId` のレスポンス。

`client.trends.getById()` の GraphQL レスポンスを正規化。フィールドは実 API 確認後に確定する。

```ts
interface TrendDetail {
  id: string;
  name: string | null;
  summary: string | null;          // AI 生成サマリー
  postsOverview: string | null;
  createdAt: string | null;
  relatedTrends: TrendItem[];
  _raw?: unknown;
}
```

## 6. RelevantUser（関連ユーザー）

`users` / `GET /api/v1/trends/:trendName/users` のレスポンス。

```ts
interface RelevantUser {
  id: string;
  username: string;
  name: string;
  verified: boolean;
  followersCount: number | null;
  profileImageUrl: string | null;
}
```

## 7. SearchTweet（検索結果投稿）

`search` / `GET /api/v1/search` の `data.tweets[]` 要素。

emusks `search.tweets()` / `search.latest()` のパース済みオブジェクトを正規化。

```ts
interface SearchTweet {
  id: string;
  text: string;
  createdAt: string | null;
  lang: string | null;
  author: {
    id: string;
    username: string;
    name: string;
    verified: boolean;
  };
  metrics: {
    likes: number | null;
    retweets: number | null;
    replies: number | null;
    views: number | null;
  };
  urls: string[];
  hashtags: string[];
}
```

## 8. ExploreSettings

`settings` / `GET /api/v1/settings` のレスポンス。

```ts
interface ExploreSettings {
  location: {
    woeid: number | null;
    name: string | null;
  } | null;
  raw: unknown;   // v2 get_explore_settings の生 JSON
}
```

## 9. パーサー実装ガイド

### 9.1 ExplorePage パース戦略

GraphQL レスポンスはネストが深く、キー名が変更されうる。以下の順で探索する:

```
1. data オブジェクト内で "timeline" を含むキーを探索
2. instructions[] を走査
3. type === "TimelineAddEntries" の entries[] を処理
4. 各 entry の content.itemContent から以下を判定:
   - trend_metadata / trend / eventSummary 等 → TrendItem
   - tweet_results → スキップ（トレンド一覧ではない）
5. entryId や clientEventInfo から rank を推定
```

### 9.2 フォールバック

パースに失敗した場合:

```json
{
  "ok": true,
  "data": {
    "trends": [],
    "_raw": { }
  },
  "meta": {
    "partial": true,
    "parserVersion": "1"
  }
}
```

HTTP ステータスは 200 のまま返し、`meta.partial: true` で警告する（n8n ワークフローを止めないため）。完全失敗時のみ 502。

### 9.3 パーサーテスト

実装時に以下を保存してスナップショットテストに使用する:

```
fixtures/
├── explore-japan-woeid.json      # 生レスポンス
├── explore-sidebar-japan.json
├── available-locations.json
└── expected/
    ├── explore-japan-trends.json # 正規化後
    └── ...
```

## 10. Zod スキーマ（実装参考）

```ts
import { z } from "zod";

export const TrendItemSchema = z.object({
  id: z.string().nullable(),
  name: z.string().min(1),
  url: z.string().url().nullable(),
  tweetVolume: z.number().int().nonnegative().nullable(),
  rank: z.number().int().positive().nullable(),
  category: z.enum(["trending", "promoted", "event", "topic", "unknown"]),
  description: z.string().nullable(),
  hashtags: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const TrendListResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    trends: z.array(TrendItemSchema),
    _raw: z.unknown().optional(),
  }),
  meta: z.object({
    requestedAt: z.string().datetime(),
    woeid: z.number().nullable(),
    source: z.enum(["explore", "sidebar"]),
    count: z.number(),
    cursor: z.string().nullable(),
    nextCursor: z.string().nullable(),
    cached: z.boolean(),
    cacheExpiresAt: z.string().datetime().nullable(),
    parserVersion: z.string(),
    partial: z.boolean(),
  }),
});
```

## 11. n8n 向けフィールド設計メモ

n8n の後続ノードで使いやすいよう、以下を推奨:

| 用途 | 推奨フィールド |
|------|--------------|
| トレンド名の一覧 | `data.trends[].name` |
| Slack 通知文 | `data.trends[].name` + `tweetVolume` |
| 検索 URL | `data.trends[].url` |
| 地域の識別 | `meta.woeid` |
| 差分検知キー | `data.trends[].name`（正規化後の文字列） |
| 詳細取得 | `data.trends[].id` → `GET /api/v1/trends/:id` |

**Split In Batches** を使う場合は `data.trends` 配列を Item Lists に展開する。

```javascript
// n8n Code ノード: 配列をアイテムに展開
return $json.data.trends.map(trend => ({ json: trend }));
```
