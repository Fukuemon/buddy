# /// script
# requires-python = ">=3.12"
# ///
"""Python と Go の照合の結果の CSV を、意図した違いを吸収してからセルごとに比べる。

使い方:
    uv run compare.py PYTHON_CSV GO_CSV
    uv run compare.py PYTHON_CSV --golden OUT   Python の結果を Go の形にそろえて OUT に書く

吸収する違いは README.md の「吸収する違い」にある。

終了コード: 0 は差分なし、1 は差分あり。
"""

import argparse
import csv
import re
import sys
from pathlib import Path

HEADER_RENAMES = {"_カレンダー": "_予定", "_Ibow": "_実績"}
LABEL_RENAMES = {"カレンダーのみ": "予定のみ", "Ibowのみ": "実績のみ"}
LABELS = ["不整合データ", "予定のみ", "実績のみ", "整合データ"]
NO_DATA = "データなし"
MARK = re.compile(r" (❌|※).*$")
FLOAT_MINUTES = re.compile(r"^(\d+)\.0(?=$| )")


def read(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


def normalize_python(rows: list[list[str]]) -> list[list[str]]:
    header = rows[0]
    for old, new in HEADER_RENAMES.items():
        header = [h.replace(old, new) for h in header]
    duration_cols = {i for i, h in enumerate(header) if h.startswith("提供時間_")}
    out = [header]
    for row in rows[1:]:
        if row[0] in LABEL_RENAMES:
            row = [LABEL_RENAMES[row[0]], *row[1:]]
        cells = []
        for i, cell in enumerate(row):
            cell = cell.replace("  ❌", " ❌").replace(" ❌ ()", " ❌")
            if i in duration_cols:
                cell = FLOAT_MINUTES.sub(r"\1", cell)
            cells.append(cell)
        out.append(cells)
    return out


def sections(rows: list[list[str]]) -> dict[str, list[list[str]]]:
    header = rows[0]
    col = {h: i for i, h in enumerate(header)}
    result: dict[str, list[list[str]]] = {label: [] for label in LABELS}
    current = None
    for row in rows[1:]:
        if row[0] in result and all(c == "---" for c in row[1:]):
            current = row[0]
            continue
        if current is None:
            raise ValueError(f"区切りの行より前に行がある: {row}")
        result[current].append(row)

    def start(row: list[str]) -> str:
        s = row[col["開始時間_予定"]]
        if s == NO_DATA:
            s = row[col["開始時間_実績"]]
        return MARK.sub("", s)

    def key(row: list[str]):
        return (row[col["訪問日"]], start(row), row[col["利用者名"]], row[col["主訪問者"]], row)

    for label in LABELS:
        result[label].sort(key=key)
    return result


def flatten(header: list[str], secs: dict[str, list[list[str]]]) -> list[list[str]]:
    out = [header]
    for label in LABELS:
        out.append([label] + ["---"] * (len(header) - 1))
        out.extend(secs[label])
    return out


def ragged(side: str, rows: list[list[str]]) -> list[str]:
    """ヘッダーと列の数が違う行を返す。zip で比べると、短い行の欠けたセルを黙って読み飛ばす。"""
    width = len(rows[0])
    return [
        f"{side} の {n} 行目: 列の数 {len(row)}、ヘッダーは {width}: {row}"
        for n, row in enumerate(rows[1:], start=2)
        if len(row) != width
    ]


def diff(py: list[list[str]], go: list[list[str]]) -> list[str]:
    msgs = []
    if py[0] != go[0]:
        msgs.append(f"ヘッダー: python={py[0]} go={go[0]}")
        return msgs
    msgs = ragged("python", py) + ragged("go", go)
    if msgs:
        return msgs
    header = py[0]
    ps, gs = sections(py), sections(go)
    for label in LABELS:
        p, g = ps[label], gs[label]
        if len(p) != len(g):
            msgs.append(f"{label}: 行の数 python={len(p)} go={len(g)}")
        for i in range(max(len(p), len(g))):
            pr = p[i] if i < len(p) else None
            gr = g[i] if i < len(g) else None
            if pr is None or gr is None:
                msgs.append(f"{label}[{i}]: python={pr} go={gr}")
                continue
            for h, a, b in zip(header, pr, gr):
                if a != b:
                    msgs.append(f"{label}[{i}] {pr[0]} {pr[1]} {h}: python={a!r} go={b!r}")
    return msgs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("python_csv", type=Path)
    parser.add_argument("go_csv", type=Path, nargs="?")
    parser.add_argument("--golden", type=Path)
    args = parser.parse_args()

    py = normalize_python(read(args.python_csv))
    if args.golden:
        with args.golden.open("w", encoding="utf-8-sig", newline="") as f:
            csv.writer(f, lineterminator="\n").writerows(flatten(py[0], sections(py)))
        return 0
    if args.go_csv is None:
        parser.error("GO_CSV か --golden を渡す")

    go = read(args.go_csv)
    msgs = diff(py, go)
    rows = sum(1 for r in py[1:] if not (r and r[0] in LABELS and all(c == "---" for c in r[1:])))
    for m in msgs:
        print(m)
    print(f"{args.python_csv.parent.name}: 行 {rows}、差分 {len(msgs)}")
    return 1 if msgs else 0


if __name__ == "__main__":
    sys.exit(main())
