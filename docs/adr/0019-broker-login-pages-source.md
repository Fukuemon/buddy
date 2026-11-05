# ADR-0022: ID ブローカーのログインの画面のソースを apps/broker に置き、@buddy/ui から生成したテンプレートを ID ブローカーが埋め込んで配信する

## Status

承認

## Context

ID ブローカーは、ログインの画面、ログインの失敗の画面、ログアウトの失敗の画面の 3 つを出す。

- ADR-0014 は、ブローカーがログインと同意とログアウトの画面を持つと決めた。web は Hydra のクライアントに `skip_consent` を設定するので、同意の画面は出ない。
  - ADR-0014: [OIDC のブローカーを、Ory Hydra と、自作の login and consent app で作る](0014-id-broker-hydra.md)
- ADR-0012 は、画面と BFF を `apps/` に、Go の API を `services/` に置くと決めた。
  - ADR-0012: [2 つの API を services/ に置き、画面と API をトップのディレクトリで分ける](0012-services-directory.md)
- 今の 3 つの画面は、HTML と CSS を Go の文字列として `services/broker/internal/login/pages.go` に持つ。
  - `packages/ui` のコンポーネントと `focus-ring` を使えず、フォーカスの表示とカードの見た目を CSS で書き写している。
  - ログインの失敗の画面の文言は、web の `AuthErrorMessage` の `failed` から手で写している。登録されていないメールとブローカーの中の失敗を区別させないため、2 つの文言は同じでなければならない。
- 画面を web に移すと、Hydra の admin API でログインを確定させる資格を、web の BFF が持つことになる。
- `packages/ui` には、業務と buddy に固有の名前を持たない Base と Case のコンポーネントだけを置く。buddy の画面の帯（`SiteHeader`）も Domain として `apps/web` に残した。
  - ADR-0004: [デザインシステムのトークンを DADS の基本、buddy の意味、Tailwind のテーマの 3 段にし、カタログをドキュメントサイトと同じ Worker で誰でも開けるように出す](0004-design-system.md)

## Decision

ログインの画面のソースを `apps/broker`（パッケージの名前は `@buddy/broker`）に置き、`@buddy/ui` のコンポーネントで書く。ID ブローカーは、`apps/broker` が生成したテンプレートと CSS を埋め込んで配信する。

- ディレクトリの名前は、ADR-0012 と同じく役割の接尾辞（`-pages`）を付けず、`services/broker` と同じ `broker` にする。トップのディレクトリで、画面か Go のサーバーかを区別する。
- `apps/broker` は、ビルドのときに React のコンポーネントを `renderToStaticMarkup` で静的な HTML に書き出し、Go の `html/template` のテンプレートにする。CSS は、`packages/ui` の `theme.css` を読む Tailwind で生成する。
  - `login_challenge` のような実行のときの値は、`{{.Challenge}}` のようなテンプレートの式として書き出し、ID ブローカーが埋める。
- 生成物は `services/broker/internal/login/` に置いてコミットし、ID ブローカーは `go:embed` で読む。`pnpm check:generated` が、生成し直した結果との差分を確認する。
  - 理由: 今の `tokens.css` と同じく、ID ブローカーのビルドとコンテナのイメージに Node.js を要しない。
- 認証の確定（Hydra の admin API の呼び出し）と画面の配信は、ADR-0014 のとおり ID ブローカーに残す。ID ブローカーが動くときには、`apps/broker` のコードは動かない。
- `apps/broker` はコンテナを持たないので、ADR-0013 のコンテナとサービスの名前の規則の対象の外にする。
  - ADR-0013: [2 つの API のサービスの名前とトークンの aud を、ディレクトリの名前にそろえる](0013-service-names.md)
- ロゴと理由を出すカードのコンポーネントと、ログインの失敗（web の `failed`）の文言は `apps/broker` に置き、web は `@buddy/broker` から読む。web だけが出す理由（事業所に登録されていない、試行の回数の上限を超えた）の文言は web に残し、カードに渡す。
  - 理由: 文言とカードは buddy に固有なので、ADR-0004 の規則で `packages/ui` の Case にできない。web とブローカーのどちらかに置くなら、ID ブローカーが出す画面のソースの側に置き、web が読む向きにする。web の側に置くと、`apps/broker` のビルドが web のコードを読むことになる。

## Verification

`packages/ui` の `Button` と `FormField` と、カードにする `section` の要素で、今のログインの画面を組み、`renderToStaticMarkup` で書き出せるかを試した。カードのコンポーネントは `packages/ui` に無いので、Tailwind のユーティリティで書いた。

- Vite の SSR で読み込み、`renderToStaticMarkup` で HTML を書き出せた。ブラウザの API に触れるコードは無かった。
- `FormField` の `useId` は描画のたびに同じ id を出し、ラベルと欄、補足の文と欄を `for` と `aria-describedby` で結び付けたまま書き出せた。
- 隠しの欄の `value="{{.Challenge}}"` は、そのまま書き出された。Go の `html/template` で読み、`a"b<c` を渡すと、`value="a&#34;b&lt;c"` とエスケープして埋めた。
- `@tailwindcss/vite` で `theme.css` を読んで生成した CSS は、`focus-visible:focus-ring` の規則と DADS の基本のトークンを含み、圧縮の前で 45,015 バイトだった。`theme.css` が `packages/ui` の全てのソースを読むので、画面が使わないクラスの規則も含む。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** `apps/broker` で `@buddy/ui` から生成し、ID ブローカーが埋め込んで配信する | コンポーネント、`focus-ring`、文言を web と同じソースから作れる。ID ブローカーのビルドに Node.js を要しない | 生成の手順と、生成物の差分の確認が増える |
| HTML と CSS を `services/broker` の中でファイルに分ける | 生成の手順が無い | 画面のソースが `services/` に残り、web からの手の写しも残る |
| 画面を別のコンテナにする | 画面を React で動かせる | 画面は 3 つだが、コンテナと、認証を確定させる ID ブローカーの新しい API と、その認可が増える |
| 画面を web に移す | 画面のアプリが 1 つで済む | web の BFF が Hydra の admin API の資格を持つ |
| ログインの失敗の案内を `packages/ui` の Case にする | web が `apps/` の別のパッケージに依存しない | buddy に固有の文言とロゴを `packages/ui` に持ち込み、ADR-0004 の規則に反する |

## Consequences

### Positive

- ログインの画面が、web と同じボタン、入力の欄、フォーカスの表示になり、デザインシステムを変えると生成し直すだけで追従する。
- ログインの失敗の文言が 1 か所になり、web とブローカーで食い違わない。
- ID ブローカーのトークンの CSS を作る `scripts/build-broker-tokens.mjs` が要らなくなる。

### Negative

- `apps/web` が `apps/broker` に依存する。`apps/` のパッケージの間の依存は、ここが初めてである。
- `packages/ui` のコンポーネントを、ブラウザの外で書き出せる形に保つ必要がある。描画の中でブラウザの API に触れるコンポーネントは、ログインの画面に使えない。
- 画面を変えたら、`apps/broker` で生成し直し、生成物を同じコミットに入れる必要がある。
