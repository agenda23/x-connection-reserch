# x-res と emusks の適合性検討

参考: [X (Twitter) Research CLI Tool x-res 設計仕様書](./X%20(Twitter)%20Research%20CLI%20Tool%20x-res%20設計仕様書.md)

## 結論

x-res を emusks で **丸ごと実装する価値は低い**。採用するのは **CLI 思想・JSON 出力・キャッシュ** 程度とし、**トレンド中心・ノイズ除去・低負荷** の方針で本プロジェクト（x-trends）を設計する。

## 前提ギャップ

| x-res の想定 | emusks の現実 |
|-------------|--------------|
| 公式 API v2 `search/all` | GraphQL `search.tweets`（非公式） |
| `x-rate-limit-*` ヘッダー | なし。429・ロックは試行で対応 |
| 大量・長期取得 | 数百件・短期が実用上限 |
| 高並列 | アカウント制限リスク大 |

## コマンド別評価

| x-res コマンド | emusks 実装 | 本プロジェクト |
|---------------|------------|--------------|
| `trend`（スパイク・共起語） | △ 簡易版のみ | **diff で代替**（追加 API なし） |
| `voice`（本音・ノイズ除去） | ◎ 検索+フィルタ | Phase 2 軽量 search のみ |
| `network`（グラフ） | △ depth 1 のみ | **対象外**（ユーザー API） |
| `benchmark`（SoV 比較） | △ 7 日サンプルのみ | **対象外** |
| `archive`（長期） | ✕ | **対象外** |

## 本プロジェクトへの反映

- **採用:** トレンド一覧、地域、正規化、promoted 除外、diff、JSON、キャッシュ
- **Phase 2 任意:** 軽量 search、単件 detail
- **不採用:** users、network、archive、benchmark、大量ページネーション

詳細要件は [02-requirements.md](../02-requirements.md) を参照。
