# account-login API との対応

[ログイン](index.md) の項目と、web の型と OpenAPI の項目の対応。  
この画面はブローカーの画面で、web の型と OpenAPI の項目を使わない。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| メールアドレス | 入れたメールアドレス | なし | なし |

- 次へを押すと、フォームの `email` と `login_challenge` を、ブローカーの `POST /login` へ送る。
- ブローカーは、`email` から登録した職員を引き、職員の事業所の上流の IdP へリダイレクトする。
  - 流れは [ID ブローカーの Design Doc のログイン](../../design/services/broker.md#ログイン) にある。

## 状態と失敗の要因

ブローカーは OpenAPI の操作を持たないので、要因の列にはブローカーのパスと HTTP のステータスを書く。

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| メールの入力 | なし | `GET /login` で、Hydra がログインのセッションを保っていない |
| ログインの失敗 | 「時間をおいて、もう一度ログインしてください。」 | `GET /login`、`POST /login`、`GET /consent` で `login_challenge` か `consent_challenge` が無い（400）か、Hydra の admin API で読めない（`POST /login` は 400、ほかは 502） |
| ログインの失敗 | 「時間をおいて、もう一度ログインしてください。」 | `POST /login` がほかのサイトから送られた（403） |
| ログインの失敗 | 「時間をおいて、もう一度ログインしてください。」 | `POST /login` で、職員を DB から引けない（500）か、ログインの途中の値を書けない（500）か、上流の IdP の discovery の文書を読めない（502） |
| ログインの失敗 | 「時間をおいて、もう一度ログインしてください。」 | `GET /login/callback` で、ログインの途中の値の cookie が無いか、`state` が合わない（400） |
| ログインの失敗 | 「時間をおいて、もう一度ログインしてください。」 | Hydra へログインか同意の accept か reject を返せない（502） |
| ログアウトの失敗 | 「時間をおいて、もう一度 buddy を開いてログアウトしてください。」 | `GET /logout` で `logout_challenge` が無い（400）か、Hydra へログアウトの accept を返せない（502） |

- ブローカーがログインを reject で返したときは、この画面の状態でなく、web の [ログインの失敗](../account-error_ログインの失敗/index.md) を出す。
  - reject で返す主な理由は、登録していないメール、休職と退職の職員、上流のメールの違いである。
  - 試行の回数の上限を超えたときは、`temporarily_unavailable` の reject で返す。ログインの失敗の画面は、ほかの理由と分けた文を出す。
- 失敗の画面を出す処理は、`services/broker/internal/login/login.go` の `fail` と `failLogout` にある。
