---
type: feature-design
title: 予定の画面
description: 予定のカレンダー、予定の詳細、予定の作成、予定の編集の画面が、BFF を通して予定の API を読み書きする流れ。呼び出し、ログインが切れたとき、読み込み、予定の一覧の期間と職員の絞り込み、保存
status: stable
governs:
  - apps/web/src/features/schedule
  - apps/web/src/api
verified_commit: 31cbed15
---

# 予定の画面

## Overview

予定のカレンダー、予定の詳細、予定の作成、予定の編集の画面が、web の BFF を通して予定の API を読み書きする流れを書く。  
web と予定の API の責務と依存は、[buddy Design Doc](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md) にある。  
予定の API の中の構成は、[予定の管理の Design Doc](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md) にある。

## Scope

- 持つもの: 4 つの画面の呼び出し、読み込み、取り直し、予定の一覧の期間と職員の絞り込み、保存の前の値の組み立て。
- 持たないもの: 画面の状態と文。
  - 各画面の画面仕様書にある。status と文の対応は、各画面の `api.md` の「状態と失敗の要因」にある。
  - [予定のカレンダー](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/schedule-calendar_予定のカレンダー/index.md)
  - [予定の詳細](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/schedule-detail_予定の詳細/index.md)
  - [予定の作成](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/schedule-new_予定の作成/index.md)
  - [予定の編集](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/schedule-edit_予定の編集/index.md)
  - [繰り返しの変更](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/schedule-recurrence_繰り返しの変更/index.md)

## Design

### 呼び出しと、ログインが切れたとき

- 画面は、BFF の server function を通して予定の API を呼ぶ。
  - BFF は、引数の先頭の事業所をセッションの事業所に替え、セッションの access token を付けて呼ぶ（`apps/web/src/server/bff.ts`）。
- セッションが無ければ、BFF が 401 を返す。
  - 予定の API が 401 を返したときも、その status を返す。
  - ブラウザは 401 を受けると、今の画面に戻るログインの画面へ移す（`apps/web/src/api/bff/bffBuddyApi.ts`）。
  - 移すときは、呼び出しを終わらせない。そのため、移るまで、画面は読み込み中か送信中の表示のままである。
- 予定のカレンダーとその上のモーダルは、サーバーで描画しない（`apps/web/src/routes/schedule.tsx` の `ssr: false`）。
  - 表示する日のデフォルトを職員のデバイスの日付で決め、FullCalendar がデバイスの時間帯で描くためである。

### 読み込み

- 予定、予定の一覧、職員、チーム、利用者の一覧は、TanStack Query の query で読む（`apps/web/src/features/schedule/queries.ts`）。
- 読み込みが失敗すると、3 回まで取り直してから失敗にする。
  - 4xx の `ApiError` は、取り直さずにすぐ失敗にする（`apps/web/src/appContext.ts` の `shouldRetryQuery`）。
  - 予定が見つからないとき、権限が無いとき、入力が規則に合わないときは、取り直しても結果が変わらないためである。
  - 文の選び方は [画面仕様書の規約のエラーの見せ方](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/rules.md#エラーの見せ方) にある。
- 画面の出し分けに使う予定の権限は、画面を読み込むたびに web のサーバーが `GET /v1/me` で読む。
  - web のサーバーは、`policies` のうち予定の権限と対象を、`Viewer` の `schedulePolicies` に入れる。変換は `apps/web/src/api/http/scheduleMapper.ts` の `fromApiSchedulePolicies` にある。
  - 画面は、職員ごとに見られるかと編集できるかを、予定の API の `schedule.CanRead` と `schedule.CanEdit` と同じ規則で決める。判定の処理は `apps/web/src/features/schedule/lib/schedulePermission.ts` にある。
- 予定の取得（`getSchedule`）は、パスに事業所を持たない。
  - BFF は、返った予定の `facility_id` がセッションの事業所と違えば、status が 403 の `ApiError` にする（`apps/web/src/api/http/httpBuddyApi.ts`）。
  - 予定の API のミドルウェアも、パスの `schedule_id` の事業所で 403 を返す（[予定の管理の Design Doc の認証から事業所の確認までの流れ](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#認証から事業所の確認までの流れ)）。
- 予定の詳細と予定の編集は、予定と同時に職員と利用者の一覧を読み、名前を一覧で探す。
  - 予定の詳細は一覧を待たずに予定を出す。一覧に無い職員と利用者を「職員不明」「利用者不明」と出す。
- 予定の作成と予定の編集は、職員、利用者、サービスコードの一覧（`listServiceCodes`）を読み終えてからフォームを出す。
  - サービスコードの選択肢と提供時間の範囲は、`listServiceCodes` の順と値を使う。

### 予定の一覧の期間と職員の絞り込み

- 予定のカレンダーは、表示の期間を日時の範囲（`from`、`to`）で、職員を `staffIds` で BFF に渡す。
- `listSchedules` は日付の範囲（`date_from`、`date_to`）だけを受けるので、BFF は `to` の前の日を `date_to` にして呼ぶ。
- BFF は、返った繰り返しの予定を期間の回に分け、回の ID（`occurrenceId`）を持つ単発の予定として画面に渡す。
  - 除外した日の回は作らない。
- 期間に重なるかと、職員の絞り込みは、BFF が返った予定に当てる。
  - キャンセルした予定は、画面が `includeCancelled` を渡したときだけ残す。
- 回の ID で予定を読むと、BFF は繰り返しの予定を読んでその回を作る。
  - 回が無いか除外した日なら、404 にする。

### 保存

- 予定の作成と予定の編集は、送る前に、BFF が予定の種類、サービスコード、訪問の区分のマスタ（`listScheduleTypes`、`listServiceCodes`、`listVisitCategories`）を読み、画面の値を ID にする。
  - マスタを読めないか、当たる値が無ければ、予定の API を呼ばずに失敗にする。
- 予定の作成は、画面の主訪問者を、予定の職員（`staff_id`）と訪問の担当（`visit_info.assigned_staff_id`）の両方に送る。
- 予定の作成で「繰り返しの予定にする」を選ぶと、BFF は繰り返しの予定を作る（`POST /v1/facilities/{facility_id}/schedules/recurring`）。
  - 予定の日時と訪問の情報は単発の予定と同じに変換し、日付を最初の日付にして、規則（`recurring_rule`）を足して送る。
  - 予定の API は、最初の日付が規則の回に当たらない規則を 400 で拒む。画面は送る前に同じ条件を確認し、繰り返しの欄に理由を出す（`apps/web/src/features/schedule/schema/scheduleCreateForm.ts`）。
  - 繰り返しの予定の `id` は、単発の予定の ID とは別に、フォームを開いたときに作る。送り直しでも同じ値を送る。
  - 規則の欄は、繰り返しの変更と同じ `apps/web/src/features/schedule/components/RecurringRuleFields.tsx` を使う。
- 予定の編集は、保存の前に今の予定を読み直し、画面が持たない値を今の予定から引き継ぐ（`apps/web/src/api/http/scheduleMapper.ts` の `keepCurrentVisit`）。
  - 読み直せなければ失敗にする。
  - 訪問の予定どうしの保存では、同行者とタイトルを今の予定の値のまま送る。
  - 訪問の担当は、今の担当が予定の職員と同じなら新しい予定の職員にし、違えば今の担当のまま送る。
  - 今の予定が訪問の情報を持たないときは、画面の値をそのまま送る。タイトルは「訪問」で送り、予定の API が Google のタイトルを訪問の情報から作る。
- 予定の編集は、訪問の情報を読み取れなかった確認が必要な Google カレンダーの予定でだけ、予定の種類のタブを出し、通常の予定を訪問の予定に変えて送れる。
  - 当たる予定かは、`apps/web/src/features/schedule/lib/reviewFix.ts` の `canAddVisitInfo` が決める。
  - 予定の API は、変更の予定の種類と訪問の情報をそのまま受けるので、BFF の変換は予定の作成と同じである。
- 繰り返しの予定の回を保存すると、BFF はその回だけを単発の予定に置き換える（`POST /v1/schedules/recurring/{recurring_schedule_id}/occurrences`）。
  - 画面は、置き換えた予定の ID の詳細へ戻る。
- 繰り返しの予定のまだ変えていない回（`Schedule.recurrence` を持つ回）では、予定の詳細の「編集」のメニューの「繰り返しを変更」から、繰り返しの変更（`/schedule/$scheduleId/recurrence`）を開ける。保存すると、BFF は規則を変える（`PUT /v1/schedules/recurring/{recurring_schedule_id}/rule`、ADR-0037）。
  - `buddy_primary` では回の ID から繰り返しの予定を読み、`google_primary` では予定の API が回に返す親の ID と規則（`recurring_schedule_id`、`recurring_rule`）を使う。`getRecurringSchedule` は `google_primary` で 404 を返すためである。
  - 適用の日は開いた回の日で、今日より前の回では今日である。`etag` は回の `etag`（親の予定の etag）である。新しい繰り返しの予定の `id` は繰り返しの変更を開いたときに作り、送り直しでも同じ値を送る。
  - 終了日だけを変えたときは、今の規則の終了日だけを替えて送る。
  - 成功すると、開いた回の取得の結果を捨て、予定のカレンダーへ戻る。開いた回は別の繰り返しの予定の回に替わることがあるためである。
  - 規則の欄は `apps/web/src/features/schedule/components/RecurringRuleFields.tsx` にある。
- 予定のキャンセルは、詳細から開くモーダルで理由を入れ、`POST /v1/schedules/{schedule_id}/cancel` に送る。
  - BFF が画面で展開した `buddy_primary` の繰り返しの予定の回は、回のキャンセルの API に回の日付と理由を送る。
    - API は `POST /v1/schedules/recurring/{recurring_schedule_id}/occurrences/cancel` である。
- `google_primary` の事業所では、予定の API が Google カレンダーに書く。
  - 作成は、フォームを開いたときに作った予定の ID（`apps/web/src/features/schedule/lib/scheduleId.ts`）を送る。送り直しでも同じ ID を送る。
  - 変更とキャンセルは、フォームかモーダルを開いたときに読んだ予定の `etag` を送る。
  - 予定の正本の切り替え中と、繰り返しの規則を buddy で表せない予定では、変更とキャンセルの操作を閉じる（`apps/web/src/features/schedule/lib/scheduleWritable.ts`）。
  - 予定の編集と繰り返しの変更の URL を切り替え中に直に開いたときは、フォームを出さずに切り替えていることを出す。切り替え中かは、開いたときに予定の詳細と同じ一覧の `cutover` で読み、開いた後は変えない（`apps/web/src/features/schedule/queries.ts` の `useCutoverAtOpen`）。
  - 409（`google_event_changed`）では、入力を残して予定を読み直し、最新の予定をフォームの上に出し、送る `etag` を置き換える。
  - 動きの全体は、`services/schedule/internal/features/calendar/DesignDoc.md` の「画面からの書き込み」にある。
- 保存とキャンセルの失敗は、403、Google カレンダーに書けなかったときの code、400 をほかの失敗と分けて文を出す。
  - 文は `apps/web/src/features/schedule/lib/errorMessage.ts` の `scheduleSubmitErrorMessage` が決める。
  - `google_primary` の code は、予定の API が、buddy を予定の正本にしていない事業所の予定を buddy の予定として書くのを拒んだことを表す。
  - 予定の API の 400 は合わない項目を返さないので、項目には示さない。
- 保存とキャンセルに成功すると、事業所の予定の読み込みの結果を捨てて読み直す。

## Interface

- query と保存の mutation: `apps/web/src/features/schedule/queries.ts`
- 予定の権限の判定: `apps/web/src/features/schedule/lib/schedulePermission.ts`
- 保存と読み込みの失敗の文: `apps/web/src/features/schedule/lib/errorMessage.ts`
- 予定の API の呼び出しと、画面の値との変換: `apps/web/src/api/http/httpBuddyApi.ts`、`apps/web/src/api/http/scheduleMapper.ts`
- ブラウザから BFF への呼び出し: `apps/web/src/api/bff/bffBuddyApi.ts`
