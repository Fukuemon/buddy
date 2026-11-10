# account-error API との対応

[ログインの失敗](index.md) の項目と、web の型と OpenAPI の項目の対応。  
この画面は API を呼ばず、URL の search params の `reason` だけを読む。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ページのタイトル | 理由ごとのタイトル | search params の `reason`（`AuthErrorReason`） | なし |
| 説明の文 | 理由ごとの文 | search params の `reason`（`AuthErrorReason`） | なし |

## 条件の対応

なし。

- 画面を出し分けるのは search params の `reason` だけで、どれも状態が決める。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 4 | もう一度ログインする | `auth-error-login` |

- カードの `auth-error` は、構成要素の表に載せないので、この表に載せない。

## 状態と失敗の要因

web のサーバーは、ログインの後の戻り（`/auth/callback`）で失敗すると、`reason` を付けてこの画面へリダイレクトする。  
ブローカーがログインを reject で返したときは、Hydra が reject の `error` を `/auth/callback` に渡し、web のサーバーが `reason` に読み替える。

| 状態 | `reason` | 要因 |
| --- | --- | --- |
| 登録を確認できない | `denied` | `error` が `access_denied`。登録していないメール、休職と退職の職員、登録の途中の職員、メールに当たる有効な職員が 2 人以上いるとき、ログインの途中に休職か退職になった職員 |
| 登録と違うアカウント | `account_mismatch` | `error` が `account_mismatch`。上流のメールが確認済みでないか登録のメールと違う、結び付けた上流のアカウントと違う、上流のアカウントが別の職員に結び付いている |
| 事業所に登録されていない | `forbidden` | `getMe` が 403 |
| 試行の回数の上限を超えた | `too_many_attempts` | `error` が `temporarily_unavailable`。入れたメールアドレスごとの試行の回数の上限を超えた |
| ログインを続けられない | `interrupted` | `state` が cookie と合わないか、ログインの途中の値が無い。`error` が `login_interrupted`（上流の IdP がログインを終えずに戻した） |
| 障害でログインできない | `failed` | `error` が `server_error` か、ほかの値。Hydra で認可コードをトークンと交換できない。`getMe` が 403 以外の失敗のステータスを返す |

- 登録を確認できない 5 つの要因は、同じ reject を返し、同じ状態コードで、同じ先へリダイレクトする。
- `reason` は、`apps/web/src/server/auth.ts` の `finishLogin` が付ける。`error` から `reason` への読み替えは、同じファイルの `reasonOfBrokerError` にある。
- `AuthErrorReason` の型は `apps/web/src/api/types.ts` に、理由ごとの文は `apps/web/src/components/page/AuthErrorMessage.tsx` にある。
