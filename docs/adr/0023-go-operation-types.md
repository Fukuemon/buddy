# ADR-0023: Go の API の操作を、使う依存だけを持つ操作ごとの型にする

## Status

承認

## Context

Go の API は 3 つある。予定の API（`services/schedule`）、照合の API（`services/receipt`）、ID ブローカー（`services/broker`）である。

- 予定の API は、組織と人、訪問と予定、外部のカレンダーの、複数の機能を持つ。
- 照合の API は、照合という 1 つの機能を段（読み込み、正規化、対の作成、判定）に分け、usecase にあたる `check.Run` の 1 つの関数を HTTP のハンドラから呼ぶ。
- ID ブローカーは、職員のアカウントの 1 つの機能を、ログインの画面（`login`）と内部の API（`internalapi`）で扱う。ハンドラが手順を持つ。

決定に関わる制約と事実は、次のとおり。

- DB の操作は sqlc、HTTP は oapi-codegen の strict server が、それぞれ 1 つのパッケージに生成する。
  - 予定の API と照合の API の `httpapi` は、生成した `StrictServerInterface` を 1 つの型で実装するので、ハンドラを操作ごとの型に分けられない。
- 予定の API の規則と手順は、機能ごとのパッケージに置き、全ての依存は組み立ての場所（`internal/assemble`）で組み立てる。
  - ADR-0020: [予定の API を機能ごとのパッケージに分ける](0020-schedule-api-packages.md)

## Decision

機能のパッケージの操作を、使う依存だけをフィールドに持つ操作ごとの型にする。全ての依存を知るのは、組み立ての場所（`internal/assemble`）だけにする。

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

- 型の名前は、operationId の動詞から決まる操作の名前にし、操作のファイル（`leave.go`）に置く。
  - 型の名前が、同じパッケージの集約や読み取りのモデルの型と重なるときは、集約や読み取りのモデルの型を名詞に改める。
- コンストラクタは `New<操作>` にし、使う依存を引数で受け、値を返す。nil のときにデフォルトを入れる依存（`Now` など）は、その依存を受けるコンストラクタでデフォルトを入れる。
- 実行のメソッドの名前は `Do` にする。型の名前が動詞を持つので、メソッドの名前は動詞を重ねない。`Handle` はファイルの名前の役割の語の `handler` と紛れ、`Run` は照合の API の `check.Run` が使う。
- 複数の操作が使う補助は、使う依存を引数で受けるパッケージの関数にし、`<まとまり>_app.go` に置く。
  - 例は `func locked(ctx context.Context, staff Repository, id string) (Detail, error)`。
  - 既に自分の依存をフィールドに持つ補助の型（`calendarsync` の適用の規則）は、型のまま残し、使う操作の型と常駐の処理がフィールドに持つ。
- 操作の型の doc コメントには、操作の契約を書く。

操作の型を束ねる型は、機能のパッケージに置かない。束は、使う側の `httpapi` が持つ。

- `httpapi` の `<機能>App`（`StaffApp` など）は、操作と同じ名前とシグネチャの関数のフィールドを持つ struct にする。`<機能>App` の束は `Apps` と名付ける。
- 組み立ての場所は、操作の型の `Do` をメソッド値で渡す（`Leave: staff.NewLeave(...).Do`）。`assemble` の関数は、操作ごとではなく `httpapi` の `<機能>App` ごとに 1 つ置く（`staffApp(repos) httpapi.StaffApp`）。
  - Worker は、使う型だけを作る。ID ブローカーの依存を持つ機能（`staff`）を作らない。
- ハンドラは `s.u.Staff.Leave(ctx, id, in)` のように呼び、呼び先のパッケージを知らない。
- `httpapi` のテストは、フェイクのメソッド値を struct に入れて渡す。

常駐の処理と、操作の型以外で操作を持つ型（`calendarexport` の `Exporter`、`Outbox`、`calendarsync` の `Syncer`、`visit` の `Writer`）は、1 つの型が 1 つの役割を持つ型にする。

- これらの型は、同じ集約のリポジトリと規則を使うので、同じ機能のパッケージに置く。
- 常駐と 1 回の繰り返しの配置先は ADR-0031 にある。
  - ADR-0031: [Google カレンダーの書き出しと同期を、予定の API と同じイメージの Worker のコマンドで役割ごとに動かし、繰り返しを Worker のコマンドに集める](0031-calendar-worker.md)

照合の API と ID ブローカーには、次のとおり当てる。

- 照合の API の操作（`check.Run`）は、予定のデータソースを引数で受けるパッケージの関数のままにする。`httpapi` の `server` は、生成した `StrictServerInterface` を実装するアダプタのままにする。
- ID ブローカーの `login` と `internalapi` は、手順の型を足さず、ハンドラを操作として扱う。
  - パスごとのハンドラを、使う依存だけをフィールドに持つ、パッケージの外に出さない型にし、`http.Handler` を実装させる。実行のメソッドは `ServeHTTP` にする。
  - 型の名前は、ハンドラのメソッドの名前（`submitEmail`、`register`）にし、ハンドラのファイル（`login_handler.go`、`staff_handler.go`）に置く。
  - 複数のハンドラが使う補助（`login` の `accept`、`fail`、`setCookie`、`internalapi` の `revoke`、`writeError`）は、使う依存を引数で受ける関数にする。
  - 組み立ての場所は、パッケージの名前のファイルの `NewHandler` にし、`Config` を受けてハンドラの型を作る。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 操作を、使う依存だけをフィールドに持つ操作ごとの型にする | 操作の依存をフィールドから読める | 組み立ての場所が長くなる |
| 機能のパッケージに、操作を束ねる型（`App`）を置き、操作をそのメソッドにする | 機能の操作の一覧を 1 つの型から読める | どの操作からも全ての依存に触れ、操作のシグネチャから依存を読めない。1 つの操作のテストにも全ての依存を用意する |
| 操作ごとの型にし、依存を `<操作>Deps` の struct で受ける | 依存の多い操作でも引数が並ばない | 操作ごとに型が 2 つになる。フィールドの入れ忘れがコンパイルで分からない |
| 操作ごとの型にし、機能のパッケージに束（Wild Workouts の `Application`）を置く | 機能の操作の一覧を 1 つの型から読める | 束が操作の具体の型を持つと、`httpapi` のテストがフェイクを渡せない |

## Consequences

### Positive

- 読み手は、操作の型のフィールドとコンストラクタの引数から、操作が使う依存を読める。1 つの操作のテストは、その操作が使う依存だけを用意する。

### Negative

- 依存の多い操作は、コンストラクタの引数が 9 個ほど並ぶ。関数のフィールドを入れ忘れると、呼び出しで panic する。
- 機能の操作の一覧は、パッケージの操作のファイルの一覧と、`httpapi` の `<機能>App` から読む。
