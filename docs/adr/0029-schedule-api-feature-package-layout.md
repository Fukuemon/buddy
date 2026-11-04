# ADR-0029: 予定の API の機能のパッケージの中で、操作でないファイルとテストの配置先と、ほかの機能を書くインターフェースの大きさを決める

## Status

承認

## Context

ADR-0026 は、機能のパッケージの公開の操作を、操作の名前のファイルに 1 つずつ置くと決めた。操作でないものの配置先は決めていなかった。

- ADR-0026: [予定の API の機能のパッケージを internal/features/ に置き、usecase のメソッドを操作ごとのファイルに分ける](0026-schedule-api-features-directory.md)

ADR-0026 は、操作を `usecase.go` の 1 つにまとめる例外を決めた。  
操作が 2 つ以下の機能と、全部の操作が Get、List、Create、Update で 1 つが 20 行に収まる機能（`organization` と `visit`）が当たる。  
`organization` の `CreateTeam` と `CreatePosition` は 20 行を超え、条件に合っていなかった。

構成の整理の後のコードには、次の食い違いもあった。

- 集約のリポジトリのインターフェースが、`schedule` では `repository.go`、`staff` では `staff.go`、`calendar` では `link.go` にあった。
  - `calendar` は `link.go` が型とリポジトリを持つので、操作の `Link` が `link_calendar.go` にあり、ファイルと操作の名前がそろわなかった。
- `calendar` は、常駐の処理（`Exporter`、`Syncer`）を同じパッケージに持つ。`Syncer` は、同期の状態の型と同じ `sync.go` にあった。
- `calendar` の `leave_test.go` と `accounts_test.go`、`schedule` の `authorization_test.go` は、複数の操作を 1 つの観点でまとめて確認する。codebase.md は、複数の操作をまとめて確認するテストを `usecase_test.go` に置くと決めている。
  - 3 つのファイルは合わせて約 30 KB あり、`usecase_test.go` に移すと、観点ごとにテストを探せなくなる。
- ADR-0010 は、ほかの機能のデータを、使う側で定義した 1〜2 のメソッドの小さなインターフェースで受けると決めた。
  - ADR-0010: [予定の API の機能のパッケージで、手順を usecase、規則を関数、リポジトリを集約の単位に分ける](0010-schedule-api-usecase-boundaries.md)
  - `calendar` の `applier` は、外部の予定の変更を 1 つのトランザクションで単発の予定に当てる。そのために `ScheduleStore`（6 つのメソッド）と `RecurringStore`（3 つのメソッド）で、`schedule` の集約を読み書きする。
  - 1〜2 のメソッドに分けると、例えば `ScheduleStore` は 4 つ（作成、読み込みとロック、更新とキャンセル、置き換えの予定の検索）に、`RecurringStore` は 2 つになる。項目は、`Deps` で 3 つ、`SyncerDeps` と `applier` で 4 つずつ増える。

## Decision

機能のパッケージの中の、操作でないファイルとテストの配置先を、次のとおりにする。

- 集約の型と、その集約のリポジトリのインターフェースは、集約の名前のファイルに置く（`schedule.go`、`recurring.go`、`export.go`、`staff.go`）。
  - この判断は ADR-0030 で置き換えた。
    - ADR-0030: [Go の 3 つの API で、パッケージをフラットに保ち、ファイルの名前の末尾の語で役割を表す](0030-go-file-names-by-role.md)
  - 機能の名前と同じ集約が無い `calendar` は、結び付けたカレンダーの型とリポジトリを `calendar.go` に置く。操作の `Link` は `link.go` に置く。
  - `organization` は、`facility.go`、`department.go`、`team.go`、`position.go`、`policy.go` に分ける。`visit` は、`info.go` と `master.go` に分ける。
- パッケージのドキュメントコメントと、複数の集約が使う定数は、機能の名前のファイル（`organization.go`、`visit.go`）に置く。
- ほかの機能と外部のシステムを読み書きするインターフェースは、使う型のファイルに置く。`Usecase` が使うものは `usecase.go`、`applier` が使うものは `apply.go` に置く。
  - この判断は ADR-0030 で置き換えた。
    - ADR-0030: [Go の 3 つの API で、パッケージをフラットに保ち、ファイルの名前の末尾の語で役割を表す](0030-go-file-names-by-role.md)
  - `patient` の `ScheduleReader`、`staff` の `AssignmentReader`、`CalendarDetacher`、`Identities` は、集約のファイルから `usecase.go` に移す。
- 常駐の処理と、`Usecase` 以外で操作を持つ型は、同じ機能のパッケージに、型の名前のファイル（`exporter.go`、`syncer.go`、`visit` の `writer.go`）で置く。これらの型と操作は、同じ集約のリポジトリと規則を使うためである。
  - この判断のうち、`calendar` の `Exporter` と `Syncer` を操作と同じパッケージに置く部分は ADR-0032 で置き換えた。
    - ADR-0032: [予定の API の calendar を、結び付け、取り込み、同期、書き出しの 4 つの機能に分ける](0032-schedule-api-calendar-split.md)
  - 外部のシステムの手段の型が多く、`Usecase` と常駐の処理が共有する `calendar` は、`EventSource`、`EventWriter`、`SourceFor`、`WriterFor`、`Accounts` を `event.go` にまとめる。
    - この判断は ADR-0030 で置き換えた。
      - ADR-0030: [Go の 3 つの API で、パッケージをフラットに保ち、ファイルの名前の末尾の語で役割を表す](0030-go-file-names-by-role.md)
- 複数の操作を 1 つの観点でまとめて確認するテストは、観点の名前のファイル（`calendar` の `accounts_test.go`、`schedule` の `authorization_test.go`）に置く。観点に名前が付かないものだけを `usecase_test.go` に置く。
- その型を確認するテストは、型の名前のファイル（`exporter_test.go`、`syncer_test.go`）に置く。

ほかの機能のデータを受けるインターフェースの大きさを、次のとおりにする。ADR-0010 の「1〜2 のメソッド」を、この 2 つに置き換える。

- 読むだけなら、`kernel.Finder` か 1〜2 のメソッドにする。
- ほかの機能の集約を 1 つのトランザクションで書くかロックするなら、使うメソッドだけを並べた 1 つのインターフェースにする。`calendar` の `ScheduleStore` と `RecurringStore`、`schedule` の `StaffRefs` が当たる。
  - 1 つのトランザクションの中で使うメソッドを分けると、同じ実装を指す項目が増えるだけで、使う側から読める依存は減らないためである。

ADR-0026 の、操作を `usecase.go` の 1 つにまとめる例外をやめる。操作の数と大きさによらず、全ての機能で、公開の操作を操作の名前のファイルに置き、テストも操作ごとのファイルに分ける。

- 例外の条件（20 行）は、操作が増えると守られなくなり、機能によってファイルの分け方が違うままになるためである。
- `organization` と `visit` を、操作と集約のファイルに分ける。`CreateTeam` と `CreatePosition` は、色を選ぶ処理と、権限が全て有るかを確認する処理と保存を、非公開の関数に分ける。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 集約のファイル、使う型のファイル、型の名前のファイル、観点の名前のテストに置く。書くインターフェースは使うメソッドだけを並べる | ファイルの名前から、集約、操作、常駐の処理、観点を探せる。今のコードの多くがこの形である | 機能ごとに集約の数が違うので、集約のファイルの数がそろわない |
| リポジトリのインターフェースを、どの機能も `repository.go` に置く | リポジトリを探す場所が 1 つになる | 集約の型とそのリポジトリが別のファイルに分かれる。`repository.go` を持たない `staff`、`patient`、`calendar`、`organization`、`visit` のファイルを分け直す |
| `organization` と `visit` は `usecase.go` の 1 つのまま、長い操作を非公開の関数に分けて 20 行に収める | ファイルの数が増えない | 操作が増えるたびに条件を確認し直す。機能によってファイルの分け方が違うままになる |
| 観点ごとのテストを `usecase_test.go` に移す | codebase.md の今の規則のまま | `calendar` の `usecase_test.go` が 30 KB を超え、観点ごとに探せない |
| `ScheduleStore` と `RecurringStore` を 1〜2 のメソッドに分ける | ADR-0010 の規則のまま | 3 つの型の項目が 3〜4 つずつ増え、同じ `schedule.Repository` を何度も渡す |

## Consequences

### Positive

- 機能のパッケージに操作、常駐の処理、テストを足すときに、ファイルの名前を規則だけで決められる。
- `calendar` の操作の `Link` が、操作の名前の `link.go` にある。

### Negative

- ほかの機能を書くインターフェースが大きいかどうかを、lint で確認できない。レビューで、1 つのトランザクションの中で使うメソッドだけかを確認する。
