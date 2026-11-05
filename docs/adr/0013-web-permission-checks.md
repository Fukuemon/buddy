# ADR-0013: web の画面の権限の確認を、route の beforeLoad と PermissionGuard で宣言し、1 つの関数で評価する

## Status

承認

## Context

web の画面で、どの画面を開けるか、画面の中のどのボタンとダイアログを出すかを、権限で出し分ける。  
決定に関わる事実は次のとおり。

- 権限は、役職のデフォルトの権限と職員ごとの上書きで持ち、9 つある。
  - ADR-0002: [権限を役職のデフォルトと職員ごとの上書きで持ち、職員の管理と照合も権限で許し、訪問するかを職員に持つ](0002-pbac.md)
- 9 つのうち、画面を開けるかに使うのは `staff.manage` と `receipt.check` の 2 つである。
  - 予定の 7 つの権限は、予定ごとの閲覧と編集の判定に使う。
- 今は各機能の Container が、権限が無ければ `PageForbiddenMessage` を出す。
  - `staff.manage` の画面は 8 つの Container が確認し、照合の画面は `ReceiptPermissionGate` が確認する。
  - どの画面にどの権限が要るかは、Container を開かないと分からない。
- 画面に渡す職員の情報（Viewer）は、`canManageStaff` と `canCheckReceipt` の真偽値で権限を持つ。
  - 画面の単位の権限を足すたびに、Viewer の型と BFF の変換を足すことになる。
- BFF は、Viewer を返すたびに予定の API の `GET /v1/me` で権限を読み直す。
  - ブラウザの Viewer の query は `staleTime` が無限なので、画面を読み直すまで古い権限で出し分ける。
- 業務の規則と認可は API が持ち、web は画面の出し分けだけを持つ。
  - route の確認はデータの認可の境界にならず、サーバーの確認が要る。
  - 出典: [Authenticated Routes - TanStack Router](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)

## Decision

権限の確認を次の 4 つの段に分ける。  
web の 3 つの段は画面の出し分けだけを行い、拒む判断はデータの段の API が持つ。

| 段 | 確認すること | 配置先 |
| --- | --- | --- |
| 認証 | ログインしているか | `__root.tsx` の `beforeLoad` |
| 画面 | その画面を開いてよいか | 各 route の `beforeLoad` で呼ぶ `requirePermission` |
| 画面の中 | ボタンとダイアログを出してよいか | `PermissionGuard` |
| データ | そのデータを読み書きしてよいか | 予定の API と照合の API |

### 画面の段

各 route の `beforeLoad` で、`requirePermission('staff.manage')` のように 1 行で画面に要る権限を宣言する。  
権限の要らない画面も、`requirePermission('none')` と明示的に宣言する。  
全ての route が `requirePermission` を宣言しているかを、route の一覧を読むテストで確認する。  
`/auth/` の下の route と、画面を持たない route（`/healthz`、`/readyz`）は、テストの対象から外す。

`beforeLoad` が失敗すると、その route と子の route の loader は動かない。  
権限が無い職員には、画面のデータの API を呼ばずに、権限が無いことを伝える。  
出典: [RouteOptions type - TanStack Router](https://tanstack.com/router/latest/docs/framework/react/api/router/RouteOptionsType)

### 権限が無いときの表示

権限が無いときは、URL を変えずに、その場で `PageForbiddenMessage` を出す。  
`requirePermission` は権限が無いことを表すエラーを投げ、route のエラーの表示が、画面の枠（ヘッダーとナビ）の中に `PageForbiddenMessage` を出す。  
route のエラーの表示は、route、親の route、router のデフォルトの順に探される。  
出典: [Data Loading - TanStack Router](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading)

その場で出すのは、今の画面と同じく URL を変えないためである。  
権限を付けてもらった職員は、同じ URL を開き直せば画面に入れる。

### 画面の中の段

画面の中のボタンとダイアログは、`<PermissionGuard permission="staff.manage">` で出し分ける。  
`PermissionGuard` は `requirePermission` と同じ権限のキーを受け取り、Viewer を props ではなく query から読む。  
予定の 7 つの権限による予定ごとの判定は、対象の職員とチームを見るので、機能のコードに残す。

### 権限のキーと評価の関数

`requirePermission` と `PermissionGuard` は、どちらも 1 つの純粋な関数 `hasPermission(viewer, permission)` で評価する。  
権限のキーは API の権限のコードとそろえて 1 か所に定義し、型から外れた文字列を書くと型のエラーになるようにする。  
`hasPermission` は、Viewer と権限と期待する結果を並べた表の形のテストで確認する。

Viewer は、真偽値の代わりに、職員が持つ権限のコードの一覧を持つ。  
BFF の変換は、API の権限のコードをそのまま写す。  
画面の単位の権限が増えても、Viewer の型と BFF の変換を変えずに済む。  
対象を持つ予定の権限は、予定ごとの判定に使うので、対象とともに今の形で持つ。

### Viewer を取り直す時機

ブラウザの Viewer の query を、次の 2 つの時機に取り直す。

- 職員の権限、役職、チームを変える操作の後に、Viewer の query を invalidate し、route の確認をやり直す。
  - 対象が自分かどうかを見分けずに取り直す。取り直しは `GET /v1/me` の 1 回で、自分を変えたときに取り直さない場合が無くなる。
- ほかの職員が自分の権限を変えたときは、Viewer の query の `staleTime` を 5 分にし、古くなった後にウィンドウにフォーカスが戻ったときと、画面を移ったときに取り直す。
  - TanStack Query は、古くなった query を、ウィンドウにフォーカスが戻ったときに裏で取り直す。デフォルトで有効である。
  - 出典: [Window Focus Refetching - TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching)

`staleTime` は、データを古いとみなすまでの時間で、過ぎたときに取り直すタイマーではない。  
出典: [Important Defaults - TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)

ほかの職員が権限を変えた後は、5 分が過ぎてから、次にウィンドウにフォーカスが戻るか画面を移るまで、古い権限で出し分ける。  
決まった間隔での取り直しは足さない。  
権限を変える頻度は低く、同じ画面をフォーカスしたまま使い続ける間に権限を外された操作をしても、API が拒むためである。

## Considered Options

画面の段の確認の配置先は、次の 3 つを比べた。

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 各 route の `beforeLoad` で `requirePermission` を 1 行で宣言する | route のファイルを開けば、画面に要る権限が分かる。権限を変えるときは 1 行を直す。「どちらかの権限」の条件も書ける | 画面を足したときに宣言を書き忘れうる。全ての route の宣言を確認するテストが要る |
| 今のまま Container で確認する | route の書き方を変えずに済む | 画面を足すときに確認を書き忘れても気づけない。どの画面にどの権限が要るかを route から読めない |
| URL に出ないレイアウト（`_staffManage/`）で子の route をまとめて確認する | ディレクトリの一覧で、画面に要る権限が分かる。書き忘れが起きない | 権限を変えるたびにファイルを移し、route の ID と機能のコードの `useSearch({ from })` を書き換える。「どちらかの権限」を表せない。カレンダーの連携の画面は URL が `/schedule/...` で、URL の階層と権限のまとまりがずれる |

TanStack Router のガイドは、ロールのような粗いまとまりを URL に出ないレイアウトで、細かい権限を各画面の `beforeLoad` で守る例を挙げる。  
PBAC では画面に要る権限が変わりやすいので、レイアウトでまとめる形を採らない。  
出典: [Role-Based Access Control - TanStack Router](https://tanstack.com/router/latest/docs/framework/react/how-to/setup-rbac)

権限が無いときの表示は、次の 2 つを比べた。

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** URL を変えずに、その場で `PageForbiddenMessage` を出す | 今の画面と同じ振る舞いで、権限を付けてもらった後に同じ URL を開き直せばよい | route のエラーの表示が、権限が無いエラーと、ほかのエラーを見分ける必要がある |
| 権限が無いことを伝える route へ移す | 理由と戻り先を 1 つの画面で案内できる | URL が変わり、権限を付けてもらった後に元の画面へ戻る URL を別に持つ必要がある |

## Consequences

### Positive

- route のファイルを開けば、画面に要る権限が分かる。
- 画面の段と画面の中の段が、同じ権限のキーと 1 つの評価の関数を使う。
- 権限が無い職員の画面は、データの API を呼ばない。
- 職員の管理の画面で自分の権限を変えると、画面を読み直さずに出し分けが変わる。

### Negative

- 全ての route の宣言を確認するテストを保つ必要がある。
- ほかの職員が権限を変えた後は、5 分が過ぎてから、次にウィンドウにフォーカスが戻るか画面を移るまで、古い権限で画面を出し分ける。
