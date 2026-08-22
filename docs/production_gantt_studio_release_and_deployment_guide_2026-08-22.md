# Production Gantt Studio — リリース・デプロイ統合ガイド

**更新日:** 2026-08-22  
**対象公開URL:** <https://rikufujita1229-sudo.github.io/production-gantt-studio/>  
**コード保管先:** <https://github.com/rikufujita1229-sudo/production-gantt-studio>  
**Supabase Project Ref:** `pcudvibzfsmblztcriib`（東京リージョン）

> この文書は、Production Gantt StudioをManusに依存せず、SupabaseとGitHub Pagesで運用するための正本です。秘密鍵、トークン、実在の顧客データは記載しません。

## 1. 現在の公開状態

| 領域 | 状態 | 確認済みの内容 |
|---|---|---|
| GitHub main | 公開反映済み | 最新コミット `a4149c8`。認証確認ルート、初回管理者修正、RLS補助関数の非公開化を含む |
| GitHub Pages | 公開済み | 上記公開URLで案件一覧と3件のSample案件が表示されることを確認済み |
| Supabase DB | 本番反映済み | Phase 1の基盤5テーブル、Phase 2の14マイグレーション、追加の安全強化2本を反映済み |
| Edge Functions | 本番反映済み | 標準処理15本と、初回管理者作成用の安全な初期化処理を公開済み |
| Supabase Auth | 設定済み | メールリンク、自己登録OFF、匿名ログインOFF、GitHub Pagesへの戻り先設定を反映済み |
| 初回管理者メール送信 | PASS | `rikufujita1229@gmail.com` 宛のログインリンク送信と受信を確認済み |
| 初回管理者の認証画面遷移 | 条件付きPASS | メールリンク後に管理者用の「新規案件」操作は表示された。認証後のブラウザ再読込みは未確認 |
| 共有・アーカイブ復元 | 実測PASS（API/DB） | 本番APIで親子共有の作成・親取消連動を確認。本番DBでアーカイブ→復元→再アーカイブを確認 |
| 編集者招待 | ブラウザ対話未確認 | 招待作成・受諾を別メールと対話ログインで完走する確認だけが残る |

## 2. 実装された役割と権限

| 利用者 | できること | できないこと |
|---|---|---|
| 管理者 | 新規案件作成、既存案件の編集、編集者招待、共有URL発行・取消、アーカイブ・復元 | 他組織のデータ閲覧・操作 |
| 編集者 | 参加済み案件の編集、編集者招待、共有URL発行・取消 | 新規案件作成、他組織のデータ閲覧・操作 |
| 閲覧者 | 共有URLで対象案件だけを閲覧、親URLの期限内で子共有URLを発行 | ログイン、案件・タスク・メンバー・設定の編集、他案件の閲覧 |

閲覧者が発行する子共有URLには親リンクIDを保存します。子URLの期限は親URLを超えず、親URLの取消・失効後は子URLも無効です。共有トークンは生の値を保存せず、ハッシュだけを保存します。

## 3. Phase 1・Phase 2の主要修正

### 3.1 データベースとRLS

既存の `profiles`、`organizations`、`organization_members`、`projects`、`project_members` を維持しました。組織境界と案件参加者の権限は、画面の表示制御ではなくPostgres RLSで強制します。

Phase 2では次のデータ構造を追加しました。

| 追加項目 | 目的 |
|---|---|
| `project_activity` | 案件変更履歴 |
| `project_share_links` | 期限・取消・親子関係を持つ閲覧専用リンク |
| `security_audit_logs` | 認可成功・拒否・失敗の監査記録。一般利用者は読取不可 |
| `projects.archive_expires_at` | アーカイブ後30日の保持期限 |
| `bootstrap_admin` | 管理者不在時だけ原子的に昇格させるSQL関数 |

トークンハッシュと監査ログは、匿名利用者・認証済み利用者のいずれからも通常のテーブルAPIで読めません。

### 3.2 Edge Functions

公開済みの主要処理は以下です。

| 分類 | 処理 |
|---|---|
| 管理 | `bootstrap-admin`、`provision-initial-admin` |
| 案件 | `create-project`、`update-project`、`delete-project`、`archive-project`、`restore-project` |
| 招待 | `create-invite`、`accept-invite`、`revoke-invite`、`invite-preview` |
| 共有 | `create-share-link`、`revoke-share-link`、`get-shared-project`、`create-forwarded-share-link` |
| 運用 | `health` |

書込み操作はEdge Function経由です。閲覧系はRLSを満たす場合だけSupabaseの通常APIを使い、匿名の招待・共有プレビューはトークン検証済みのEdge Functionだけを使います。

### 3.3 初回管理者の初期化

自己登録をOFFにしているため、初回管理者用のAuthアカウントを安全に作成する処理を追加しました。`ADMIN_BOOTSTRAP_EMAIL` と一致し、かつ管理者がまだ存在しない時だけ作動します。現在の初回管理者指定は `rikufujita1229@gmail.com` です。

2026-08-22に、本番データで管理者が未設定であることを検出しました。指定メールのプロファイルを管理者へ修復済みです。また、`provision-initial-admin` はアカウント作成だけで終わらず、`bootstrap_admin` の原子的なゼロ管理者判定を通して同メールを即時昇格する実装へ更新・本番公開しました。管理者が存在する状態では同関数は409で停止するため、誰でも管理者になれる状態にはなりません。

## 4. Supabase本番設定

### 4.1 Auth

| 設定 | 本番値・状態 |
|---|---|
| Site URL | `https://rikufujita1229-sudo.github.io/production-gantt-studio/` |
| Redirect URLs | 上記URL、`/auth/confirm`、`/auth/callback` |
| Email認証 | ON |
| 自己登録 | OFF |
| 匿名ログイン | OFF |
| カスタムSMTP | 未使用 |

公開クライアントは `/auth/confirm` の `token_hash` 検証方式を実装済みであり、GitHub Pages上でも同ルートが404にならず表示されることを確認しました。Supabase側のメールテンプレートは共有ブラウザのセッション不一致により未変更のため、現在は旧PKCEの `/auth/callback` も併存して受け付けます。メールテンプレートを `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` へ変更し、ログイン後の再読み込みでセッションを再確認するまでは、token_hash方式の本番メール往復とセッション保持を未確認と扱います。Supabase Freeの送信上限は毎時2通のため、実運用ではログイン・招待送信を短時間に連続させないでください。

### 4.2 Edge Function Secrets

| 秘密設定名 | 用途 |
|---|---|
| `ALLOWED_ORIGINS` | GitHub Pagesからの呼出しだけを許可 |
| `AUDIT_IP_HASH_SECRET` | 監査ログに残すIP情報の匿名化 |
| `ADMIN_BOOTSTRAP_EMAIL` | 初回管理者として作成を許可するメールアドレス |

`SUPABASE_SERVICE_ROLE_KEY` はSupabaseの予約済みサーバー秘密情報です。GitHub、クライアント、`.env`、ドキュメントへ絶対に書かないでください。

## 5. GitHub Pagesの公開構成

Viteの `base` は `/production-gantt-studio/` です。GitHub Pagesに直接対応しないパスへのアクセスは `404.html` がSPAルートへ戻す方式です。`/auth/callback` は、SupabaseのPKCEコード交換後にアプリへ戻る専用画面です。

GitHub Actionsのワークフローは静的ビルドを作成し、GitHub PagesのActions公開元へデプロイします。フロントエンドへ入るのはSupabase URLとPublishable Keyだけです。どちらもRLSを有効にした公開用値であり、Service Role Keyではありません。

## 6. 実利用テスト結果

| テスト | 結果 | 根拠・補足 |
|---|---|---|
| 公開URL表示 | PASS | GitHub Pagesの案件一覧と3つのSample案件を表示 |
| 初回管理者の権限設定 | PASS | 本番`profiles`で指定メールが`admin`であること、RLSで自身のプロファイルを読めることを確認 |
| ログインメール送信 | PASS | Supabase Authから対象メールアドレスへメール到着を確認 |
| メールリンクの遷移 | PASS | `/auth/callback` 経由で管理者UIの「新規案件」を表示 |
| 新規案件の保存基盤 | PASS | `Sample — 公開検証用` を本番DBへ保存し、管理者のRLS読取を確認。管理画面操作による作成完走は未確認 |
| 編集者招待 | ブラウザ対話未確認 | 別メールの招待作成、メールリンクログイン、受諾、編集可・新規案件不可の画面操作は未実施 |
| 無効共有URLの拒否 | PASS | 未ログインの公開関数が無効トークンを404で拒否し、GitHub Pages OriginへのCORSを返すことを確認 |
| 親共有URLの閲覧 | PASS | 未ログインの公開関数が検証対象案件だけをHTTP 200で返すことを確認 |
| 閲覧者の子共有URL発行 | PASS | 公開`create-forwarded-share-link`が親トークンだけから子URLを発行し、親以下の期限を返すことを確認 |
| 親取消と子URL失効 | PASS | 親取消後、公開`get-shared-project`が子URLを404で拒否することを確認 |
| アーカイブ・復元 | PASS（DB） | アーカイブで30日後の期限を保存、復元でデータ保持と期限クリア、テスト後に再アーカイブしたことを確認 |

> **区別:** PASSは本番DBまたは本番公開APIで実測した結果です。ブラウザ対話未確認は、My Browser拡張のHTTP 504によりログイン済み利用者の画面操作を自動取得できないためであり、PASSと表記しません。

### 6.1 本番安全強化の実測

2026-08-22に本番診断で検出した公開スキーマ上の`SECURITY DEFINER`補助関数を、RLSから明示参照する非公開`private`スキーマへ移しました。公開RPCからは呼び出せず、RLS評価だけが利用します。これはSupabaseの「RLSで使う`SECURITY DEFINER`関数は公開スキーマに置かず、ポリシーからスキーマを明示して呼ぶ」という案内に従うものです。[1]

再診断では、公開RPCから実行できる`SECURITY DEFINER`関数の警告は消えました。残る`security_audit_logs`のINFOは、監査ログを一般利用者から完全に読めなくする意図的なRLS構成です。パスワード漏えい保護のWARNは、アプリがパスワードを発行・入力させないメールリンク認証だけを使うため、現時点で利用者の認証経路には該当しません。

### 6.2 認証セッション不一致の実測と再発防止

今回の不一致は、利用者のChromeでSupabaseの組織画面がログイン済みであった一方、共有ブラウザ操作が設定画面を開く際に未ログイン応答を返したことで発生しました。前者は利用者の表示セッション、後者は拡張機能を経由する自動操作セッションであり、接続の再同期や別タブ復元が完了していない場合に状態が一致しないことがあります。利用者のログイン状態が失われたことを示すものではありません。

今後、認証又は本番設定を変更する前には、次の順で必ず確認します。

1. 利用者のログイン済み状態を前提として扱い、同じ確認やログイン依頼を繰り返さない。
2. 共有ブラウザ操作で同じURLを読み、組織名・プロジェクトID・設定画面の応答が一致する場合だけ、ブラウザ依存の設定を変更する。
3. 不一致またはHTTP 504の場合は、利用者画面の状態を疑わず、直接管理接続で実施できる本番修正・検証を先に完了する。
4. ブラウザ専用の対話確認だけを別項目として残し、確認できていない内容をPASSにしない。

## 7. 今後の再デプロイ手順（Claude Code向け）

1. GitHubリポジトリを取得し、最新の `main` ブランチから作業します。
2. `pnpm install --frozen-lockfile`、`pnpm test`、型検査、`pnpm build` をすべて成功させます。
3. Supabaseスキーマ変更は新しい番号のSQLマイグレーションとして追加し、本番へ適用前に内容をレビューします。既存の本番マイグレーションを編集・再適用しません。
4. Edge Function変更は関数本体と共有モジュールを同時にデプロイします。新しい秘密情報はSupabaseのSecretsへだけ設定します。
5. 公開コードにはPublishable Keyだけを使い、Service Role Key・DB URL・トークンハッシュ・監査秘密値を絶対に含めません。
6. GitHub `main` への反映後、Actionsのbuildとdeploy成功を確認します。
7. 公開URLで、未ログイン表示、メールリンクログイン、管理者の新規案件、編集者招待、共有URL、アーカイブ・復元を確認します。

## 8. 残るブラウザ対話の確認

1. Supabase Authメールテンプレートをtoken_hash形式へ更新し、実メールで`/auth/confirm`、ページ再読込み後のセッション保持を確認する。
2. 管理者画面で新規案件を作成・保存する。
3. 別メールの編集者を招待し、ログイン、受諾、編集可・新規案件作成不可を確認する。

上記以外の共有・アーカイブ検証は本番API/DBで完了しています。検証案件`Sample — 公開検証用`はアーカイブ状態で2026-09-21まで保持します。実在のクライアント名・案件名は使っていません。

## 9. 参照資料

- [Phase 2独立セキュリティレビュー](phase2_independent_security_review_2026-08-22.md)
- [RLS・Edge Function認可変更](role_based_rls_and_edge_function_changes_2026-08-22.md)
- [GitHub同期・認可障害の実測記録](github_sync_and_auth_incident_2026-08-22.md)
- [Phase 2修正指示書](claude_phase2_role_security_corrections_prompt_2026-08-22.md)

## 10. 参照

[1] [Supabase: Row Level Security — Use security definer functions](https://supabase.com/docs/guides/database/postgres/row-level-security)
