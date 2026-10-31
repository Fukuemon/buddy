# account-error API との対応

[ログインの失敗](index.md) の項目と、web の型と OpenAPI の項目の対応。  
この画面は API を呼ばず、URL の search params の `reason` だけを読む。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ページのタイトル | 理由ごとのタイトル | search params の `reason`（`AuthErrorReason`） | なし |
| 説明の文 | 理由ごとの文 | search params の `reason`（`AuthErrorReason`） | なし |

- `reason` は、web のサーバー（`apps/web/src/server/auth.ts` の `finishLogin`）がリダイレクト先の URL に付ける。
- `forbidden` は、ログインの後に `getMe`（`GET /v1/me`）が 403 を返したときに付ける。`getMe` がほかの失敗を返したときは `failed` を付ける。
- `AuthErrorReason` の型は `apps/web/src/components/site/AuthErrorMessage.tsx` にある。
