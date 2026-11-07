#!/bin/sh
# ローカル環境で、職員としてログインした access token を標準出力に書く。予定の API と照合の API を手で呼ぶときに使う。
# ブラウザの代わりに、Hydra、ブローカー、上流の IdP のフェイクの画面を順に curl で通る。
#
# 使い方: compose/dev-token.sh <メール> [上流の IdP の sub]
# 上流の IdP の sub を省くと、メールの @ の前の部分にする。職員に結び付けた後は、同じ sub で入る。
# URL かポートを変えて起動したときは、compose と同じ環境変数（HYDRA_PUBLIC_ORIGIN、BROKER_ORIGIN、WEB_ORIGIN か、
# HYDRA_PUBLIC_PORT、BROKER_PORT、WEB_PORT）を渡す。worktrunk で作った worktree では、mise が .env から渡す。
set -eu

email=${1:?メールを渡す}
sub=${2:-${email%@*}}
hydra=${HYDRA_PUBLIC_ORIGIN:-http://localhost:${HYDRA_PUBLIC_PORT:-4444}}
broker=${BROKER_ORIGIN:-http://localhost:${BROKER_PORT:-8100}}
redirect=${WEB_ORIGIN:-http://localhost:${WEB_PORT:-3000}}/auth/callback
jar=$(mktemp)
trap 'rm -f "$jar"' EXIT

# リダイレクト先を返す。リダイレクトしない応答はエラーで止める
next() {
  to=$(curl -sS -b "$jar" -c "$jar" -o /dev/null -w '%{redirect_url}' "$@")
  [ -n "$to" ] || { echo "リダイレクトされない: $*" >&2; exit 1; }
  echo "$to"
}

to=$(next "$hydra/oauth2/auth?client_id=web&response_type=code&scope=openid+email+offline_access&state=dev-token-state&redirect_uri=$redirect")
# 画面の form が送るのと同じく、URL の符号を戻して送る
challenge=$(printf '%b' "$(echo "${to##*login_challenge=}" | sed 's/%/\\x/g')")
to=$(next "$broker/login" --data-urlencode "login_challenge=$challenge" --data-urlencode "email=$email")
case $to in "$hydra"*) echo "ブローカーがログインを拒んだ: $email" >&2; exit 1 ;; esac
to=$(next "$to" --data-urlencode "username=$sub" \
  --data-urlencode "claims={\"email\": \"$email\", \"email_verified\": true}")
while :; do
  case $to in "$redirect"*) break ;; esac
  to=$(next "$to")
done
code=$(echo "$to" | sed -E 's/.*[?&]code=([^&]+).*/\1/')
case $code in http*) echo "認可コードを受け取れない: $to" >&2; exit 1 ;; esac
curl -sS -u web:web-dev "$hydra/oauth2/token" \
  -d grant_type=authorization_code -d "code=$code" -d "redirect_uri=$redirect" |
  sed -E 's/.*"access_token":"([^"]+)".*/\1/'
