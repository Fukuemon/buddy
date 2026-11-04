# ADR-0031: Go の API の操作を、使う依存だけを持つ操作ごとの型にし、機能のパッケージの App をやめる

## Status

承認

## Context

ADR-0030 は、機能のパッケージの組み立てを `App` 型にし、操作を `App` のメソッドにした。  
`App` は機能が使う全ての依存を持ち、どの操作のメソッドからも全ての依存に触れる。

- ADR-0030: [Go の 3 つの API で、パッケージをフラットに保ち、ファイルの名前の末尾の語で役割を表す](0030-go-file-names-by-role.md)

予定の API の `staff` では、`App` が 13 個の依存（`Deps` の 11 項目と `tx`、`ids`、`guard`）を持つ。  
操作が使うのは、その一部だけである。

| 操作 | 使う依存 |
| --- | --- |
| `Get` | `Staff` |
| `List` | `Facilities`、`Staff` |
| `Create` | `Facilities`、`Departments`、`Teams`、`Positions`、`Identities`、`Staff`、`guard`、`ids`、`tx` |

このため、次の 2 つが起きる。

- 読み手は、操作のシグネチャから、その操作が何に依存するかを読めない。
- 1 つの操作のテストにも、`Deps` の全体を用意する。

複数の操作が使う補助（`staff` の `stop`、`locked`、`lastManager`）も `App` のメソッドで、補助を通した依存はさらに読みにくい。  
予定の API の `access` の `Service` も、`Deps` の 11 項目を持ち、2 つの操作（`Authenticate`、`FacilityOf`）がその一部を使う。

予定の API と照合の API の `httpapi` は、openapi.yaml から生成した `StrictServerInterface` を 1 つの型で実装する。  
このため、ハンドラを操作ごとの型に分けられない。  
`httpapi` のテストは、`StaffApp` のようなインターフェースを実装したフェイクを、操作の代わりに渡す。

この ADR は、ADR-0030 の次の判断を置き換える。

- 組み立てを `app.go` の `App`、`Deps`、`NewApp` に置く判断
- 手順の型を `App` と名付け、`httpapi` のインターフェースを `CalendarApp`、束を `Apps` と名付ける判断のうち、手順の型を `App` とする部分

ADR-0030 の、ファイルの名前の役割の語、操作のファイルの名前、`<まとまり>_app.go`、`app_test.go` の規則は保つ。

予定の API の構成は、Google カレンダーの書き出しと同期を Worker に分ける変更（#593）と、Google カレンダーを予定の正本にする変更（#594）を見越して、次の 4 点で直すと決めている。  
この ADR は、4 点を直した後の構成を前提にする。

- `calendar` を、結び付け（`calendar`）、取り込み（`calendarimport`）、同期（`calendarsync`）、書き出し（`calendarexport`）の 4 つの機能に分ける（#611）。
- 予定の書き込みのモデル（`schedule`）と、画面と照合が読む読み取りのモデル（`scheduleview`）を分ける（#612）。
- 正本のモードを `organization` の事業所の状態にし、事業所の行のロックを `organization` に移す（#612、#615）。
- 組み立てを `internal/assemble` に移し、`cmd/api` と `cmd/calendar-worker` が共有する（#614）。

## Decision

機能のパッケージの操作を、使う依存だけをフィールドに持つ操作ごとの型にし、`App` と `Deps` をやめる。  
全ての依存を知るのは、組み立ての場所（`internal/assemble`。移すまでは `cmd/api`）だけにする。  
処理の中身は変えず、依存の受け取り方を、メソッドの受け手から操作の型のフィールドに変える。

操作の型の形は、次のとおり。

```go
// Leave は、職員を休職にする操作である。
type Leave struct {
	staff       Repository
	assignments AssignmentReader
	tx          tx.Transactor
	guard       organization.Guard
	// ...
}

// NewLeave は Leave を作る。
func NewLeave(staff Repository, assignments AssignmentReader, tx tx.Transactor, guard organization.Guard /* ... */) Leave

// Do は、職員 id を休職にする。
func (o Leave) Do(ctx context.Context, id string, in LeaveInput) (StatusChange, error)
```

- 型の名前は、今の `App` のメソッドの名前にし、操作のファイル（`leave.go`）に置く。
  - 型の名前が、同じパッケージの集約や読み取りのモデルの型（`schedule` の `Cancel`、`List`、`calendar` の `Link`、`Preview`）と重なるときは、集約や読み取りのモデルの型を名詞に改める。
  - 操作の名前は operationId の動詞から決まるので、動詞でない側を改める。
- コンストラクタは `New<操作>` にし、使う依存を引数で受け、値を返す。
  - `Deps` の `Now` のように、nil のときにデフォルトを入れていた依存は、その依存を受けるコンストラクタでデフォルトを入れる。
- 実行のメソッドの名前は `Do` にし、引数と戻り値は今の `App` のメソッドのまま変えない。
  - 型の名前が動詞を持つので、メソッドの名前は動詞を重ねない。
  - `Handle` は、ファイルの名前の役割の語の `handler`（HTTP のハンドラ）と紛れる。
  - `Run` は、常駐の処理（`calendar` の `Exporter.Run`）と照合の API の `check.Run` が使う。
- 複数の操作が使う補助は、使う依存を引数で受けるパッケージの関数にし、`<まとまり>_app.go` に置いたままにする。
  - 例は、`func locked(ctx context.Context, staff Repository, id string) (Detail, error)`。
  - 既に自分の依存をフィールドに持つ補助の型（`calendar` の `applier`）は、型のまま残し、使う操作の型と常駐の処理がフィールドに持つ。
- 操作の型の doc コメントには、今の `App` のメソッドの doc コメントの契約を移す。

操作の型を束ねる型は、機能のパッケージに置かない。  
束は、使う側の `httpapi` の `<機能>App` が持つ。

- `httpapi` の `<機能>App`（`StaffApp` など）を、インターフェースから、今のメソッドと同じ名前とシグネチャの関数のフィールドを持つ struct に改める。
- 組み立ての場所は、操作の型の `Do` をメソッド値で渡す（`Leave: staff.NewLeave(...).Do`）。
- ハンドラの呼び出し（`s.u.Staff.Leave(ctx, id, in)`）は変わらない。
- `httpapi` のテストは、フェイクのメソッド値を struct に入れて渡す。フェイクの型は今のまま使う。

常駐の処理と、`App` 以外で操作を持つ型（`calendar` の `Exporter`、`Syncer`、`Outbox`、`visit` の `Writer`）は、1 つの型が 1 つの役割を持つので、今の形のまま変えない。  
この判断のうち、`Exporter` と `Syncer` が常駐の繰り返し（`Run`）を持つ部分は ADR-0037 で置き換えた。

- ADR-0037: [Worker の常駐と 1 回の繰り返しを cmd/calendar-worker に集め、機能のパッケージは 1 回の処理だけを持つ](0037-calendar-worker-loop.md)

照合の API と ID ブローカーには、次のとおり当てる。

- 照合の API は変えない。
  - 照合の操作（`check.Run`）は、既に予定のデータソースを引数で受けるパッケージの関数である。
  - `httpapi` の `server` は、生成した `StrictServerInterface` を実装するアダプタで、1 つの型から分けられない。
- ID ブローカーの `login` と `internalapi` は、ハンドラが手順を持つので、ハンドラを操作として扱う。
  - パスごとのハンドラを、使う依存だけをフィールドに持つ、パッケージの外に出さない型にし、`http.Handler` を実装させる。実行のメソッドは `ServeHTTP` にする。
  - 型の名前は、今のハンドラのメソッドの名前（`submitEmail`、`register`）にし、今のハンドラのファイル（`login_handler.go`、`staff_handler.go`）に置く。
  - 複数のハンドラが使う補助（`login` の `accept`、`fail`、`setCookie`、`internalapi` の `revoke`、`writeError`）は、使う依存を引数で受ける関数にする。
  - 組み立ての場所は、パッケージの名前のファイルの `NewHandler` にし、`Config` を受けてハンドラの型を作る。

## Verification

Context の 4 点を直した後の構成で、操作ごとの型が成り立つかを、今のコードの操作ごとの依存で確認した。

`calendar` を 4 つの機能に分けるときは、操作の型のファイルを移すだけで済む。

- 今の `calendar.App` の 10 の操作は、`Deps` の一部だけを使う。例は、`RetryExport` と `ListExportIssues` が `Exports` だけ、`ServiceAccount` が `Accounts` だけを使う。
- 操作の型は自分の依存だけを持つので、`retry_export.go` を `calendarexport` に、`import.go` と `preview.go` を `calendarimport` に移せる。`App` のままだと、`Deps` を 4 つに分け直す。
- 4 つのパッケージが使う補助（`source`、`requireSource`、`active`）は、依存を引数で受ける関数なので、`calendar` から公開して使える。`App` のメソッドのままだと、ほかのパッケージから呼べない。
- `AcceptExport` は、適用の規則の型 `applier` を使う。書き出しの確認の解決（`calendarexport`）が同期の適用の規則（`calendarsync`）を使う向きになる。#611 の ADR で、2 つのパッケージの間の向きを決める。

予定の書き込みと読み取りのモデルを分けるときも、操作の型のファイルを移すだけで済む。

- `schedule` の読み取りの操作（`Get`、`GetRecurring`、`List`、`ListTypes`）は、書き込みの操作と別の型なので、`scheduleview` に移せる。書き込みの操作の型は変わらない。
- 読み取りと書き込みの両方が使う権限の確認（`requireScheduleAccess`）は、職員のリーダーを引数で受ける関数にするので、`schedule` から公開して `scheduleview` が使える。
- `httpapi` の `ScheduleApp` は関数のフィールドの struct なので、`schedule` と `scheduleview` の 2 つのパッケージの操作を 1 つの束に入れられる。ハンドラは呼び先のパッケージを知らない。

正本のモードと事業所のロックを `organization` に置くときは、書き込みの操作の型にだけ依存を足す。

- 予定を書く操作は、事業所を共有のロックで読むリポジトリと、モードの規則の関数を使う。読み取りの操作の型は変わらない。`App` のままだと、`Deps` に足した依存に全ての操作が触れる。
- `staff` の `locked` のような、事業所をロックする補助は、ロックのリポジトリを引数で受ける関数にする。移す先が `organization` になっても、補助の引数の型を替えるだけで済む。

組み立てを `internal/assemble` に移し、API と Worker が共有するときも成り立つ。

- 操作の型と常駐の処理は `httpapi` に依存しないので、`assemble` は API の束と、Worker の `Exporter` と `Syncer` を同じリポジトリから作れる。
- Worker は使う型だけを作る。`staff` のように ID ブローカーの依存を持つ機能を作らずに済み、#593 の「Worker の設定は DB と Google カレンダーに必要なものに限る」に合う。
- `assemble` の関数は、操作ごとではなく `httpapi` の `<機能>App` ごとに 1 つ置く（`staffApp(repos) httpapi.StaffApp`）。操作を足すと、その関数の 1 行が増える。このため、機能のパッケージに束ねる型を足さない。
- 1 回だけ処理して終わる Worker の実行は、今の `Exporter.ExportDue` と `Syncer.SyncDue` で足りる。
- `calendarsync` の適用の規則（`ProjectionApplier` と `ReconcileApplier`）は、`Syncer` がフィールドで受け、`assemble` が渡す。正本のモードごとの規則を、`Syncer` を変えずに足せる。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 操作ごとの型と `Do` にし、束は `httpapi` の関数のフィールドの struct が持つ | 操作の依存をフィールドとコンストラクタから読める。ハンドラの呼び出しと `httpapi` のフェイクを変えずに済む | 組み立ての場所が長くなる。関数のフィールドを入れ忘れると、呼び出しで panic する |
| 操作ごとの型にし、機能のパッケージに依存を持たない束（Wild Workouts の `Application` の `Commands` と `Queries`）を置く | 機能の操作の一覧を 1 つの型から読める | 束が操作の具体の型を持つと、`httpapi` のテストがフェイクを渡せない。フェイクを渡すには、操作ごとにインターフェースを足す |
| `App` を残し、操作ごとの依存を doc コメントに書く | 変更が無い | 依存をコンパイラで確認できず、コメントが実装とずれる。テストに `Deps` の全体が要るまま残る |
| 操作ごとの型にし、依存を `<操作>Deps` の struct で受ける | 依存の多い操作（`Create`）でも引数が並ばない | 操作ごとに型が 2 つになる。フィールドの入れ忘れがコンパイルで分からない |

- 出典: [Three Dots Labs: Basic CQRS in Go](https://threedots.tech/post/basic-cqrs-in-go/)

## Consequences

### Positive

- 読み手は、操作の型のフィールドとコンストラクタの引数から、操作が使う依存を読める。
- 1 つの操作のテストは、その操作が使う依存だけを用意する。
- 補助が使う依存を、補助の関数の引数から読める。

### Negative

- 予定の API の 6 つの機能と `access`、`cmd/api`、`httpapi`、テストを直す。ID ブローカーの `login` と `internalapi` も直す。
- 依存の多い操作は、コンストラクタの引数が 9 個ほど並ぶ。
- 機能の操作の一覧は、パッケージの操作のファイルの一覧と、`httpapi` の `<機能>App` から読む。
