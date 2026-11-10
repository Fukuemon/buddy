# account-error ログインの失敗

職員が、ログインできなかった理由と次にすることを知り、もう一度ログインする画面。  
ログインを断られたとき、ログインの途中で続けられなくなったとき、buddy の障害でログインできなかったときに、この画面が開く。

| 項目 | 値 |
| --- | --- |
| URL | `/auth/error`。search params の `reason` で理由を受ける |
| 使う人 | ログインを試した全ての職員。ログインしていなくても開ける |
| 実装 | `apps/web/src/routes/auth.error.tsx`、`apps/web/src/components/page/AuthErrorMessage.tsx` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。  
どの失敗でこの画面を開くかは、[ID ブローカーの Design Doc のログイン](../../design/services/broker.md#ログイン) にある。

## 構成

[ログインの画面](../account-login_ログイン/index.md) と同じく、画面の背景の中央に白いカードを置き、ロゴ、ページのタイトル、説明の文、もう一度ログインするリンクを縦に並べる。  
ログインしていないので、サイトのヘッダーとナビゲーションを出さない。  
6 つの状態は、タイトルと説明の文だけが違う。

=== "登録を確認できない"

    入れたメールアドレスが登録されていないとき、休職か退職の職員のメールアドレスのとき、登録の途中の職員のメールアドレスのとき（URL の `reason` が `denied` のとき）。

    <iframe class="mock" title="ログインの失敗の、登録を確認できない" src="mocks/01-denied.html"></iframe>
    <a class="mock-open" href="mocks/01-denied.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

=== "登録と違うアカウント"

    ふだん使っているログインの画面で、事業所に登録したメールアドレスと違うアカウントでログインしたとき（URL の `reason` が `account_mismatch` のとき）。

    <iframe class="mock" title="ログインの失敗の、登録と違うアカウント" src="mocks/02-account-mismatch.html"></iframe>
    <a class="mock-open" href="mocks/02-account-mismatch.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

=== "事業所に登録されていない"

    ふだん使っているログインの画面でログインできたが、事業所の職員として登録されていないとき（URL の `reason` が `forbidden` のとき）。

    <iframe class="mock" title="ログインの失敗の、事業所に登録されていない" src="mocks/03-forbidden.html"></iframe>
    <a class="mock-open" href="mocks/03-forbidden.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

=== "試行の回数の上限を超えた"

    同じメールアドレスで続けてログインを試し、buddy が受け付けを止めたとき（URL の `reason` が `too_many_attempts` のとき）。

    <iframe class="mock" title="ログインの失敗の、試行の回数の上限を超えた" src="mocks/04-too-many-attempts.html"></iframe>
    <a class="mock-open" href="mocks/04-too-many-attempts.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

=== "ログインを続けられない"

    ログインの途中で時間がたったか別の画面から戻ったとき、ふだん使っているログインの画面でログインをやめたとき（URL の `reason` が `interrupted` のとき）。

    <iframe class="mock" title="ログインの失敗の、ログインを続けられない" src="mocks/05-interrupted.html"></iframe>
    <a class="mock-open" href="mocks/05-interrupted.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

=== "障害でログインできない"

    buddy の障害で、ログインを終えられなかったとき（URL の `reason` が `failed` か、無いか、読めないとき）。

    <iframe class="mock" title="ログインの失敗の、障害でログインできない" src="mocks/06-failed.html"></iframe>
    <a class="mock-open" href="mocks/06-failed.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

## ロゴ

**概要**: buddy の画面であることを示すラベル。

**値のソース**: 「buddy」。  
カードの上端の中央に、主の色で出す。  
支援技術には読ませない。  
ページのタイトルが画面の内容を示すためである。

**カタログ**: [AuthErrorMessage の Denied](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--denied)

## ページのタイトル

**概要**: ログインできなかった理由を示すラベル。

**値のソース**: 理由ごとに次の文を出す。  
ブラウザのタブのタイトルは、理由によらず「ログインできません | buddy」。

| 理由 | 文 |
| --- | --- |
| 登録を確認できない | 「ログインできませんでした」 |
| 登録と違うアカウント | 「登録と違うアカウントでログインしました」 |
| 事業所に登録されていない | 「この事業所に登録されていません」 |
| 試行の回数の上限を超えた | 「しばらくログインできません」 |
| ログインを続けられない | 「ログインを続けられませんでした」 |
| 障害でログインできない | 「ログインできませんでした」 |

**カタログ**: [AuthErrorMessage の Denied](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--denied)、[AuthErrorMessage の AccountMismatch](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--account-mismatch)、[AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)

## 説明の文

**概要**: 職員が次にすることを伝えるラベル。

**値のソース**: 理由ごとに次の文を出す。

| 理由 | 文 |
| --- | --- |
| 登録を確認できない | 「入れたメールアドレスでは、ログインできません。事業所の管理者に、登録のメールアドレスを確認してください。」 |
| 登録と違うアカウント | 「登録したメールアドレスのアカウントで、もう一度ログインしてください。分からないときは、事業所の管理者に確認してください。」 |
| 事業所に登録されていない | 「事業所の管理者に、メールアドレスの登録を頼んでください。」 |
| 試行の回数の上限を超えた | 「続けて何度もログインを試したため、受け付けを止めています。30 秒ほどおいてから、もう一度ログインしてください。」 |
| ログインを続けられない | 「もう一度ログインしてください。」 |
| 障害でログインできない | 「時間をおいて、もう一度ログインしてください。」 |

- 頼む相手は、職員を登録する権限を持つ職員を指し、全ての画面で「事業所の管理者」と呼ぶ。
  - 呼び方の規則は、規約の [文言](../rules.md#文言) にある。
- 登録を確認できないときは、登録されていないメールアドレス、休職と退職の職員、登録の途中の職員を分けず、1 つの文を出す。
  - メールアドレスを入れた時点では、入れた人が本人か分からない。
  - 理由を分けると、メールアドレスを入れるだけで、ある人が事業所の職員か、休職しているかを調べられる。
  - ふだん使っているログインの画面でログインした後に休職か退職になった職員にも、同じ文を出す。
- 登録と違うアカウントのときと、事業所に登録されていないときは、ふだん使っているログインの画面で本人を確認した後なので、理由に合う文を出す。
- 時間をおいて試すよう伝えるのは、障害でログインできないときだけにする。
  - ほかの理由では、時間をおいても同じ画面に戻るためである。
- 試行の回数の上限を超えたときは、ほかの理由と分けた文を出し、待つ長さを伝える。
  - buddy は、メールアドレスで職員を探す前に上限で止めるので、この文からは登録の有無が分からない。
- 理由の詳細は buddy の記録に残す。

**カタログ**: [AuthErrorMessage の Denied](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--denied)、[AuthErrorMessage の AccountMismatch](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--account-mismatch)、[AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)

## もう一度ログインする

**概要**: ログインをやり直すリンク。

**値のソース**: 「もう一度ログインする」  
カードの幅いっぱいの、主の操作のボタンの見た目のリンクにする。

- 事業所に登録されていない職員にも出す。
  - 登録を頼んだ後に、この画面からログインし直せるようにするためである。
  - 登録されるまでは、ログインし直してもこの画面に戻る。

**カタログ**: [AuthErrorMessage の Denied](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--denied)

**操作**: 押すと、[ログイン](../account-login_ログイン/index.md) のメールの入力の画面へ移る。

1. ログインした後に戻る先は付けない。
2. 前にログインしてから 12 時間の間でも、メールの入力の画面を出す。前のログインのまま進むと、失敗した職員でまたログインして、この画面に戻るためである。
3. ログインに成功すると、予定のカレンダーに移る。
   - ログインにまた失敗すると、この画面に戻る。

## 全体動作

### 初期処理

- ログインしていなくても開ける。
  - `/auth/` の下の画面は、ログインした職員を求めない。
- 読み込むデータは無い。
- フォーカスは `body` にある。

### URL の search params からの復元

| search param | 値 | 省いたときと読めないとき |
| --- | --- | --- |
| `reason` | `denied`、`account_mismatch`、`forbidden`、`too_many_attempts`、`interrupted`、`failed` | `failed` |

## 未決

未決は無い。
