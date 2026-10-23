# ID ブローカー

Ory Hydra の login and consent app として動き、事業所ごとの上流の IdP の前に立って職員の身元を持つサービス。  
ログイン、同意、ログアウトの画面、上流の IdP への RP の処理、職員の登録、休職、復職、退職の内部の API、Hydra の token_hook、ヘルスチェック、職員の身元の DB のマイグレーションとシードを持つ。  
責務と流れは [DesignDoc.md](DesignDoc.md) にある。

## セットアップ

Go と golangci-lint のバージョンは、リポジトリのルートの `mise.toml` にある。

```sh
mise install go golangci-lint
```

## 起動する

ルートの compose は、ブローカーを Hydra と上流の IdP のフェイクと一緒に起動する（[CONTRIBUTING.md](../../CONTRIBUTING.md) の「ローカル環境で全体を起動する」）。  
ここでは、compose のブローカーを止め、ローカルで `go run` で起動する手順を示す。ブローカーの DB は、compose の PostgreSQL の `broker` のデータベースである。Hydra と予定の API の DB とは分ける。

```sh
docker compose up -d --wait hydra idp broker-seed
docker compose stop broker

# パスワードと token_hook の鍵は、compose のブローカーと同じ値を compose の設定から読む
compose_env() { docker compose config --format json | jq -r ".services.broker.environment.$1"; }
export DB_PORT=15432 DB_USER=buddy DB_PASSWORD="$(compose_env DB_PASSWORD)" DB_NAME=broker
go run ./cmd/migrate up
go run ./cmd/migrate seed

export PORT=8100 INTERNAL_PORT=8101 HYDRA_ADMIN_URL=http://127.0.0.1:4445 PUBLIC_URL=http://localhost:8100 \
  UPSTREAM_IDPS_FILE=upstream-idps.example.json \
  UPSTREAM_IDP_CLIENT_SECRETS_FILE=upstream-idp-client-secrets.example.json \
  HYDRA_ISSUER=http://hydra:4444 TOKEN_HOOK_KEY="$(compose_env TOKEN_HOOK_KEY)"
go run ./cmd/broker
```

ローカルの端末からは Hydra の issuer の名前 `hydra` を引けないので、この手順のブローカーの内部の API は 401 を返す。  
ブローカーは、内部の API が初めて呼ばれたときに Hydra の discovery の文書を読み、ログインの画面は Hydra の issuer に届かなくても動く。  
compose の Hydra の token_hook は、コンテナの間の名前 `broker` を呼ぶので、この手順のブローカーには届かない。

`curl localhost:8100/readyz` が `{"status":"ok"}` を返せば、起動できている。`/readyz` は DB に届かなければ 503 を返し、`/healthz` は DB を確認しない。  
ポートは、compose の Hydra がリダイレクトするブローカーの画面（`http://localhost:8100/login`）と同じ 8100 にしている。内部の API は 8101 で待ち受ける。

設定は環境変数で渡す。

- `PORT`: ログイン、同意、ログアウトの画面とヘルスチェックを待ち受けるポート。デフォルトは `8080`
- `INTERNAL_PORT`: 内部の API と `oauth2.token_hook` とヘルスチェックを待ち受けるポート。`PORT` と違う値にし、ブラウザに開かない。デフォルトは `8081`
- `LOG_LEVEL`: `debug`、`info`、`warn`、`error` のいずれか。デフォルトは `info`
- `DB_HOST`、`DB_PORT`: ブローカーの DB の接続先。デフォルトは `localhost` と `5432`
- `DB_USER`、`DB_PASSWORD`、`DB_NAME`: 必須。ブローカーの DB の利用者、パスワード、データベース
- `HYDRA_ADMIN_URL`: 必須。Hydra の admin API の URL
- `UPSTREAM_IDPS_FILE`: 必須。組織の ID と、上流の IdP の issuer と client ID の対応（JSON）のパス。形は [upstream-idps.example.json](upstream-idps.example.json) にある
- `PUBLIC_URL`: 必須。ブラウザが開くブローカーの URL。上流の IdP のコールバックの URL（`<PUBLIC_URL>/login/callback`）を作り、https ならログインの途中の cookie に Secure を付ける
- `UPSTREAM_IDP_BROWSER_ORIGIN`: 上流の IdP の認可の画面へリダイレクトするときに、URL の scheme とホストを替える origin。ブローカーが discovery の文書を読む issuer にブラウザが届かないローカル環境だけで渡す
- `UPSTREAM_IDP_CLIENT_SECRETS_FILE`: 必須。組織の ID と、上流の IdP の client secret の対応（JSON）のパス。シークレットとして渡す。形は [upstream-idp-client-secrets.example.json](upstream-idp-client-secrets.example.json) にある
- `CLIENT_IP_HEADER`: ログインの試行を数える送信元の IP アドレスを読む、リバースプロキシが付けるヘッダーの名前。ブローカーは最後の値を使う。無ければ接続の相手のアドレスを使う。ブローカーにプロキシを通らずに届かない構成でだけ渡す
- `AUTO_CONSENT_CLIENTS`: 同意の画面を出さずに accept するクライアントの ID をカンマで区切った値。デフォルトは `web`。ほかのクライアントの同意は reject する
- `HYDRA_ISSUER`: 必須。Hydra のトークンの `iss`。内部の API は、`<HYDRA_ISSUER>/.well-known/openid-configuration` の JWKS で、予定の API の client credentials の access token を検証する
- `INTERNAL_API_AUDIENCE`: 内部の API が access token の `aud` に求める値。デフォルトは `broker`
- `INTERNAL_API_CLIENTS`: 内部の API を呼んでよいクライアントの ID をカンマで区切った値。デフォルトは `schedule`。access token の `sub` と、token_hook が通す client credentials の要求の `client_id` を照合する
- `TOKEN_HOOK_KEY`: 必須。Hydra が `oauth2.token_hook` を呼ぶときに、ヘッダー `Token-Hook-Key` に入れる値。シークレットとして渡し、Hydra の `oauth2.token_hook.auth` と同じ値にする

上流の IdP の設定は、待ち受けを始める前に読む。次のいずれかでは、ブローカーは起動せず、終了コード 1 で終わる。

- 2 つのファイルのどちらかを読めないか、JSON の形が違うか、知らないキーがある
- 上流の IdP の一覧が空である
- `org_id`、`issuer`、`client_id` のいずれかが空であるか、`issuer` が http か https の URL でない
- `org_id` が重なっている
- 上流の IdP の client secret が無いか、上流の IdP の設定に無い組織の client secret がある

2 つの例のファイルの値は、開発用のダミーである。issuer は、compose の上流の IdP のフェイク（mock-oauth2-server）の 2 つの事業所（`/office-a`、`/office-b`）を、ローカルから届く `localhost:9000` で指す。compose のブローカーは、コンテナの間の名前 `idp` で指す `compose/broker/` のファイルを読む。

コンテナで起動するときは、このディレクトリで次を実行する。ビルドの文脈はリポジトリの直下である（`packages/go` を読むため）。  
イメージは、ブローカーの `broker` とマイグレーションの `migrate` を `/usr/local/bin` に持つ。`migrate seed` は、職員がいない DB にだけ、ダミーの職員（`db/seed/seed.sql`）を入れる。

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

`internal/postgres` のテストは、testcontainers で PostgreSQL のコンテナを起動し、マイグレーションを当ててテーブルの制約を確認する。Docker が無い環境では `go test -short ./...` で飛ばす。

## ドキュメント

- [DesignDoc.md](DesignDoc.md): ブローカーの責務、Hydra との分担、ログイン、職員の登録、休職、復職、退職、ログアウトの流れ
- ADR-0016: [OIDC のブローカーを、Ory Hydra と、自作の login and consent app で作る](../../docs/adr/0016-id-broker-hydra.md)
- ADR-0017: [職員の身元をブローカーが持ち、権限と業務のデータは予定の API が持つ](../../docs/adr/0017-identity-boundary.md)
