# ADR-0012: Google カレンダーのサービスアカウントを事業所ごとに分け、buddy は IAM の権限借用で切り替える

## Status

承認

## Context

ADR-0009 は、Google カレンダーに、照合の API と同じサービスアカウントと、職員のカレンダーの共有で接続すると決めた。

- ADR-0009: [Google カレンダーとの連携を、buddy をマスターにする段階の同期にし、サービスアカウントとカレンダーの共有で認証する](0009-google-calendar-sync.md)

この ADR は、ADR-0009 の次の 2 つの判断を置き換える。職員のカレンダーの共有で接続し、ドメイン全体の委任を使わない判断は保つ。

- 照合の API と同じサービスアカウントを使う判断
- 承認の条件

決定に関わる事実は次のとおり。

- サービスアカウントは全ての事業所で 1 つである。ほかの事業所の職員がサービスアカウントに共有したカレンダーも、ID を入れれば読めて結び付けられる。読めるかどうかで、カレンダーがどの事業所のものかを判定できない。
- 照合の API は、設定のファイルのカレンダーごとに事業所の組織の ID（`org_id`）を持ち、リクエストのトークンの組織のカレンダーだけを読む。照合の API は事業所のテーブルを持たない。
  - 出典: [照合の API の Design Doc](https://github.com/Fukuemon/buddy/blob/982a702e7ac452b125badc7cda4848f025ef9bc1/apps/receipt-api/DesignDoc.md#予定の取得元-google-カレンダー)
- 予定の API は、結び付けの操作でカレンダーの ID をリクエストから受ける。結び付けたカレンダーのレコードは、事業所（`facility_id`）を持つ。予定の書き出しと増分の取得は、リクエストを受けずに動く。事業所と組織は 1 対 1 に対応する（`facilities.org_id`）。
  - 出典: [予定の API の Design Doc](https://github.com/Fukuemon/buddy/blob/982a702e7ac452b125badc7cda4848f025ef9bc1/apps/schedule-api/DesignDoc.md#google-カレンダーへの書き出し)
  - 出典: [カレンダーの連携の画面仕様書](../screens/schedule-link_カレンダーの連携/index.md)
- 予定の API は、サービスアカウントのメールアドレスを環境変数で 1 つだけ受ける。
- 照合の API は、デプロイした環境で Workload Identity Federation で認証し、ローカルではサービスアカウントのキーのファイルで認証する。
  - 出典: [照合の API の Design Doc](https://github.com/Fukuemon/buddy/blob/982a702e7ac452b125badc7cda4848f025ef9bc1/apps/receipt-api/DesignDoc.md#予定の取得元-google-カレンダー)
- サービスアカウントの権限を借用するには、`iam.serviceAccounts.getAccessToken` の権限が要る。この権限は、サービスアカウントのトークン作成者のロール（`roles/iam.serviceAccountTokenCreator`）に含まれる。
  - 出典: [Service account impersonation](https://docs.cloud.google.com/iam/docs/service-account-impersonation)
- 権限借用の短い期間の token を作るには、プロジェクトで IAM Service Account Credentials API を有効にする。
  - 出典: [Create a short-lived access token](https://docs.cloud.google.com/iam/docs/create-short-lived-credentials-direct)
- ロールは、プロジェクトの全体でなく、1 つのサービスアカウントに付けられる。
  - 出典: [Manage access to service accounts](https://docs.cloud.google.com/iam/docs/manage-access-service-accounts)
- Go のライブラリは、Application Default Credentials の認証から、権限を借用した token を作れる。元の認証が利用者のアカウントのときは、権限を借用する先のアカウントにも `serviceusage.services.use` を持つロールが要る。
  - 出典: [impersonate パッケージ](https://pkg.go.dev/google.golang.org/api/impersonate)
- 1 つのプロジェクトに作れるサービスアカウントの数は、プロジェクトごとに違い、増やすことを申し込める。
  - 出典: [IAM の割り当てと上限](https://docs.cloud.google.com/iam/quotas)

## Decision

運営側の 1 つの GCP のプロジェクトに、事業所ごとのサービスアカウントを作る。buddy はサービスアカウントのキーを持たず、Application Default Credentials で認証した主体から、事業所のサービスアカウントの権限を借用して Google Calendar API を呼ぶ。

- 事業所のアカウント: 職員は、自分の事業所のサービスアカウントにカレンダーを共有する。ほかの事業所のアカウントには共有されていないので、ほかの事業所の職員が ID を入れても読めない。
- 事業所の決め方: リクエストを受ける操作は、リクエストの職員かトークンの組織から事業所を決める。リクエストを受けない書き出しと増分の取得は、結び付けたカレンダーのレコードの事業所（`external_calendars.facility_id`）で決める。リクエストの本文からは受けない。
- 対応の配置先: 組織の ID（`org_id`）とサービスアカウントのメールアドレスの対応を、運営側が設定のファイルで渡す。予定の API と照合の API は、同じ形の設定を読む。予定の API は、事業所の組織の ID で対応を引く。アカウントを作るのも、ロールを付けるのも運営側で、buddy の画面からは変えないためである。
- 権限: Application Default Credentials で認証する主体に、トークン作成者のロールを、事業所のサービスアカウントごとに付ける。プロジェクトの全体には付けない。主体は、Workload Identity Federation でプールの主体が直接に呼ぶならその主体、中間のサービスアカウントを経るならそのアカウントである。プロジェクトでは IAM Service Account Credentials API を有効にする。
- キー: buddy のリポジトリと動いている環境に、サービスアカウントのキーを置かない。デプロイした環境は Workload Identity Federation で認証する。
- ローカルでの確認: 開発者は、検証の事業所のサービスアカウントの権限を借用した Application Default Credentials を作る。コマンドは `gcloud auth application-default login --impersonate-service-account` である。キーのファイルと `GOOGLE_APPLICATION_CREDENTIALS` は使わない。開発者のアカウントには、検証の事業所のアカウントのトークン作成者のロールだけを付け、本番の事業所のアカウントには付けない。本番の事業所のアカウントの権限を借用できると、ローカルから利用者名の入った職員のカレンダーを読めるためである。
  - Application Default Credentials のアカウントが事業所のアカウントと同じときは、buddy は重ねて権限を借用しない。見分け方は実装の issue で決める。
- 移行: 今の 1 つのサービスアカウントに共有したカレンダーは、事業所のアカウントに切り替えると読めなくなる。職員は、事業所のアカウントに共有し直し、今のアカウントへの共有を外す。運営側は、全ての職員が共有し直した後に、今のアカウントを止める。

## Verification

- 2026-10-22 に、検証の事業所のアカウントが持つカレンダーで、実際の Google Calendar API を呼んで確認した。予定の API は、検証の事業所のアカウントに権限を借用した Application Default Credentials で動き、取り込み、書き出し（予定の作成、変更、削除）、増分の取得ができた。
  - 出典: [#180 の実際の API での確認](https://github.com/Fukuemon/buddy/issues/180#issuecomment-6333280999)
- アカウントが持つカレンダーへの書き込みなので、職員の共有での書き込みの確認にはならない。承認の条件の 1 つ目は、未確認のままである。
- 検証の事業所のアカウントに `serviceusage.services.use` を持つロールがあったかは見ておらず、ロールを外して確認してもいない。承認の条件の 2 つ目の要否は、未確認のままである。

## 承認の条件

- サービスアカウントが、ドメイン全体の委任なしに、予定の変更の共有だけで予定を書けるかは、まだ確認していない。書き出しを本番で有効にする前に、職員のアカウントが検証の事業所のアカウントに共有したカレンダー 1 つで確認する。書けなければ、書き出しの認証を新しい ADR で決め直す。
- ローカルでの権限借用で、検証の事業所のアカウントに `serviceusage.services.use` を持つロールが要るかは、まだ確認していない。同じ検証で確認する。
- 事業所ごとに分け、権限借用で切り替える判断は、これらの確認を待たずに承認とする。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 事業所ごとのサービスアカウントに、権限借用で切り替える | 事業所の間でカレンダーを読めない。キーを保管しない。事業所を足すときに、buddy のコードを変えない | 事業所を足すたびに、運営側がアカウントを作り、ロールを付け、設定に足す |
| 1 つのサービスアカウントのまま、ほかの事業所が結び付けたカレンダーを拒む | 運営側の操作が増えない | 最初に結び付けた事業所を確認できない。ほかの事業所の職員が先に結び付ければ読める |
| 1 つのサービスアカウントのまま、カレンダーのオーナーのメールアドレスと職員のメールアドレスを比べる | 運営側の操作が増えない | 共有のアカウントが持つカレンダーと、2 つ目のカレンダーを結び付けられない |
| 事業所ごとのサービスアカウントのキーを、buddy が持つ | 権限借用に要るロールを付けなくてよい | 事業所の数だけキーを保管し、入れ替える必要がある |
| 事業所ごとに GCP のプロジェクトを分ける | 事業所の間を、プロジェクトの境界で分けられる | 事業所を足すたびにプロジェクトと課金と API の有効化が要る |

## Consequences

### Positive

- ほかの事業所の職員が共有したカレンダーは、公開していなければ、ID を入れても読めず、結び付けられない。
- シークレットから、サービスアカウントのキーが無くなる。
- 事業所ごとに、カレンダーの共有の範囲と、権限借用に要るロールを外せる。

### Negative

- 事業所を足すときの運営側の手順が増える。サービスアカウントを作り、認証する主体にトークン作成者のロールを付け、buddy の設定に対応を足す。
- 認証する主体は、全ての事業所のサービスアカウントの権限を借用できる。buddy が事業所を間違えると、ほかの事業所のカレンダーに届く。事業所は、リクエストの職員、トークンの組織、結び付けたカレンダーのレコードからだけ決める。
- 切り替えのときに、全ての職員がカレンダーを共有し直す必要がある。
- 事業所の数が、プロジェクトのサービスアカウントの上限に近づいたら、上限を増やすことを申し込む。
- 予定の API と照合の API の両方に、事業所ごとに Calendar API のクライアントを作る仕組みが要る。照合の API の Design Doc と README の、ローカルでキーのファイルを使う手順は、実装の issue で直す。
