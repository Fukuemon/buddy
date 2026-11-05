# ADR-0015: OIDC のブローカーを、Ory Hydra と、自作の login and consent app で作る

## Status

承認

## Context

ADR-0001 は、外部の IdP の前に OIDC のブローカーを置き、buddy の全てのアプリはブローカーの 1 つの Issuer のトークンだけを検証すると決めた。ブローカーを何で作るかは決めていない。

ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにする](0001-auth.md)

- ローカル環境の compose は、開発用の IdP（mock-oauth2-server）をブローカーの位置に置いているだけで、本番で使えるブローカーが無い。
- 事業所ごとに上流の IdP が違う。Google、LINE、Entra ID のような OIDC の IdP を想定する。
- ブローカーは、事業所と職員の所属のような buddy の業務のデータを扱う。持つものの範囲は ADR-0016 で決める。
  - ADR-0016: [職員の身元をブローカーが持ち、権限と業務のデータは予定の API が持つ](0016-identity-boundary.md)
- 認可コード、トークンの発行、鍵のローテーション、refresh token のローテーションと再利用の検出、失効は、どのプロダクトでも同じ処理で、誤ると被害が大きい。
- 2 つの API は、access token の JWT を、discovery の `jwks_uri` で検証している（`packages/go/oidc`）。
- インフラは別のリポジトリが持ち、buddy はデプロイ先のクラウドを知らない。

## Decision

トークンの発行は Ory Hydra に任せ、ブローカーは Hydra の login and consent app として自作する。web と 2 つの API から見える Issuer は Hydra だけになる。

- Hydra は、認可コード、トークンの発行、JWKS、refresh token のローテーション、失効、ログアウトを持つ。
- 自作のブローカーは、ログインと同意とログアウトの画面、上流の IdP への振り分けと RP の処理、職員の身元を持つ。RP の処理は `go-oidc` と `golang.org/x/oauth2` で書く。
  - 画面のソースの配置先と配信の仕方は、ADR-0025 で決めた。
  - ADR-0025: [ID ブローカーのログインの画面のソースを apps/broker に置き、@buddy/ui から生成したテンプレートを ID ブローカーが埋め込んで配信する](0025-broker-login-pages-source.md)
- web は自社のアプリなので、Hydra のクライアントに `skip_consent` を設定し、同意の画面を出さない。
- 本番も OSS 版の Hydra を、インフラのリポジトリで運用する。
  - OSS 版はパッチ版が出ず、セキュリティの修正は最新版にだけ出る。年 1〜2 回のメジャーなアップグレードを、停止を含めて回す。
  - 理由: 管理のサービスと商用版は費用がかかり、管理のサービスはデプロイ先を選べない。
- access token は JWT（`strategies.access_token: jwt`）にし、期限を 5 分にする。組織の ID などのクレームは、`oauth2.allowed_top_level_claims` で JWT の top level に出す。
  - 理由: 2 つの API は検証の作りを変えずに、Issuer を替えるだけで済む。opaque にすると、全ての API のリクエストが Hydra の introspection を呼び、Hydra が止まると buddy の全体が止まる。OSS 版の introspection は admin API にあり、クライアントと鍵とセッションの管理と同じポートなので、API にこのポートを開くことになる。
  - 理由: JWT はすぐに失効できないが、トークンは BFF のサーバー側にだけあり、ブラウザに出ない。失効が遅れるのは最大 5 分である。
- `aud` は、ADR-0013 のとおり `schedule` と `receipt` にする。ブローカーが同意の accept で付け、Hydra の web のクライアントに許す audience として登録する。
  - ADR-0013: [2 つの API のサービスの名前とトークンの aud を、ディレクトリの名前にそろえる](0013-service-names.md)
- ブローカーは、モノレポの `services/broker` に置く。
  - 理由: `packages/go`、compose、E2E を、web と 2 つの API と共有する。ログインの流れを変える変更を、1 つの pull request で web、API、ブローカーにわたって直せる。
  - ADR-0012: [2 つの API を services/ に置き、画面と API をトップのディレクトリで分ける](0012-services-directory.md)
- 事業所ごとの上流の IdP の設定（組織の ID、issuer、client ID）は、インフラからファイルで渡し、client secret はシークレットとして渡す。ブローカーは管理の画面を持たない。
  - 理由: 事業所と Google のサービスアカウントの対応のファイル（`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE`）と同じ扱いにし、事業所を足す手順を運営側の 1 か所にまとめる。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** Hydra に発行を任せ、login and consent app を自作する | 汎用の処理を自分で持たない。業務のデータモデルを製品に合わせなくてよい | Hydra とブローカーの 2 つを動かす。Hydra のメジャーなアップグレードを自分で回す |
| ブローカーを全て自作する | 依存が少ない | トークンの発行、鍵のローテーション、失効、refresh token の再利用の検出を持ち続ける |
| Keycloak か Zitadel を使う | 上流の IdP の連携と組織を製品が持つ | 事業所と職員のデータモデルを製品に合わせる。Keycloak は JVM の運用が増える |
| Hydra と Kratos を使う | 上流の IdP の連携を Kratos が持つ | 組織（B2B Organizations）は Kratos の商用版の機能である |
| access token を opaque にし、API が introspection で確認する | すぐに失効できる | Hydra の可用性が buddy の全体の可用性になる。admin API を 2 つの API に開く |

## Consequences

### Positive

- 2 つの API は、`OIDC_ISSUER` を Hydra に替えるだけで、検証の作りを変えずに済む。
- 上流の IdP を足すときは、設定のファイルに事業所の行を足し、ブローカーを起動し直す。buddy のアプリは変わらない。

### Negative

- ローカル環境と E2E は、Hydra、ブローカー、上流の IdP のフェイクの 3 つを立てる。
- access token の期限が 5 分なので、web の BFF は今より頻繁に refresh token で取り直す。
- 事業所を足すたびに、インフラの設定を変えてブローカーをデプロイし直す。
- OSS 版の Hydra の脆弱性を直すには、修正を含む最新版へのアップグレードが要り、停止を伴うことがある。
