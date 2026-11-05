# ADR-0007: 2 つの Go の API が共有するコードを、別の module にまとめる

## Status

承認

## Context

予定の API と照合の API は、別の Go の module（`apps/schedule-api/go.mod`、`apps/receipt-api/go.mod`）である。module が別なので、Go の `internal/` で共有できず、次のコードをそれぞれにコピーしていた。

- access token の検証（`internal/oidc/oidc.go`）。2 つのコピーは、返す主張の型だけが違う
- テストのフェイクの Issuer（`internal/oidc/oidctest`）。2 つのコピーは同じ
- イメージのヘルスチェック（`cmd/api/healthcheck.go`）。2 つのコピーは同じ

トークンの検証は安全に関わる。片方だけを直すと、2 つの API が受け入れるトークンがずれる。

2 つの API は、別のイメージとして別にデプロイし、HTTP の API で web とつながる。API 同士は呼び合わない。依存のバージョンと Go のバージョンは、API ごとに上げたい。リポジトリは private である。

## Decision

共有するコードを、別の module `packages/go`（`github.com/Fukuemon/buddy/packages/go`）に置く。2 つの API は自分の `go.mod` を保ち、`require` と `replace github.com/Fukuemon/buddy/packages/go => ../../packages/go` で読む。

- 依存のバージョンと Go のバージョンは、API ごとに決めたままにする。共有の module の依存は、各 API の `go.mod` で、高い方のバージョンに解決される。
- `replace` はローカルのディレクトリを指すので、Docker のビルドの文脈をリポジトリの直下にする。Dockerfile ごとの `.dockerignore`（`Dockerfile.dockerignore`）で、文脈を自分のアプリと `packages/go` に絞る。
- 共有の module の変更は、次のビルドで 2 つの API に同時に入る。トークンの検証は、2 つの API でずれないことを求めるので、この動きを選ぶ。
  - この判断のうち、共有するものを基盤のコードとする前提は ADR-0020 で置き換えた。2 つの API でずれてはならない業務の規則（サービスの規則）も共有する。
    - ADR-0020: [サービスの規則を packages/go/servicecode に置き、予定の API のサービスコードを visit から servicecode の機能に分ける](0020-service-code-rules.md)
- API 同士は、互いのパッケージを import しない。2 つの API が共有するのは `packages/go` だけにする。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 共有するコードを別の module にし、各 API が `replace` で読む | 依存と Go のバージョンを API ごとに保てる。トークンの検証が 1 か所になる | module が 3 つになり、lint とテストを 3 回流す。Docker のビルドの文脈が直下になる |
| 2 つの API を 1 つの module にし、直下の `internal/` で共有する | module が 1 つで、lint、テスト、依存の更新が 1 回で済む | 一方の API のために依存か Go のバージョンを上げると、もう一方も変わる |
| 共有の module にタグを付け、各 API がタグのバージョンで読む | API ごとに共有のコードのバージョンを固定できる | 直すたびにタグと 2 つの `go.mod` を上げる。private のリポジトリなので、Docker の中で GitHub の認証が要る |
| コピーのまま | 移す費用が無い | トークンの検証を片方だけ直すと、2 つの API の検証がずれる |

## Consequences

### Positive

- トークンの検証、テストのフェイクの Issuer、ヘルスチェックを 1 か所で直せる。
- 2 つの API の依存と Go のバージョンは、互いに縛らない。

### Negative

- 共有の module を変えると、2 つの API の両方で確認する必要がある。
- エディタで 3 つの module を同時に読むには、追跡しない `go.work` をローカルで作る。
