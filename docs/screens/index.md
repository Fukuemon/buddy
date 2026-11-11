# 画面仕様書

画面ごとに、何を表示し、何ができるかを書く。  
画面を開ける職員は、[PRD の画面の一覧](../PRD.md#画面の一覧) にある。  
新しい画面の仕様書は、テンプレートの `docs/screens/_template/` をコピーし、[画面仕様書の規約](rules.md) に従って書く。

## 画面の一覧

| 画面の ID | URL | 仕様書 |
| --- | --- | --- |
| `schedule-calendar` | `/schedule` | [予定のカレンダー](schedule-calendar_予定のカレンダー/index.md) |
| `schedule-new` | `/schedule/new` | [予定の作成](schedule-new_予定の作成/index.md) |
| `schedule-detail` | `/schedule/$scheduleId` | [予定の詳細](schedule-detail_予定の詳細/index.md) |
| `schedule-edit` | `/schedule/$scheduleId/edit` | [予定の編集](schedule-edit_予定の編集/index.md) |
| `schedule-recurrence` | `/schedule/$scheduleId/recurrence` | [繰り返しの変更](schedule-recurrence_繰り返しの変更/index.md) |
| `schedule-link` | `/schedule/link` | [カレンダーの連携](schedule-link_カレンダーの連携/index.md) |
| `schedule-import` | `/schedule/import` | [予定の取り込み](schedule-import_予定の取り込み/index.md) |
| `schedule-review` | `/schedule/review` | [確認が必要な予定](schedule-review_確認が必要な予定/index.md) |
| `schedule-cutover` | `/schedule/link/cutover` | [予定の管理を buddy に移す](schedule-cutover_予定の管理をbuddyに移す/index.md) |
| `patient-list` | `/patients` | [利用者の一覧](patient-list_利用者の一覧/index.md) |
| `patient-new` | `/patients/new` | [利用者の登録](patient-new_利用者の登録/index.md) |
| `patient-detail` | `/patients/$patientId` | [利用者の詳細](patient-detail_利用者の詳細/index.md) |
| `staff-list` | `/staff` | [職員の一覧](staff-list_職員の一覧/index.md) |
| `staff-new` | `/staff/new` | [職員の登録](staff-new_職員の登録/index.md) |
| `staff-detail` | `/staff/$staffId` | [職員の詳細](staff-detail_職員の詳細/index.md) |
| `organization-list` | `/organization` | [部署とチーム](organization-list_部署とチーム/index.md) |
| `receipt-upload` | `/receipt` | [照合](receipt-upload_照合/index.md) |
| `receipt-result` | `/receipt/result` | [照合の結果](receipt-result_照合の結果/index.md) |
| `account-login` | `/auth/login` | [ログイン](account-login_ログイン/index.md) |
| `account-error` | `/auth/error` | [ログインの失敗](account-error_ログインの失敗/index.md) |
| `account-profile` | `/me` | [自分の情報](account-profile_自分の情報/index.md) |

- 役職と権限の対応は、[PRD の役職ごとの権限](../PRD.md#役職ごとの権限) にある。
- 予定の作成、詳細、編集は、予定のカレンダーの上にモーダルとして重ねて出す。
  - URL は `/schedule` の子で、カレンダーの search params を引き継ぐ。
- 職員の登録は、職員の一覧の上にモーダルとして重ねて出す。
  - 職員の編集は、職員の詳細の中で行うので、別の画面にしない。
- 利用者の登録は、利用者の一覧の上にモーダルとして重ねて出す。
  - 利用者の編集は、利用者の詳細の中で行うので、別の画面にしない。

## 画面の ID の規則

- 形は `<ドメイン>-<種類>` にする。
  - 小文字の英語と `-` だけを使う。
- ドメインは BCD Design の Domain の名詞にする。
  - 今使うのは `schedule`、`patient`、`staff`、`organization`、`receipt`、`account`。
  - `organization` は、事業所の中の部署、チーム、役職を指す。
    - 予定の API の Go のパッケージと OpenAPI の tag の名前にそろえた。
- 種類は次の表の語から選ぶ。
  - 足すときは、この表に足す。

| 種類 | 意味 |
| --- | --- |
| `list` | 一覧 |
| `calendar` | カレンダーの表示 |
| `detail` | 1 件の詳細 |
| `new` | 作成 |
| `edit` | 編集 |
| `upload` | ファイルを受け取る |
| `result` | 処理の結果 |
| `link` | 外部のサービスとの結び付け |
| `import` | 外部のサービスからの取り込み |
| `review` | 人が確認して決める必要があるものの一覧 |
| `cutover` | 移行 |
| `recurrence` | 繰り返しの規則の変更 |
| `login`、`profile`、`error` | `account` のドメインだけで使う。`error` はログインの失敗 |

- 固有の URL を持つものを 1 つの画面に数える。
  - URL を持つモーダルも画面にする。
  - 予定のキャンセルのような、URL を持たない確認のダイアログは、親の画面の構成要素にする。
- URL と ID をそろえる。
  - `/schedule/new` は `schedule-new` にする。
- 一度決めた ID は、画面の名前を変えても変えない。
  - 仕様書のファイル名、ワイヤーフレーム、E2E のシナリオの ID が ID を使うためである。

## 画面の間の遷移

ログインした後の画面は、左端のナビゲーションで互いに移れる。  
ナビゲーションの見出しと項目、出す職員は、[職員の一覧のナビゲーション](staff-list_職員の一覧/index.md#ナビゲーション) にある。  
予定と照合の画面の間の遷移は次のとおり。

```mermaid
flowchart TB
  root["/"]
  calendar["予定のカレンダー<br/>/schedule"]
  create["予定の作成<br/>/schedule/new"]
  detail["予定の詳細<br/>/schedule/$scheduleId"]
  edit["予定の編集<br/>/schedule/$scheduleId/edit"]
  recurrence["繰り返しの変更<br/>/schedule/$scheduleId/recurrence"]
  upload["照合<br/>/receipt"]
  result["照合の結果<br/>/receipt/result"]
  root -- "リダイレクト" --> calendar
  calendar -- "予定を作成、空いた時間、時間の枠" --> create
  create -- "作成に成功、閉じる" --> calendar
  calendar -- "予定を押す" --> detail
  detail -- "閉じる" --> calendar
  detail -- "編集、繰り返しの回の「この予定を編集」" --> edit
  edit -- "保存に成功、閉じる" --> detail
  edit -- "取得の失敗から閉じる" --> calendar
  detail -- "繰り返しの回の「繰り返しを変更」" --> recurrence
  recurrence -- "保存に成功" --> calendar
  recurrence -- "閉じる" --> detail
  calendar -- "ナビゲーションの「照合」" --> upload
  upload -- "ナビゲーションの「カレンダー」" --> calendar
  upload -- "照合に成功" --> result
  result -- "別のファイルで照合する、照合の画面へ、ナビゲーションの「照合」" --> upload
  result -- "ナビゲーションの「カレンダー」" --> calendar
```

カレンダーの連携、予定の取り込み、確認が必要な予定の画面にも、同じナビゲーションを出す。  
職員の管理の権限を持つ職員が使う、Google カレンダーとの連携の画面の間の遷移は次のとおり。  
図には、ナビゲーションによる遷移のうち、予定のカレンダーとの間の遷移だけを描く。

```mermaid
flowchart TB
  calendar["予定のカレンダー<br/>/schedule"]
  detail["予定の詳細<br/>/schedule/$scheduleId"]
  link["カレンダーの連携<br/>/schedule/link"]
  import["予定の取り込み<br/>/schedule/import"]
  review["確認が必要な予定<br/>/schedule/review"]
  calendar -- "ナビゲーションの「取り込み」" --> import
  calendar -- "ナビゲーションの「連携」" --> link
  import -- "「カレンダーの連携」" --> link
  link -- "「取り込む」" --> import
  cutover["予定の管理を buddy に移す<br/>/schedule/link/cutover"]
  link -- "「予定の管理を buddy に移す」" --> cutover
  cutover -- "「取り込む」" --> import
  import -- "「移行の状況に戻る」" --> cutover
  cutover -- "「カレンダーの連携」" --> link
  import -- "「予定のカレンダーで見る」、ナビゲーションの「カレンダー」" --> calendar
  link -- "ナビゲーションの「カレンダー」" --> calendar
  calendar -- "ナビゲーションの「要確認」" --> review
  review -- "「予定を開く」" --> detail
  review -- "ナビゲーションの「カレンダー」" --> calendar
```

職員の画面の間の遷移は次のとおり。  
図には、ナビゲーションによる遷移のうち、予定のカレンダーとの間の遷移だけを描く。

```mermaid
flowchart TB
  calendar["予定のカレンダー<br/>/schedule"]
  list["職員の一覧<br/>/staff"]
  create["職員の登録<br/>/staff/new"]
  staff["職員の詳細<br/>/staff/$staffId"]
  scheduleDetail["予定の詳細<br/>/schedule/$scheduleId"]
  calendar -- "ナビゲーションの「職員」" --> list
  list -- "職員を登録" --> create
  create -- "閉じる、キャンセル" --> list
  create -- "登録に成功" --> staff
  list -- "職員の名前" --> staff
  staff -- "職員の一覧へ、ナビゲーションの「職員」" --> list
  staff -- "休職と退職の確認の、残る予定" --> scheduleDetail
  list -- "ナビゲーションの「カレンダー」" --> calendar
```

部署とチームの画面は、見出し「職員」の下の「部署とチーム」から開く。  
部署とチームの作成と編集は URL を持たないダイアログで、画面の間の遷移は無い。

利用者の画面の間の遷移は次のとおり。  
図には、ナビゲーションによる遷移のうち、予定のカレンダーとの間の遷移だけを描く。

```mermaid
flowchart TB
  calendar["予定のカレンダー<br/>/schedule"]
  list["利用者の一覧<br/>/patients"]
  create["利用者の登録<br/>/patients/new"]
  patient["利用者の詳細<br/>/patients/$patientId"]
  scheduleDetail["予定の詳細<br/>/schedule/$scheduleId"]
  calendar -- "ナビゲーションの「利用者」" --> list
  list -- "利用者を登録" --> create
  create -- "閉じる、キャンセル" --> list
  create -- "登録に成功" --> patient
  list -- "利用者の名前" --> patient
  patient -- "利用者の一覧へ、ナビゲーションの「利用者」" --> list
  patient -- "利用の終了の確認の、残る予定" --> scheduleDetail
  list -- "ナビゲーションの「カレンダー」" --> calendar
```

自分の情報の画面は、ヘッダーを出す全ての画面の、アカウントのメニューの「自分の情報」から開く。  
職員の管理の権限を持つ職員は、自分の情報の「職員の詳細を開く」で、自分の職員の詳細へ移れる。

ログアウトすると `/` へ移り、ログインしていないので、`/` からそのままログインへ進む。  
ログインした後は、`/` を経て予定のカレンダーに戻る。  
ログインしていないときと、ログインに失敗したときの遷移は次のとおり。

```mermaid
flowchart TB
  screen["buddy の画面"]
  login["ログイン<br/>/auth/login"]
  broker["ID ブローカーと事業所の IdP のログインの画面"]
  callback["ログインの後の戻り<br/>/auth/callback"]
  error["ログインの失敗<br/>/auth/error"]
  screen -- "ログインしていない" --> login
  login -- "リダイレクト" --> broker
  broker -- "ログインした" --> callback
  callback -- "成功" --> screen
  callback -- "失敗、事業所に登録されていない" --> error
  error -- "もう一度ログインする" --> login
```

## 全ての画面に共通する状態

### 画面を表示できない

画面を開く前の処理か画面の描画で、画面が扱っていない失敗が起きたときに、どの画面もこの表示に替わる。  
例えば、BFF を通すときに、ログインした職員を読むためのセッションの保存先に届かないと、この表示になる。  
画面ごとの仕様書は、この状態を状態のタブに数えない。

- ヘッダーは「buddy」だけを出し、メニューのボタンとアカウントのボタンは出さない。
  - ナビゲーションも出さない。
- タイトルは「画面を表示できませんでした」、説明の文は「時間をおいて、読み直してください。」。
- 「読み直す」のリンクを押すと、今の画面の URL を読み込み直す。
- E2E が指す目印は、表示の全体の `page-error`。
  - この状態はモックを持たないので、`page-error` の元はこのセクションである。
- 実装は `apps/web/src/routes/__root.tsx` の `RootError` と、`apps/web/src/components/page/PageErrorMessage.tsx`。
- カタログ: [PageErrorMessage の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-pageerrormessage--default)

### 一時的に使えない

ログインしたままの職員を、一時的に確認できないときに、どの画面もこの表示に替わる。  
ログインの期限を延ばす処理が、ログインの仕組みの障害で失敗したときが当たる。決まりは [ADR-0044 の BFF は refresh を 1 度だけ試す](../adr/0044-token-hook-fail-closed.md#bff-は-refresh-を-1-度だけ試す) にある。  
画面ごとの仕様書は、この状態を状態のタブに数えない。

- ログインは残る。障害が直った後に読み直すと、ログインし直さずに画面が出る。
- ヘッダーは「buddy」だけを出し、メニューのボタンとアカウントのボタンは出さない。
  - ナビゲーションも出さない。
- タイトルは「buddy を一時的に使えません」、説明の文は「ログインしたまま、しばらく待ってから読み直してください。」。
- 「読み直す」のリンクを押すと、今の画面の URL を読み込み直す。
- E2E が指す目印は、表示の全体の `page-unavailable`。
  - この状態はモックを持たないので、`page-unavailable` の正本はこのセクションである。
- 実装は `apps/web/src/routes/__root.tsx` の `RootError` と、`apps/web/src/components/page/PageUnavailableMessage.tsx`。
- カタログ: [PageUnavailableMessage の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-pageunavailablemessage--default)
