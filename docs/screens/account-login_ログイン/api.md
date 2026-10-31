# account-login API との対応

[ログイン](index.md) の項目と、web の型と OpenAPI の項目の対応。  
この画面はブローカーの画面で、web の型と OpenAPI の項目を使わない。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| メールアドレス | 入れたメールアドレス | なし | なし |

- 次へを押すと、フォームの `email` と `login_challenge` を、ブローカーの `POST /login` へ送る。
- ブローカーは、`email` から登録した職員を引き、職員の事業所の上流の IdP へリダイレクトする。流れは [ID ブローカーの Design Doc のログイン](../../design/services/broker.md#ログイン) にある。
