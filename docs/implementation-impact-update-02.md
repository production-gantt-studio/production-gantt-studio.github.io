# Implementation Impact Matrix — Update 02

## Scope

| 項目 | 内容 |
| --- | --- |
| Approved design reference | `ideas.md` の Edit Suite と checkpoint `a912cefd` の画面 |
| Existing application / repository | `production-gantt-studio` の静的Reactアプリ |
| Visual-only scope | いいえ。依存タスクの日程ロジックと空状態の画面を変更する。 |
| Feature work explicitly frozen | 外部API、認証、DB、共同編集、共有URLのデータ形式 |

## Screen / module matrix

| Screen / module | Reference visual element | Classification | Existing data or behavior to preserve | Allowed visual change | Prohibited change | Required proof |
| --- | --- | --- | --- | --- | --- | --- |
| ガントタイムライン | クリップ型バー、再生ヘッド | live | ドラッグ、リサイズ、詳細編集、LocalStorage保存 | 連動結果のトーストと補助表示 | 表示専用モック化 | 前後の依存タスクが移動すること |
| タスク詳細 | 日付・依存タスク入力 | live | 日付と依存関係の編集 | 連動方向の説明 | 既存入力の削除 | 日付変更後も入力値が保持されること |
| ゼロスタート | Edit Suiteの開始パネル | live | テンプレート適用、空プロジェクトの保存 | 開始カード・説明 | 非機能ボタン | 各ボタンで目的の状態へ移ること |

## Existing-function preservation checklist

| Function | Current route / component | Must stay live? | Data write? | Project / user isolation requirement | Proof after change |
| --- | --- | ---: | ---: | --- | --- |
| 日程編集 | `/` / `Home.tsx` | Yes | Yes | 現在のブラウザのみ | ドラッグ・リサイズ・日付入力の動作 |
| LocalStorage保存 | `/` / `Home.tsx` | Yes | Yes | 同一ブラウザのキー | 再読み込み後の内容確認 |
| JSON/CSV入出力 | `/` / `Home.tsx` | Yes | Yes | ファイル選択時のみ | UIに出力・読み込み導線が残ること |
| 閲覧専用共有 | `/` / `Home.tsx` | Yes | No | URL所有者の閲覧 | 編集操作が無効であること |

## Safety boundary checklist

| Boundary | Must remain unchanged | Verification method | Result |
| --- | --- | --- | --- |
| Database / canonical data location | LocalStorageのみ | コードとブラウザ動作を確認 | Pending |
| State transitions | タスク編集は同じブラウザ状態へ保存 | 日付変更と再読み込みを確認 | Pending |
| External service / AI calls | 追加しない | 変更ファイルとビルドを確認 | Pending |
