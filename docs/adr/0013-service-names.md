# ADR-0013: 2 つの API のサービスの名前とトークンの aud を、ディレクトリの名前にそろえる

## Status

承認

## Context

ADR-0012 は、2 つの API のディレクトリを `services/schedule` と `services/receipt` にした。  
コンテナとサービスの名前、`aud`、テーブル定義書の出力先、API の仕様のページの名前は、`schedule-api` と `receipt-api` のまま残すと決めた。  
この ADR は、ADR-0012 の決定のうち、名前を残す判断だけを置き換える。

ADR-0012: [2 つの API を services/ に置き、画面と API をトップのディレクトリで分ける](0012-services-directory.md)

- ディレクトリの名前とサービスの名前が違うので、コードと文書を読む人は 2 つの名前を読み替えている。
- `schedule-api` と `receipt-api` の名前を使うものは、次のとおり。
  - compose のサービス、コンテナ、イメージ、環境変数
  - トークンの `aud` と、IdP の開発用の設定
  - テーブル定義書の出力先と、ドキュメントサイトの API の仕様のページ
  - GitHub のラベル `pkg:schedule-api` と `pkg:receipt-api`
- 非公開のインフラの設定は、2 つの名前をまだ指していない。
- 2 つの API はまだリリースしておらず、名前を変えて互換を保つ必要のある利用者がいない。
- web は、トークンを取るときに audience を指定しない。`aud` を決めるのは IdP の設定で、確認するのは各 API の `OIDC_AUDIENCE` である。

## Decision

2 つの API を名前で指す全ての箇所を、ディレクトリの名前の `schedule` と `receipt` にそろえる。

- compose のサービスは `schedule`、`schedule-migrate`、`schedule-seed`、`receipt` にし、イメージは `<プロジェクト>-schedule` にする。
- トークンの `aud` は `schedule` と `receipt` にする。
  - 理由: 2 つの API は、ブローカーの 1 つの Issuer のトークンだけを受けるので、`aud` の値は buddy の API の間で区別できればよい。サービスの名前と同じにすると、API の `OIDC_AUDIENCE` と IdP の設定を名前から書ける。
  - ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにする](0001-auth.md)
- 環境変数は、ほかのサービスの `WEB_PORT`、`IDP_PORT`、`E2E_GCALHOLD_URL` と同じく、サービスの名前を接頭辞にする（`SCHEDULE_PORT`、`SCHEDULE_URL`、`E2E_SCHEDULE_URL` など）。
- テーブル定義書の出力先は `docs/db/schedule/`、API の仕様のページは `docs/api/schedule.html` と `docs/api/receipt.html` にする。
- GitHub のラベルは `pkg:schedule` と `pkg:receipt` にする。名前を変えるので、付いている issue と pull request のラベルも変わる。
- 文書の地の文では、2 つの API を「予定の API」「照合の API」と書く。名前そのものを指すときだけ、`schedule` と `receipt` をコードスパンで書く。
  - 理由: web にも予定と照合の画面があるので、地の文の `schedule` は API か画面かが分からない。
- ADR のファイル名と ADR-0012 の本文は変えない。ほかの承認した ADR の本文は、用語の置き換えとして新しい名前に変える。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** サービスの名前、`aud`、環境変数、文書とラベルの名前を全て `schedule` と `receipt` にする | ディレクトリとサービスの名前を読み替えずに済む | compose、IdP、web、E2E、ドキュメントサイトの設定を一度に変える |
| ADR-0012 のとおり `schedule-api` と `receipt-api` を残す | 変更が無い | ディレクトリとサービスの名前の読み替えが残る |
| `aud` だけを `buddy-schedule` のように buddy の接頭辞を付けた名前にする | ほかのプロダクトと同じ IdP の組織を使っても `aud` が重ならない | `aud` だけがサービスの名前と違い、読み替えが残る。buddy の Issuer は buddy の組織だけを扱う |
| 環境変数は `SCHEDULE_API_URL` のように `_API_` を残す | web の設定の中で、API の URL であることが名前から分かる | 環境変数だけがサービスの名前と違い、ほかのサービスの環境変数の付け方ともずれる |

## Consequences

### Positive

- compose、トークン、文書、ラベルのどこでも、ディレクトリと同じ名前で API を指せる。

### Negative

- 非公開のインフラは、2 つの API を `schedule` と `receipt` の名前で設定する必要がある。
- 古い名前の環境変数を設定したローカル環境は、`SCHEDULE_API_PORT` などを新しい名前に変えるまで、ポートがデフォルトに戻る。
