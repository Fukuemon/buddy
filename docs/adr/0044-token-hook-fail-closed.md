# ADR-0044: token_hook が答えないときはトークンを発行せず、待ちを短くし、冗長化と監視で止まる時間を減らす

## Status

承認

## Context

ブローカーは、Hydra の `oauth2.token_hook` で、トークンを発行するたびに職員が有効かを確認する。ブローカーか、その DB か、Hydra が止まったときに、ログインと refresh をどう扱うかを決める必要がある。

- 止めた職員には、トークンを出さない。
  - ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにし、職員の身元をブローカーが、権限と業務のデータを予定の API が持つ](0001-auth.md)
- 休職と退職では、ブローカーが Hydra のトークンも取り消す。
  - ADR-0004: [職員の停止を、戻せる休職と、戻せない退職に分ける](0004-staff-leave-and-retirement.md)
- 故障を入れて測った結果は、[token_hook と ID ブローカーの障害のときの動きを測った結果](../verification/877-token-hook-failures/README.md) にある。次の事実は、その測定による。
  - Hydra v26.2.0 は、hook が 429 か 501 以外の 5xx を返すか、つながらないときに、1 秒と 2 秒の間を置いて 3 回まで呼ぶ。1 回の呼び出しは 30 秒で打ち切る。ブローカーがすぐ 500 を返すと約 3 秒で 500 になる。ブローカーが答えないと、約 93 秒後に Hydra のログでは 500 になるが、クライアントには答えが返らないまま接続が切れた。403 とほかの 4xx、501 は呼び直さない。
  - Hydra が止まっている間に休職にした職員は、Hydra のトークンを取り消せず、hook の 403 だけが発行を止めた。
  - hook が失敗した refresh token と認可コードは消費されず、復旧の後にそのまま使えた。BFF のセッションも残った。
  - 発行済みの access token は、ブローカーと Hydra が止まっている間も API で通った。access token の期限は 5 分である。
  - BFF は Hydra を 5 秒待つ。access token が切れた職員の 1 回の表示で refresh を 4 回試し、7〜27 秒待って 500 のエラーの画面になった。refresh の失敗はログに出していない。
  - 予定の API と照合の API は、Hydra が止まっている間に起動すると、discovery を読めずに終了した。
- Hydra v26.2.0 では、hook の 1 回の待ちの上限と呼び直しの回数を、設定で変えられない。#1021 で、v26.2.0 のソースを読んで確認した。
  - hook は、Hydra の共通の HTTP クライアントで呼ぶ。設定から渡すのは URL と認証の値だけである。
    - `oauth2/token_hook.go:91-111` / [GitHub](https://github.com/ory/hydra/blob/0b84568fffccf151dc5e6c7955fdfb738555bf4b/oauth2/token_hook.go#L91-L111)
  - 共通の HTTP クライアントは、呼び直しを 2 回、1 回の打ち切りを 30 秒に固定して作る。
    - `driver/registry_sql.go:454-458` / [GitHub](https://github.com/ory/hydra/blob/0b84568fffccf151dc5e6c7955fdfb738555bf4b/driver/registry_sql.go#L454-L458)
  - 呼び直しの間は、最短 1 秒のデフォルト値を倍にしていくので、測った 1 秒と 2 秒になる。
    - `oryx/httpx/resilient_client.go:30-38` / [GitHub](https://github.com/ory/hydra/blob/0b84568fffccf151dc5e6c7955fdfb738555bf4b/oryx/httpx/resilient_client.go#L30-L38)
    - `oryx/httpx/resilient_client.go:99-103` / [GitHub](https://github.com/ory/hydra/blob/0b84568fffccf151dc5e6c7955fdfb738555bf4b/oryx/httpx/resilient_client.go#L99-L103)
    - go-retryablehttp v0.7.8 の `client.go:551-566` / [GitHub](https://github.com/hashicorp/go-retryablehttp/blob/e1f5485fe84728709b857cb89e17088894c301d6/client.go#L551-L566)
  - 設定のスキーマは、`oauth2.token_hook` に、URL の文字列か、`url` と `auth` だけの `webhook_config` を許し、ほかの項目を拒む。
    - `spec/config.json:965-977` / [GitHub](https://github.com/ory/hydra/blob/0b84568fffccf151dc5e6c7955fdfb738555bf4b/spec/config.json#L965-L977)
    - `spec/config.json:29-71` / [GitHub](https://github.com/ory/hydra/blob/0b84568fffccf151dc5e6c7955fdfb738555bf4b/spec/config.json#L29-L71)
    - `driver/config/provider.go:595-598` / [GitHub](https://github.com/ory/hydra/blob/0b84568fffccf151dc5e6c7955fdfb738555bf4b/driver/config/provider.go#L595-L598)
- 監視のツールと通知の設定は、インフラのリポジトリ（非公開）が持つ。

## Decision

### hook が答えないときは発行しない

hook が 204 以外を返すか、答えないときは、ログインでも refresh でもトークンを発行しない（fail-closed）。hook の前に、答えが無ければ許す仕組みを置かない。

- 理由: 止めた職員にトークンを出す道を作らない。Hydra が止まっている間に休職にした職員は、hook の 403 だけが止める。
- 故障の間に失敗した refresh token とセッションは残るので、復旧すれば職員は操作をせずに使い続けられる。

### 待ちを短くする

- ブローカーは、hook の中の DB の呼び出しに、2 秒ほどの待ちの上限を付ける。上限を過ぎたら 500 を返す。
  - 理由: DB が答えないと、Hydra は 30 秒の打ち切りを 3 回待つ。1 回 2 秒の上限なら、呼び直しの間を含めて約 9 秒で失敗が決まる。
- Hydra の hook の待ちの上限と呼び直しの回数は設定で変えられないので、待ちはブローカーの側の上限だけで短くする。

### BFF は refresh を 1 度だけ試す

- BFF は、1 回の表示で refresh を 1 度だけ試す。
  - 一時的に失敗したら、10 秒の間は同じセッションの refresh を試さない。access token の期限の手前で失敗し、まだ使える access token で画面を出したときも、続く呼び出しが試し直さないためである。
- refresh が `invalid_grant` と `access_denied` 以外で失敗したら、セッションを残し、一時的に使えないことを示す画面を出す。
  - 理由: 職員は、エラーの画面で再読み込みを繰り返さずに待てる。復旧すれば、同じセッションで戻る。
- 画面と文言は、画面仕様書に足す。

### 冗長化

- ブローカーと Hydra は、2 台以上で動かす。どちらも状態を DB に持つので、並べて動かせる。
- DB は、自動のフェイルオーバーと、ポイントインタイムの復元ができる構成にする。
- 予定の API と照合の API は、Hydra が止まっていても起動できるか、起動の後に discovery を読み直す。
- 構成はインフラのリポジトリが決める。buddy は、要件を [基盤と運用](https://github.com/Fukuemon/buddy/blob/develop/context/operations.md) に書く。

### 監視と復旧

- buddy は、出すログの項目と、アラートの条件の推奨の値と、復旧の順を [基盤と運用](https://github.com/Fukuemon/buddy/blob/develop/context/operations.md) に書く。通知の設定は、インフラのリポジトリが持つ。
  - 理由: 条件の根拠の測定とログを出すコードが buddy にあるので、ログを変えたときに条件も直せる。
- 故障を入れる仕組みは、本番のコードに足さない。compose の override とテスト用のスタブを、テストのディレクトリに入れて、手で流せるようにする。
  - 理由: 設定を誤ったときに、本番に故障を入れる道を作らない。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** hook が答えなければ発行しない | 止めた職員にトークンを出す道が無い。復旧すれば、refresh token とセッションがそのまま使える | ブローカーか Hydra が止まっている間、新しいログインと、access token が切れた職員の操作が止まる |
| ブローカーが職員の状態を短い期限でキャッシュし、DB の障害のときだけ最後に読んだ状態で判定する | ブローカーの DB だけの障害では、ログイン済みの職員が止まらない | 期限の間に止めた職員にトークンを出しうる。判定の道が 2 つになる |
| refresh だけ、hook が答えなければ許す | ブローカーの障害でも、ログイン済みの職員が使い続けられる | 止めた職員にトークンを出しうる |
| **採用:** 故障を入れる仕組みをテストのディレクトリに置く | 本番に故障の道を作らずに、同じ測定を繰り返せる | compose の構成を変えたときに、スタブも直す必要がある |
| 本番のコードに、環境変数で故障を入れる仕組みを足す | 検証環境でも同じ故障を入れられる | 設定を誤ると、本番に故障を入れうる |

## Consequences

### Positive

- 止めた職員は、障害の間もトークンを取れない。
- 復旧の後に、職員がログインし直す必要が無い。
- ブローカーの DB が答えないときの待ちが、約 93 秒から約 9 秒になる。

### Negative

- ブローカーか Hydra が全て止まると、最大で access token の期限（5 分）と JWT の時刻の許容（30 秒）の後に、全ての職員の操作が止まる。
- BFF に refresh のログと画面、ブローカーに DB の待ちの上限とログ、2 つの API に起動の変更が要る。
- アラートの閾値は、本番の量で見直す必要がある。
- ブローカーの DB が答えないときは、Hydra が失敗を返す約 9 秒より先に、BFF の 5 秒の待ちが切れる。Hydra の hook の待ちは、設定で縮められない。
  - ブローカーの DB の待ちの上限は、2 秒のままにする。
  - 理由: BFF が 5 秒で打ち切るので、職員には 5 秒でエラーが返る。残りの約 4 秒は、Hydra が裏で hook を呼び直すだけである。
  - BFF が待ちを打ち切ったときも、refresh が失敗したときと同じく、一時的に使えないことを示す画面を出す。
