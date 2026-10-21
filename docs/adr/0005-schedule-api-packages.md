# ADR-0005: schedule-api の規則と手順を機能ごとのパッケージにまとめる

## Status

承認

## Context

schedule-api は、domain、usecase、infrastructure、presentation の層でパッケージを分けていた。1 つの機能の規則（domain）と手順（usecase）が別のパッケージにあり、usecase は全ての機能を 1 つのパッケージに持っていた。

- 職員の役職を変える操作（PR #67）は、手で書いた Go の 9 ファイルに触れた。domain、usecase、mysql、handler の 4 つのパッケージと、それぞれのテストにまたがる。
- usecase のテストの偽物は、全てのリポジトリを 1 つのメモリ上の store に持っていた。
- リポジトリのインターフェイスは、使う側の usecase ではなく domain にあった。
- DB の操作は sqlc、HTTP は oapi-codegen の strict server が、それぞれ 1 つのパッケージに生成する。

## Decision

規則と手順を、機能ごとのパッケージ（`organization`、`staff`、`patient`、`visit`、`schedule`）にまとめる。各パッケージは、エンティティ、値の検証、リポジトリのインターフェイス、操作（`Service`）を持つ。DB と HTTP のアダプタ（`mysql`、`httpapi`）は、生成物が 1 つのパッケージなので、機能に分けずに 1 つずつ置く。

操作を `Service` と呼び、ほかの機能のリポジトリを束ねて受ける判断は、[ADR-0010](0010-schedule-api-usecase-boundaries.md) で置き換えた。

- 認証と、パスが指す資源の事業所の確認は、全ての機能を読むので `access` に置く。職員（`auth.Principal`）と予定の判定は `auth` に置き、機能のパッケージから import できるようにする。`auth` に認証の手順を置くと、`schedule` と `auth` が互いを import する。
- 機能のパッケージのテストが使うメモリ上のリポジトリは、`inmem` に置いて共有する。本番のコードからは import しない。
- 共通の誤り、並べ替え、`Transactor`、`IDGenerator` は `domain` に残す。
  - この判断は [ADR-0010](0010-schedule-api-usecase-boundaries.md) で置き換えた。

Go の module の配置の指針は、サーバーのコードを `internal/` に置くことだけを勧め、層や `pkg/` を求めない。
- Organizing a Go module: [Server project](https://go.dev/doc/modules/layout#server-project)

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 規則と手順を機能のパッケージにまとめ、DB と HTTP のアダプタは 1 つずつ置く | 1 つの機能の規則と手順が 1 か所にある。テストの偽物を機能ごとに使える | 機能を足すときは、なお `mysql`、`httpapi`、SQL、`openapi.yaml` に触れる |
| 層のまま変えない | 移す費用が無い | 1 つの機能の変更が 4 つのパッケージにまたがり、usecase が大きくなり続ける |
| DB と HTTP のアダプタも機能ごとに分ける | 1 つの機能が 1 つのディレクトリに収まる | sqlc の生成物が機能ごとに重なる。strict server のインターフェイスを組み立て直す必要がある。MySQL のテストのコンテナが機能の数だけ立つ |

## Consequences

### Positive

- 機能の規則と手順を、1 つのパッケージで読める。
- リポジトリのインターフェイスが、使う側の `Service` と同じパッケージにある。

### Negative

- `patient` が `visit` を使うので、`visit` は利用者を `patient.Repository` ではなく関数（`visit.PatientFinder`）で受ける。
- 依存の向きは lint で確かめず、レビューで確かめる。
