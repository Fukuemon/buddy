#!/bin/sh
# 生成するコードを全て生成し直し、コミットした生成物と差分がないことを確かめる。
#
# 使い方: pnpm check:generated（リポジトリのルートで実行する）
# 終了コード: 0 は差分なし。1 は差分か、まだ追跡していない生成物がある。生成に失敗したときは、生成のコマンドの終了コードで終わる。
set -eu

(cd services/receipt && go generate ./...)
(cd services/schedule && go generate ./... && sqlc generate)
pnpm --filter @buddy/web generate:api
node scripts/build-mock-tokens.mjs

set -- \
  services/receipt/internal/httpapi/openapi \
  services/schedule/internal/httpapi/openapi \
  services/schedule/internal/postgres/sqlcgen \
  apps/web/src/api/generated \
  docs/screens/_common/tokens.css

git diff --exit-code -- "$@"
untracked=$(git ls-files --others --exclude-standard -- "$@")
if [ -n "$untracked" ]; then
  echo "追跡していない生成物がある:" >&2
  echo "$untracked" >&2
  exit 1
fi
