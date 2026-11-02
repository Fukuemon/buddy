# account-error API との対応

[ログインの失敗](index.md) の項目と、web の型と OpenAPI の項目の対応。  
この画面は API を呼ばず、URL の search params の `reason` だけを読む。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ページのタイトル | 理由ごとのタイトル | search params の `reason`（`AuthErrorReason`） | なし |
| 説明の文 | 理由ごとの文 | search params の `reason`（`AuthErrorReason`） | なし |

## 状態と失敗の要因

web のサーバーは、ログインの後の戻り（`/auth/callback`）で失敗すると、`reason` を付けてこの画面へリダイレクトする。

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| ログインの途中の失敗 | 「時間をおいて、もう一度ログインしてください。」 | `state` が cookie と合わないか、ログインの途中の値が無い |
| ログインの途中の失敗 | 「時間をおいて、もう一度ログインしてください。」 | Hydra で認可コードをトークンと交換できない。ブローカーがログインを reject で返したときを含む。reject で返す主な理由は、登録していないメール、休職と退職の職員、上流のメールの違いである |
| 試行の回数の上限を超えた | 「続けて何度もログインを試したため、受け付けを止めています。30 秒ほどおいてから、もう一度ログインしてください。」 | `/auth/callback` の `error` が `temporarily_unavailable`。ブローカーが、入れたメールアドレスごとの試行の回数の上限を超えたログインを reject で返したとき |
| ログインの途中の失敗 | 「時間をおいて、もう一度ログインしてください。」 | `getMe` が 403 以外の失敗のステータスを返す |
| 事業所に登録されていない | 「事業所の管理者に、メールアドレスの登録を頼んでください。」 | `getMe` が 403 |

- `reason` は、`apps/web/src/server/auth.ts` の `finishLogin` が、リダイレクト先の URL に付ける。
- `AuthErrorReason` の型と、理由ごとの文は `apps/web/src/components/site/AuthErrorMessage.tsx` にある。
