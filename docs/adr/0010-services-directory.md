# ADR-0011: 2 つの API を services/ に置き、画面と API をトップのディレクトリで分ける

## Status

承認

## Context

2 つの Go の API は `apps/schedule-api` と `apps/receipt-api` にあり、画面（`apps/web`）とドキュメントサイト（`apps/docs-site`）と同じ `apps/` に並んでいた。

- ディレクトリの名前は `-api` の接尾辞で API であることを表している。接尾辞だけを外して `apps/schedule` にすると、web にも予定と照合の機能があるので、API か画面かが名前から分からない。
- リリースのタグは、ディレクトリと 1 対 1 に対応させる `apps/<アプリ>/vX.Y.Z` の形と決めている。ディレクトリを変えると、タグの形も決め直す必要がある。
  - ADR-0003: [git flow でマージし、アプリごとのバージョンでリリースする](0003-branch-and-release.md)
- compose のサービス名、トークンの `aud`、テーブル定義書の出力先、ドキュメントサイトの API の仕様のページは、`schedule-api` と `receipt-api` の名前で指している。
- 予定の API と照合の API はまだリリースしておらず、リリースのタグも無い。

## Decision

画面と BFF、ドキュメントサイトは `apps/` に、Go の API は `services/` に置く。API のディレクトリは、接尾辞を付けず機能の名前にする（`services/schedule`、`services/receipt`）。共有のコードは今と同じく `packages/` に置く。

- 理由: トップのディレクトリで画面と API が分かれるので、同じ機能の名前を使っても区別できる。Go の module のパスも `github.com/Fukuemon/buddy/services/schedule` と短くなる。
- タグは `<ディレクトリ>/vX.Y.Z` の形にする（`apps/web/v1.0.0`、`services/schedule/v1.0.0`）。ディレクトリとタグを 1 対 1 に対応させる ADR-0003 の方針を保つ。リリースのタグがまだ無いので、付け直すタグは無い。
- ディレクトリの名前だけを変え、コンテナとサービスの名前、`aud`、テーブル定義書の出力先（`docs/db/schedule-api/`）、API の仕様のページの名前は `schedule-api` と `receipt-api` のまま残す。これらはディレクトリと違い、web には同じ名前のものが無く、インフラと IdP の設定が名前で指すので、変えると利点よりも直す範囲が大きい。
  - この判断は、ADR-0012 で置き換えた。
  - ADR-0012: [2 つの API のサービスの名前とトークンの aud を、ディレクトリの名前にそろえる](0012-service-names.md)
- ID ブローカーのログインの画面のソースの配置先は、ADR-0018 で決めた。
  - ADR-0018: [ID ブローカーのログインの画面のソースを apps/broker に置き、@buddy/ui から生成したテンプレートを ID ブローカーが埋め込んで配信する](0018-broker-login-pages-source.md)

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** API を `services/<機能>` に置き、画面と API をトップのディレクトリで分ける | 機能の名前だけで API を指せ、画面と区別できる | パス、module、CI のジョブ名、タグの形を一度に変える |
| `apps/schedule-api` と `apps/receipt-api` のまま残す | 変更が無い | 名前に役割の接尾辞が付き続け、画面と API が同じ階層に並ぶ |
| `apps/schedule` と `apps/receipt` に名前だけを変える | トップのディレクトリの数が変わらない | web の予定と照合の機能と、名前から区別できない |

## Consequences

### Positive

- 新しい API は `services/` に、新しい画面のアプリは `apps/` に置けばよく、配置先を迷わない。

### Negative

- CI のジョブ名（`go (services/schedule)` など）と ruleset の必須のチェックの名前が変わる。
- ディレクトリの名前（`schedule`）と、残したサービスの名前（`schedule-api`）が違うので、両方を読み替える必要がある。
