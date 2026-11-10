# #877 token_hook と ID ブローカーの障害のときの動きを測った結果

[#877](https://github.com/Fukuemon/buddy/issues/877) の検証の観点 1、2、5 を、ローカル環境の compose で測った結果。  
故障ごとに、新しいログイン、refresh、既発行の JWT での API の呼び出しがどうなるかと、故障を戻した後の動きを記録する。  
障害のときの方針（fail-closed のままにするか、冗長化、監視、復旧の手順）は、この文書では決めない。

## 測った環境

- Ory Hydra は v26.2.0 で、設定は `compose/hydra/hydra.yml` のままにした。
  - access token は 5 分、ログインのセッションは 12 時間で切れる。
- 測ったコミットは `acc269ec` である。
- compose は、web とその依存（Hydra、ブローカー、予定の API、照合の API、PostgreSQL、Valkey、上流の IdP のフェイク）だけを起動した。
- トークンのエンドポイントは、`compose/dev-token.sh` と同じ道でログインして、curl で直に呼んだ。
- web の BFF は、ブラウザと同じ道でログインし、`/schedule` を開いて、Valkey のセッションが残るかを見た。
  - access token の期限は、待たずに Valkey のセッションの `expiresAt` を書き換えて、refresh を起こした。

## 故障の入れ方

故障は compose の操作と、コミットしないテスト用のスタブで入れた。  
本番のコードには、故障を入れる仕組みを足していない。

| 故障 | 入れ方 |
| --- | --- |
| ブローカーの停止 | `docker compose stop` で、ブローカーと、hook を受けるスタブの両方を止める。Hydra からは、hook の宛先の名前を引けない接続の失敗になる。ブローカーへ直に向けて止めたときと同じ種類の失敗である |
| ブローカーの DB だけの停止 | PostgreSQL で `broker` のデータベースへの接続を禁じ、張られた接続を切る。Hydra と予定の API の DB は動いたままにする |
| PostgreSQL の全体の停止 | `docker compose stop postgres`。ローカル環境では、Hydra、ブローカー、予定の API が同じインスタンスを使う |
| hook の 500、403 | Hydra の `oauth2.token_hook.url` を環境変数でスタブに向け、スタブが決まった状態コードを返す。ほかの故障では、スタブは hook をブローカーへそのまま渡す。スタブの 403 はブローカーの判定を通さないので、ブローカーのログインの画面は職員を通す |
| hook のタイムアウト | スタブが 120 秒待ってから答える |
| hook の遅れ | スタブが 7 秒待ってから、ブローカーに渡す。BFF が Hydra を待つ 5 秒より長くする |
| hook の宛先が答えない | スタブのコンテナを `docker compose pause` で止める。接続は張れるが、答えが返らない |
| Hydra の停止 | `docker compose stop hydra` |

スタブは、受けた hook の数を数え、1 回のトークンの要求で Hydra が hook を何回呼んだかを測るのに使った。  
スタブが止まっている故障（ブローカーの停止、pause）の回数は、Hydra のログの `giving up after 3 attempt(s)` と `retrying in` の行で数えた。

## 期待と結果の対応

測る前に、コードと設定から期待の動きを書き、測った結果と比べた。

コードから読めて、結果と合ったこと。

- hook の判定の順（鍵、本文、client credentials、職員の取得、状態、上流でのログインからの時間）と、DB の失敗で 500、有効でない職員で 403 を返すこと
  - `services/broker/internal/internalapi/token_hook_handler.go:46-102` / [GitHub](https://github.com/Fukuemon/buddy/blob/acc269ec37137237606bcdbd6d52ee2acc3aab9e/services/broker/internal/internalapi/token_hook_handler.go#L46-L102)
- 休職と退職は refresh token を取り消すので、hook より前に `invalid_grant` で拒まれること
  - `services/broker/DesignDoc.md:444-445` / [GitHub](https://github.com/Fukuemon/buddy/blob/acc269ec37137237606bcdbd6d52ee2acc3aab9e/services/broker/DesignDoc.md#L444-L445)
- 既発行の JWT は、ブローカーと Hydra を呼ばずに API が検証するので、ブローカーと Hydra が止まっても通ること
- BFF は、`invalid_grant` と `access_denied` のときだけセッションを消し、ほかの失敗では残すこと

コードと設定から読めず、測って分かったこと。

- Hydra が hook を呼び直す回数（3 回）と、1 回の待ち（30 秒）と、答えない hook を待つ全体の長さ（約 93 秒）。`compose/hydra/hydra.yml` の `oauth2.token_hook` には、待ちと呼び直しを書いていない。
- hook が失敗した refresh で、Hydra は refresh token を使い切らないこと。hook の 500 で交換に失敗した認可コードも使い切らない。
- クライアントが待つのをやめると、Hydra も hook の呼び出しを打ち切り、トークンを発行しないこと。
- web の BFF が、access token の切れた 1 回の表示で refresh を 4 回試すこと。

期待と違ったこと。

- Hydra の停止で、BFF は 5 秒を待たず、すぐ失敗した。compose の中では、止めた Hydra の名前を引けないためである。
- PostgreSQL の全体の停止で、Hydra は refresh とログインに `invalid_client` を返した。DB の障害を、クライアントの認証の失敗として返す。

## Hydra が hook を呼ぶ回数と待つ長さ

Hydra v26.2.0 は、hook の宛先が 2xx と 403 以外を返すか、接続に失敗すると、1 秒と 2 秒の間を置いて 2 回呼び直す。  
1 回の呼び出しは 30 秒で打ち切る。  
3 回とも失敗すると、トークンの要求に 500 の `server_error` を返す。

| hook の答え | 呼んだ回数 | トークンの要求が返るまで | トークンの要求の結果 |
| --- | --- | --- | --- |
| 204 | 1 | 0.1 秒未満 | 200 |
| 403 | 1 | 0.1 秒未満 | 403 `access_denied` |
| 500 | 3 | 約 3 秒 | 500 `server_error`（`An error occurred while executing the token hook.`） |
| 接続の失敗（ブローカーの停止） | 3 | 約 3 秒 | 500 `server_error` |
| 答えない（120 秒の遅れ、pause） | 3 | 約 93 秒 | Hydra のログでは 500。クライアントには、答えの無いまま接続が切れた |

- 403 は、呼び直さずにすぐ拒む。
- クライアントが待つのをやめると、Hydra も hook の呼び出しを打ち切る。
  - hook が 7 秒かかるときに 5 秒で切ると、スタブの受けた呼び出しは 1 回で、5 秒で切れた。Hydra はその後に呼び直さず、トークンも発行しなかった。
- 約 93 秒で返す 500 がクライアントに届かない理由は、未確認である。
  - Hydra の HTTP サーバーの書き込みの待ちの上限による切断と推測する。

## 故障ごとの結果

どの故障でも、故障の前にログインして取った access token と refresh token を使った。  
「戻した後」は、故障の間に送った refresh token を、故障を戻してから送り直した結果である。

| 故障 | 新しいログイン | refresh | 既発行の JWT で予定の API | client credentials | 戻した後 |
| --- | --- | --- | --- | --- | --- |
| ブローカーの停止 | ログインの画面に届かない | 約 3 秒で 500 `server_error` | 200 | 約 3 秒で 500 | refresh は 200。ログインも通る |
| ブローカーの DB だけの停止 | ログインの画面は 200 で出るが、メールを送ると 500 | 約 3 秒で 500 `server_error` | 200 | 200 | refresh は 200。ログインも通る |
| PostgreSQL の全体の停止 | Hydra がクライアントを引けず `invalid_client` | 401 `invalid_client` | 500（予定の API が DB を引けない） | 401 | refresh は 200。ログインも通る |
| hook の 500 | 認可コードの交換が約 3 秒で 500 | 約 3 秒で 500 `server_error` | 200 | 約 3 秒で 500 | refresh は 200 |
| hook の 403 | 認可コードの交換が 403 `access_denied` | 403 `access_denied` | 200 | 403 | refresh は 200 |
| hook のタイムアウト | 認可コードの交換が答えない | 答えない（約 93 秒） | 200 | 答えない | refresh は 200 |
| hook の宛先が答えない | 認可コードの交換が答えない | 答えない | 200 | 答えない | refresh は 200 |
| Hydra の停止 | 認可のエンドポイントに届かない | 届かない | 200 | 届かない | refresh は 200。ログインも通る |

- 故障の間に送って失敗した refresh token は、どの故障でも、戻した後にそのまま使えた。
  - Hydra は、hook が失敗した refresh で refresh token を使い切らない。
  - 故障の間に送らなかった refresh token も、戻した後に使えた。
- hook の 500 で交換に失敗した認可コードも、hook を戻した後に同じコードで交換できた。
  - web の BFF は交換を送り直さず、ログインの失敗の画面を出す。
- ブローカーの DB だけが止まっている間、ブローカーの `GET /readyz` は 503 を返した。
  - hook の 500 は、ブローカーのログに ERROR の `内部の API がエラーを返す`（`reason` は `職員を引けません`）として 1 回の呼び出しごとに出た。
  - hook の成功と所要の時間は、ブローカーのログに出ない。
- client credentials のトークン（予定の API がブローカーの内部の API を呼ぶのに使う）も hook を通る。
  - ブローカーの DB を見ないので、DB だけの停止では発行された。
  - ブローカーが止まっているときは、職員の登録、休職、復職、退職の操作も、トークンを取れずに失敗する。

## web の BFF での見え方

BFF は、access token の期限の 60 秒前から refresh する。  
access token がまだ使えるか、もう切れているかで、利用者の見え方が分かれた。

| 故障 | access token がまだ使える | access token が切れている |
| --- | --- | --- |
| hook の 500 | 画面は出る。1 回の表示に約 3 秒かかる。セッションは残る | 約 20 秒待って 500 のエラーの画面。セッションは残る |
| hook の 7 秒の遅れ | 画面は出る。1 回の表示に約 5 秒かかる。セッションは残る | 約 27 秒待って 500 のエラーの画面。セッションは残る |
| Hydra の停止 | 画面はすぐ出る。セッションは残る | 約 7 秒待って 500 のエラーの画面。セッションは残る |
| スタブの hook の 403 | セッションが消え、ログインに戻される。スタブは認可コードの交換も拒むので、ログインの失敗の画面（`reason=failed`）が出る | 同じ |

- どの故障も、戻した後に同じセッションで画面が出た。
  - スタブの hook の 403 だけは、セッションが消えるので、ログインし直しになる。
  - Hydra のログインのセッションが残っていれば、上流の IdP の画面を通らずに入り直せた。
- access token が切れているとき、hook の 500 では、1 回の表示で hook が 12 回呼ばれた。
  - Hydra が 1 回の refresh で 3 回呼ぶので、BFF は 1 回の表示で refresh を 4 回試したことになる。20 秒を超えて待つのは、このためである。

止めた職員の web での見え方は、スタブを通さず、ブローカーの判定で測った。

- ブローカーの DB の職員の状態だけを `suspended` にすると、次の refresh で hook が拒み、BFF はセッションを消した。
  - ログインに戻されると、Hydra に残ったログインのセッションでブローカーのログインの画面が拒み、ログインの失敗の画面（`reason=denied`）が出た。
- ブローカーの内部の API で休職にすると、次の refresh が `invalid_grant` になり、BFF はセッションを消した。
  - 休職の操作が Hydra のログインのセッションも取り消すので、ブローカーのメールの入力の画面が出た。

コードの根拠は次のとおり。

- BFF は `invalid_grant` と `access_denied` のときだけセッションを消す。ほかの失敗では、access token がまだ使えればそれを使い、切れていれば投げる
  - `apps/web/src/server/session.ts:117-143` / [GitHub](https://github.com/Fukuemon/buddy/blob/acc269ec37137237606bcdbd6d52ee2acc3aab9e/apps/web/src/server/session.ts#L117-L143)
  - `apps/web/src/server/oidc.ts:48-56` / [GitHub](https://github.com/Fukuemon/buddy/blob/acc269ec37137237606bcdbd6d52ee2acc3aab9e/apps/web/src/server/oidc.ts#L48-L56)
- PostgreSQL の停止の間に Hydra が返した `invalid_client` は、セッションを消す値に入っていない

## 停止した職員のトークン

止めた職員の新しいトークンと refresh を、3 つの層で測った。  
職員はシードの 1 人を使い、測った後に有効に戻した。

| 止め方 | refresh | 新しいログイン | hook の呼び出し |
| --- | --- | --- | --- |
| ブローカーの内部の API で休職にする（予定の API が呼ぶのと同じ） | 400 `invalid_grant` | ブローカーのログインの画面が拒む | 0 回。Hydra は refresh token を取り消してあるので、hook より前に拒む |
| Hydra が止まっている間に休職にし、Hydra を戻す | 403 `access_denied` | ブローカーのログインの画面が拒む | 1 回。休職の操作は `revoke_failed` の 502 を返し、refresh token は残る。hook が拒む |
| ブローカーの DB の職員の状態だけを `suspended` にする（取り消しが無い） | 403 `access_denied` | ブローカーのログインの画面が拒む | 1 回。hook が拒む |
| ブローカーの内部の API で退職にする | 400 `invalid_grant` | ブローカーのログインの画面が拒む | 0 回 |

- どの層でも、止めた職員は新しいトークンも refresh したトークンも取れなかった。
- ブローカーの DB の状態だけを `retired` にする操作は、退職の職員にメールを持たせない DB の制約で拒まれたので、退職は内部の API の道だけを測った。
- 止めた職員の既発行の access token は、ブローカーの側を変えただけでは、予定の API で 200 のまま通った。
  - この測定では、予定の API の DB の職員の状態を変えていない。予定の API は、休職と退職を自分の DB でも知り、その場で 403 を返す。
  - ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにし、職員の身元をブローカーが、権限と業務のデータを予定の API が持つ](../../adr/0001-auth.md)

## Hydra が止まっているときの API の起動

予定の API と照合の API は、Hydra が止まっている間に再起動すると、discovery の文書を読めずに終了した。  
web は起動したまま動き、Hydra を戻した後のリクエストで discovery を読み直した。

- 予定の API と照合の API は、起動のときに discovery を読めないと終了する
  - `packages/go/oidc/oidc.go:60-71` / [GitHub](https://github.com/Fukuemon/buddy/blob/acc269ec37137237606bcdbd6d52ee2acc3aab9e/packages/go/oidc/oidc.go#L60-L71)
  - `services/schedule/cmd/api/main.go:60` / [GitHub](https://github.com/Fukuemon/buddy/blob/acc269ec37137237606bcdbd6d52ee2acc3aab9e/services/schedule/cmd/api/main.go#L60)
- web は、discovery に失敗したら、次のリクエストで試し直す
  - `apps/web/src/server/runtime.ts:36-40` / [GitHub](https://github.com/Fukuemon/buddy/blob/acc269ec37137237606bcdbd6d52ee2acc3aab9e/apps/web/src/server/runtime.ts#L36-L40)

## 既発行の JWT、JWKS のキャッシュ、BFF のセッションへの影響

- 既発行の access token は、ブローカーと Hydra が止まっている間も、予定の API で通った。
  - API は JWT を Hydra の JWKS で検証し、ブローカーを呼ばない。
  - 通るのは、`exp`（発行から 5 分）と、検証の猶予の 30 秒までである。
- API は JWKS を 1 時間ごとに取り直し、取り直しに失敗したら前の鍵を使い続ける。
  - 取り直しに失敗した場合を、測定では起こしていない。ライブラリ（jwkset v0.11.4）のソースで、成功したときだけ鍵を置き換えることを確認した。
  - `packages/go/oidc/oidc.go:21-29` / [GitHub](https://github.com/Fukuemon/buddy/blob/acc269ec37137237606bcdbd6d52ee2acc3aab9e/packages/go/oidc/oidc.go#L21-L29)
  - jwkset v0.11.4 の `storage.go:255-291`（失敗したときは `KeyReplaceAll` の前で返す）と `storage.go:295-311`（定期の取り直し）
- BFF のセッション（Valkey、12 時間）は、通信の失敗と hook の 500 では消えず、故障を戻せば同じセッションで使えた。
  - 消えるのは、hook の 403 と、取り消した refresh token の `invalid_grant` のときである。

## 未確認のこと

- Hydra の hook の待ちの上限（30 秒）と呼び直しの回数（3 回）を、設定で変えられるか。
- 約 93 秒で返す 500 が、クライアントに届かない理由。
- ブローカーの停止と Hydra の停止がすぐ失敗したのは、compose の中で止めたコンテナの名前を引けないためである。本番で、止まった宛先への接続が答えないまま待たされる構成なら、hook のタイムアウトと同じく約 93 秒の側になる。
- 本番の構成（Hydra とブローカーの台数、DB のインスタンスの分け方、ロードバランサーの待ちの上限）での動き。ローカル環境の compose は 1 台ずつで、DB は 1 つのインスタンスである。
- 照合の API に既発行の JWT を送ったときの動き。予定の API と同じ検証の仕組み（`packages/go/oidc`）を使うので、同じ結果になると推測する。
