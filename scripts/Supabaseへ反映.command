#!/bin/zsh
# ============================================================
#  Production Gantt Studio — 権限まわりの変更を本番へ反映する
#
#  このファイルはダブルクリックで実行できます。
#  やること: 案件の裏側(Supabase)にある3つの処理を、最新の内容に入れ替えます。
#  かかる時間: 1〜2分。データは消えません。作り直しも起きません。
#
#  初回だけ「アクセストークン」の貼り付けを1回お願いします。
#  2回目以降は、このファイルをダブルクリックするだけで終わります。
# ============================================================

set -e
cd "$(dirname "$0")/.."

PROJECT_REF="pcudvibzfsmblztcriib"
KEYCHAIN_SERVICE="Supabase CLI"
KEYCHAIN_ACCOUNT="production-gantt-studio"
FUNCTIONS=(update-task-progress create-invite accept-invite update-member-role)

print ""
print "============================================"
print " Production Gantt Studio — 本番へ反映します"
print "============================================"
print ""

# --- 1. アクセストークンを用意する ---------------------------
TOKEN="$(security find-generic-password -w -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" 2>/dev/null || true)"

if [ -z "$TOKEN" ]; then
  print "初回のみ、Supabaseのアクセストークンが必要です。"
  print ""
  print "  1) このリンクをブラウザで開いてください:"
  print "     https://supabase.com/dashboard/account/tokens"
  print "  2) 右上の緑のボタン「Generate new token」を押します。"
  print "  3) 名前を聞かれたら gantt-deploy と入力し、「Generate token」を押します。"
  print "  4) 画面に出た sbp_ で始まる文字列をコピーします(この画面を閉じると二度と見られません)。"
  print "  5) 下に貼り付けて Enter を押してください(画面には表示されません)。"
  print ""
  printf "トークンを貼り付け: "
  read -s TOKEN
  print ""
  print ""
  if [ -z "$TOKEN" ]; then
    print "何も入力されませんでした。中止します。"
    print ""
    print "このウィンドウは閉じて構いません。"
    exit 1
  fi
  SAVE_TOKEN=1
else
  print "保存済みのアクセストークンを使います。"
  SAVE_TOKEN=0
fi

export SUPABASE_ACCESS_TOKEN="$TOKEN"

# --- 2. トークンが有効か確かめる ------------------------------
print ""
print "トークンを確認しています..."
if ! npx --yes supabase@latest projects list >/dev/null 2>&1; then
  print ""
  print "トークンが使えませんでした。貼り付けの途中で欠けていないか確認し、"
  print "もう一度このファイルをダブルクリックしてください。"
  print ""
  print "このウィンドウは閉じて構いません。"
  exit 1
fi
print "確認できました。"

if [ "$SAVE_TOKEN" = "1" ]; then
  security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w "$TOKEN" >/dev/null 2>&1 || true
  print "次回から貼り付け不要になるよう、このMacに保存しました。"
fi

# --- 3. 反映する ---------------------------------------------
print ""
for FN in $FUNCTIONS; do
  print "反映中: $FN"
  npx --yes supabase@latest functions deploy "$FN" --project-ref "$PROJECT_REF" --use-api
done

print ""
print "============================================"
print " 反映が完了しました。"
print ""
print " これで、案件画面の「メンバー招待」から"
print " 「進行メンバー(状態・担当のみ)」を選んで招待できます。"
print "============================================"
print ""
print "このウィンドウは閉じて構いません。"
