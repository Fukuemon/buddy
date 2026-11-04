# ADR-0030: Go の 3 つの API で、パッケージをフラットに保ち、ファイルの名前の末尾の語で役割を表す

## Status

承認

## Context

予定の API の機能のパッケージは、公開の操作を操作の名前のファイルに 1 つずつ置く。  
操作でないものの配置先は、集約のファイル、使う型のファイル、型の名前のファイルに置くと決めた。

- ADR-0026: [予定の API の機能のパッケージを internal/features/ に置き、usecase のメソッドを操作ごとのファイルに分ける](0026-schedule-api-features-directory.md)
- ADR-0029: [予定の API の機能のパッケージの中で、操作でないファイルとテストの配置先と、ほかの機能を書くインターフェースの大きさを決める](0029-schedule-api-feature-package-layout.md)

この配置のまま、次のファイルは名前から役割が分からない。

- `usecase.go` は、組み立て（`Deps`、`Usecase`、`NewUsecase`）、複数の操作が使う補助、ほかの機能のインターフェースを持つ。名前は「操作」と読める。
- `staff.go` は、集約（`Staff`）、値オブジェクト（`Status`、`Profile`）、読み取りのモデル（`Summary`、`Detail`）、リポジトリ（`Repository`）を 1 つに持つ。
- `calendar` の `event.go` は、Google カレンダーの予定と、それを読み書きするインターフェースを持つ。event は DDD のドメインイベントと紛れる。
- 照合の API は、照合の 1 つの機能を段ごとのパッケージに分け、段のパッケージはファイルを 1 つずつ持つ。段をつなぐ `check` と、HTTP の `httpapi` は、インターフェース、読み取りのモデル、操作、組み立てを 1 つのファイルに持つ。
- ID ブローカーの `login` と `internalapi` は、`Usecase` に当たる型を持たず、ハンドラが手順を持つ。1 つのファイルに、インターフェース、組み立て、全てのハンドラを持つ。

この ADR は、ADR-0029 の配置先の規則のうち、次の 3 つを置き換える。

- 集約の型とそのリポジトリのインターフェースを、集約の名前のファイルに置く判断
- ほかの機能と外部のシステムのインターフェースを、使う型のファイル（`usecase.go`、`apply.go`）に置く判断
- `calendar` の外部のシステムの手段の型を `event.go` にまとめる判断

ADR-0026 の、`Usecase` 型、`Deps`、`NewUsecase` を `usecase.go` に置く判断と、ADR-0010 の、手順の型を `Usecase` と名付ける判断も置き換える。  
ADR-0029 の、常駐の処理の型、パッケージのドキュメントコメント、テストの配置先の規則は保つ。  
常駐の繰り返し（`Run`）を機能のパッケージに置く部分は ADR-0037 で置き換えた。

- ADR-0037: [Worker の常駐と 1 回の繰り返しを cmd/calendar-worker に集め、機能のパッケージは 1 回の処理だけを持つ](0037-calendar-worker-loop.md)

## Decision

パッケージはフラットに保ち、サブパッケージを足さない。ファイルの名前の末尾に付ける役割の語で、そのファイルが持つものの役割を表す。

| 役割 | ファイルの名前 |
| --- | --- |
| 操作（書き込みと読み取り） | `<動詞>_<対象>.go`。役割の語を付けず、`context/conventions.md` の動詞で書き込みか読み取りかを表す |
| 集約、エンティティ、値オブジェクト、読み取りのモデル | `<集約>.go` |
| リポジトリのインターフェース | `<集約>_repository.go` |
| 集約をまたぐ規則（ドメインサービス） | `<規則>_service.go` |
| 組み立て | `app.go`。型は `App`、`Deps`、`NewApp` |
| 複数の操作の共通の補助 | `<まとまり>_app.go` |
| ほかの機能と外部のシステムのインターフェース | `<相手>_port.go` |
| HTTP のハンドラ | `<機能>_handler.go` |

- 例は、`staff_repository.go`、`assignable_service.go`、`status_change_app.go`、`identity_port.go`、`staff_handler.go`。
- 操作のファイルの名前は、メソッドの名前を snake_case にしたものにする。対象がパッケージの集約のときは、メソッドの名前と同じく対象を省く（`staff` の `Retire` は `retire.go`）。
- 役割の語は、ファイルの名前の末尾に付ける。Go で多い付け方で、テストのファイルが `staff_repository_test.go` のように対象のファイルと並ぶためである。
  - 出典: [Three Dots Labs: Basic CQRS in Go](https://threedots.tech/post/basic-cqrs-in-go/)（例の Wild Workouts の `trainings_firestore_repository.go`）
- 役割の語（`repository`、`service`、`app`、`port`、`handler`）は、GOOS と GOARCH の値に当たらないので、暗黙のビルドの条件にならない。Go は、ファイルの名前の末尾が GOOS か GOARCH の値（`linux`、`amd64` など）に合うときだけ、ビルドの条件にする。
  - 出典: [Build constraints](https://pkg.go.dev/cmd/go#hdr-Build_constraints)
- テストのファイルは、確認する対象のファイルの名前に `_test` を付ける。観点の名前のテストは ADR-0029 のまま保ち、観点に名前が付かないテストは `usecase_test.go` から `app_test.go` に移す。
- 手順の型を `Usecase` から `App` に改める。呼ぶ側の `httpapi` のインターフェース（`CalendarUsecase` など）と束（`Usecases`）も、`CalendarApp` と `Apps` に改める。
  - 手順の型を `App` とし、組み立てを `app.go` の `App`、`Deps`、`NewApp` に置く判断は ADR-0031 で置き換えた。
    - ADR-0031: [Go の API の操作を、使う依存だけを持つ操作ごとの型にし、機能のパッケージの App をやめる](0031-go-operation-types.md)
- CQRS は、書き込みと読み取りを動詞で区別するところまでにする。読み取りの DB と、その同期は足さない。
  - 出典: [Fowler: CQRS](https://martinfowler.com/bliki/CQRS.html)
- ドメインイベントは足さない。Google カレンダーへの書き出し（予定の変更と同じトランザクションで積む書き出しの待ち）が、ドメインイベントにする将来の候補になる。

階層を足さない理由は次のとおり。

- Google Go Style は、1 つの領域とその複数の責務を 1 つのパッケージに持つ形を例に挙げ、ファイルは、どのファイルに何があるかが分かる程度に分けるとする。
  - 出典: [Google Go Style Best Practices の Package size](https://google.github.io/styleguide/go/best-practices#package-size)
- Go の blog は、`types` や `interfaces` のように、種類でパッケージをまとめることを誤りとする。
  - 出典: [Package names](https://go.dev/blog/package-names)
- ADR-0010 は、機能のパッケージを domain と usecase のサブパッケージに分ける案を却下している。
  - ADR-0010: [予定の API の機能のパッケージで、手順を usecase、規則を関数、リポジトリを集約の単位に分ける](0010-schedule-api-usecase-boundaries.md)

照合の API と ID ブローカーには、表の規則を次のとおり当てる。

- 役割が 1 つのパッケージは、役割の語を付けず、パッケージの名前のファイルの 1 つにする（照合の API の `record`、`normalize`、`match`、`judge`、ID ブローカーの `hydra`）。
  - 役割の語は、1 つのパッケージに複数の役割があるときに、役割を分けるために付ける。
- アダプタのパッケージ（`httpapi`、`login`、`internalapi`、`postgres`）は、`Config` と `NewHandler` の組み立てを、パッケージの名前のファイルに置く。`app.go` と `App` は、手順の型を持つ機能のパッケージにだけ使う。
  - この判断のうち `app.go` と `App` の部分は ADR-0031 で置き換えた。
    - ADR-0031: [Go の API の操作を、使う依存だけを持つ操作ごとの型にし、機能のパッケージの App をやめる](0031-go-operation-types.md)
  - 予定の API の `httpapi` の `router.go` も、`httpapi.go` に改める。
- アダプタのパッケージの中でも、ハンドラは `<機能>_handler.go`、使う側で定義したインターフェースは `<相手>_port.go` に置く。
- 照合の API の `check` は、ファイルを 3 つに分ける。
  - 段をつなぐ操作（`Run`）は `run.go` に置く。
  - 結果の型（`Report`、`Summary`）は `report.go` に置く。
  - 予定のデータソースのインターフェースと CSV の実装は `schedules_port.go` に置く。
- ID ブローカーは、手順の型を足さない。`login` と `internalapi` はハンドラが手順を持つ今の形のまま、ハンドラとインターフェースのファイルを分ける。
  - 手順の型を足すと、処理の中身を移すことになり、ファイルの名前を変えるだけの変更で済まないためである。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** パッケージをフラットに保ち、ファイルの名前の末尾の役割の語で役割を表す | import のパスが変わらない。対象の名前で並び、テストのファイルが対象のファイルの隣に並ぶ | ファイルの数が増える。役割の語が正しいかを lint で確認できない |
| 機能のパッケージを `domain`、`app`、`port` のサブパッケージに分ける | ディレクトリで役割が分かる | 種類でパッケージをまとめる形になる。ADR-0010 が却下した案に戻り、機能の型を全てのサブパッケージから export する |
| 役割の語をファイルの名前の先頭に付ける（`repository_staff.go`） | ファイルの一覧が役割ごとに並ぶ | Go で少ない付け方で、同じ対象の集約とリポジトリが離れて並ぶ |
| ADR-0029 の配置のまま、`usecase.go` だけを `app.go` に改める | 変更が少ない | 集約とリポジトリが 1 つのファイルのままで、`event.go` の紛れも残る |


## Consequences

### Positive

- ファイルの一覧から、集約、リポジトリ、ほかの機能のインターフェース、操作を、名前だけで探せる。
- 3 つの API で、HTTP のハンドラと、使う側で定義したインターフェースの配置先がそろう。

### Negative

- 3 つの API のファイルを移し、`Usecase` を使う `httpapi`、`cmd`、テスト、文書を一度に直す。
- 役割の語が役割と合っているかを lint で確認できない。レビューで確認する。
