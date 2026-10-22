#!/usr/bin/env bash
# testdata/parity の各ケースを Python と Go で照合し、compare.py で比べる。
#
#   RECEIPT_CHECKER_LIBS=<receipt-checker/server/libs> tools/parity/run.sh [--update] [OUT_DIR]
#
# apps/receipt-api で実行する。--update は Python の結果から各ケースの expected.csv を書き直す。
# OUT_DIR を省くと一時ディレクトリに結果を書く。終了コードは、差分のあるケースがあれば 1 である。
set -euo pipefail

update=false
if [[ "${1:-}" == "--update" ]]; then
  update=true
  shift
fi
out="${1:-$(mktemp -d)}"
mkdir -p "$out"
here="$(cd "$(dirname "$0")" && pwd)"

status=0
for dir in testdata/parity/*/; do
  name="$(basename "$dir")"
  mkdir -p "$out/$name"
  uv run --quiet "$here/run_python.py" "$dir/visits.csv" "$dir/schedules.csv" "$out/$name/python.csv" >/dev/null
  go run ./tools/parity/goreport "$dir/visits.csv" "$dir/schedules.csv" >"$out/$name/go.csv"
  if $update; then
    uv run --quiet "$here/compare.py" "$out/$name/python.csv" --golden "$dir/expected.csv"
  fi
  uv run --quiet "$here/compare.py" "$out/$name/python.csv" "$out/$name/go.csv" || status=1
done
echo "結果: $out"
exit $status
