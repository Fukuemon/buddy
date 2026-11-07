#!/bin/sh
# ローカル環境で、職員としてログインした access token を標準出力に書く。予定の API と照合の API を手で呼ぶときに使う。
# ブラウザの代わりに、Hydra、ブローカー、上流の IdP のフェイクの画面を順に curl で通る。
#
# 使い方: compose/dev-token.sh <メール> [上流の IdP の sub]
# 上流の IdP の sub を省くと、メールの @ の前の部分にする。職員に結び付けた後は、同じ sub で入る。
# デフォルトは main の checkout の環境（https://<サービス>.buddy.localhost）である。別の名前で起動したときは、
# compose と同じ環境変数（HYDRA_PUBLIC_ORIGIN、BROKER_ORIGIN、WEB_ORIGIN）を渡す。worktrunk で作った worktree では、mise が .env から渡す。
set -eu

email=${1:?メールを渡す}
sub=${2:-${email%@*}}
hydra=${HYDRA_PUBLIC_ORIGIN:-https://hydra.buddy.localhost}
broker=${BROKER_ORIGIN:-https://broker.buddy.localhost}
redirect=${WEB_ORIGIN:-https://web.buddy.localhost}/auth/callback
jar=$(mktemp)
trap 'rm -f "$jar"' EXIT

# portless の CA はシステムに信頼させないので（ADR-0035）、https の URL は portless の CA で検証する
ca=$HOME/.portless/ca.pem
fetch() {
  if [ -f "$ca" ]; then curl --cacert "$ca" "$@"; else curl "$@"; fi
}

# リダイレクト先を返す。リダイレクトしない応答はエラーで止める
next() {
  to=$(fetch -sS -b "$jar" -c "$jar" -o /dev/null -w '%{redirect_url}' "$@")
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
fetch -sS -u web:web-dev "$hydra/oauth2/token" \
  -d grant_type=authorization_code -d "code=$code" -d "redirect_uri=$redirect" |
  sed -E 's/.*"access_token":"([^"]+)".*/\1/'
