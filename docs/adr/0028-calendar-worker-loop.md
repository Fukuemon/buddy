# ADR-0028: Worker の常駐と 1 回の繰り返しを cmd/calendar-worker に集め、機能のパッケージは 1 回の処理だけを持つ

## Status

承認

## Context

Google カレンダーの書き出しと同期は、`cmd/calendar-worker` が役割ごとのプロセスで、常駐か 1 回の形で動かす。

- ADR-0027: [Google カレンダーの書き出しと同期を、予定の API と同じイメージの Worker のコマンドで動かす](0027-calendar-worker.md)

次のバッチをいつ呼ぶかの方針が、3 か所に分かれていた。

- 常駐の書き出しは `calendarexport` の `Exporter.Run` が、常駐の同期は `calendarsync` の `Syncer.Run` が持つ。
- 1 回の形は `cmd/calendar-worker` の `drain` が持ち、取れるものが無くなるまで呼ぶ。

`Exporter.Run` は間隔ごとに 1 回だけ呼び、待ちが溜まっても 1 回の上限の 5 件しか書かなかった。  
`Syncer.Run` は、取った数が上限に届く間は続けて呼んでいた。  
3 か所の振る舞いがそろわず、書き出しだけが ADR-0027 の「間隔ごとに取れるものを処理し続ける」から外れていた。

この繰り返しを使うのは、`cmd/calendar-worker` だけである。

ADR-0005 は、常駐の処理（`Exporter`、`Syncer`）を今の形のまま変えず、機能のパッケージの型の名前のファイルに置くと決めた。  
この ADR は、ADR-0005 の判断のうち、常駐の繰り返し（`Run`）の配置先だけを置き換える。

- ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](0005-schedule-api-packages.md)

## Decision

常駐と 1 回の繰り返しを、`cmd/calendar-worker` の `loop.go` に集める。

- 常駐（`resident`）は、1 回の形（`drain`）と同じく、取れるものが無くなるまで呼んでから、間隔を待つ。
  - 待ちとカレンダーを取れなかったときは、ログに書き、間隔を待ってから取り直す。
  - 停止の合図を受けたら、新しく取らない。呼んだ処理は、取ったものの結果を書いてから戻る。
- 常駐の書き出しの間隔は `GOOGLE_CALENDAR_EXPORT_INTERVAL` である。
- 常駐の同期の確認の間隔は、`GOOGLE_CALENDAR_SYNC_INTERVAL` と 5 秒の短い方である。確認の間隔（`syncPollTick`）は `cmd/calendar-worker` が持つ。

`Exporter.Run` と `Syncer.Run` を消す。  
機能のパッケージは、1 回の取得と処理（`ExportDue`、`SyncDue`）、Claim、リース、Finish、1 回に取る数の上限を持つ。

- `Syncer` の `interval` は、読み終えたカレンダーを次に読む時刻を決める業務の値なので、`Syncer` に残す。

新しいパッケージ（`internal/calendarworker`）は作らない。  
使う側が `cmd/calendar-worker` の 1 つのうちは、パッケージを作っても、依存の規則と文書が増えるだけである。  
2 つ目の Worker のコマンドを足すときに分ける。

ADR-0027 の実行の契約（常駐と 1 回の形、停止の合図、終了のコード）は変えない。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 常駐と 1 回の繰り返しを `cmd/calendar-worker` の 1 つのファイルに集め、機能のパッケージは 1 回の処理だけを持つ | 次のバッチを呼ぶ方針が 1 か所になり、常駐と 1 回の形の振る舞いがそろう。機能のパッケージは時刻の待ち方を持たない | 1 回に取る数の上限を `cmd` が知らないので、常駐は、取れるものが無くなったことを、何も取らなかった呼び出しで知る |
| `Exporter.Run` と `Syncer.Run` を残し、振る舞いだけをそろえる | 変更が小さい | 方針が 3 か所に残り、片方だけを直すと、またずれる |
| `internal/calendarworker` を作り、繰り返しをそこに置く | Worker のコマンドが増えたときに、そのまま共有できる | 使う側が 1 つのうちは、依存の規則と文書が増えるだけである |

## Consequences

### Positive

- 常駐と 1 回の形が、同じ `drain` で取れるものを処理する。書き出しと同期の振る舞いがそろう。
- 繰り返しのテストを、DB と外部のカレンダーを使わずに、`cmd/calendar-worker` で書ける。

### Negative

- 常駐は、取った数が上限に届かなかった後も、何も取らなくなるまでもう 1 回呼ぶ。間隔ごとの Claim の問い合わせが、取るものがあった間隔だけ 1 回増える。
- 常駐で待ちとカレンダーを取れなかったときのログの `msg` が、役割ごとの `calendar export` と `calendar sync` から、`calendar worker batch` になる。役割は、ログの `component` で見分ける。
