# 誤って入れた予定の削除の検証の設計

[#882](https://github.com/Fukuemon/buddy/issues/882) の受け入れの条件を、画面から確認する検証の設計。  
検証の issue は [#946](https://github.com/Fukuemon/buddy/issues/946) である。  
シナリオは [scenarios.md](scenarios.md) に、エビデンスの一覧は [README.md](README.md) にある。

## 対象範囲

### 対象

- 確認する受け入れの条件（#882）
  1. 削除できる予定の詳細から、削除の確認を経て予定を消せる。
  2. 削除した予定は、キャンセルした予定を出す設定でもカレンダーに出ない。
  3. 削除できない予定（前提と論点で決める条件に当たる予定）では、削除の操作が出ない。
  4. `google_primary` の事業所での動きが、前提と論点で決めたとおりになる。
- 予定の詳細の「予定を削除」、削除の確認のダイアログ、日の表示、`buddy_primary` の事業所の書き出し先の Google カレンダー（calendarpit）

### 対象外

| 観点 | 理由 |
| --- | --- |
| 置き換えた回の削除で元の回に戻らないこと（ADR-0040 の 7） | [#953](https://github.com/Fukuemon/buddy/pull/953) の `1-3` と、Go のテストで確認した |
| 回を削除した後の規則の変更（ADR-0040 の 8） | `TestSchedulesDeleteOccurrenceThenChangeRule` で確認した。画面の操作は削除と別の機能である |
| 削除を拒まれたときの文 | [#959](https://github.com/Fukuemon/buddy/pull/959) の `detail-delete-failed` で確認した |
| 予定の API が返す 400 と 409 | #953 の `1-4` と `1-5` で確認した。画面は条件に当たる予定に操作を出さない |
| 監査の記録の中身（ADR-0040 の 9） | 画面に出さない。`TestScheduleDeleteInDB` で確認した |
| 削除した予定の ID での作成を 409 で拒むこと | 画面は新しい ID で作る。`TestSchedulesDelete` で確認した |
| 予定の正本を切り替えている途中の事業所 | キャンセルと同じ判定（`canChangeSchedule`）を使う。`scheduleWritable.test.ts` で確認した |

## 根拠

| 種別 | 参照先 | 確認した内容 |
| --- | --- | --- |
| 要求 | #882 の受け入れ条件 | 上の 4 つの条件 |
| 設計 | [ADR-0040](../../adr/0040-schedule-deletion.md) の Decision | 編集できる職員が、開始の日が今日以降の有効な予定を消せる。回は 1 回だけ消せる。`google_primary` では操作を出さない。`buddy_primary` では書き出しが Google の予定を消す |
| 画面仕様書 | [予定の詳細の「予定を削除」](../../screens/schedule-detail_予定の詳細/index.md#予定を削除) | 「予定を削除」を出す 6 つの条件 |
| 実装 | `apps/web/src/features/schedule/lib/scheduleWritable.ts` の `canDeleteSchedule` | 事業所のモード、キャンセル、切り替え、写せない繰り返し、今日の日付で判定する |
| 実装 | `services/schedule/internal/features/schedule/delete.go` の `Delete` と `DeleteOccurrence` | 権限、キャンセル、日付を確認し、監査の記録を書き、書き出しの待ちを積む |
| 実装 | `services/schedule/internal/features/calendarexport/exporter.go` | 削除の待ちで、Google の予定を消すか、親の予定の `EXDATE` にする |

## 処理の流れ

```text
apps/web/src/features/schedule/components/ScheduleDetailModalContainer.tsx
├── canEditScheduleOf と canDeleteSchedule で「予定を削除」を出すかを決める
└── ScheduleDeleteDialog の「予定を削除する」で useDeleteSchedule を呼ぶ
    └── api.schedules.delete
        ├── 単発の予定: DELETE /v1/schedules/{schedule_id}
        └── 回: POST /v1/schedules/recurring/{recurring_schedule_id}/occurrences/delete

services/schedule/internal/httpapi/schedule_handler.go
├── google_primary の事業所は 409（google_primary）で拒む
└── schedule.Delete か DeleteOccurrence
    ├── 監査の記録（schedule_deletions）を書く
    ├── 単発の予定の行を消すか、回の日を除外する日に足す
    └── Outbox.ScheduleDeleted で、書き出しの待ちを積む

services/schedule/internal/features/calendarexport/exporter.go
└── Google の予定を消すか、親の予定に EXDATE を足す
```

## テスト観点

| 観点 | 受け入れの条件 | 対応する分岐・仕様 | 検出する不具合 | シナリオ |
| --- | --- | --- | --- | --- |
| 単発の予定の削除 | 1、2 | `Delete`、削除の確認のダイアログ | 確認を経ずに消える。消えた予定がキャンセルした予定として出る | 単発の予定の削除 |
| 繰り返しの予定の回の削除 | 1、2 | `DeleteOccurrence`、回の説明 | ほかの回も消える。消えた回がキャンセルした予定として出る | 繰り返しの予定の回の削除 |
| 今日より前、キャンセル済み、編集の権限が無い予定 | 3 | `canDeleteSchedule`、`canEditScheduleOf` | 削除できない予定に操作が出る。削除できる予定に出ない | 削除できない予定 |
| `google_primary` の事業所 | 4 | `sourceMode === 'buddy_primary'`、キャンセルの書き込み | 操作が出る。キャンセルが Google の予定を消さなくなる（回帰） | Google カレンダーで管理する事業所 |
| `buddy_primary` の事業所の書き出し | 1（ADR-0040 の書き出し） | `Outbox.ScheduleDeleted`、`Exporter` | Google の予定が残り、照合に削除した予定が残る | Google カレンダーに書き出した予定の削除 |

## テストケース

### 削除できる予定

- **REQ-1**: WHEN 予定を編集できる職員が、`buddy_primary` の事業所の今日以降の有効な予定を、詳細の「予定を削除」と確認のダイアログで消したとき、the 予定のカレンダー SHALL その予定を出さない。
  - 単発の予定の削除、繰り返しの予定の回の削除
- **REQ-2**: WHEN 削除した後に「キャンセルした予定を出す」を入れたとき、the 予定のカレンダー SHALL 削除した予定を出さず、同じ日のキャンセルした予定は出す。
  - 単発の予定の削除、繰り返しの予定の回の削除
- **REQ-3**: WHEN 繰り返しの予定の回を削除したとき、the 予定のカレンダー SHALL ほかの回を出す。
  - 繰り返しの予定の回の削除

### 削除できない予定

- **REQ-4**: IF 開いた予定が、開始の日が今日より前の予定か、キャンセルした予定か、編集できない職員の予定ならば、the 予定の詳細 SHALL 「予定を削除」を出さない。
  - 削除できない予定

### Google カレンダー

- **REQ-5**: IF 事業所が `google_primary` ならば、the 予定の詳細 SHALL 「予定を削除」を出さず、「予定をキャンセル」で Google カレンダーの予定を消す。
  - Google カレンダーで管理する事業所
- **REQ-6**: WHEN `buddy_primary` の事業所で、Google カレンダーを結び付けた職員の書き出した予定を削除したとき、the 書き出し SHALL Google カレンダーの予定を消す。
  - Google カレンダーに書き出した予定の削除

## 未決事項

なし。
