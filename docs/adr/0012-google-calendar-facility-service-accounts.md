# ADR-0012: Google カレンダーのサービスアカウントを事業所ごとに分け、buddy は IAM のなりすましで切り替える

## Status

承認

## Context

ADR-0009 は、Google カレンダーに、照合の API と同じサービスアカウントと、職員のカレンダーの共有で接続すると決めた。

- ADR-0009: [Google カレンダーとの連携を、buddy を正にする段階の同期にし、サービスアカウントとカレンダーの共有で認証する](0009-google-calendar-sync.md)

この ADR は、ADR-0009 の次の 2 つの判断を置き換える。職員のカレンダーの共有で接続し、ドメイン全体の委任を使わない判断は保つ。

- 照合の API と同じサービスアカウントを使う判断
- 承認の条件

決定に関わる事実は次のとおり。

- サービスアカウントは全ての事業所で 1 つである。ほかの事業所の職員がサービスアカウントに共有したカレンダーも、ID を入れれば読めて結び付けられる。読めるかどうかで、カレンダーがどの事業所のものかを判定できない。
- 照合の API は、設定のファイルのカレンダーごとに事業所の組織の ID（`org_id`）を持ち、要求のトークンの組織のカレンダーだけを読む。照合の API は事業所の表を持たない。
  - 出典: [照合の API の Design Doc](https://github.com/Fukuemon/buddy/blob/982a702e7ac452b125badc7cda4848f025ef9bc1/apps/receipt-api/DesignDoc.md#予定の取得元-google-カレンダー)
- 予定の API は、結び付けの操作でカレンダーの ID を要求から受ける。結び付けたカレンダーの行は、事業所（`facility_id`）を持つ。予定の書き出しと増分の取得は、要求を受けずに動く。事業所と組織は 1 対 1 に対応する（`facilities.org_id`）。
  - 出典: [予定の API の Design Doc](https://github.com/Fukuemon/buddy/blob/982a702e7ac452b125badc7cda4848f025ef9bc1/apps/schedule-api/DesignDoc.md#google-カレンダーへの書き出し)
  - 出典: [カレンダーの連携の画面仕様書](../screens/schedule-link_カレンダーの連携/index.md)
- 予定の API は、サービスアカウントのメールアドレスを環境変数で 1 つだけ受ける。
- 照合の API は、デプロイした環境で Workload Identity Federation で認証し、手元ではサービスアカウントの鍵のファイルで認証する。
  - 出典: [照合の API の Design Doc](https://github.com/Fukuemon/buddy/blob/982a702e7ac452b125badc7cda4848f025ef9bc1/apps/receipt-api/DesignDoc.md#予定の取得元-google-カレンダー)
- サービスアカウントになりすますには、`iam.serviceAccounts.getAccessToken` の権限が要る。この権限は、サービスアカウントのトークン作成者のロール（`roles/iam.serviceAccountTokenCreator`）に含まれる。
  - 出典: [Service account impersonation](https://docs.cloud.google.com/iam/docs/service-account-impersonation)
- なりすましの短い期間の token を作るには、プロジェクトで IAM Service Account Credentials API を有効にする。
  - 出典: [Create a short-lived access token](https://docs.cloud.google.com/iam/docs/create-short-lived-credentials-direct)
- ロールは、プロジェクトの全体でなく、1 つのサービスアカウントに付けられる。
  - 出典: [Manage access to service accounts](https://docs.cloud.google.com/iam/docs/manage-access-service-accounts)
- Go のライブラリは、Application Default Credentials の認証から、なりすました token を作れる。元の認証が利用者のアカウントのときは、なりすます先のアカウントにも `serviceusage.services.use` を持つロールが要る。
  - 出典: [impersonate パッケージ](https://pkg.go.dev/google.golang.org/api/impersonate)
- 1 つのプロジェクトに作れるサービスアカウントの数は、プロジェクトごとに違い、増やすことを申し込める。
  - 出典: [IAM の割り当てと上限](https://docs.cloud.google.com/iam/quotas)

## Decision

運営側の 1 つの GCP のプロジェクトに、事業所ごとのサービスアカウントを作る。buddy はサービスアカウントの鍵を持たず、Application Default Credentials で認証した主体から、事業所のサービスアカウントになりすまして Google Calendar API を呼ぶ。

- 事業所のアカウント: 職員は、自分の事業所のサービスアカウントにカレンダーを共有する。ほかの事業所のアカウントには共有されていないので、ほかの事業所の職員が ID を入れても読めない。
- 事業所の決め方: 要求を受ける操作は、要求の職員かトークンの組織から事業所を決める。要求を受けない書き出しと増分の取得は、結び付けたカレンダーの行の事業所（`external_calendars.facility_id`）で決める。要求の本文からは受けない。
- 対応の置き場: 組織の ID（`org_id`）とサービスアカウントのメールアドレスの対応を、運営側が設定のファイルで渡す。予定の API と照合の API は、同じ形の設定を読む。予定の API は、事業所の組織の ID で対応を引く。アカウントを作るのも、ロールを付けるのも運営側で、buddy の画面からは変えないためである。
- 権限: Application Default Credentials で認証する主体に、トークン作成者のロールを、事業所のサービスアカウントごとに付ける。プロジェクトの全体には付けない。主体は、Workload Identity Federation でプールの主体が直接に呼ぶならその主体、中間のサービスアカウントを経るならそのアカウントである。プロジェクトでは IAM Service Account Credentials API を有効にする。
- 鍵: buddy のリポジトリと動いている環境に、サービスアカウントの鍵を置かない。デプロイした環境は Workload Identity Federation で認証する。
- 手元の確かめ: 開発者は、検証の事業所のサービスアカウントになりすました Application Default Credentials を作る。コマンドは `gcloud auth application-default login --impersonate-service-account` である。鍵のファイルと `GOOGLE_APPLICATION_CREDENTIALS` は使わない。開発者のアカウントには、検証の事業所のアカウントのトークン作成者のロールだけを付け、本番の事業所のアカウントには付けない。本番の事業所のアカウントになりすませると、手元から利用者名の入った職員のカレンダーを読めるためである。
  - Application Default Credentials のアカウントが事業所のアカウントと同じときは、buddy は重ねてなりすまさない。見分け方は実装の issue で決める。
- 移行: 今の 1 つのサービスアカウントに共有したカレンダーは、事業所のアカウントに切り替えると読めなくなる。職員は、事業所のアカウントに共有し直し、今のアカウントへの共有を外す。運営側は、全ての職員が共有し直した後に、今のアカウントを止める。

## 承認の条件

- サービスアカウントが、ドメイン全体の委任なしに、予定の変更の共有だけで予定を書けるかは、まだ確かめていない。書き出しを本番で有効にする前に、運営側の Workspace の検証のカレンダー 1 つで確かめる。書けなければ、書き出しの認証を新しい ADR で決め直す。
- 手元のなりすましで、検証の事業所のアカウントに `serviceusage.services.use` を持つロールが要るかは、まだ確かめていない。同じ検証で確かめる。
- 事業所ごとに分け、なりすましで切り替える判断は、これらの確認を待たずに承認とする。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 事業所ごとのサービスアカウントに、なりすましで切り替える | 事業所の間でカレンダーを読めない。鍵を保管しない。事業所を足すときに、buddy のコードを変えない | 事業所を足すたびに、運営側がアカウントを作り、ロールを付け、設定に足す |
| 1 つのサービスアカウントのまま、ほかの事業所が結び付けたカレンダーを拒む | 運営側の操作が増えない | 最初に結び付けた事業所を確かめられない。ほかの事業所の職員が先に結び付ければ読める |
| 1 つのサービスアカウントのまま、カレンダーの持ち主のメールアドレスと職員のメールアドレスを比べる | 運営側の操作が増えない | 共有のアカウントが持つカレンダーと、2 つ目のカレンダーを結び付けられない |
| 事業所ごとのサービスアカウントの鍵を、buddy が持つ | なりすましの権限が要らない | 事業所の数だけ鍵を保管し、入れ替える必要がある |
| 事業所ごとに GCP のプロジェクトを分ける | 事業所の間を、プロジェクトの境界で分けられる | 事業所を足すたびにプロジェクトと課金と API の有効化が要る |

## Consequences

### Positive

- ほかの事業所の職員が共有したカレンダーは、公開していなければ、ID を入れても読めず、結び付けられない。
- 秘密の値から、サービスアカウントの鍵が無くなる。
- 事業所ごとに、カレンダーの共有の範囲と、なりすましの権限を外せる。

### Negative

- 事業所を足すときの運営側の手順が増える。サービスアカウントを作り、認証する主体にトークン作成者のロールを付け、buddy の設定に対応を足す。
- 認証する主体は、全ての事業所のサービスアカウントになりすませる。buddy が事業所を間違えると、ほかの事業所のカレンダーに届く。事業所は、要求の職員、トークンの組織、結び付けたカレンダーの行からだけ決める。
- 切り替えのときに、全ての職員がカレンダーを共有し直す必要がある。
- 事業所の数が、プロジェクトのサービスアカウントの上限に近づいたら、上限を増やすことを申し込む。
- 予定の API と照合の API の両方に、事業所ごとに Calendar API のクライアントを作る仕組みが要る。照合の API の Design Doc と README の、手元で鍵のファイルを使う手順は、実装の issue で直す。
