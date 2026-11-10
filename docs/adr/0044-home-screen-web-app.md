# ADR-0044: web を、マニフェストと手で書いた service worker でホーム画面から開ける web アプリにし、service worker にはデータを含まないファイルだけを保存させる

## Status

承認

## Context

外で訪問する職員が、スマートフォンのホーム画面から buddy を開き、電波の無い場所でも自分の予定を確認できるようにする（#837）。iOS のアプリは作らない（[PRD の Non-Goals](../PRD.md#non-goals)）。

- web は TanStack Start で画面を描き、BFF として web のセッションを持つ。ブラウザには、HttpOnly の cookie でセッションの ID だけを渡す。
  - ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにし、職員の身元をブローカーが、権限と業務のデータを予定の API が持つ](0001-auth.md)
- root の route の `beforeLoad` は、`/auth/` の下を除く全ての画面で、サーバーとブラウザの両方で職員を読み、読めなければログインへ移す。このため、サーバーが描いた HTML は、`ssr: false` の `/schedule` でも、職員の名前と権限の code を含む（#837 の試作で確認した）。
- 画面のデータの呼び出しは、BFF の server function の `POST /_serverFn/<id>` である。Cache API は POST の応答を保存できない。職員を返す server function は GET で、保存できる。
- 本番の web は `srvx serve --prod --static ../client` で動き、`apps/web/public/` のファイルはビルドで `dist/client/` に写る。`--static` は、アプリの処理より先にファイルを返す（#837 の試作で確認した）。
- TanStack Start には PWA の公式の機能が無い。vite-plugin-pwa は、TanStack Start の本番のビルドで service worker を作らない報告がある。
- iOS の Safari は、マニフェストの `display` が `standalone` のときに、ホーム画面に追加したサイトを web アプリとして開く。通知（Web Push）は、その web アプリにだけ許す（[Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)）。ホーム画面の web アプリは、cookie と保存を Safari と別に持つ（[What's new in web apps - WWDC23](https://developer.apple.com/videos/play/wwdc2023/10120/)）。
- iOS のホーム画面の web アプリの中で、Hydra、ブローカー、上流の IdP を通るログインが終わるかは、実機で確認していない。この ADR は、終わることを前提にする。確認は #1024 で行う。

## Decision

マニフェスト、アイコン、service worker を、`apps/web/public/` の静的なファイルとして手で書く。

- マニフェストは、名前を `buddy`、`id` と `scope` を `/`、`display` を `standalone`、`start_url` を `/schedule` にする。検証環境と本番は見分けない。
  - `id` を変えると、ホーム画面に追加した web アプリが別のものになるので、`/` から変えない。
- root の route の `head` から、マニフェストと `apple-touch-icon` を指す。
- service worker は、データを含まないファイルだけを保存する。
  - 保存するのは、ビルドがハッシュを付けた `/assets/*` と、職員を読まずに作る HTML の殻だけである。
  - サーバーが描いた HTML と、`/_serverFn/*` の応答は、GET か POST かによらず保存しない。職員の名前と業務のデータが入るためである。
  - 画面の移動では、先にネットワークに送る。ネットワークに届かなかったときだけ、殻を返す。電波があるときに、古い殻と画面が出ないようにするためである。
  - 電波の無いときの予定のデータは、service worker ではなく画面が持つ。扱いは ADR-0045 にある。
- service worker は、マニフェストを置く段では入れず、電波の無い場所で予定を出す段で入れる（#837 の進め方の段 2）。
- ログインのセッションの長さは、ADR-0001 のとおりで、ホーム画面から開いても変えない。
- iOS と Android の差は受け入れ、iOS では、ホーム画面に追加した web アプリでログインし直すことを、使い方の説明に書く。ホーム画面への追加を促す画面は作らない。

## Considered Options

| 論点 | 選択肢 | 強み | 弱み |
| --- | --- | --- | --- |
| マニフェストの置き方 | **採用:** `public/` の静的なファイル | ログイン無しで配信できる。設定が要らない | 環境ごとに名前とアイコンを変えられない |
| マニフェストの置き方 | server route で返す | 環境ごとに名前とアイコンを変えられる | 環境の名前を web の設定に足す。検証環境と本番を見分ける要件が無い |
| service worker の作り方 | **採用:** 手で書く | 保存するファイルを全部数えられる。プラグインに依らない | service worker のバージョンの切り替えを自分で書く |
| service worker の作り方 | vite-plugin-pwa か Workbox | バージョンの切り替えと保存の規則をライブラリが持つ | 本番のビルドで service worker を作らない報告がある。保存してよいものは手で書く場合と同じで、利点が小さい |
| 保存するもの | **採用:** assets とデータを含まない殻だけ | 端末に職員と業務のデータが残らない | 殻を作るための分岐が要る |
| 保存するもの | サーバーが描いた HTML も保存する | 電波の無いときも同じ HTML を出せる | 職員の名前と権限が端末に残る。ログアウトの後も残る |

## Verification

- `pnpm --filter @buddy/web build` の後に srvx で配信し、cookie 無しの `/manifest.webmanifest` とアイコンが 200 を返した。
- デスクトップの Chromium の CDP の `Page.getAppManifest` と `Page.getInstallabilityErrors` は、どちらもエラーを返さなかった。
- iPhone の Safari と Android の Chrome での確認は、#1024 で行う。

## Consequences

### Positive

- 職員は、アプリを入れずに、ホーム画面からブラウザの UI を出さずに buddy を開ける。
- 端末に残る業務のデータは、ADR-0045 の 1 か所だけになる。

### Negative

- iOS では、ホーム画面に追加した web アプリの cookie が Safari と別なので、追加した後にログインし直す。
- #1024 で、iOS のホーム画面の web アプリの中でログインが終わらないと分かったときは、ログインの渡し方を別の ADR で決め、この ADR を置き換える。
- 殻を作るには、root の route の `beforeLoad` に、殻を作るときは職員を読まない分岐が要る。
