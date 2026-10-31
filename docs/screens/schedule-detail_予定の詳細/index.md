# schedule-detail 予定の詳細

職員が、カレンダーで押した予定 1 件の内容を見て、編集へ進む画面。  
予定のカレンダーの上にモーダルで重ねて出し、閉じるとカレンダーに戻る。

| 項目 | 値 |
| --- | --- |
| URL | `/schedule/$scheduleId`。`/schedule` の子で、カレンダーの search params を引き継ぐ |
| 使う人 | 予定を見る権限を持つ職員。自分の予定は全ての職員が見られる |
| 実装 | `apps/web/src/routes/schedule.$scheduleId.index.tsx`、`apps/web/src/features/schedule/components/ScheduleDetailModalContainer.tsx`、`apps/web/src/features/schedule/components/ScheduleDetailModal.tsx` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。

## 構成

=== "訪問の予定"

    予定の取得が成功し、予定が訪問の予定のとき。  
    職員か利用者が分からないときも同じ見た目で、名前の代わりに「職員不明」「利用者不明」を出す（[利用者](#利用者)、[担当者](#担当者)）。

    <iframe class="mock" title="予定の詳細の、訪問の予定" src="mocks/01-visit.html"></iframe>
    <a class="mock-open" href="mocks/01-visit.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | モーダルの背景 | [モーダルの背景](#モーダルの背景) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 5 | ラベル | 日時 | [日時](#日時) |
    | 6 | ラベル | 種類 | [種類](#種類) |
    | 7 | ラベル | 担当者 | [担当者](#担当者) |
    | 8 | 領域 | 訪問の情報 | [訪問の情報](#訪問の情報) |
    | 9 | ラベル | 利用者 | [利用者](#利用者) |
    | 10 | ラベル | サービスコード | [サービスコード](#サービスコード) |
    | 11 | ラベル | 訪問の種類 | [訪問の種類](#訪問の種類) |
    | 12 | ラベル | メモ | [メモ](#メモ) |
    | 13 | ボタン | 編集 | [編集](#編集) |

=== "通常の予定"

    予定の取得が成功し、予定が通常の予定のとき。  
    職員が分からないときも同じ見た目で、名前の代わりに「職員不明」を出す（[予定者](#予定者)）。

    <iframe class="mock" title="予定の詳細の、通常の予定" src="mocks/02-normal.html"></iframe>
    <a class="mock-open" href="mocks/02-normal.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | モーダルの背景 | [モーダルの背景](#モーダルの背景) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 5 | ラベル | 日時 | [日時](#日時) |
    | 6 | ラベル | 種類 | [種類](#種類) |
    | 7 | ラベル | タイトル | [タイトル](#タイトル) |
    | 8 | ラベル | 予定者 | [予定者](#予定者) |
    | 9 | ラベル | メモ | [メモ](#メモ) |
    | 10 | ボタン | 編集 | [編集](#編集) |

=== "読み込み中"

    予定の取得が終わっていないとき。  
    BFF を通すときに API が 401 を返した場合も、ログインの画面へ移るまでこの表示が続く。

    <iframe class="mock" title="予定の詳細の、読み込み中" src="mocks/03-loading.html"></iframe>
    <a class="mock-open" href="mocks/03-loading.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | モーダルの背景 | [モーダルの背景](#モーダルの背景) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 5 | ラベル | 読み込み中の表示 | [読み込み中の表示](#読み込み中の表示) |

=== "見つからない"

    API が 404 を返したとき。

    <iframe class="mock" title="予定の詳細の、見つからない" src="mocks/04-not-found.html"></iframe>
    <a class="mock-open" href="mocks/04-not-found.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | モーダルの背景 | [モーダルの背景](#モーダルの背景) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 5 | メッセージ | 失敗の文 | [失敗の文](#失敗の文) |

=== "取得の失敗"

    404 以外の失敗を API が返したか、API に届かないとき。  
    権限の外の予定を指して API が 403 を返したときと、ほかの事業所の予定を指して web のサーバーが 403 にしたときも、この状態になる。

    <iframe class="mock" title="予定の詳細の、取得の失敗" src="mocks/05-error.html"></iframe>
    <a class="mock-open" href="mocks/05-error.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | モーダルの背景 | [モーダルの背景](#モーダルの背景) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 5 | メッセージ | 失敗の文 | [失敗の文](#失敗の文) |

=== "キャンセルした予定"

    予定の取得が成功し、予定がキャンセルした予定のとき。  
    予定のカレンダーでキャンセルした予定を出しているときに開く。

    <iframe class="mock" title="予定の詳細の、キャンセルした予定" src="mocks/06-cancelled.html"></iframe>
    <a class="mock-open" href="mocks/06-cancelled.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | モーダルの背景 | [モーダルの背景](#モーダルの背景) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 5 | ラベル | キャンセルの理由 | [キャンセルの理由](#キャンセルの理由) |
    | 6 | ラベル | 日時 | [日時](#日時) |
    | 7 | ラベル | 種類 | [種類](#種類) |
    | 8 | ラベル | 担当者 | [担当者](#担当者) |
    | 9 | ラベル | 訪問の情報 | [訪問の情報](#訪問の情報) |
    | 10 | ラベル | 利用者 | [利用者](#利用者) |
    | 11 | ラベル | サービスコード | [サービスコード](#サービスコード) |
    | 12 | ラベル | 訪問の種類 | [訪問の種類](#訪問の種類) |
    | 13 | ラベル | メモ | [メモ](#メモ) |

## モーダルの背景

**概要**: ダイアログの背後の予定のカレンダーを暗くぼかして覆う。  
押すとダイアログを閉じる。

**値のソース**: 暗くぼかした背景。  
背後のカレンダーは、`/schedule` の画面として描いたまま残る。

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

### インタラクション

#### 1. 押す

1. 押し始めと押し終わりがどちらも背景のときだけ、[閉じる](#閉じる) を押したときと同じく閉じる。
   - ダイアログの中から背景へ引きずって離したときは閉じない。

## 予定の詳細のダイアログ

**概要**: 予定 1 件の内容を出す。  
幅 768px 未満では、画面いっぱいに出す。

**値のソース**: 上端に閉じるボタンとダイアログのタイトル、本文に項目の名前と値の行、下端に編集のボタンを置く。  
項目の名前と値の行の並びは、種類、タイトル、日時、利用者、サービスコード、訪問の種類、担当者か予定者、メモの順。  
項目の名前と値は、全ての段で、名前を左、値を右に置く同じ 1 列の並びにし、値の列の位置をそろえる。  
幅によらず 2 列にしない。

**活性条件**: 常に活性

**表示条件**: 常に表示。  
予定を取れなかったときは、中に失敗の文を出す

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

### インタラクション

#### 1. Escape キーを押す

1. [閉じる](#閉じる) を押したときと同じく閉じる。

## 閉じる

**概要**: ダイアログを閉じて、予定のカレンダーに戻る。

**値のソース**: 「×」の印。  
読み上げの名前は「閉じる」。

**活性条件**: 常に活性。  
読み込み中と失敗のときも押せる。

**表示条件**: 常に表示

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

### インタラクション

#### 1. 押す

1. 確認を出さずに、`/schedule` に戻る。
   - search params の `view`、`date`、`staff`、`cancelled` は引き継ぐ。
   - 履歴に積む。

## ダイアログのタイトル

**概要**: 何のダイアログかを示す。

**値のソース**: 「予定の詳細」

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

## 種類

**概要**: 予定の種類を示す。

**値のソース**: 「通常」か「訪問」。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功したとき

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## タイトル

**概要**: 通常の予定のタイトルを示す。

**値のソース**: 予定のタイトル。  
訪問の予定では、タイトルの行を出さない。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功し、種類が通常のとき

**カタログ**: [ScheduleDetailModal の Normal](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--normal)

## キャンセルの理由

**概要**: キャンセルした予定であることと、その理由を示す。

**値のソース**: `キャンセルした予定です。` の文と、キャンセルの理由。  
理由が空なら「なし」。  
注意の色の帯で出し、文で伝える。

**活性条件**: 押せない

**表示条件**: 予定の取得が成功し、予定がキャンセルした予定のとき

**カタログ**: [ScheduleDetailModal の Cancelled](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--cancelled)

## 日時

**概要**: 予定の日付と時間を、ダイアログの本文の見出しで示す。

**値のソース**: `2026年10月20日（火） 09:00〜09:29` の形。  
年月日、曜日、開始と終了の時刻を、デバイスの時間帯で出す。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功したとき

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 訪問の情報

**概要**: 訪問の相手と内容の項目を、1 つのセクションにまとめる。

**値のソース**: 見出し「訪問の情報」と、[利用者](#利用者)、[サービスコード](#サービスコード)、[訪問の種類](#訪問の種類) の 3 つの項目。  
ほかの段と同じ 1 列の並びで、値の列の位置をほかの段にそろえる。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功し、予定が訪問の情報を持つとき

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 利用者

**概要**: 訪問する利用者を示す。

**値のソース**: 利用者の名前。  
利用者の一覧に予定の利用者が無いときは「利用者不明」。  
一覧の取得が終わる前と、取得が失敗したときを含む。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功し、予定が訪問の情報を持つとき

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## サービスコード

**概要**: 訪問のサービスコードを示す。

**値のソース**: サービスコード（例「訪看I2」）。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功し、予定が訪問の情報を持つとき

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 訪問の種類

**概要**: 夜勤、緊急、入院の区分を示す。

**値のソース**: 「夜勤」「緊急」「入院」のうち当てはまるものを「、」でつなぐ。  
無ければ「通常」。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功し、予定が訪問の情報を持つとき

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 担当者

**概要**: 訪問の予定を担当する職員を示す。

**値のソース**: 職員の名前。  
職員の一覧に予定の職員が無いときは「職員不明」。  
一覧の取得が終わる前と、取得が失敗したときを含む。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功し、種類が訪問のとき。  
通常の予定では、同じ行を [予定者](#予定者) として出す。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 予定者

**概要**: 通常の予定の職員を示す。

**値のソース**: 職員の名前。  
分からないときは、[担当者](#担当者) と同じく「職員不明」。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功し、種類が通常のとき

**カタログ**: [ScheduleDetailModal の Normal](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--normal)

## メモ

**概要**: 予定のメモを示す。

**値のソース**: 見出し「メモ」のセクションの中に、メモを出す。  
改行はそのまま出す。  
空なら「なし」。

**活性条件**: 常に活性

**表示条件**: 予定の取得が成功したとき

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 編集

**概要**: 予定の編集へ進む。

**値のソース**: 「編集」

**活性条件**: 常に活性。  
権限による出し分けは未決。

**表示条件**: 予定の取得が成功し、キャンセルした予定でないとき。  
権限による条件は未決（[未決](#未決)）。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

### インタラクション

#### 1. 押す

1. 予定の編集を開く。
   - URL は `/schedule/{予定の id}/edit` にし、search params の `view`、`date`、`staff`、`cancelled` を引き継ぐ。
   - 履歴に積む。

## 読み込み中の表示

**概要**: 予定を取っている途中であることを示す。

**値のソース**: 回転のインジケーターだけ。  
文言は無い。

**活性条件**: 常に活性

**表示条件**: 予定の取得が終わっていないとき

**カタログ**: [ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)

## 失敗の文

**概要**: 予定を出せない理由を伝える。

**値のソース**: API が 404 を返したときは「予定が見つかりません。」、それ以外の失敗のときは「予定を取得できませんでした。」。  
どちらも読み上げの対象（alert）として出す。

- 3 回まで取り直してから出す。
  - 404 も取り直すため、「予定が見つかりません。」が出るまで数秒かかる。
- 403 は、それ以外の失敗と同じ文になる。

**活性条件**: 常に活性

**表示条件**: 予定の取得が失敗したとき

**カタログ**: [ScheduleDetailModalContainer の NotFound](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--not-found)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

## 全体動作

### 初期処理

- URL の `scheduleId` で予定を取り、同時に、職員と利用者の一覧を取る。
- 押せる要素は、予定の取得の段階で変わる。
  - 取得が終わる前は、[閉じる](#閉じる) だけを押せる。
  - 成功した後は、閉じるのと編集ができる。
  - 失敗した後は、閉じるだけができる。
- フォーカスは、次のように動く。
  - 開いたときに、ダイアログのタイトルへ移す。
  - 予定の取得が終わってダイアログを描き直したときも、ダイアログのタイトルへ移す。
  - Tab キーはダイアログの中だけを回る。
  - 閉じると、開く前にフォーカスがあった要素へ戻す。
- 背後のカレンダーは、`/schedule` の画面として描いたまま残り、操作できない。
- キャンセルした予定を URL で開くと、キャンセルしていない予定と同じ見た目で出す。
  - キャンセルしたことは示さない。
  - カレンダーはキャンセルした予定を出さないので、押して開くことは無い。

### URL の search params

- search params の `view`、`date`、`staff`、`cancelled` は、閉じたときと編集へ進むときに引き継ぐ。
- 読めない値は、予定のカレンダーと同じ規則でデフォルト値に置き換える。

## 未決

PRD と実装の食い違い

- PRD は、カレンダーから予定をキャンセルし、理由を残せるとしている。
  - 実装の詳細は、キャンセルのボタンを持たない。
  - API はキャンセルの操作を持つ。
- PRD の同行者、時間外の勤務の印、キャンセルの理由を、詳細に出していない。
  - API の予定は、どれも持つ。
- PRD は、訪問の予定の職員を「主訪問者」、夜勤、緊急、入院を「訪問の区分」と呼ぶ。
  - 画面は「担当者」「訪問の種類」と出す。

決まっていないこと

- 編集の権限が無い予定で、編集のボタンを隠すか、押せなくするか、出して API の 403 で止めるか。
  - 画面が権限をどこから読むかも決まっていない。
  - 次の権限で対象のときに出すかを決める。
    - 自分の予定: 自分の予定の編集
    - ほかの職員の予定: 事業所の全ての予定の編集、指定した職員の予定の編集、指定したチームの職員の予定の編集のどれか
- 403 を、取得の失敗と同じ文で出すか、権限が無いことを示す文に分けるか。
- 404 と 403 を取り直さずにすぐ表示するか。
- キャンセルした予定を URL で開いたときに、キャンセルしたことを示すか、見つからないときと同じに扱うか。
- 繰り返しの予定の 1 回を押したときに、どの URL で詳細を開くか。
  - API は、繰り返しの予定の取得を、予定の取得と別に持つ。
- 職員と利用者の一覧の取得が終わる前に、「職員不明」「利用者不明」を一時的に出してよいか。
  - API につないだ後は、予定のレスポンスの職員と利用者の名前を使えば一覧を待たずに済む。
- 読み込み中と失敗のダイアログに、E2E が指す目印を付けるか。
  - 今の実装は、予定の取得が成功したダイアログにだけ付けている。
- モーダルの背景に E2E が指す目印を付けるか。
  - 古い仕様書は付けるとしていた。
  - 実装はブラウザのダイアログの背景（`::backdrop`）を使い、目印を付けられる要素を持たない。
