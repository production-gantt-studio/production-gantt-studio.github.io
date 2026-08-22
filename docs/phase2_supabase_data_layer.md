# Phase 2: Supabaseへの全面切替（このドキュメントの範囲）

Phase 1で作ったSupabase基盤（5テーブル＋RLS＋Edge Function共通部品）の上に、既存アプリのManus/tRPC/MySQL側の認証・データ層をSupabase側へ全面的に置き換えた。**既存のガント画面・3サンプル・4色ルール・モバイル表示・PDF/CSV/JSON・依存関係・Undo・複数選択などの実際のUI/業務ロジックは一切変更していない** — 変更したのは、それらの下にあるデータの出し入れの実装だけ。

## 今回やったこと（実装ずみ・ローカル検証ずみ）

- **マイグレーション4本を追加**（`20260821000008`〜`000011`）：`project_activity`（変更履歴）、`project_share_links`（閲覧専用共有リンク、`token_hash`は列単位で非公開）、`security_audit_logs`（認可の成功・拒否・失敗をすべて記録、anon/authenticatedからは一切読めない設計）、`projects.archive_expires_at`（30日保持期限。`timestamptz + interval`はIMMUTABLEにできないため生成列ではなく通常列とし、`archive-project`が`archived_at`と同時に設定する）。
- **マイグレーション1本を追加**（`20260821000012`）：`bootstrap_admin()`— 最初の管理者を安全に昇格させるための、レースセーフなSECURITY DEFINER関数。
- **Edge Function 13本を新規実装**（`supabase/functions/`）：`bootstrap-admin`、`create-project`、`update-project`、`delete-project`、`archive-project`、`restore-project`、`create-invite`、`accept-invite`、`revoke-invite`、`invite-preview`、`create-share-link`、`revoke-share-link`、`get-shared-project`。いずれも既存の`server/routers.ts`・`server/db.ts`のロジック（権限判定、直近再ログイン要求、監査ログ、トークンのハッシュ化保存など）を1対1で移植し、`_shared/db.ts`・`_shared/http.ts`・`_shared/tokens.ts`・`_shared/validation.ts`として共通化した。全関数を`deno check`で型検証ずみ。
- **クライアント側のtRPC互換シム**（`client/src/lib/supabaseTrpcShim.ts`、`client/src/lib/caseMapping.ts`）：`trpc.projects.list.useQuery(...)`のような既存の呼び出し形をそのまま維持しつつ、内部実装だけをSupabase（読み取りはPostgREST直、書き込みはEdge Function経由）に差し替えた。**`Home.tsx`・`ProjectIndex.tsx`・`Invite.tsx`は1行も変更していない** — 変わったのは`client/src/lib/trpc.ts`が指す実装だけ。
- **認証層の置き換え**（`client/src/_core/hooks/useAuth.ts`、`client/src/const.ts`、`client/src/main.tsx`）：Manus OAuthリダイレクトを、Supabase Authのメールリンクログイン（`signInWithOtp`、`shouldCreateUser:false`）に置き換えた。`startLogin()`は既存の呼び出し側（`onClick={() => startLogin()}`）を変えずに、メールアドレス入力用の小さな画面を自前で表示するよう変更。
- **PKCEコールバック画面**（`client/src/pages/AuthCallback.tsx`、`App.tsx`に`/auth/callback`ルートを追加）：HashRouterではなく、既存どおりのパス方式のルーティングのまま追加。Wouterのbaseパスを`vite.config.ts`の`base`と連動させ、GitHub Pagesのサブパス配信（`/production-gantt-studio/`）でも同じコードで解決するようにした。
- **静的ビルド対応**：`vite.config.ts`からManus専用プラグイン（`vite-plugin-manus-runtime`、Manusデバッグログ収集プラグイン）を削除し、`base`をproduction時のみ`/production-gantt-studio/`に設定。`client/public/404.html`（GitHub PagesのSPAフォールバック、rafgraph/spa-github-pages方式）と`.github/workflows/deploy-pages.yml`（型検証・テスト・依存監査・ビルド・公式Pages Actionsでの公開）を追加。
- **初期管理者の安全な作成手順**（`supabase/scripts/create-initial-admin.ts`）：`shouldCreateUser:false`にした結果、最初の管理者は「誰かがservice-role鍵を使って、そのメールのアカウントだけを事前に作成する」以外に存在できないことが分かったため、コミットしない1回限りの保守スクリプトとして用意した（下記「Phase 1の提案からの変更点」参照）。

## Phase 1の提案からの変更点

Phase 1のドキュメントでは、初期管理者登録に`ADMIN_BOOTSTRAP_EMAIL`という追加のFunction secretを提案していた。実装を進める中で、それを使わないもっと単純な方式に変更した：

- `bootstrap-admin`はメールアドレスの一致を見ない。ログイン済みの**誰でも**呼び出せるが、`profiles`にadminが1人もいない場合しか成功しない（`bootstrap_admin()`のSQL内で`WHERE NOT EXISTS`により保証、同時呼び出しに対してもレースセーフ）。
- 一度でもadminが存在すれば、以後は誰が呼んでも必ず失敗する。
- ただし、この方式には見落としてはいけない前提が1つある：`signInWithOtp({shouldCreateUser:false})`は、**Supabase Authに既存アカウントがないメールアドレスでは絶対にログインできない**。つまり管理者になる本人ですら、最初の1回はどこかで既存アカウントを持っている必要がある。これを解決する、クライアントからは絶対に呼べない一回限りの手順が`supabase/scripts/create-initial-admin.ts`（サービスロール鍵を持つ人が手元で1回だけ実行する保守スクリプト）。
- 同じ理由で、`create-invite` Edge Functionは招待作成時に`ensureAuthUserForEmail()`（service-roleの`auth.admin.createUser()`、確認メールなし）を呼び、招待されたメールアドレスのログイン用アカウントを裏側で用意している。招待メール自体は今まで通りアプリ独自のコピー＆`mailto:`フローで送られ、Supabase自身のメール送信は一切発生しない。

## ローカル検証（実施ずみ・Supabase実環境には一切接続していない）

- `supabase/migrations/`の全12本を、このセッション内の使い捨てローカルPostgresに最初から順番に適用し、エラーなく通ることを確認（`docs/phase2_local_rls_verification_log.txt`）。
- 新規3テーブル＋`archive_expires_at`列に対するRLS許可・拒否シナリオ9件（owner/editor/outsiderの`project_activity`可視性、editor-or-above限定の`project_share_links`可視性、`token_hash`の完全非公開、`security_audit_logs`のanon/authenticated双方への完全非公開、service_roleのみ到達可能）をすべてPASSで確認。同じ内容を`supabase/tests/database/phase2_rls.test.sql`（pgTAP、`supabase test db`用）としても用意した。
- `bootstrap_admin()`のレース安全性を実際に2回連続呼び出して確認：1人目は正常にadminへ昇格、2人目（adminが既に存在する状態）は昇格されず`role='user'`のまま。
- 全13 Edge Functionを`deno check`で型検証ずみ（`npm:@supabase/supabase-js@2`・`npm:zod@3`込み）。
- クライアント側：`pnpm run check`（`tsc --noEmit`）がエラーなしで通過。既存の88件のテスト（`pnpm test`）が変更なしで全件PASS。`pnpm exec vite build`が成功し、`base`が正しく`/production-gantt-studio/`に反映され、ビルド出力に秘密情報（`SERVICE_ROLE`・`DATABASE_URL`・`JWT_SECRET`等の文字列）が一切含まれないことを確認。`pnpm audit --audit-level=high`は0件（既存のvitestを2系から4.1.11へ更新して解消。開発専用ツールのみで、ビルド出力には影響しない）。

## 意図的に実施していないこと（実接続が必要なため）

以下は、このセッションがSupabase・GitHubのいずれにも書き込み接続を持たない（今回のTurn Kの停止条件2にすでに該当）ため、実施していない。下の最終報告の表でHOLDとして扱う。

- 実際のSupabaseプロジェクト（`pcudvibzfsmblztcriib`）へのマイグレーション適用・Edge Function公開。
- `supabase/scripts/create-initial-admin.ts`の実行（サービスロール鍵を持つ人が手元で1回実行する必要がある）。
- GitHubリポジトリへのコミット・プッシュ、GitHub Pagesの有効化、実際の公開URLでの受入テスト。
- Supabase Auth の Site URL / Redirect URLs の設定（公開後のURLが確定してから行う）。

## 依存関係監査

`pnpm audit --audit-level=high` は0件（moderateが1件のみ残るが、`drizzle-kit`が開発時にのみ使う`esbuild`の古いバージョンで、ビルド出力にもGitHub Pages公開物にも含まれない）。

## Manus/Gemini レビュー対応（2026-08-22 追記）

上記の初回実装に対するManus/Geminiのレビューで指摘された、修正必須項目にすべて対応した。既存のガント画面・3サンプル・4色ルール・モバイル表示・依存関係・Undo・CSV/JSON/PDF・88件のテストは今回も一切変更していない。`Home.tsx`・`ProjectIndex.tsx`・`Invite.tsx`も1行も変更していない。

- **初期管理者の安全性**：`bootstrap_admin()`への直接RPC呼び出しをできなくした（`authenticated`・`anon`に加えて`PUBLIC`からもEXECUTEを剥奪 — PostgreSQLは関数作成時にPUBLICへ自動的にEXECUTEを付与するため、`authenticated`/`anonのみをREVOKEしても実は塞がっていなかったことをローカル検証で発見し、修正した）。`bootstrap-admin` Edge Functionは、ログイン中のメールアドレスをFunction secret `ADMIN_BOOTSTRAP_EMAIL`と正規化した上で完全一致確認し、一致しない場合は昇格処理そのものを試みない。`bootstrap_admin()`自体は`pg_advisory_xact_lock`で同時呼び出しを直列化し、実際に2つの同時呼び出しで1つだけが成功することをローカルで確認した。
- **招待とログイン**：招待は編集者ロールのみ発行する（閲覧者アカウント・招待・ログインは一切作らない）。招待先のログイン用アカウント作成（`ensureAuthUserForEmail`）を招待レコードの書き込みより先に実行するよう順序を入れ替え、アカウント作成が失敗した場合に「受諾できない招待」が残ってしまう状態を防いだ。招待受諾時のメール一致確認は前後の空白を除去した上で行う。
- **PKCEメールリンクとGitHub Pages**：`token_hash`＋`type=email`によるメール確認方式（`verifyOtp()`）専用の新しいルート`/auth/confirm`を追加した。既存の`/auth/callback`（`?code=`によるPKCE交換）はそのまま残し、両方の経路からのセッション確立を受け止められるようにした。実際のメールテンプレート変更（`{{ .ConfirmationURL }}`から`/auth/confirm?token_hash={{ .TokenHash }}&type=email`形式へ）とSite URL/Redirect URLsの設定はSupabaseダッシュボード側の作業のため、今回は未実施（下記HOLD参照）。
- **共有URLと閲覧者による子URL発行**：`project_share_links`に`parent_share_link_id`列を追加し、閲覧者が保有する有効な共有URLをもとに、ログインなしで同じ案件の子共有URLを1つだけ発行できる新しいEdge Function `create-forwarded-share-link`を追加した。入力は親トークンのみ、期限は「親の期限」と「標準期間（7日）」の短い方、親（およびその祖先）が失効・取り消し済みなら常に同一の汎用エラーのみを返す。共有リンクの有効性チェックは、リンク自身だけでなく親・祖先を毎回たどって再検証するようにし（`resolveValidShareLinkChain`）、親リンクの取り消しは子・孫リンクへ再帰的に伝播する（`cascadeRevokeShareLinkDescendants`、`revoke-share-link`から呼び出し）。これらはローカルPostgres上で、親を取り消すと子も即座に無効化されることを確認した。閲覧者向けのUIは、`Home.tsx`を一切変更せずに追加できる独立したオーバーレイ部品（`ShareForwardWidget.tsx`）として実装し、「この案件を共有する」ボタン1つだけを表示する（共有リンク一覧・取り消しボタン・設定・メンバー一覧・タスク編集は一切表示しない）。
- **監査・CORS・秘密情報**：Edge Functionの共通ラッパー（`_shared/http.ts`）で、未認証アクセス・入力検証エラー・失敗/未処理エラーを一律で監査ログに記録するようにし、「記録すると謳っている以上は実装も一致させる」という要求に対応した。CORSは引き続き`ALLOWED_ORIGINS`による許可リスト方式のみで、`*`は一度も使っていない。

### ローカル再検証（今回追加分）

- 全14本のマイグレーション（`000001`〜`000014`）を、まっさらなローカルPostgresに最初から順番に適用し、エラーなく通ることを確認した。
- `bootstrap_admin`のEXECUTE権限を`information_schema.routine_privileges`で直接確認し、`PUBLIC`・`authenticated`・`anon`のいずれにも付与されておらず、`service_role`にのみ付与されていることを確認した。
- `set role authenticated; select public.bootstrap_admin(...)`が`permission denied`で拒否されることを実際に確認した。
- `service_role`として2つの`bootstrap_admin`呼び出しを同時実行し、1件だけが成功（admin昇格）し、もう1件は`null`が返って昇格しなかったことを確認した。
- `project_share_links`の列権限を`information_schema.column_privileges`で確認し、`parent_share_link_id`は`authenticated`から読めるが`token_hash`は引き続き読めないことを確認した。
- 親リンク・子リンクを手動で作成し、親を取り消した上で子への連鎖的な取り消しを適用し、両方が無効になることを確認した。
- 全14 Edge Function（新規の`create-forwarded-share-link`を含む）を`deno check`で型検証ずみ。
- クライアント側：`pnpm run check`・`pnpm test`（88件、変更なしで全件PASS）・`pnpm exec vite build`（ビルド出力に秘密情報の文字列が一切含まれないことを確認）・`pnpm audit --audit-level=high`（0件、既存のmoderate 1件のみ残存）をすべて再実行し、いずれも成功した。

### 今回も実施していないこと（実接続・実環境が必要なため、HOLD）

- 実際のSupabaseプロジェクトへのマイグレーション適用・Edge Function公開・Function secrets（`ADMIN_BOOTSTRAP_EMAIL`含む）の設定。
- Supabase Auth の自己登録（self-signup）無効化、匿名ログイン無効化 — いずれもダッシュボード側のプラットフォーム設定で、コードからは確認・変更できない。
- Supabase Auth の Site URL / Redirect URLs へのGitHub Pagesドメイン・`/auth/confirm`・`/auth/callback`の登録。
- メールテンプレートを`token_hash`＋`/auth/confirm`形式に変更する作業。
- 実際にメールリンクを別ブラウザ/シークレットウィンドウで開き、セッションが確立して案件一覧に戻ることの確認。
- GitHubリポジトリへのコミット・プッシュ、GitHub Pagesの有効化。
- 実際に公開されたページでの、デスクトップ1440px・モバイル390/360/320pxでの画面崩れ確認。
