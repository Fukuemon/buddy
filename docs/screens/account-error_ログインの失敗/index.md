# account-error ログインの失敗

職員が、ログインできなかった理由を知り、もう一度ログインする画面。ログインの途中で失敗したときと、職員が事業所に登録されていないときに、buddy のサーバーがこの画面へ転送する。

| 項目 | 値 |
| --- | --- |
| URL | `/auth/error`。search params の `reason` で理由を受ける |
| 使う人 | ログインを試した全ての職員。ログインしていなくても開ける |
| 実装 | `apps/web/src/routes/auth.error.tsx`、`apps/web/src/components/site/AuthErrorMessage.tsx` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。

## 構成

上端のヘッダーの下に、ページのタイトル、説明の文、もう一度ログインするリンクを縦に並べる。ログインしていないので、ヘッダーにナビゲーションとログインした職員を出さない。2 つの状態は、タイトルと説明の文だけが違う。

=== "ログインの途中の失敗"

    URL の `reason` が `failed` か、無いか、読めないとき。

    <iframe class="mock" title="ログインの失敗の、ログインの途中の失敗" src="mocks/01-failed.html"></iframe>
    <a class="mock-open" href="mocks/01-failed.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ヘッダー | [ヘッダー](#ヘッダー) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

=== "事業所に登録されていない"

    URL の `reason` が `forbidden` のとき。

    <iframe class="mock" title="ログインの失敗の、事業所に登録されていない" src="mocks/02-forbidden.html"></iframe>
    <a class="mock-open" href="mocks/02-forbidden.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | ラベル | ヘッダー | [ヘッダー](#ヘッダー) |
    | 2 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 3 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 4 | リンク | もう一度ログインする | [もう一度ログインする](#もう一度ログインする) |

## ヘッダー

**概要**: buddy の画面であることを示す。

**値のソース**: 「buddy」。ナビゲーションとログインした職員は出さない。

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [SiteHeader の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-siteheader--default)

## ページのタイトル

**概要**: ログインできなかった理由を示す。

**値のソース**: 理由ごとに次の文を出す。ブラウザのタブのタイトルは、理由によらず「ログインできません | buddy」。

| 理由 | 文 |
| --- | --- |
| ログインの途中の失敗 | 「ログインできませんでした」 |
| 事業所に登録されていない | 「この事業所に登録されていません」 |

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)、[AuthErrorMessage の Forbidden](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--forbidden)

## 説明の文

**概要**: 職員が次にすることを伝える。

**値のソース**: 理由ごとに次の文を出す。

| 理由 | 文 |
| --- | --- |
| ログインの途中の失敗 | 「時間をおいて、もう一度ログインしてください。」 |
| 事業所に登録されていない | 「事業所の管理者に、メールアドレスの登録を頼んでください。」 |

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)、[AuthErrorMessage の Forbidden](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--forbidden)

## もう一度ログインする

**概要**: ログインをやり直す。

**値のソース**: 「もう一度ログインする」

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [AuthErrorMessage の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--failed)、[AuthErrorMessage の Forbidden](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-autherrormessage--forbidden)

### インタラクション

#### 1. 押す

1. `/auth/login?prompt=login` を読み込み、認証の基盤のログインの画面へ移る。戻る先は付けない。
   - 認証の基盤が前のログインを覚えていても、メールの入力の画面を出させる。覚えたログインを使うと、失敗した職員に戻るためである。
2. ログインに成功すると、`/` を経て予定のカレンダーに移る。また失敗すると、この画面に戻る。

## 全体動作

### この画面へ移る条件

buddy のサーバーは、ログインの後の戻り（`/auth/callback`）で次のどれかが起きると、この画面へ転送する。

- ログインの途中の失敗（`reason=failed`）: ログインを始めたときの値と戻りの値が合わない、ログインの途中の値が無い、トークンを取れない、ログインした職員を API に問い合わせて 403 以外の失敗が返った。
- 事業所に登録されていない（`reason=forbidden`）: ログインした職員を API に問い合わせ、事業所に登録されていない（403）と返った。

### 初期処理

- ログインしていなくても開ける。`/auth/` の下の画面は、ログインした職員を求めない。
- API を呼ばない。フォーカスは `body` にある。

### URL の search params からの復元

| search param | 値 | 省いたときと読めないとき |
| --- | --- | --- |
| `reason` | `failed`、`forbidden` | `failed` |

## 未決

- PRD は、職員の登録を、職員の管理の権限を持つ職員（デフォルトはマネージャー）が行うとしている。画面は、登録を頼む相手を「事業所の管理者」と出す。この呼び方でよいかが決まっていない。
- 事業所に登録されていない職員に、もう一度ログインするリンクを出すか。登録を頼むまでは、ログインし直しても同じ画面に戻る。
- ログインの途中の失敗の理由（トークンを取れない、API が失敗を返したなど）を、画面で分けて伝えるか。今はサーバーの記録にだけ残す。
