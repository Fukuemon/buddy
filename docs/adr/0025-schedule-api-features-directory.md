# ADR-0025: 予定の API の機能のパッケージを internal/features/ に置き、usecase のメソッドを操作ごとのファイルに分ける

## Status

承認

## Context

予定の API は、規則と手順を 6 つの機能のパッケージ（`organization`、`staff`、`patient`、`visit`、`schedule`、`calendar`）にまとめている。パッケージの中は、usecase、規則の関数、集約の単位のリポジトリに分けている。

- ADR-0005: [予定の API の規則と手順を機能ごとのパッケージにまとめる](0005-schedule-api-packages.md)
- ADR-0010: [予定の API の機能のパッケージで、手順を usecase、規則を関数、リポジトリを集約の単位に分ける](0010-schedule-api-usecase-boundaries.md)

この構成のまま、次の事実がある。

- 機能のパッケージは、アダプタ（`postgres`、`httpapi`、`gcal`）と共通のパッケージ（`apperr`、`tx`、`kernel`、`civil`）と一緒に、`internal/` の直下に並ぶ。ディレクトリの一覧から、どれが機能かを読み取れない。
- 1 つの機能の全部の操作が、1 つの `usecase.go` にある。`calendar` は 789 行で公開の操作が 10、`staff` は 651 行で 11、`schedule` は 479 行で 9、`patient` は 297 行で 7 ある。
- `organization` は 218 行で公開の操作が 14 あり、部署、チーム、役職の Get、List、Create、Update が 1 つ平均 15 行ほどである。`visit` は 138 行で公開の操作が 2 つである。
- `principal`（リクエストを送った職員）は `organization` と `staff` に依存し、`schedule`、`calendar`、`access`、`httpapi`、`cmd` から使われる。リポジトリと usecase を持たない。
- 照合の API（`services/receipt`）は、照合という 1 つの機能を段ごとのパッケージに分け、usecase にあたる `check.Run` の 1 つの関数を HTTP のハンドラから呼ぶ。
- ID ブローカー（`services/broker`）は、職員のアカウントの 1 つの機能を、ログインの画面（`login`）と内部の API（`internalapi`）で扱う。
- 依存の向きは lint で確認せず、レビューで確認している。

この ADR は、次の 2 つの判断を置き換える。機能のパッケージにまとめる判断、DB と HTTP のアダプタを 1 つずつ置く判断、`Usecase` 型を機能ごとに 1 つ持つ判断は保つ。

- ADR-0005 の Decision のうち、機能のパッケージを `internal/` の直下に置く判断
- ADR-0010 の Decision のうち、手順のファイルを `usecase.go` の 1 つにする判断

## Decision

予定の API の 6 つの機能のパッケージを `internal/features/` に移し、`calendar`、`staff`、`schedule`、`patient` の usecase のメソッドを、操作ごとのファイルに分ける。

- 配置: 機能のパッケージを `internal/features/<機能>/` に置く。アダプタ、共通のパッケージ、`access`、`config`、`principal`、`inmem` は `internal/` の直下に残す。パッケージの名前は変えない。
  - Go の module の配置の指針は、サーバーのコードを `internal/` に置くことだけを勧め、その下の分け方を決めていない。
    - Organizing a Go module: [Server project](https://go.dev/doc/modules/layout#server-project)
- `principal`: `features/` の外に置く。`principal` はリポジトリと usecase を持たず、`access` と `httpapi` が認証の後に作る、リクエストの文脈である。`features/` に置くと、機能の一覧に機能でないパッケージが並ぶ。
  - 依存は今のまま、`organization` と `staff` から `principal`、`principal` から `schedule`、`calendar`、`access`、`httpapi`、`cmd` の向きにする。
- usecase のファイル: `Usecase` 型、`Deps`、`NewUsecase` は機能ごとに 1 つのまま `usecase.go` に置き、公開のメソッドを操作の名前のファイル（`cancel.go`、`retire.go` など）に移す。テストも操作ごとのファイルに分ける。
  - 複数の操作が使う非公開の補助の関数は `usecase.go` に残し、1 つの操作だけが使う補助の関数はその操作のファイルに移す。
  - Go は、同じパッケージの型のメソッドを、パッケージの中のどのファイルにも置ける。呼ぶ側の `httpapi` と `cmd/api` は変わらない。
    - The Go Programming Language Specification: [Method declarations](https://go.dev/ref/spec#Method_declarations)
  - 操作が 2 つ以下の機能と、全部の操作が Get、List、Create、Update で 1 つが 20 行に収まる機能は、`usecase.go` の 1 つにする。今は `organization` と `visit` が当たる。
- 新しい API: 機能が 2 つ以上あるときは、`internal/features/<機能>/` に置く。機能が 1 つの API は、`features/` を作らない。
  - 照合の API は、照合の 1 つの機能を段に分けた構成なので、`features/` を作らない。
  - ID ブローカーは、職員のアカウントの 1 つの機能なので、`features/` を作らない。
- 依存の向き: `features/` の下と外でパスを分けると、ファイルのパターンで規則を書ける。golangci-lint の depguard で、codebase.md の向きを確認する。
  - depguard: [Config](https://github.com/OpenPeeDeeP/depguard#config)

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 機能のパッケージを `internal/features/` に置き、`Usecase` 型を保ったまま、メソッドを操作ごとのファイルに分ける | ディレクトリの一覧で機能を読み取れる。1 つの操作を 1 つのファイルで読める。`httpapi` と `cmd/api` は import のパスのほかは変わらない | 移すときに、機能のパッケージを import する全部のファイルと文書のパスを変える |
| `internal/` の直下のまま、usecase のファイルだけを分ける | import のパスが変わらない | 機能とアダプタと共通のパッケージが同じ階層に並んだままで、depguard の規則を機能ごとに列挙する |
| `Usecase` 型を操作ごとの型に分ける | 操作が使う依存だけを型が持つ | `Deps`、`NewUsecase`、`cmd/api` の組み立てと、`httpapi` の受け取る型を全部直す。ファイルを分けるだけで操作ごとに読める目的は満たせる |
| `principal` を `features/principal/` に置く | 職員を表す型と同じ階層に置ける | 機能の一覧に、リポジトリと usecase を持たないパッケージが並ぶ |

## Consequences

### Positive

- 予定の API の機能を、`internal/features/` の一覧で読み取れる。
- 1 つの操作を、その操作の名前のファイルだけを開いて読める。
- 依存の向きを、`features/` の下と外のパスのパターンで lint に書ける。

### Negative

- 機能のパッケージを import する Go のファイルと、パスを書いた文書（context、Design Doc、画面仕様書、ドキュメントサイトの設定）を一度に変える。
- `organization` と `visit` だけが `usecase.go` の 1 つのままで、機能によってファイルの分け方が違う。
