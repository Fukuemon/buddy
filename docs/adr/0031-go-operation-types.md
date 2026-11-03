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

## Decision

機能のパッケージの操作を、使う依存だけをフィールドに持つ操作ごとの型にし、`App` と `Deps` をやめる。  
全ての依存を知るのは、実行単位ごとの組み立ての場所（`cmd/<実行単位>/main.go`。今は予定の API の `cmd/api` だけ）にする。  
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

この形が、予定の API に控えている 2 つの変更の後も成り立つかを、今のコードで確認した。

#593 は、Google カレンダーの書き出しと同期を、予定の API のプロセスから Worker の実行単位に分ける。

- 操作の型と常駐の処理は機能のパッケージに置き、`httpapi` に依存しないので、API と Worker の 2 つの `cmd` から同じ型を作れる。
- Worker の組み立ては、使う型だけを作る。
  - `App` のままだと、Worker が `calendar` の 1 つの処理を使うにも `calendar.Deps` の全体を作る。
  - `staff` のように ID ブローカーの依存を持つ機能の `App` を、Worker が作らずに済む。#593 の「Worker の設定は DB と Google カレンダーに必要なものに限る」に合う。
- 1 回だけ処理して終わる実行は、今の `Exporter.ExportDue` と `Syncer.SyncDue` で足りる。繰り返す `Run` は、常駐の実行単位だけが呼ぶ。
- 2 つの `cmd` で、リポジトリと `tx` の作り方が重なる。重なりは 1 行ずつの `postgres.New...` なので、共通の組み立てのパッケージは足さない。

#594 は、Google カレンダーを予定の正本にする期間に、buddy の予定を参照のモデルにし、予定の API からの書き込みを止める。

- 読み取りの操作（`schedule` の `Get`、`List`）と書き込みの操作（`Create`、`Cancel`）は別の型なので、読み取りの操作の依存だけを参照のモデルのリーダーに替えられる。書き込みの操作の型は変わらない。
- 正本の状態で書き込みを止める確認は、書き込みの操作の型にだけ依存を足す。`App` のままだと、`Deps` に足した依存に全ての操作が触れる。
- 同期の「変更を取る」と「取った変更を当てる規則」を分けるときは、`Syncer` が当てる規則の型（今の `applier`）をフィールドで受け、正本の状態ごとの規則を組み立ての場所で選べる。
- 参照のモデルのテーブル、リーダーのインターフェースの配置先、読み取りの DB を足すかは、#594 の ADR で決める。ADR-0030 の「読み取りの DB は足さない」を変えるときも、その ADR で置き換える。

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
