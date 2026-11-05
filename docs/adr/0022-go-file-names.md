# ADR-0022: Go の API のパッケージをフラットに保ち、ファイルの名前の末尾の語で役割を表す

## Status

承認

## Context

Go の API は 3 つある。予定の API（`services/schedule`）、照合の API（`services/receipt`）、ID ブローカー（`services/broker`）である。

- 予定の API は、組織と人、訪問と予定、外部のカレンダーの、複数の機能を持つ。
- 照合の API は、照合という 1 つの機能を段（読み込み、正規化、対の作成、判定）に分け、usecase にあたる `check.Run` の 1 つの関数を HTTP のハンドラから呼ぶ。
- ID ブローカーは、職員のアカウントの 1 つの機能を、ログインの画面（`login`）と内部の API（`internalapi`）で扱う。ハンドラが手順を持つ。

決定に関わる制約と事実は、次のとおり。

- Go は、同じパッケージの型のメソッドを、パッケージの中のどのファイルにも置ける。
  - 出典: The Go Programming Language Specification の [Method declarations](https://go.dev/ref/spec#Method_declarations)
- Google Go Style は、1 つの領域とその複数の責務を 1 つのパッケージに持つ形を例に挙げ、ファイルは、どのファイルに何があるかが分かる程度に分けるとする。Go の blog は、`types` や `interfaces` のように、種類でパッケージをまとめることを誤りとする。
  - 出典: [Google Go Style Best Practices の Package size](https://google.github.io/styleguide/go/best-practices#package-size)、[Package names](https://go.dev/blog/package-names)
- 予定の API の規則と手順は、`internal/features/` の機能ごとのパッケージに置く。
  - ADR-0018: [予定の API を機能ごとのパッケージに分ける](0018-schedule-api-packages.md)

## Decision

3 つの API で、パッケージはフラットに保ち、サブパッケージを足さない。ファイルの名前の末尾に付ける役割の語で、そのファイルが持つものの役割を表す。

| 役割 | ファイルの名前 |
| --- | --- |
| 操作（書き込みと読み取り） | `<動詞>_<対象>.go`。役割の語を付けず、`context/conventions.md` の動詞で書き込みか読み取りかを表す |
| 集約、エンティティ、値オブジェクト、読み取りのモデル | `<集約>.go` |
| リポジトリのインターフェース | `<集約>_repository.go` |
| 集約をまたぐ規則（ドメインサービス） | `<規則>_service.go` |
| 複数の操作の共通の補助 | `<まとまり>_app.go` |
| ほかの機能と外部のシステムのインターフェース | `<相手>_port.go` |
| HTTP のハンドラ | `<機能>_handler.go` |

- 例は、`staff_repository.go`、`assignable_service.go`、`status_change_app.go`、`identity_port.go`、`staff_handler.go`。
- 操作のファイルの名前は、操作の名前を snake_case にしたものにする。対象がパッケージの集約のときは、操作の名前と同じく対象を省く（`staff` の `Retire` は `retire.go`）。
  - 操作の数と大きさによらず、全ての機能で、公開の操作を操作の名前のファイルに置く。
  - 1 つの操作だけが使う補助の関数は、その操作のファイルに置く。
- 集約の型は、集約の名前のファイルに置く。機能の名前と同じ集約が無い `calendar` は、結び付けたカレンダーの型を `calendar.go` に置き、操作の `Link` を `link.go` に置く。`organization` は `facility.go`、`department.go`、`team.go`、`position.go`、`policy.go` に、`visit` は `info.go` と `master.go` に分ける。
- パッケージのドキュメントコメントと、複数の集約が使う定数は、機能の名前のファイル（`organization.go`、`visit.go`）に置く。
- 常駐の処理と、操作の型以外で操作を持つ型は、型の名前のファイル（`exporter.go`、`syncer.go`、`writer.go`）に置く。
- 役割の語は、ファイルの名前の末尾に付ける。Go で多い付け方で、テストのファイルが `staff_repository_test.go` のように対象のファイルと並ぶためである。
  - 出典: [Three Dots Labs: Basic CQRS in Go](https://threedots.tech/post/basic-cqrs-in-go/)（例の Wild Workouts の `trainings_firestore_repository.go`）
- 役割の語（`repository`、`service`、`app`、`port`、`handler`）は、GOOS と GOARCH の値に当たらないので、暗黙のビルドの条件にならない。Go は、ファイルの名前の末尾が GOOS か GOARCH の値（`linux`、`amd64` など）に合うときだけ、ビルドの条件にする。
  - 出典: [Build constraints](https://pkg.go.dev/cmd/go#hdr-Build_constraints)
- CQRS は、書き込みと読み取りを動詞で区別するところまでにする。読み取りの DB と、その同期は足さない。
  - 出典: [Fowler: CQRS](https://martinfowler.com/bliki/CQRS.html)
- ドメインイベントは足さない。Google カレンダーへの書き出し（予定の変更と同じトランザクションで積む書き出しの待ち）が、ドメインイベントにする将来の候補になる。

テストのファイルは、次のとおり置く。

- 確認する対象のファイルの名前に `_test` を付ける。操作のテストは操作ごとのファイルに、型のテストは型の名前のファイル（`exporter_test.go`、`syncer_test.go`）に置く。
- 複数の操作を 1 つの観点でまとめて確認するテストは、観点の名前のファイル（`accounts_test.go`、`authorization_test.go`）に置く。観点に名前が付かないものだけを `app_test.go` に置く。

照合の API と ID ブローカーには、表の規則を次のとおり当てる。

- 役割が 1 つのパッケージは、役割の語を付けず、パッケージの名前のファイルの 1 つにする（照合の API の `record`、`normalize`、`match`、`judge`、ID ブローカーの `hydra`）。役割の語は、1 つのパッケージに複数の役割があるときに、役割を分けるために付ける。
- アダプタのパッケージ（`httpapi`、`login`、`internalapi`、`postgres`）は、`Config` と `NewHandler` の組み立てを、パッケージの名前のファイル（`httpapi.go` など）に置く。ハンドラは `<機能>_handler.go`、使う側で定義したインターフェースは `<相手>_port.go` に置く。
- 照合の API の `check` は、ファイルを 3 つに分ける。
  - 段をつなぐ操作（`Run`）は `run.go` に置く。
  - 結果の型（`Report`、`Summary`）は `report.go` に置く。
  - 予定のデータソースのインターフェースと CSV の実装は `schedules_port.go` に置く。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** ファイルの名前の末尾の語で役割を表す | ファイルの名前から役割を探せる | ファイルの数が増える |
| 役割の語をファイルの名前の先頭に付ける（`repository_staff.go`） | ファイルの一覧が役割ごとに並ぶ | Go で少ない付け方で、同じ対象の集約とリポジトリが離れて並ぶ |
| 機能のパッケージを `domain`、`app`、`port` のようなサブパッケージに分ける | ディレクトリで役割が分かる | 種類でパッケージをまとめる形になる。パッケージの数が増え、1 つの機能の変更が複数のパッケージにまたがる |

## Consequences

### Positive

- ファイルの一覧から、集約、リポジトリ、ほかの機能のインターフェース、操作を、名前だけで探せる。3 つの API で、HTTP のハンドラと、使う側で定義したインターフェースの配置先がそろう。

### Negative

- 次のものは lint で確認できず、レビューで確認する。
  - 役割の語が役割と合っているか
