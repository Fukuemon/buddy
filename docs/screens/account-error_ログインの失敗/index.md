# account-error ログインの失敗

職員が、ログインできなかった理由を知り、もう一度ログインする画面。  
ログインの途中で失敗したとき、職員が事業所に登録されていないとき、ログインの試行の回数の上限を超えたときに、この画面が開く。

| 項目 | 値 |
| --- | --- |
| URL | `/auth/error`。search params の `reason` で理由を受ける |
| 使う人 | ログインを試した全ての職員。ログインしていなくても開ける |
| 実装 | `apps/web/src/routes/auth.error.tsx`、`apps/web/src/components/site/AuthErrorMessage.tsx` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。  
どの失敗でこの画面を開くかは、[ID ブローカーの Design Doc のログイン](../../design/services/broker.md#ログイン) にある。

## 構成

ログインの画面（[account-login](../account-login_ログイン/index.md)）と同じく、画面の背景の中央に白いカードを置き、ロゴ、ページのタイトル、説明の文、もう一度ログインするリンクを縦に並べる。  
ログインしていないので、サイトのヘッダーとナビゲーションを出さない。  
3 つの状態は、タイトルと説明の文だけが違う。

=== "ログインの途中の失敗"

    メールアドレスが登録されていないときや、ふだん使っているログインの画面から戻れなかったときのように、ログインの途中で失敗したとき（URL の `reason` が `failed` か、無いか、読めないとき）。

    <iframe class="mock" title="ログインの失敗の、ログインの途中の失敗" src="mocks/01-failed.html"></iframe>
    <a class="mock-open" href="mocks/01-failed.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

=== "試行の回数の上限を超えた"

    同じメールアドレスか同じ送信元から、続けてログインを試し、ID ブローカーが受け付けを止めたとき（URL の `reason` が `too_many_attempts` のとき）。

    <iframe class="mock" title="ログインの失敗の、試行の回数の上限を超えた" src="mocks/03-too-many-attempts.html"></iframe>
    <a class="mock-open" href="mocks/03-too-many-attempts.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

=== "事業所に登録されていない"

    ふだん使っているログインの画面でログインできたが、事業所の職員として登録されていないとき（URL の `reason` が `forbidden` のとき）。

    <iframe class="mock" title="ログインの失敗の、事業所に登録されていない" src="mocks/02-forbidden.html"></iframe>
    <a class="mock-open" href="mocks/02-forbidden.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ロゴ | [ロゴ](#ロゴ) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

## ロゴ

**概要**: buddy の画面であることを示す。

**値のソース**: 「buddy」。  
カードの上端の中央に、主の色で出す。  
支援技術には読ませない。  
ページのタイトルが画面の内容を示すためである。

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)

## ページのタイトル

**概要**: ログインできなかった理由を示す。

**値のソース**: 理由ごとに次の文を出す。  
ブラウザのタブのタイトルは、理由によらず「ログインできません | buddy」。

| 理由 | 文 |
| --- | --- |
| ログインの途中の失敗 | 「ログインできませんでした」 |
| 事業所に登録されていない | 「この事業所に登録されていません」 |
| 試行の回数の上限を超えた | 「しばらくログインできません」 |

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)、[AuthErrorMessage の Forbidden](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--forbidden)、[AuthErrorMessage の TooManyAttempts](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--too-many-attempts)

## 説明の文

**概要**: 職員が次にすることを伝える。

**値のソース**: 理由ごとに次の文を出す。

| 理由 | 文 |
| --- | --- |
| ログインの途中の失敗 | 「時間をおいて、もう一度ログインしてください。」 |
| 事業所に登録されていない | 「事業所の管理者に、メールアドレスの登録を頼んでください。」 |
| 試行の回数の上限を超えた | 「続けて何度もログインを試したため、受け付けを止めています。1 分ほどおいてから、もう一度ログインしてください。」 |

- 頼む相手は、職員を登録する権限を持つ職員を指し、全ての画面で「事業所の管理者」と呼ぶ（[文言](../rules.md#文言)）。
- ログインの途中の失敗は、理由によらず 1 つの文を出す。職員が理由を知っても、時間をおいてログインし直すほかにできることが変わらないためである。理由は buddy の記録に残す。
- 試行の回数の上限を超えたときだけ、ログインの途中の失敗と分けた文を出す。すぐにログインし直しても同じ画面に戻るので、待つ長さを伝える。ID ブローカーは、メールアドレスで職員を引く前に上限で止めるので、この文からは登録の有無が分からない。

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)、[AuthErrorMessage の Forbidden](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--forbidden)、[AuthErrorMessage の TooManyAttempts](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--too-many-attempts)

## もう一度ログインする

**概要**: ログインをやり直す。

**値のソース**: 「もう一度ログインする」  
カードの幅いっぱいの、主の操作のボタンの見た目のリンクにする。

- 事業所に登録されていない職員にも出す。登録を頼んだ後に、この画面からログインし直せるようにするためである。登録されるまでは、ログインし直してもこの画面に戻る。

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)、[AuthErrorMessage の Forbidden](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--forbidden)、[AuthErrorMessage の TooManyAttempts](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--too-many-attempts)

### インタラクション

#### 1. 押す

1. [ログイン](../account-login_ログイン/index.md) のメールの入力の画面へ移る。ログインした後に戻る先は付けない。
   - 前にログインしてから 12 時間の間でも、メールの入力の画面を出す。前のログインのまま進むと、失敗した職員でまたログインして、この画面に戻るためである。
2. ログインに成功すると、予定のカレンダーに移る。また失敗すると、この画面に戻る。

## 全体動作

### 初期処理

- ログインしていなくても開ける。
  - `/auth/` の下の画面は、ログインした職員を求めない。
- 読み込むデータは無い。
- フォーカスは `body` にある。

### URL の search params からの復元

| search param | 値 | 省いたときと読めないとき |
| --- | --- | --- |
| `reason` | `failed`、`forbidden`、`too_many_attempts` | `failed` |

## 未決

未決は無い。
