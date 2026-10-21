# ADR-0008: web の画面の型を API の型と分けて持ち、架空のデータを API の形で 1 か所に置く

## Status

承認

## Context

web の画面は、`apps/web/src/api/types.ts` の型（画面の型）で予定、職員、チーム、利用者を扱う。API の型は、各 API の `openapi.yaml` から `apps/web/src/api/generated/` に生成する。2 つの型は名前と形が違う。

- 予定は、API が日付（`date`）と時刻（`start_time`、`end_time`）を分けて持ち、画面は時差つきの日時（`startsAt`、`endsAt`）で持つ。カレンダーのライブラリ（FullCalendar）は日時で受ける。
- 予定の種類と訪問の区分は、API が日本語の名前（`通常`、`夜勤`）と ID で持ち、画面は英語の値（`normal`、`night`）で持つ。作成と更新では、名前から API のマスタの ID を引く。
- 職員の名前は、API が `username` で、画面が `name` である。
- チームと利用者は、画面が API の型の ID と名前だけを使う。

API の応答は `apps/web/src/api/http/scheduleMapper.ts` が画面の型に変える。偽物の API は 2 つあり、架空のデータを別々に持っていた。

- 画面の型で動く偽物（`src/api/fake/`）。開発サーバーの fake のモード、story、テストが使う
- API の形で返す MSW の handler（`src/mocks/`）。テストと開発サーバーの msw のモードが使う

## Decision

画面の型を残し、API の型との変換を `scheduleMapper.ts` に集める。架空のデータは API の形で `src/mocks/scheduleData.ts` に 1 つだけ置き、画面の型で動く偽物は、そのデータを本物の API と同じ変換に通して作る。

- 画面の型は、画面が要る形にする。API と同じ意味で同じ形の型（チーム、利用者）は、生成した型から `Pick` で導き、手で書き写さない。
- 型の変換は、`scheduleMapper.ts` に置く。API の型から画面の型へは `fromApiSchedule` などが、画面の型から API の要求へは `toSlotRequest` が変える。画面のコンポーネントと route は API の型を import しない。
- `src/api/fake/fixtures.ts` は、`src/mocks/scheduleData.ts` のデータを上の変換に通して作る。偽物のデータを変えるときは、`src/mocks/scheduleData.ts` だけを直す。
- サービスコードの一覧（`SERVICE_CODES`）は、画面の型に残す。API はサービスコードを文字列で返し、列挙の型を持たないので、生成した型から導けない。表記はマイグレーションの値と同じにする（`apps/schedule-api/db/migrations/000007_insert_fixed_masters.up.sql` の注記）。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 画面の型を残し、同じ意味の型は生成した型から導き、架空のデータを API の形で 1 か所に置く | コンポーネントは画面に合う形を受ける。API の名前や日付の持ち方が変わっても、`scheduleMapper.ts` だけを直せばよい。fake のモードでも本物と同じ変換を通る | 変換の層が残る。画面の型と API の型の両方を読む必要がある |
| 画面も API の型を直接使い、変換の層を無くす | 型が 1 つになる。変換のコードが無くなる | 日付と時刻をまとめる処理、名前から ID を引く処理が、コンポーネントとフォームに散る。API の名前を変えると画面の全体に波及する |
| 今のまま（画面の型と、2 つの偽物のデータを別々に持つ） | 変更が要らない | 2 つの偽物のデータが食い違う。fake のモードは変換を通らないので、変換の誤りに気付けない |

## Consequences

### Positive

- 偽物のデータが 1 か所になり、fake、msw のモード、story、テストが同じ予定を見る。
- fake のモードでも `scheduleMapper.ts` を通るので、変換の誤りが手元の画面に出る。
- チームと利用者の型は、API の型が変わると型のチェックで食い違いが分かる。

### Negative

- 画面の型に新しい項目を足すときは、`scheduleMapper.ts` の変換も直す。
- 訪問の予定の題は、API では空で、フォームが「訪問」に固定する。画面の型の題は、API から来た予定では空になる。
