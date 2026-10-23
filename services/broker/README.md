# 認証のブローカー

Ory Hydra の login and consent app として動き、事業所ごとの上流の IdP の前に立って職員の身元を持つサービス。  
今は、設定と上流の IdP の設定の読み込み、ヘルスチェック、職員の身元の DB のマイグレーションだけを持つ。ログイン、同意、ログアウトの画面と内部の API は、後の変更で足す。  
責務と流れは [DesignDoc.md](DesignDoc.md) にある。

## セットアップ

Go と golangci-lint のバージョンは、リポジトリのルートの `mise.toml` にある。

```sh
mise install go golangci-lint
```

## 起動する

ブローカーの DB には、ルートの compose の PostgreSQL に、別のデータベースを作って使う。Hydra と予定の API の DB とは分ける。

```sh
docker compose up -d --wait postgres
docker compose exec postgres createdb -U buddy broker

export DB_PORT=15432 DB_USER=buddy DB_PASSWORD=buddy-dev DB_NAME=broker
go run ./cmd/migrate up

export PORT=8100 HYDRA_ADMIN_URL=http://127.0.0.1:4445 \
  UPSTREAM_IDPS_FILE=upstream-idps.example.json \
  UPSTREAM_IDP_CLIENT_SECRETS_FILE=upstream-idp-client-secrets.example.json
go run ./cmd/broker
```

`curl localhost:8100/readyz` が `{"status":"ok"}` を返せば、起動できている。`/readyz` は DB に届かなければ 503 を返し、`/healthz` は DB を確かめない。  
ポートは、compose の予定の API（8080）と照合の API（8090）と重ならない 8100 にしている。

設定は環境変数で渡す。

- `PORT`: 待ち受けるポート。デフォルトは `8080`
- `LOG_LEVEL`: `debug`、`info`、`warn`、`error` のいずれか。デフォルトは `info`
- `DB_HOST`、`DB_PORT`: ブローカーの DB の接続先。デフォルトは `localhost` と `5432`
- `DB_USER`、`DB_PASSWORD`、`DB_NAME`: 必須。ブローカーの DB の利用者、パスワード、データベース
- `HYDRA_ADMIN_URL`: 必須。Hydra の admin API の URL
- `UPSTREAM_IDPS_FILE`: 必須。組織の ID と、上流の IdP の issuer と client ID の対応（JSON）のパス。形は [upstream-idps.example.json](upstream-idps.example.json) にある
- `UPSTREAM_IDP_CLIENT_SECRETS_FILE`: 必須。組織の ID と、上流の IdP の client secret の対応（JSON）のパス。シークレットとして渡す。形は [upstream-idp-client-secrets.example.json](upstream-idp-client-secrets.example.json) にある

上流の IdP の設定は、待ち受けを始める前に読む。次のいずれかでは、ブローカーは起動せず、終了コード 1 で終わる。

- 2 つのファイルのどちらかを読めないか、JSON の形が違うか、知らないキーがある
- 上流の IdP の一覧が空である
- `org_id`、`issuer`、`client_id` のいずれかが空であるか、`issuer` が http か https の URL でない
- `org_id` が重なっている
- 上流の IdP の client secret が無いか、上流の IdP の設定に無い組織の client secret がある

2 つの例のファイルの値は、開発用のダミーである。issuer は、compose の開発用の IdP（mock-oauth2-server）の 2 つの事業所（`/office-a`、`/office-b`）を指す。

コンテナで起動するときは、このディレクトリで次を実行する。ビルドの文脈はリポジトリの直下である（`packages/go` を読むため）。  
イメージは、ブローカーの `broker` とマイグレーションの `migrate` を `/usr/local/bin` に持つ。

```sh
docker build -f Dockerfile -t broker ../..
docker run --rm broker migrate up   # DB の環境変数を -e で渡す
```

## テストとチェック

`services/broker` で実行する。

```sh
go test ./...
go vet ./...
golangci-lint run
```

テストと lint は `GOWORK=off` を付けて流す。  
理由は [CONTRIBUTING.md](../../CONTRIBUTING.md) の「開発環境のセットアップ」にある。

`internal/postgres` のテストは、testcontainers で PostgreSQL のコンテナを起動し、マイグレーションを当ててテーブルの制約を確かめる。Docker が無い環境では `go test -short ./...` で飛ばす。

## 文書

- [DesignDoc.md](DesignDoc.md): ブローカーの責務、Hydra との分担、ログイン、職員の登録と停止、ログアウトの流れ
- ADR-0016: [OIDC のブローカーを、Ory Hydra と、自作の login and consent app で作る](../../docs/adr/0016-id-broker-hydra.md)
- ADR-0017: [職員の身元をブローカーが持ち、権限と業務のデータは予定の API が持つ](../../docs/adr/0017-identity-boundary.md)
