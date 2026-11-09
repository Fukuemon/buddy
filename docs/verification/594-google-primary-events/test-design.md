# Google カレンダーを正本にする事業所の、取り込めない予定の扱いの検証の設計

[#594](https://github.com/Fukuemon/buddy/issues/594) の受け入れの条件の 5 つ目を、画面から確認する検証の設計。  
検証の issue は [#933](https://github.com/Fukuemon/buddy/issues/933) である。  
シナリオは [scenarios.md](scenarios.md) に、エビデンスの一覧は [README.md](README.md) にある。

## 対象範囲

### 対象

- 確認する受け入れの条件: 繰り返し予定と例外の回、終日予定、訪問情報に変換できない予定の扱いを定義・検証し、取り込めない予定を、件数も案内も無く欠落させない（#933 の書き方）。
- `google_primary` の事業所の予定のカレンダーの週の表示で、Google カレンダーの予定が次のどこに出るか。
  - 時刻の格子
  - 「終日」の行
  - 通知の欄の確認が必要な予定（日時、職員、理由）
  - 通知の欄のカレンダーに出せない予定の件数（職員ごとの件数）

### 対象外

| 観点 | 理由 |
| --- | --- |
| `buddy_primary` の事業所の表示 | 受け入れの条件は Google カレンダーを正本にする事業所の扱いである。通知の欄と「終日」の行が出ないことは、[#968](https://github.com/Fukuemon/buddy/pull/968) の `buddy-primary` で確認した |
| 月の表示、日の表示、幅 390px の週の一覧 | 同じ一覧の API の応答を出し分けるだけである。終日の予定の出し方は #968 の `all-day-span` で確認した |
| 例外の回の元の開始を読めない予定と、取り消した回の元の日付を読めない予定 | 同期が Projection に写さずに消す（下の「未決事項」）。calendarpit は元の開始の無い例外の回を作れず、画面では確認できない |
| 長さが 0 以下の予定 | calendarpit が 400 で拒み、作れない。`TestProjectionRulesReadCalendarOnly` が件数に入れる読み替えを確認している |
| 休職と退職の職員、訪問しない職員の件数 | シードの `google_primary` の事業所に該当する職員がいない。web のテストで確認している（#968 の撮らない観点） |
| 予定の詳細と編集 | 受け入れの条件は欠落しないことである。確認が必要な予定に訪問の情報を入れる操作は、`google-primary-visit-info.e2e.ts` で確認した |

## 根拠

| 種別 | 参照先 | 確認した内容 |
| --- | --- | --- |
| 要求 | #594 の受け入れの条件の 5 つ目 | 取り込めない予定を、件数も案内も無く欠落させない |
| 要求 | #672 で利用者が決めた 4 つの論点（#968 の本文の「背景」） | 何日かにわたる終日の予定は全ての日に出す。繰り返しは回に展開する。期間と重なる予定を数える。時刻を読めない予定は読めた方の日で数える |
| 設計 | [ADR-0029](../../adr/0029-google-calendar-sync.md) の Decision | 展開できない繰り返しの規則の予定は、確認が必要な予定として 1 件で返し、一覧から落とさない |
| 実装 | `services/schedule/internal/features/calendar/projection_rules.go` の `Read` | Projection の予定を、訪問、通常、タイトルを読めない予定、終日、出せない予定、取り消しに読み替える |
| 実装 | `services/schedule/internal/features/scheduleview/list.go` の `listProjected` と `detail` | 時刻のある予定を回に展開し、訪問の情報を引けない予定に確認が必要な理由を付ける |
| 実装 | `services/schedule/internal/features/scheduleview/calendar_only.go` の `collectCalendarOnly` | 終日の予定を回ごとに返し、出せない予定を職員ごとに数える |
| 実装 | `apps/web/src/features/schedule/components/ScheduleSourceNotices.tsx` | 確認が必要な予定の通知と、出せない予定の件数の通知を出す |
| 既存テスト | `TestSchedulesListGooglePrimaryReviewReasons`、`TestSchedulesListGooglePrimaryExpandsRecurrence`、`TestSchedulesListGooglePrimaryAllDayEvents`、`TestSchedulesListGooglePrimaryUnlistedCounts` | 一覧の API が、理由、回、終日の予定、件数を返す |

## 用語

- 取り込めない予定: Google カレンダーにあり、buddy の時刻のある予定（訪問か通常）に読み替えられない予定。終日の予定、出せない予定、写せない繰り返しの予定、訪問の情報を引けない予定を指す。
- 出せない予定: 2 日以上にわたる予定、24 時間以上の予定、日時を読めない予定、長さが 0 以下の予定。中身を出さずに件数だけを出す。
- 写せない繰り返し: buddy の繰り返しの規則（`RuleFromRecurrence`）に写せない RRULE の予定。例は、間隔が 2 以上の毎日である。

## 処理の流れ

### 呼び出しの tree

行番号は d99741e5 のもの。

```text
services/schedule/internal/features/calendarsync/projection_applier.go  Apply
├── calendar.ProjectionOf で行にする                                     :57
│   ├── 開始か終了を読めない予定は TimeUnreadable の行にする               projection_row.go:73-74
│   └── 例外の回の元の開始を読めない予定はエラーにする                       projection_row.go:56-61
├── エラーの予定は Projection から消す（ログだけ残す）                     :58-62
└── Projection に書く                                                    :67

services/schedule/internal/features/scheduleview/list.go  listProjected
├── expandProjections で時刻のある予定を回に展開する                       :111
│   ├── 単発の予定は Read が訪問、通常、タイトルを読めない予定のときだけ残す  projection.go:127
│   ├── 親の最初の回が時刻のある予定でなければ展開しない                     projection.go:138
│   └── 写せない繰り返しは最初の回の 1 件にし、unsupported を付ける           projection.go:146
├── detail で理由を付ける                                                 :222
│   ├── unsupported は recurrence_unsupported                            :254
│   ├── タイトルを読めない予定は title_unreadable                          :260
│   └── 訪問のタイトルで、サービスコードか利用者を引けなければ理由を付ける     :262-271
└── collectCalendarOnly で終日の予定と出せない予定を集める                  :129
    ├── 出せない予定は職員ごとに数える                                     calendar_only.go:56
    ├── 単発の予定と日時を読めない予定は、期間に重なれば 1 件にする           calendar_only.go:87-91
    └── 写せない繰り返しは、期間を見ずに最初の回の 1 件にする                calendar_only.go:93-99

apps/web/src/api/http/httpBuddyApi.ts
└── 理由のある予定を、期間で絞らずに needsReview にする                      :174

apps/web/src/features/schedule/components/ScheduleSourceNotices.tsx
├── 確認が必要な予定の件数と、予定ごとの日時、職員、理由を出す
└── 出せない予定の件数と職員ごとの件数、Google カレンダーで確認する案内を出す
```

### 予定の種類ごとの出し先

| Google カレンダーの予定 | 読み替え（`Read`） | 画面の出し先 |
| --- | --- | --- |
| 時刻のある予定、繰り返しの回、変えた回 | 訪問か通常 | 時刻の格子 |
| 取り消した回 | 取り消し | 出さない（Google で取り消した予定） |
| 訪問のタイトルで、利用者かサービスコードを引けない予定 | 訪問 | 時刻の格子と、確認が必要な予定（理由つき） |
| タイトルが空白だけの予定、訪問のタイトルを読めない予定 | タイトルを読めない予定 | 時刻の格子と、確認が必要な予定（理由つき） |
| 写せない繰り返しの時刻のある予定 | 訪問か通常 | 最初の回を時刻の格子に出し、確認が必要な予定（理由つき） |
| 終日の予定 | 終日 | 「終日」の行（かかる全ての日、繰り返しは回ごと） |
| 写せない繰り返しの終日の予定 | 終日 | 最初の回の日だけの「終日」の行と、確認が必要な予定（理由つき） |
| 出せない予定 | 出せない予定 | 出せない予定の件数 |

### 取り込めない予定は、件数か理由のどちらかで知らせる

画面の格子に出ない予定は、「終日」の行か出せない予定の件数に出る。  
格子に出ても buddy の訪問の予定にできない予定は、確認が必要な予定に理由と一緒に出る。  
確認が必要な予定は、表示している期間で絞らない。

### 写せない繰り返しは最初の回の 1 件にする

時刻のある予定は、最初の回の 1 件にして確認が必要な予定に出す。ADR-0029 のとおりである。  
終日の予定も、最初の回の 1 件にして確認が必要な予定に出す（#972）。2 回目からの回は「終日」の行に出ないが、確認が必要な予定はどの週にも出る。

## テスト観点

| 観点 | 対応する分岐・仕様 | 検出する不具合 | 扱い |
| --- | --- | --- | --- |
| 繰り返しの回と例外の回 | `expandParent`、例外の回の置き換え | 変えた回が元の時刻にも出る。取り消した回が出る | 必須 |
| 写せない繰り返しの時刻のある予定 | `unsupported`、`recurrence_unsupported` | 写せない予定が一覧から落ちる。理由が出ない | 必須 |
| 終日の予定（1 日、何日か、繰り返しと除外） | `collectCalendarOnly`、`spanOccurrences` | 終日の予定が落ちる。何日かの予定が 1 日だけに出る。除外した回が出る | 必須 |
| 訪問の情報に変換できない予定 | `detail` の理由 | 利用者かサービスコードを引けない予定が落ちる。理由が違う | 必須 |
| 出せない予定の件数 | `counts`、`ScheduleSourceNotices` | 日時を読めない予定と何日かの予定が落ちる。読めない予定でほかの予定が出なくなる | 必須 |
| 写せない繰り返しの終日の予定 | `spanOccurrences` の写せない繰り返し | 2 回目からの回が、件数も理由も無く落ちる | 必須 |
| 例外の回の元の開始を読めない予定 | `ProjectionOf` のエラー | 落ちる | 対象外（作れない） |

## テストケース

ケースの前提、操作、期待結果は、[scenarios.md](scenarios.md) のシナリオに書く。

| ケース | 対応観点 | EARS の要件 | 優先度 |
| --- | --- | --- | --- |
| 繰り返しの予定と例外の回 | 繰り返しの回と例外の回、写せない繰り返しの時刻のある予定 | WHEN 繰り返しの予定の回を変えたか取り消したとき、THEN 回は変えた時刻に出て、取り消した回は出ない SHALL。WHEN 写せない繰り返しの時刻のある予定があるとき、THEN 最初の回が格子に出て、確認が必要な予定に理由と一緒に出る SHALL | 高 |
| 終日の予定 | 終日の予定 | WHEN 1 日、何日か、回を除外した繰り返しの終日の予定があるとき、THEN かかる日と回の日の「終日」の行に出て、除外した日には出ない SHALL | 高 |
| 訪問の情報に変換できない予定 | 訪問の情報に変換できない予定 | IF タイトルから利用者かサービスコードを引けないか、タイトルを読めないならば、THEN 予定は格子に出て、確認が必要な予定に理由と一緒に出る SHALL | 高 |
| カレンダーに出せない予定 | 出せない予定の件数 | IF 時刻を読めない予定か 2 日にわたる予定があるならば、THEN 格子に出ずに職員ごとの件数に数えられ、同じ週のほかの予定は格子に出る SHALL | 高 |
| 写せない繰り返しの終日の予定 | 写せない繰り返しの終日の予定 | IF 写せない繰り返しの終日の予定があるならば、THEN 最初の回の日の「終日」の行に出て、表示している週によらず、確認が必要な予定に理由と一緒に出る SHALL | 高 |

## 既存テストとの対応

| ケース | 既存テスト | 対応方針 |
| --- | --- | --- |
| 繰り返しの予定と例外の回 | `TestSchedulesListGooglePrimaryExpandsRecurrence`、`TestSchedulesListGooglePrimaryReviewReasons`。#968 の `timed-and-notices` | 画面で回と理由を撮る |
| 終日の予定 | `TestSchedulesListGooglePrimaryAllDayEvents`。#968 の `all-day-week`、`all-day-span`、`all-day-recurring` | 3 種類を 1 つの週で撮る |
| 訪問の情報に変換できない予定 | `TestSchedulesListGooglePrimaryReviewReasons` | 4 つの理由を画面で撮る |
| カレンダーに出せない予定 | `TestSchedulesListGooglePrimaryUnlistedCounts`。#968 の `unlisted-time`、`unlisted-multi-day` | 2 種類を 1 つの週で撮る |
| 写せない繰り返しの終日の予定 | `TestSchedulesListGooglePrimaryAllDayRecurrence`（#972） | 新しく撮る |

## 未決事項

- 写せない繰り返しの終日の予定は、ADR-0029 の「確認が必要な予定として 1 件で返し、一覧から落とさない」に当たるが、実装は確認が必要な予定に出さない。2 回目からの回は、件数も理由も無く出ない。シナリオ「写せない繰り返しの終日の予定」で画面を撮り、扱いを利用者に尋ねる。
- 例外の回の元の開始を読めない予定は、同期が Projection から消し、件数にも理由にも出ない。#968 の本文の「レビューしてほしい点」に、今までどおり消すと書いてある。Google カレンダーの例外の回は元の開始を持つので、起きる条件は未確認である。

## 実装への引き渡し

- テスト配置先: `packages/e2e/tests/evidence/schedule/google-primary-event-kinds.e2e.ts`
- fixture・入力データ: calendarpit の管理の API で予定を作り、利用者は予定の API で登録する。撮った後に予定を消す。
- 実行コマンド: `context/testing/evidence.md` の「撮るコマンド」に、`EVIDENCE_FOR=issue-933` と spec のファイルを渡す。
