#!/bin/sh
# Hydra に、web と予定の API のクライアントを登録する。登録済みなら設定を書き直す。
# 値は全て開発用のダミーの値で、ほかの環境で使わない。
set -eu

upsert() {
  id=$1
  shift
  if hydra get oauth2-client "$id" -e "$HYDRA_ADMIN_URL" >/dev/null 2>&1; then
    hydra update oauth2-client "$id" -e "$HYDRA_ADMIN_URL" "$@" >/dev/null
  else
    hydra create oauth2-client --id "$id" -e "$HYDRA_ADMIN_URL" "$@" >/dev/null
  fi
  echo "registered $id"
}

# web は自社のアプリなので、同意の画面を出さない（ADR-0014）
upsert web --name web --secret web-dev \
  --grant-type authorization_code,refresh_token --response-type code \
  --scope openid,email,offline_access --audience schedule,receipt \
  --redirect-uri "$WEB_REDIRECT_URI" --post-logout-callback "$WEB_POST_LOGOUT_REDIRECT_URI" \
  --token-endpoint-auth-method client_secret_basic --skip-consent

# 予定の API が、ブローカーの内部の API（職員の登録、休職、復職、退職）を呼ぶときに使う
upsert schedule --name schedule --secret schedule-dev \
  --grant-type client_credentials --audience broker \
  --token-endpoint-auth-method client_secret_basic
