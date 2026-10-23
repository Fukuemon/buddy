# parity

元の照合の実装（非公開）の Python（pandas）の照合と、この Go の照合に同じ入力を渡し、結果の CSV をセルごとに比べる。  
比べるケースは `testdata/parity/<ケース>/` にあり、各ケースは `visits.csv`、`schedules.csv`、`expected.csv` を持つ。

- `run_python.py`: 元の照合の実装の `server/libs` の `receipt_check` を呼ぶ。予定は GAS から取らず、`schedules.csv` を読んで渡す。`requests` の送信は例外にしてあり、ネットワークに出ない
- `report/`: 照合の結果を、Python の結果と同じ記号つきの CSV に書く。API は記号を付けず、JSON だけを返すので、このパッケージは比べるためだけにある
- `goreport/`: `check.Run` の結果を `report` で CSV に書く
- `compare.py`: Python の結果を Go の形にそろえてから比べる。`--golden` で、そろえた結果を `expected.csv` として書く
- `run.sh`: 全ケースで `run_python.py`、`goreport`、`compare.py` を流す

## 実行

Python と Go を比べるには、元の照合の実装のチェックアウトが要る。元の照合の実装は、非公開のリポジトリにある。Python の照合のコードは、このリポジトリにコピーしない。  
外部の人は元の照合の実装を持たないので、この節の末尾のコマンドで、`expected.csv` との比較だけを流せる。

`run.sh` は `services/receipt` で実行する。依存は `uv` が各スクリプトの inline script metadata から入れる。

```sh
RECEIPT_CHECKER_LIBS=<元の照合の実装>/server/libs tools/parity/run.sh
```

各ケースで `<ケース>: 行 N、差分 0` を出す。差分があると、区分、行、カラム、両方の値を出し、終了コード 1 で終わる。  
ヘッダーとカラムの数が違う行があるときは、セルを比べずに、その行を差分として出す。  
ケースを足したとき、または Python の側が変わったときは、`--update` を付けて `expected.csv` を書き直す。

```sh
RECEIPT_CHECKER_LIBS=<元の照合の実装>/server/libs tools/parity/run.sh --update
```

`expected.csv` は `internal/check` の `TestRunParity` が Go の結果と比べる。Python と元の照合の実装がない環境でも、`services/receipt` で次を流して回帰を確認できる。

```sh
GOWORK=off go test ./internal/check -run TestRunParity
```

## 吸収する違い

`compare.py` は、Python の結果に次の置き換えをしてから比べる。カラム名、区切りの行、記号の違いは、`report` の CSV の形の違いで、API の挙動ではない。並べ直しは [DesignDoc.md の Verification](../../DesignDoc.md#verification) の、元の Python と GAS から挙動を変えた点の一覧に当たる。提供時間の `.0` は pandas の型の都合である。

- カラム名の接尾辞 `_カレンダー` と `_Ibow` を `_予定` と `_実績` に、区切りの行の `カレンダーのみ` と `Ibowのみ` を `予定のみ` と `実績のみ` にする
- 範囲を持たないサービス内容の ` ❌ ()` を ` ❌` に、予定の提供時間の `  ❌` を ` ❌` にする
- 提供時間の `30.0` を `30` にする。pandas の外部結合で片側だけの行が欠損値を持つと、カラムが浮動小数点になる
- 区分の中の行を、訪問日、開始時間（予定がなければ実績）、利用者名、主訪問者の順に並べ直す

次の入力はケースに含めない。対の作り方を意図して変えたか、Go が入力のエラーとして 422 を返すので、行を比べても意味がない。

- 同じキー（訪問日、利用者名、主訪問者）の行が 1 日に 2 回以上ある。Python は直積を作り、Go は開始時間の差が最小の組から対にする
- 終了時間が開始時間より前である
- 空のサービス内容、読めない時刻と提供時間
