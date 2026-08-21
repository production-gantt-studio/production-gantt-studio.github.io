# Reference Manifest — Update 02

## 1. Assignment

| 項目 | 内容 |
| --- | --- |
| Deliverable | Production Gantt Studio の双方向日程連動とゼロスタート画面 |
| Assignment type | feature addition |
| User-visible goal | タスクの移動・期間変更時に、前後の依存タスクも同じ日数だけ移動させる。タスクがない新規案件では開始画面を表示する。 |
| Explicitly out of scope | 認証、共同編集、サーバー保存、データベース、共有URLの仕様変更 |

## 2. Sources of truth

| Concern | Source of truth | Location / version | Use it for | Do not use it for |
| --- | --- | --- | --- | --- |
| Existing behavior / data | React実装 | `client/src/pages/Home.tsx` / checkpoint `a912cefd` | LocalStorage、依存関係、ドラッグ操作、共有URL | 新しい外部データモデルの推測 |
| Visual design | Edit Suite方針 | `ideas.md` | 色、タイムライン、ゼロスタートの画面言語 | 操作仕様の置換 |
| Editable assets | ブランド記号・制作画像 | `/manus-storage/` の既存アセット | ブランド表示 | 新規の意味を持つデータ |
| Safety boundaries | 静的フロントエンド | `README.md` と現行コード | LocalStorageと共有URLの制約 | 共同編集の模擬 |

## 3. Page / screen inventory

| ID | Reference page / screen | User decision | Required individual assets | Existing live behavior | Unknown / deferred | Required acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| H-01 | 既存のガント画面 | 予定を前後どちらへ動かすか | タイムライングリッド、ロゴ、フェーズ色 | ドラッグ、リサイズ、詳細編集、保存、共有 | 循環依存の高度な警告 | 前後の依存タスクが同じ差分で移動すること |
| H-02 | ゼロスタート画面 | テンプレートで開始するか、空白の工程表を作るか | 既存ロゴ、タイムライン素材 | テンプレート適用とLocalStorage保存 | 独自テンプレートの保存 | 各開始導線が実行でき、空画面で編集機能を失わないこと |

## 4. Preservation contract

### Must preserve

- JSON/CSVの入出力、閲覧専用共有リンク、印刷、ライト／ダークテーマ、LocalStorage保存。
- ステータス・担当者・フェーズのフィルターと、既存の制作テンプレート内容。

### May change

- 日程連動アルゴリズム、空配列の表示、タスク追加時の開始日、補助コピー。

### Must not claim or simulate

- 同時編集、認証付き共有、サーバー同期、未実装のテンプレート保存。
