# ADR-0021: 画面を apps/ に、API を services/ に置き、ディレクトリの名前でサービスの名前をそろえる

## Status

承認

## Context

ディレクトリの配置と、アプリの名前を決める必要がある。

- buddy は、web、予定の API、照合の API のアプリと、共有のパッケージを 1 つのリポジトリに持つ。
  - ADR-0003: [モノレポを git flow でマージし、アプリごとのバージョンでリリースする](0003-branch-and-release.md)
- web にも予定と照合の機能があるので、API のディレクトリを `apps/schedule` のように機能の名前だけにすると、API か画面かが名前から分からない。
- アプリの名前は、compose のサービス、コンテナ、イメージ、環境変数、トークンの `aud` と IdP の開発用の設定、テーブル定義書の出力先、ドキュメントサイトの API の仕様のページ、GitHub のラベルが使う。
- web は、トークンを取るときに audience を指定しない。`aud` を決めるのは IdP の設定で、確認するのは各 API の `OIDC_AUDIENCE` である。

## Decision

### ディレクトリの配置

画面と BFF、ドキュメントサイトは `apps/` に、Go の API は `services/` に、共有のコードは `packages/` に置く。API のディレクトリは、接尾辞を付けず機能の名前にする（`services/schedule`、`services/receipt`）。

- 理由: トップのディレクトリで画面と API が分かれるので、同じ機能の名前を使っても区別できる。Go の module のパスも `github.com/Fukuemon/buddy/services/schedule` と短くなる。
- ID ブローカーのログインの画面のソースの配置先は、ADR-0014 で決めた。
  - ADR-0014: [ID ブローカーのログインの画面のソースを apps/broker に置き、@buddy/ui から生成したテンプレートを ID ブローカーが埋め込んで配信する](0014-broker-login-pages-source.md)

### API の名前

2 つの API を名前で指す全ての箇所を、ディレクトリの名前の `schedule` と `receipt` にそろえる。

- compose のサービスは `schedule`、`schedule-migrate`、`schedule-seed`、`receipt` にし、イメージは `<プロジェクト>-schedule` にする。
- トークンの `aud` は `schedule` と `receipt` にする。
  - 理由: 2 つの API は、ブローカーの 1 つの Issuer のトークンだけを受けるので、`aud` の値は buddy の API の間で区別できればよい。サービスの名前と同じにすると、API の `OIDC_AUDIENCE` と IdP の設定を名前から書ける。
  - ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにし、職員の身元をブローカーが、権限と業務のデータを予定の API が持つ](0001-auth.md)
- 環境変数は、ほかのサービスの `WEB_PORT`、`IDP_PORT`、`E2E_GCALHOLD_URL` と同じく、サービスの名前を接頭辞にする（`SCHEDULE_PORT`、`SCHEDULE_URL`、`E2E_SCHEDULE_URL` など）。
- テーブル定義書の出力先は `docs/db/schedule/`、API の仕様のページは `docs/api/schedule.html` と `docs/api/receipt.html` にする。
- GitHub のラベルは `pkg:schedule` と `pkg:receipt` にする。
- 文書の地の文では、2 つの API を「予定の API」「照合の API」と書く。名前そのものを指すときだけ、`schedule` と `receipt` をコードスパンで書く。
  - 理由: web にも予定と照合の画面があるので、地の文の `schedule` は API か画面かが分からない。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** API を `services/<機能>` に置き、サービスの名前、`aud`、環境変数、文書とラベルの名前を全てディレクトリの名前にそろえる | 機能の名前だけで API を指せ、画面と区別できる。ディレクトリとサービスの名前を読み替えずに済む | パス、module、CI のジョブ名、タグの形と、compose、IdP、web、E2E、ドキュメントサイトの設定を一度に変える |
| `apps/schedule-api` と `apps/receipt-api` のまま残す | 今の名前を変えずに済む | 名前に役割の接尾辞が付き続け、画面と API が同じ階層に並ぶ |
| `apps/schedule` と `apps/receipt` に置く | トップのディレクトリの数が変わらない | web の予定と照合の機能と、名前から区別できない |
| ディレクトリは `services/<機能>` にし、サービスの名前は `schedule-api` と `receipt-api` のまま残す | 今の名前を変えずに済む | ディレクトリとサービスの名前の読み替えが残る |
| `aud` だけを `buddy-schedule` のように buddy の接頭辞を付けた名前にする | ほかのプロダクトと同じ IdP の組織を使っても `aud` が重ならない | `aud` だけがサービスの名前と違い、読み替えが残る。buddy の Issuer は buddy の組織だけを扱う |
| 環境変数は `SCHEDULE_API_URL` のように `_API_` を残す | web の設定の中で、API の URL であることが名前から分かる | 環境変数だけがサービスの名前と違い、ほかのサービスの環境変数の付け方ともずれる |

## Consequences

### Positive

- 新しい API は `services/` に、新しい画面のアプリは `apps/` に置けばよく、配置先を迷わない。
- compose、トークン、文書、ラベルのどこでも、ディレクトリと同じ名前で API を指せる。

### Negative

- 非公開のインフラは、2 つの API を `schedule` と `receipt` の名前で設定する必要がある。
