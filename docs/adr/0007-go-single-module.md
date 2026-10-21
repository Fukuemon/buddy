# ADR-0007: 2 つの Go の API を 1 つの module にまとめ、共有するコードを直下の internal に置く

## Status

承認

## Context

schedule-api と receipt-api は、別の Go の module だった（`apps/schedule-api/go.mod`、`apps/receipt-api/go.mod`）。module が別なので、Go の `internal/` で共有できず、次のコードをそれぞれに写していた。

- access token の検証（`internal/oidc/oidc.go`）。2 つの写しは、返す主張の型だけが違う
- テストの偽物の発行者（`internal/oidc/oidctest`）。2 つの写しは同じ
- イメージのヘルスチェック（`cmd/api/healthcheck.go`）

トークンの検証は安全に関わる。片方だけを直すと、2 つの API が受け入れるトークンがずれる。

2 つの API は、別のイメージとして別にデプロイし、HTTP の API で web とつながる。API 同士は呼び合わない。

## Decision

リポジトリの直下に `go.mod`（`module github.com/Fukuemon/buddy`）を 1 つ置き、2 つの API を同じ module にする。2 つの API が共有するコードは、直下の `internal/` に置く。

- 今の module のパスは `github.com/Fukuemon/buddy/apps/<名前>` で、ディレクトリと一致する。1 つにまとめても、Go の import のパスは変わらない。
- Docker のビルドの文脈は、web と同じくリポジトリの直下にする。Dockerfile ごとの `.dockerignore`（`Dockerfile.dockerignore`）で、文脈を自分のアプリと直下の Go のファイルに絞る。
- API 同士は、互いのパッケージを import しない。共有は直下の `internal/` だけにする。
- 共有を `pkg/` に置かない。Go の module の配置の指針は、module の中の共有を `internal/` に置くことを勧め、`pkg/` を求めない。
  - Organizing a Go module: [Server project](https://go.dev/doc/modules/layout#server-project)

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 1 つの module にまとめ、直下の `internal/` で共有する | Go の慣習のまま共有できる。module が 1 つなので、lint、テスト、依存の更新が 1 回で済む | 2 つの API の依存のバージョンがそろう。Docker のビルドの文脈が直下になる |
| 共有する部分を別の module にする（`replace` で読む） | 2 つの API の `go.mod` を変えない | module が 3 つになる。`replace` のために、Docker のビルドの文脈を直下にする必要は残る |
| 写しのまま | 移す費用が無い | トークンの検証を片方だけ直すと、2 つの API の検証がずれる |

## Consequences

### Positive

- トークンの検証、テストの偽物の発行者、ヘルスチェックを 1 か所で直せる。
- エディタは、`go.work` を作らずに 2 つの API を読める。

### Negative

- 一方の API の依存を上げると、もう一方の API も同じバージョンになる。
- 直下の `go.mod` と `internal/` を変えると、2 つの API のイメージが両方とも作り直しになる。
