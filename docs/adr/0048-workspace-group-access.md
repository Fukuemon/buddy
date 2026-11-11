# ADR-0048: 自動の登録の事業所で buddy を使える人を、Workspace のグループに直接入れた職員にし、ブローカーが上流のログインのたびに Cloud Identity Groups API で所属を読む

## Status

承認

## Context

初回のログインで職員を自動で登録する事業所では、buddy を使える人を、事業所の Google Workspace の管理者が決める。  
Workspace で外した職員は、12 時間以内に buddy を使えなくなればよい。  
事業所の Workspace のエディションは分からないので、Business Starter でも使える仕組みを前提にする。

- 初回のログインで職員を自動で登録する事業所は、ADR-0049 で決める。
  - ADR-0049: [自動の登録の事業所では、初回のログインで職員を一般の職員として登録し、ブローカーが職員を作って予定の API が業務の職員を作る](0049-jit-staff-registration.md)
- ブローカーは、事業所の上流の IdP の設定に許すドメインがあれば、Google の ID token の `hd` を比べ、合わないログインを拒む。結び付け済みの職員も、ログインのたびに確認する。
  - `hd` は組織のドメインだけを表し、ドメインの中の誰が使えるかは表さない。
- Google の ID token には、グループとロールのクレームが無い。組織に関わるクレームは `hd` だけである。
  - 出典: [OpenID Connect（Google Identity）](https://developers.google.com/identity/openid-connect/openid-connect)
- token_hook は、上流の IdP でログインしてから 12 時間を過ぎたトークンを拒む。Hydra のログインのセッションも 12 時間で切れる。上流の IdP のログインで拒めば、遅くとも 12 時間後には buddy を使えなくなる。
  - ADR-0044: [token_hook が答えないときはトークンを発行せず、待ちを短くし、冗長化と監視で止まる時間を減らす](0044-token-hook-fail-closed.md)
- Workspace のカスタムの SAML のアプリは、グループにだけオンにできる。ただし、オンとオフの反映には最大 24 時間かかる。ブローカーは OIDC の RP だけを持つ。
  - 出典: [Set up your own custom SAML app](https://knowledge.workspace.google.com/admin/apps/set-up-your-own-custom-saml-app)
  - ADR-0002: [OIDC のブローカーを、Ory Hydra と、自作の login and consent app で作る](0002-id-broker-hydra.md)
- 管理コンソールの API の制御は、組織部門ごとにアプリを許す。個別のアプリを「ブロック」にしたときに、ログインのスコープだけを求めるアプリのログインが止まるかは、文書に書かれていない。
  - 出典: [Control which third-party & internal apps access Google Workspace data](https://knowledge.workspace.google.com/admin/apps/control-which-third-party-and-internal-apps-access-google-workspace-data)
- Cloud Identity Groups API は、ドメイン全体の委任なしで呼べる。事業所の特権管理者がサービスアカウントに Group Administrator のロールを割り当てると、サービスアカウントは Google のアカウントになりすまさずに呼べる。このロールは、ドメインの全てのグループに届き、ほかのリソースには届かない。前提として、ドメインで Google Groups for Business を有効にし、ドメインの Google のアカウントがグループを作れるようにする。
  - 出典: [Setting up the Groups API](https://docs.cloud.google.com/identity/docs/how-to/setup)
  - 出典: [Assign specific admin roles](https://knowledge.workspace.google.com/admin/users/assign-specific-admin-roles)
- 間接の所属を読む API（`checkTransitiveMembership` など）は、Business Starter、Business Standard、Business Plus では使えない。直接の所属を読む API（`groups.memberships.lookup` など）の文書には、エディションの制限が書かれていない。Business Starter で直接の所属を読めるかは、確認していない。
  - 出典: [New APIs to view and visualize Google Group membership](https://workspaceupdates.googleblog.com/2020/10/new-apis-view-visualize-google-group-membership.html)
  - 出典: [groups.memberships.lookup](https://docs.cloud.google.com/identity/docs/reference/rest/v1/groups.memberships/lookup)
- Workspace のアカウントを停止したときに、Sign in with Google の新しいログインが拒まれるかは、文書に書かれていない。
  - 出典: [Suspend a user temporarily](https://knowledge.workspace.google.com/admin/users/suspend-a-user-temporarily)
- 職員のカレンダーは、事業所ごとのサービスアカウントへの共有で読み書きする。ドメイン全体の委任は、範囲が広すぎるので採らなかった。
  - ADR-0030: [職員のカレンダーを、事業所ごとのサービスアカウントへの共有で読み書きする](0030-google-calendar-service-accounts.md)

## Decision

自動の登録の事業所では、buddy を使える人を、事業所の Workspace の buddy 用のグループに直接入れた職員にする。  
ブローカーは、上流の IdP のログインのたびに、Cloud Identity Groups API でグループの直接の所属を読み、所属しない職員のログインを拒む。  
上流のログインのたびに読むので、グループから外した職員は、token_hook が拒むまでの 12 時間以内に、次のログインで止まる。

### グループと設定

- 事業所の Workspace の管理者は、buddy 用のグループを 1 つ作り、使う職員を直接のメンバーとして入れる。
  - 入れ子のグループの職員は拒む。間接の所属を読む API を Business のエディションで使えないためである。
- ブローカーの上流の IdP の設定に、事業所ごとのグループ（グループのメールアドレス）と、グループを読むサービスアカウントキーの配置先を持つ。
  - 自動の登録の事業所では、許すドメインとグループを必須にする。どちらかが無ければ、ブローカーは起動しない。
  - グループの確認は、自動の登録の事業所だけで行う。自動の登録でない事業所の設定にグループがあれば、ブローカーは起動しない。
- サービスアカウントは、事業所ごとに、ブローカー用に作る。ADR-0030 のカレンダーのサービスアカウントとは分ける。
  - 理由: 1 つのキーが漏れたときに届く範囲を、1 つの事業所の 1 つの用途に限るためである。
- 事業所の特権管理者は、そのサービスアカウントに Group Administrator のロールを割り当てる。ドメイン全体の委任は使わない。
  - 理由: 委任なしで呼ぶ手順が公式の文書にあるのは、Cloud Identity Groups API と Group Administrator のロールの組だけである。

### ログインのときの確認

- ブローカーは、上流の ID token を検証し、`hd` を許すドメインと比べた後に、グループの所属を読む。読むのは、結び付けと自動の登録より前である。
  - 結び付け済みの職員と、管理者が先に登録した職員（最初のマネージャーを含む）にも当てる。自動の登録の事業所では、使える人を Workspace の側に集めるためである。
- 所属を読むメンバーのキーには、ID token の確認済みのメールを使う。
- 所属しない職員のログインは、`access_denied` で拒む。web は、事業所の管理者に確認するよう伝える文を出す。
- Google の API が答えないか、エラーを返したときは、ログインを `server_error` で拒む。所属を確認できないまま通さない。
  - 呼び出しは 2 秒で打ち切る。ADR-0044 の token_hook の待ちと同じ考え方で、ログインの画面を長く止めないためである。
- 拒んだログインは、Warn で、`reason`、`org_id`、`staff_id` を含む `error` をログに書く。メールは書かない。
- token_hook では所属を読まない。トークンを発行するたびに Google の API を呼ぶと、Google の障害で全てのトークンの発行が止まるためである。12 時間の条件は、上流のログインのときの確認で満たせる。

### 職員を外す手順

- 事業所の管理者が職員を外すときは、buddy 用のグループから外す。グループの所属はブローカーが読むので、アカウントの停止の扱いによらず止まる。
- Workspace のアカウントを停止しただけでグループに残した職員が止まるかは、Google の文書で確認していない。運用の手順に、この点を書く。

### 切り替える条件

最初の自動の登録の事業所を設定するときに、Business Starter のエディションで、直接の所属を Group Administrator のロールで読めることを確認する。  
読めなければ、この ADR を置き換える ADR を書き、使える人の決め方を次の形に切り替える。

- `hd` の確認で、事業所のドメインのアカウントに限る。
- 事業所の管理者が、管理コンソールの API の制御で、buddy のクライアントを組織部門ごとに許す。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** Cloud Identity Groups API で、グループの直接の所属を上流のログインのたびに読む | グループで使える人を決められる。API はグループの今の所属を読むので、Google の側の反映の遅れを待たない。委任なしで呼ぶ手順が公式の文書にある | Group Administrator のロールは、ドメインの全てのグループを変えられる。Business Starter で読めるかは確認していない。入れ子のグループは使えない |
| Admin SDK Directory API の `members.hasMember` を、グループの読み取りだけのカスタムのロールで呼ぶ | ロールの範囲を読み取りに限れる。入れ子のグループも同じドメインなら判定できる | ロールを割り当てたサービスアカウントで Directory API を呼べるとは、公式の文書に書かれていない。Business Starter で呼べるかも書かれていない |
| カスタムの SAML のアプリをグループにだけオンにする | 事業所の管理者の画面で完結する。グループの所属を SAML の応答で受けられる | オンとオフの反映に最大 24 時間かかり、12 時間を超えることがある。ブローカーに SAML の SP を足す |
| `hd` の確認だけにする | buddy の変更が無い。どのエディションでも使える | ドメインの全員が使える。グループで選べない |
| 管理コンソールの API の制御で、組織部門ごとに許す | buddy の変更が無い | グループで選べない。ログインのスコープだけのアプリのログインが止まるかは、文書に書かれていない |

## Consequences

### Positive

- 事業所の管理者は、グループにメンバーを足すか外すだけで、buddy を使える人を決められる。buddy のマネージャーが職員を 1 人ずつ登録しない。
- グループから外した職員は、12 時間以内に buddy を使えなくなる。
- ドメイン全体の委任を使わない。

### Negative

- Group Administrator のロールは、事業所のドメインの全てのグループを読み、作り、変え、消せる。buddy が使うのは 1 つのグループの所属を読む操作だけだが、ロールはそれより広い。
- サービスアカウントキーが漏れると、その事業所の全てのグループを変えられる。キーは、ブローカーのほかのシークレットと同じく、インフラからファイルで渡し、リポジトリと DB に置かない。キーは事業所ごとに分け、漏れたときは事業所の特権管理者がロールを外すか、キーを無効にする。
- 事業所の特権管理者は、グループの作成、サービスアカウントへのロールの割り当て、Google Groups for Business の有効化を行う。ロールの割り当ての反映には最大 24 時間かかる。
- 上流のログインのたびに Google の API を呼ぶ。Google の API が止まると、自動の登録の事業所の職員は新しくログインできない。ログイン済みの職員は、12 時間の間は使い続けられる。
- Business Starter で読めないと分かったら、この ADR を置き換える。
