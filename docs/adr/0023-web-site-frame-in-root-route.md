# ADR-0026: web の画面の枠を root の route の component で包み、左の欄を持つ画面だけを staticData で外す

## Status

承認

## Context

web の画面の枠は、ヘッダー、ナビゲーション、照合待ちのバッジ、余白を付けた `main` である。

- 枠は `SiteLayoutContainer`（`src/components/layout/`）が描き、照合待ちのバッジは calendar の機能の `CalendarReviewBadgeContainer` が描く。
  - `src/components/` は `features/` を import できないので、バッジは呼ぶ側が `reviewBadge` の props で渡す。
- 枠を、画面の route のファイル 10 個と、`__root.tsx` の権限が無いときの表示が、それぞれ組み立てていた。
  - `receipt.index.tsx` と `receipt.result.tsx` だけ、余白が `p-6` で、ほかの `p-4 desktop:p-6` と違った。
- route のファイルの責務は、URL と Container の結び付け、search params の検証、SSR の有無、loader の prefetch に限る。枠を置く場所は決めていなかった。
- 予定の画面（`/schedule` とその子）は、左の欄（ミニカレンダー、職員の絞り込み）を持つ別の枠（`SchedulePageLayout`）を使う。
  - 左の欄の開閉の状態は、カレンダーのツールバーのボタンと共有する。
  - `/schedule` は、デバイスの日付と時間帯で描くので `ssr: false` である。
- `/auth/` の下の画面（ログインの失敗）は、枠を出さない。

## Decision

画面の枠を、`routes/__root.tsx` の component（`RootLayout`）で包む。

- `RootLayout` は、`/auth/` の下を除く全ての画面を `SiteFrame`（`SiteLayoutContainer`、照合待ちのバッジ、余白を付けた `main`）で包む。
  - routes は機能を import できるので、バッジを root の 1 か所で渡せる。
- ナビゲーションの今の画面は、pathname から `siteNavHrefOf` で決める。いちばん長く一致するナビゲーションの href を選ぶ。
- 権限が無いときの表示（root の `errorComponent`）も、同じ `SiteFrame` で包む。
- 左の欄を持つ予定の画面は、route の `staticData` の `ownsSiteLayout` を true にし、root の枠で包まない。
  - 予定の画面は、今までどおり機能の `SchedulePageLayout` が `SiteLayoutContainer` を使う。
  - 左の欄と開閉の状態を root に出すと、`ssr: false` の予定の画面のコンポーネントを、root がサーバーで描くことになるためである。
- 画面の route のファイルは、Container か、機能の画面のコンポーネントだけを描く。見出しとリード文も機能に置く。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** `__root.tsx` の component で包み、予定の画面だけを `staticData` で外す | 枠とバッジが root の 1 か所になる。route の ID が変わらない | `__root.tsx` が、枠を出さない URL（`/auth/` の下）を知る。予定の画面の枠は機能に残る |
| URL に出ないレイアウトの route（`_app.tsx`）で包み、画面の route をその子にする | 枠を出す画面と出さない画面を、ファイルの配置先で分けられる | 全ての画面の route のファイル名と ID が変わり、機能のコードの `useSearch({ from })` と `useNavigate({ from })` の 14 か所と、route の ID を読むテストを書き換える。予定の画面の左の欄は、この選択肢でも別の扱いが要る |
| route のファイルごとに枠を組み立てる（今まで） | route のファイルを読めば、画面の全体が分かる | 同じ組み立てが 12 か所にあり、余白がずれた。バッジを全ての route が渡す |

- ADR-0024 は、権限でレイアウトの route をまとめる形を採らなかった。枠だけのレイアウトは権限と関係しないので、その判断の対象の外である。
  - ADR-0024: [web の画面の権限の確認を、route の beforeLoad と PermissionGuard で宣言し、1 つの関数で評価する](0024-web-permission-checks.md)

## Consequences

### Positive

- 枠、バッジ、余白を、`__root.tsx` の `SiteFrame` の 1 か所で直せる。
- 画面の route のファイルが、codebase.md の決めた責務だけを持つ。

### Negative

- 左の欄を持つ画面を足すときは、`ownsSiteLayout` を付け、機能の Layout で `SiteLayoutContainer` を使う。枠の組み立てが 2 か所（root と機能の Layout）に分かれる。
- どの route にも合わない URL の Not Found の表示は、root の `Outlet` が描くので、枠の中に出る。
- ナビゲーションに出ない URL の画面を足すと、`siteNavHrefOf` は pathname をそのまま返し、ナビゲーションのどの項目も今の画面にならない。
