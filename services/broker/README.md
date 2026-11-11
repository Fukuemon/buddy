# ID ブローカー

Ory Hydra の login and consent app として動くサービス。  
ブローカーは、事業所ごとの上流の IdP にログインを求め、職員の身元を持つ。  
責務と流れは [DesignDoc.md](DesignDoc.md) にある。

## Setup

ツールは、[CONTRIBUTING.md](../../CONTRIBUTING.md#setup) の Setup の手順で入れる。

## Configuration

設定は環境変数で渡す。

- `PORT`: ログイン、同意、ログアウトの画面とヘルスチェックを待ち受けるポート。
  - デフォルトは `8080`。
- `INTERNAL_PORT`: 内部の API と `oauth2.token_hook` とヘルスチェックを待ち受けるポート。
  - `PORT` と違う値にし、ブラウザに開かない。
  - デフォルトは `8081`。
- `LOG_LEVEL`: `debug`、`info`、`warn`、`error` のいずれか。
  - デフォルトは `info`。
- `DB_HOST`、`DB_PORT`: ブローカーの DB の接続先。
  - デフォルトは `localhost` と `5432`。
- `DB_USER`、`DB_PASSWORD`、`DB_NAME`: ブローカーの DB の利用者、パスワード、データベース。
  - 必須。
- `HYDRA_ADMIN_URL`: Hydra の admin API の URL。
  - 必須。
- `UPSTREAM_IDPS_FILE`: 組織の ID と、上流の IdP の issuer と client ID の対応を書いた JSON のパス。
  - 必須。
  - 形は [upstream-idps.example.json](upstream-idps.example.json) にある。
- `PUBLIC_URL`: ブラウザが開くブローカーの URL。
  - 必須。
  - ブローカーは、この URL から上流の IdP のコールバックの URL（`<PUBLIC_URL>/login/callback`）を作る。
  - https なら、ブローカーはログインの途中の cookie に Secure を付ける。
- `UPSTREAM_IDP_BROWSER_ORIGIN`: 上流の IdP の認可の画面へリダイレクトするときに、URL の scheme とホストを替える origin。
  - ブローカーが discovery の文書を読む issuer にブラウザが届かないローカル環境でだけ渡す。
- `UPSTREAM_IDP_CLIENT_SECRETS_FILE`: 組織の ID と、上流の IdP の client secret の対応を書いた JSON のパス。
  - 必須。
  - シークレットとして渡す。
  - 形は [upstream-idp-client-secrets.example.json](upstream-idp-client-secrets.example.json) にある。
- `CLIENT_IP_HEADER`: ログインの試行を数える送信元の IP アドレスを読む、リバースプロキシが付けるヘッダーの名前。
  - ブローカーはヘッダーの最後の値を使う。ヘッダーが無ければ、接続の相手のアドレスを使う。
  - ブローカーにプロキシを通らずに届かない構成でだけ渡す。
- `AUTO_CONSENT_CLIENTS`: 同意の画面を出さずに accept するクライアントの ID を、カンマで区切った値。
  - デフォルトは `web`。
  - ほかのクライアントの同意は reject する。
- `HYDRA_ISSUER`: Hydra のトークンの `iss`。
  - 必須。
  - 内部の API は、`<HYDRA_ISSUER>/.well-known/openid-configuration` の JWKS で、予定の API の client credentials の access token を検証する。
- `INTERNAL_API_AUDIENCE`: 内部の API が access token の `aud` に求める値。
  - デフォルトは `broker`。
- `INTERNAL_API_CLIENTS`: 内部の API を呼んでよいクライアントの ID を、カンマで区切った値。
  - デフォルトは `schedule`。
  - ブローカーは、access token の `sub` と、token_hook が通す client credentials の要求の `client_id` を、この値と照合する。
- `INTERNAL_API_ONBOARDING_CLIENTS`: 内部の API のうち、職員の登録、有効化、登録の途中の職員の削除だけを呼んでよいクライアントの ID を、カンマで区切った値。
  - デフォルトは `schedule-ops`。予定の API の運営用の CLI が、事業所の最初のマネージャーを登録するのに使う。
  - 休職、復職、退職は、403 で拒む。
  - `INTERNAL_API_CLIENTS` と同じ ID を入れると、ブローカーは起動しない。
- `TOKEN_HOOK_KEY`: Hydra が `oauth2.token_hook` を呼ぶときに、ヘッダー `Token-Hook-Key` に入れる値。前後の空白を除いて 32 バイト以上にする。
  - 必須。
  - シークレットとして渡し、Hydra の `oauth2.token_hook.auth` と同じ値にする。
- `LOGIN_COOKIE_KEYS`: ログインの途中の cookie（`broker_login`）に HMAC-SHA256 で署名する鍵を、カンマで区切った値。鍵は前後の空白を除いて 32 バイト以上にする。
  - 必須。
  - シークレットとして渡す。
  - 先頭の鍵で署名し、全ての鍵で検証する。鍵を替えるときは、新しい鍵を先頭に足し、古い鍵を 10 分より長く残してから外す。

`oauth2.token_hook` が職員を DB から読むのを待つ上限は 2 秒で、環境変数では変えない。  
上限を過ぎると、ブローカーは hook に 500 を返す。Hydra が hook を呼び直しても、DB が答えないときは約 9 秒で失敗が決まる。  
決めた理由は [ADR-0044](../../docs/adr/0044-token-hook-fail-closed.md) に、hook のログの項目は [基盤と運用](../../context/operations.md#監視の項目とアラートの条件) にある。

ブローカーは、上流の IdP の設定を、待ち受けを始める前に読む。  
次のいずれかに当たると、ブローカーは起動せず、終了コード 1 で終わる。

- 2 つのファイルのどちらかを読めないか、JSON の形が違うか、知らないキーがある。
- 上流の IdP の一覧が空である。
- `org_id`、`issuer`、`client_id` のいずれかが空であるか、`issuer` が http か https の URL でない。
- `org_id` が重なっている。
- 上流の IdP の client secret が無いか、上流の IdP の設定に無い組織の client secret がある。

2 つの例のファイルの値は、開発用のダミーである。  
例のファイルの issuer は、compose の上流の IdP のフェイク（mock-oauth2-server）の 5 つの事業所を、ローカルから届く `localhost:9000` で指す。  
事業所のパスは `/office-a` から `/office-e` である。  
compose のブローカーは、コンテナの間の名前 `idp` で指す `compose/broker/` のファイルを読む。

## Running

ルートの compose は、ブローカーを、Hydra と上流の IdP のフェイクと一緒に起動する。  
compose で起動する手順は、[CONTRIBUTING.md](../../CONTRIBUTING.md#running-locally) の Running Locally にある。

次の手順は、compose のブローカーを止め、ローカルで `go run` で起動する。  
ブローカーの DB は、compose の PostgreSQL の `broker` のデータベースを使う。  
ブローカーの DB は、Hydra と予定の API の DB とは分ける。  
compose は、[CONTRIBUTING.md](../../CONTRIBUTING.md#portless-を通さずに起動する) の「portless を通さずに起動する」の環境変数を入れたシェルで起動する。  
Hydra がブローカーの画面を `http://localhost:8100` へリダイレクトし、Hydra の admin API が `127.0.0.1:4445` で待ち受けるためである。

```sh
docker compose up -d --wait hydra idp broker-seed
docker compose stop broker

# パスワード、token_hook の鍵、cookie の鍵は、compose のブローカーと同じ値を compose の設定から読む
compose_env() { docker compose config --format json | jq -r ".services.broker.environment.$1"; }
export DB_PORT=15432 DB_USER=buddy DB_PASSWORD="$(compose_env DB_PASSWORD)" DB_NAME=broker
go run ./cmd/migrate up
go run ./cmd/migrate seed

export PORT=8100 INTERNAL_PORT=8101 HYDRA_ADMIN_URL=http://127.0.0.1:4445 PUBLIC_URL=http://localhost:8100 \
  UPSTREAM_IDPS_FILE=upstream-idps.example.json \
  UPSTREAM_IDP_CLIENT_SECRETS_FILE=upstream-idp-client-secrets.example.json \
  HYDRA_ISSUER=http://hydra:4444 TOKEN_HOOK_KEY="$(compose_env TOKEN_HOOK_KEY)" \
  LOGIN_COOKIE_KEYS="$(compose_env LOGIN_COOKIE_KEYS)"
go run ./cmd/broker
```

ローカルの端末からは Hydra の issuer の名前 `hydra` を引けないので、この手順のブローカーの内部の API は 401 を返す。  
ブローカーは、内部の API が初めて呼ばれたときに Hydra の discovery の文書を読む。  
このため、ログインの画面は、Hydra の issuer に届かなくても動く。  
compose の Hydra の token_hook は、コンテナの間の名前 `broker` を呼ぶので、この手順のブローカーには届かない。

`curl localhost:8100/readyz` が `{"status":"ok"}` を返せば、起動できている。  
`/readyz` は、DB に届かなければ 503 を返す。  
`/healthz` は、DB を確認しない。

ポートは、compose の Hydra がリダイレクトするブローカーの画面（`http://localhost:8100/login`）と同じ 8100 にしている。  
内部の API は 8101 で待ち受ける。

コンテナで起動するときは、このディレクトリで次を実行する。  
ビルドの文脈は、`packages/go` を読むため、リポジトリの直下である。  
イメージは、ブローカーの `broker` とマイグレーションの `migrate` を `/usr/local/bin` に持つ。  
`migrate seed` は、職員がいない DB にだけ、ダミーの職員（`db/seed/seed.sql`）を入れる。

```sh
docker build -f Dockerfile -t broker ../..
docker run --rm broker migrate up   # DB の環境変数を -e で渡す
```

## Tests and Checks

`services/broker` で実行する。

```sh
go test ./...
go vet ./...
golangci-lint run
```

テストと lint は `GOWORK=off` を付けて流す。  
理由は [CONTRIBUTING.md](../../CONTRIBUTING.md#go-のモジュール) の「Go のモジュール」にある。

`internal/postgres` のテストは、testcontainers で PostgreSQL のコンテナを起動する。  
Docker が無い環境では、`go test -short ./...` で `internal/postgres` のテストを飛ばす。

## Documentation

- [DesignDoc.md](DesignDoc.md): ブローカーの責務、Hydra との分担、ログイン、職員の登録、休職、復職、退職、ログアウトの流れ
- ADR-0002: [OIDC のブローカーを、Ory Hydra と、自作の login and consent app で作る](../../docs/adr/0002-id-broker-hydra.md)
- ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにし、職員の身元をブローカーが、権限と業務のデータを予定の API が持つ](../../docs/adr/0001-auth.md)
