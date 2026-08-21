# Phase 1: Supabase 基盤（このドキュメントの範囲）

Manusを使わず、Production Gantt StudioをSupabase＋GitHubで独立化する計画のPhase 1として、Supabaseの「基盤」だけを追加した。既存の画面・API実行経路・88件のテストは一切変更していない。

## 今回やったこと

- `supabase/migrations/` — 再現可能なマイグレーション7本（`profiles` / `organizations` / `organization_members` / `projects` / `project_members` の作成、RLS、grants、インデックス、および検証中に見つかった2つの不具合の修正）。
- `supabase/tests/database/phase1_rls.test.sql` — pgTAP形式のRLS許可・拒否テスト（`supabase test db`で実行、Docker必須）。
- `supabase/functions/_shared/` と `supabase/functions/health/` — Edge Functionの共通基盤（CORS、JWT検証、service-role/user-scopedクライアントの使い分け）。具体的な業務API（招待・共有・案件CRUD）はPhase 2。
- `supabase/config.toml` — Edge Function設定の雛形。
- `client/src/lib/supabaseClient.ts` / `client/src/lib/database.types.ts` — クライアント側のSupabase抽象化層と型定義。**未接続**（`main.tsx`・`useAuth.ts`・tRPC providerからは一切参照されていない）。
- `.env.supabase.example` — 追加が必要な環境変数の一覧（公開用URL・公開用キーのみ）。

## 接続していないことの確認

このセッションからSupabase/GitHubへの実接続は行っていない（今回の指示どおり）。そのため、マイグレーションとRLSの検証は、このセッション内に一時的に作成した**ローカルの使い捨てPostgres**（Rikuさんの実プロジェクトとは無関係）に対して行った。`auth.users` / `auth.uid()` / `anon`・`authenticated`・`service_role`ロールなど、Supabaseの実環境にすでに存在する部分だけを最小限模擬し、検証後にそのローカルDBは破棄する。

## 検証で見つけて直した不具合（2件）

ローカル検証を実際に流したことで、レビューだけでは気づかなかった不具合を2件発見し、その場で修正した。

1. **RLSの無限再帰**：`organizations`⇄`organization_members`、`projects`⇄`project_members`のポリシーが互いのテーブルを直接サブクエリしており、"infinite recursion detected in policy" エラーになっていた。`SECURITY DEFINER`のヘルパー関数（`is_org_member`など）を介す標準的な回避方法で修正（`20260821000006_rls_helper_functions.sql`）。
2. **列単位REVOKEが効かない**：`profiles.role`と`project_members.invite_token_hash`について、「テーブル全体にGRANTした後、特定の列だけREVOKEする」という書き方をしていたが、PostgreSQLの列権限は「テーブル全体の権限 OR 列の権限」という足し算のため、後からのREVOKEでは取り消せないことが実行して初めて分かった。テーブル全体のGRANTを取り消し、許可する列だけを明示するallow-list方式に修正（`20260821000007_column_privilege_fixes.sql`）。

修正後、想定した15項目のRLS許可・拒否シナリオ（anon拒否、owner許可、招待済みeditor許可、無関係ユーザー拒否、自己昇格拒否、直接INSERT拒否、role列非公開、invite_token_hash非公開など）がすべてローカルで意図どおりの結果になることを確認した。

## Phase 1で意図的にやらないこと

- 案件一覧・個別ガント画面をSupabaseへ切り替えること（`main.tsx`・`useAuth.ts`・tRPC providerは未変更）
- 招待・共有URLの実装（テーブルとRLSの土台だけ用意）
- GitHub Pagesへの公開
- 実データ移行（LocalStorage→Supabaseの一回移行は設計のみ）
- 同時編集の楽観的排他（`data_schema_version`列は用意したが、これはJSON形式のバージョンであり、同時編集の排他制御ではない）

## 初期管理者登録について（提案のみ・未実装）

RikuさんがSQL・環境変数・秘密情報を扱わずに、最初の管理者を安全に登録する方法として、次を提案する（Phase 2で実装、今回は実装しない）。

1. Supabaseダッシュボードの「Function secrets」画面（コードでもSQLでもない、普通の入力フォーム）に、Riku さんご自身のメールアドレスを`ADMIN_BOOTSTRAP_EMAIL`として一度だけ設定する。
2. Supabase Authでその同じメールアドレスにログインする。
3. `bootstrap-admin`という専用のEdge Function（Phase 2で実装予定）を一度だけ呼び出す。この関数は「`profiles`にadminが1人もおらず、かつ呼び出し元のログイン中メールが`ADMIN_BOOTSTRAP_EMAIL`と一致する場合だけ」呼び出し元をadminに昇格させ、それ以外は必ず失敗する。
4. 一度adminが1人でも存在すれば、この関数は二度と誰も昇格させない（毎回「admin不在」を条件にするため、自動的に無効化される）。

この方式なら、RikuさんはSQLもコード編集も秘密鍵の受け渡しも行わず、通常の画面操作だけで初期管理者を安全に作成できる。

## 依存関係監査について（参考情報）

`pnpm audit --audit-level=high`を実行したところ、既存の`vitest`（今回追加したものではなく、元のZIPにすでに含まれていたテストツール）の依存先に critical 1件・high 1件が見つかった。いずれも開発時のみ使うテストツール内部の依存であり、`@supabase/supabase-js`など今回追加したものには該当しない。Phase 1の完了条件には含まれていない項目だが、参考情報として記録する。
