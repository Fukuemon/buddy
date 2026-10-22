# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "pandas==2.2.2",
#   "numpy==1.26.4",
#   "requests==2.31.0",
#   "python-dotenv",
# ]
# ///
"""元の照合の実装（非公開）の libs で照合し、結果を BOM 付きの UTF-8 の CSV に書く。

予定は GAS から取らず、ローカルの予定の CSV を読んで渡す。

使い方:
    uv run run_python.py --libs <元の照合の実装>/server/libs VISITS SCHEDULES OUT
    --libs を省くと、環境変数 RECEIPT_CHECKER_LIBS を使う。

終了コード: 0 は成功、2 は引数の誤り。照合の例外はそのまま投げる。
"""

import argparse
import importlib
import os
import sys
from pathlib import Path

import pandas as pd
import requests


def _block_network(*_args, **_kwargs):
    raise RuntimeError("parity の実行ではネットワークに出ない")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--libs", default=os.environ.get("RECEIPT_CHECKER_LIBS"))
    parser.add_argument("visits", type=Path)
    parser.add_argument("schedules", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    if not args.libs:
        parser.error("--libs か RECEIPT_CHECKER_LIBS で libs のパスを渡す")

    libs_dir = Path(args.libs).resolve()
    sys.path.insert(0, str(libs_dir.parent))
    requests.get = _block_network
    requests.Session.request = _block_network
    libs = importlib.import_module(libs_dir.name)
    get_dataframe = importlib.import_module(f"{libs_dir.name}.get_dataframe")

    schedules = pd.read_csv(args.schedules)
    get_dataframe.create_google_calendar_to_csv = lambda *_a, **_k: schedules.copy()

    result = libs.receipt_check(args.visits)
    result.to_csv(args.out, index=False, encoding="utf-8-sig")


if __name__ == "__main__":
    main()
