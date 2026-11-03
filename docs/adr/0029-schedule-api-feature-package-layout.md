# ADR-0029: 予定の API の機能のパッケージの中で、操作でないファイルとテストの配置先と、ほかの機能を書くインターフェイスの大きさを決める

## Status

提案

## Context

ADR-0026 は、機能のパッケージの公開の操作を、操作の名前のファイルに 1 つずつ置くと決めた。操作でないものの配置先は決めていなかった。

- ADR-0026: [予定の API の機能のパッケージを internal/features/ に置き、usecase のメソッドを操作ごとのファイルに分ける](0026-schedule-api-features-directory.md)

構成の整理の後のコードには、次の食い違いがあった。

- 集約のリポジトリのインターフェイスが、`schedule` では `repository.go`、`staff` では `staff.go`、`calendar` では `link.go` にあった。
  - `calendar` は `link.go` が型とリポジトリを持つので、操作の `Link` が `link_calendar.go` にあり、ファイルと操作の名前がそろわなかった。
- `calendar` は、常駐の処理（`Exporter`、`Syncer`）を同じパッケージに持つ。`Syncer` は、同期の状態の型と同じ `sync.go` にあった。
- `calendar` の `leave_test.go` と `accounts_test.go`、`schedule` の `authorization_test.go` は、複数の操作を 1 つの観点でまとめて確認する。codebase.md は、複数の操作をまとめて確認するテストを `usecase_test.go` に置くと決めている。
  - 3 つのファイルは合わせて約 30 KB あり、`usecase_test.go` に移すと、観点ごとにテストを探せなくなる。
- ADR-0010 は、ほかの機能のデータを、使う側で定義した 1〜2 のメソッドの小さなインターフェイスで受けると決めた。
  - ADR-0010: [予定の API の機能のパッケージで、手順を usecase、規則を関数、リポジトリを集約の単位に分ける](0010-schedule-api-usecase-boundaries.md)
  - `calendar` の `applier` は、外部の予定の変更を 1 つのトランザクションで単発の予定に当てる。そのために `ScheduleStore`（6 つのメソッド）と `RecurringStore`（3 つのメソッド）で、`schedule` の集約を読み書きする。
  - 1〜2 のメソッドに分けると、例えば `ScheduleStore` は 4 つ（作成、読み込みとロック、更新とキャンセル、置き換えの予定の検索）に、`RecurringStore` は 2 つになる。項目は、`Deps` で 3 つ、`SyncerDeps` と `applier` で 4 つずつ増える。

## Decision

機能のパッケージの中の、操作でないファイルとテストの配置先を、次のとおりにする。

- 集約の型と、その集約のリポジトリのインターフェイスは、集約の名前のファイルに置く（`schedule.go`、`recurring.go`、`export.go`、`staff.go`）。
  - 機能の名前と同じ集約が無い `calendar` は、結び付けたカレンダーの型とリポジトリを `calendar.go` に置く。操作の `Link` は `link.go` に置く。
- ほかの機能を読み書きするインターフェイスは、使う型のファイルに置く。`Usecase` が使うものは `usecase.go`、`applier` が使うものは `apply.go` に置く。
- 常駐の処理は、同じ機能のパッケージに、型の名前のファイル（`exporter.go`、`syncer.go`）で置く。常駐の処理と操作は、同じ集約のリポジトリと規則を使うためである。
- 外部のシステムを読み書きする手段の型（`EventSource`、`SourceFor`、`Accounts`）は、その手段の型を集めたファイル（`calendar` の `event.go`）に置く。
- 複数の操作を 1 つの観点でまとめて確認するテストは、観点の名前のファイル（`leave_test.go`、`authorization_test.go`）に置く。観点に名前が付かないものだけを `usecase_test.go` に置く。

ほかの機能のデータを受けるインターフェイスの大きさを、次のとおりにする。ADR-0010 の「1〜2 のメソッド」を、この 2 つに置き換える。

- 読むだけなら、`kernel.Finder` か 1〜2 のメソッドにする。
- ほかの機能の集約を 1 つのトランザクションで読み書きするなら、使うメソッドだけを並べた 1 つのインターフェイスにする。
  - 1 つのトランザクションの中で使うメソッドを分けると、同じ実装を指す項目が増えるだけで、使う側から読める依存は減らないためである。

`organization` を `usecase.go` の 1 つにまとめる条件（1 つの操作が 20 行に収まる）は変えない。`CreateTeam` と `CreatePosition` は、色を選ぶ処理と権限を確認する処理を非公開の関数に分けて、20 行に収める。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 集約のファイル、使う型のファイル、型の名前のファイル、観点の名前のテストに置く。書くインターフェイスは使うメソッドだけを並べる | ファイルの名前から、集約、操作、常駐の処理、観点を探せる。今のコードの多くがこの形である | 機能ごとに集約の数が違うので、集約のファイルの数がそろわない |
| リポジトリのインターフェイスを、どの機能も `repository.go` に置く | リポジトリを探す場所が 1 つになる | 集約の型とそのリポジトリが別のファイルに分かれる。`staff`、`patient`、`calendar` のファイルを分け直す |
| 観点ごとのテストを `usecase_test.go` に移す | codebase.md の今の規則のまま | `calendar` の `usecase_test.go` が 30 KB を超え、観点ごとに探せない |
| `ScheduleStore` と `RecurringStore` を 1〜2 のメソッドに分ける | ADR-0010 の規則のまま | 3 つの型の項目が 3〜4 つずつ増え、同じ `schedule.Repository` を何度も渡す |

## Consequences

### Positive

- 機能のパッケージに操作、常駐の処理、テストを足すときに、ファイルの名前を規則だけで決められる。
- `calendar` の操作の `Link` が、操作の名前の `link.go` にある。

### Negative

- ほかの機能を書くインターフェイスが大きいかどうかを、lint で確認できない。レビューで、1 つのトランザクションの中で使うメソッドだけかを確認する。
