# schedule-detail 予定の詳細

職員が、カレンダーで押した予定 1 件の内容を見て、編集へ進むか、予定をキャンセルする画面。  
予定のカレンダーの上にモーダルで重ねて出し、閉じるとカレンダーに戻る。

| 項目 | 値 |
| --- | --- |
| URL | `/schedule/$scheduleId`。`/schedule` の子で、カレンダーの search params を引き継ぐ |
| 使う人 | 予定を見る権限を持つ職員。自分の予定は全ての職員が見られる |
| 実装 | `apps/web/src/routes/schedule.$scheduleId.index.tsx`、`apps/web/src/features/schedule/components/ScheduleDetailModalContainer.tsx` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。

画面を描くコンポーネントのうち、実装の行のほかのものは次のとおり。

- `apps/web/src/features/schedule/components/ScheduleDetailModal.tsx`
- `apps/web/src/features/schedule/components/ScheduleCancelDialog.tsx`

## 構成

=== "訪問の予定"

    予定の取得が成功し、予定が訪問の予定のとき。  
    職員か利用者が分からないときも同じ見た目で、名前の代わりに「職員不明」「利用者不明」を出す。  
    名前の出し方は、[利用者](#利用者) と [主訪問者](#主訪問者) にある。  
    予定の職員の予定を編集できない職員には、「予定をキャンセル」と「編集」を出さず、「閉じる」だけを出す。  
    出す条件は、[予定をキャンセル](#予定をキャンセル) と [編集](#編集) にある。  
    モックは、予定を編集できる職員の画面を描く。

    <iframe class="mock" title="予定の詳細の、訪問の予定" src="mocks/01-visit.html"></iframe>
    <a class="mock-open" href="mocks/01-visit.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | ラベル | 日時 | [日時](#日時) |
    | 6 | ラベル | 種類 | [種類](#種類) |
    | 7 | ラベル | 主訪問者 | [主訪問者](#主訪問者) |
    | 8 | 領域 | 訪問の情報 | [訪問の情報](#訪問の情報) |
    | 9 | ラベル | 利用者 | [利用者](#利用者) |
    | 10 | ラベル | サービスコード | [サービスコード](#サービスコード) |
    | 11 | ラベル | 訪問の区分 | [訪問の区分](#訪問の区分) |
    | 12 | ラベル | メモ | [メモ](#メモ) |
    | 13 | ボタン | 下端の閉じる | [下端の閉じる](#下端の閉じる) |
    | 14 | ボタン | 編集 | [編集](#編集) |
    | 15 | ボタン | 予定をキャンセル | [予定をキャンセル](#予定をキャンセル) |

=== "通常の予定"

    予定の取得が成功し、予定が通常の予定のとき。  
    職員が分からないときも同じ見た目で、名前の代わりに「職員不明」を出す。  
    名前の出し方は、[予定者](#予定者) にある。  
    予定の職員の予定を編集できない職員には、「予定をキャンセル」と「編集」を出さず、「閉じる」だけを出す。  
    出す条件は、[予定をキャンセル](#予定をキャンセル) と [編集](#編集) にある。  
    モックは、メモの無い予定を描く。  
    メモの見出しも出さない。

    <iframe class="mock" title="予定の詳細の、通常の予定" src="mocks/02-normal.html"></iframe>
    <a class="mock-open" href="mocks/02-normal.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | ラベル | 日時 | [日時](#日時) |
    | 6 | ラベル | 種類 | [種類](#種類) |
    | 7 | ラベル | タイトル | [タイトル](#タイトル) |
    | 8 | ラベル | 予定者 | [予定者](#予定者) |
    | 9 | ボタン | 下端の閉じる | [下端の閉じる](#下端の閉じる) |
    | 10 | ボタン | 編集 | [編集](#編集) |
    | 11 | ボタン | 予定をキャンセル | [予定をキャンセル](#予定をキャンセル) |

=== "読み込み中"

    予定を読み終えていないとき。  
    ログインが切れていたときも、ログインの画面へ移るまでこの表示が続く。

    <iframe class="mock" title="予定の詳細の、読み込み中" src="mocks/03-loading.html"></iframe>
    <a class="mock-open" href="mocks/03-loading.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | 領域 | 読み込み中の表示 | [読み込み中の表示](#読み込み中の表示) |

=== "見つからない"

    開いた予定が見つからないとき。

    <iframe class="mock" title="予定の詳細の、見つからない" src="mocks/04-not-found.html"></iframe>
    <a class="mock-open" href="mocks/04-not-found.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | メッセージ | 読み込みの失敗の文 | [読み込みの失敗の文](#読み込みの失敗の文) |

=== "読み込みの失敗"

    見つからないときと、見る権限が無いとき以外の理由で、予定を読めなかったとき。  
    つながらないときも、この状態になる。

    <iframe class="mock" title="予定の詳細の、読み込みの失敗" src="mocks/05-error.html"></iframe>
    <a class="mock-open" href="mocks/05-error.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | メッセージ | 読み込みの失敗の文 | [読み込みの失敗の文](#読み込みの失敗の文) |

=== "キャンセルした予定"

    予定の取得が成功し、予定がキャンセルした予定のとき。  
    予定のカレンダーでキャンセルした予定を出しているときに開く。

    <iframe class="mock" title="予定の詳細の、キャンセルした予定" src="mocks/06-cancelled.html"></iframe>
    <a class="mock-open" href="mocks/06-cancelled.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | ラベル | キャンセルの理由 | [キャンセルの理由](#キャンセルの理由) |
    | 6 | ラベル | 日時 | [日時](#日時) |
    | 7 | ラベル | 種類 | [種類](#種類) |
    | 8 | ラベル | 主訪問者 | [主訪問者](#主訪問者) |
    | 9 | 領域 | 訪問の情報 | [訪問の情報](#訪問の情報) |
    | 10 | ラベル | 利用者 | [利用者](#利用者) |
    | 11 | ラベル | サービスコード | [サービスコード](#サービスコード) |
    | 12 | ラベル | 訪問の区分 | [訪問の区分](#訪問の区分) |
    | 13 | ラベル | メモ | [メモ](#メモ) |

=== "見る権限が無い"

    見る権限が無い予定を開いたとき。  
    ほかの事業所の予定を開いたときも、この状態になる。

    <iframe class="mock" title="予定の詳細の、見る権限が無い" src="mocks/07-forbidden.html"></iframe>
    <a class="mock-open" href="mocks/07-forbidden.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | メッセージ | 読み込みの失敗の文 | [読み込みの失敗の文](#読み込みの失敗の文) |

=== "Google カレンダーの予定"

    予定を Google カレンダーで管理する事業所で、職員が Google カレンダーで作った予定を開いたとき。  
    先頭に、buddy で変えると Google カレンダーにも書くことの案内を出す。  
    予定を編集できる職員には、buddy で管理する事業所の予定と同じく「予定をキャンセル」と「編集」を出す。  
    予定の正本を切り替えている間は、「予定をキャンセル」と「編集」を出さない。  
    モックは、訪問の予定を描く。  
    通常の予定は、「通常の予定」の状態の行の並びに、案内を足したものになる。

    <iframe class="mock" title="予定の詳細の、Google カレンダーの予定" src="mocks/08-google-calendar.html"></iframe>
    <a class="mock-open" href="mocks/08-google-calendar.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | ラベル | Google カレンダーの案内 | [Google カレンダーの案内](#google-カレンダーの案内) |
    | 6 | ラベル | 日時 | [日時](#日時) |
    | 7 | ラベル | 種類 | [種類](#種類) |
    | 8 | ラベル | 主訪問者 | [主訪問者](#主訪問者) |
    | 9 | 領域 | 訪問の情報 | [訪問の情報](#訪問の情報) |
    | 10 | ラベル | 利用者 | [利用者](#利用者) |
    | 11 | ラベル | サービスコード | [サービスコード](#サービスコード) |
    | 12 | ラベル | 訪問の区分 | [訪問の区分](#訪問の区分) |
    | 13 | ボタン | 下端の閉じる | [下端の閉じる](#下端の閉じる) |
    | 14 | ボタン | 予定をキャンセル | [予定をキャンセル](#予定をキャンセル) |
    | 15 | ボタン | 編集 | [編集](#編集) |

=== "確認が必要な Google カレンダーの予定"

    Google カレンダーの予定のうち、buddy の予定として読めなかった予定を開いたとき。  
    予定のカレンダーの確認が必要な予定の通知からも開く。  
    Google カレンダーの案内の下に、確認が必要な理由を出す。  
    繰り返しの規則を buddy で表せない予定のほかは、通常の予定として出し、タイトルに Google カレンダーのタイトルを出す。  
    繰り返しの規則を buddy で表せない予定には、「予定をキャンセル」と「編集」を出さない。  
    モックは、タイトルの利用者が見つからない予定を、予定を編集できる職員が開いたときを描く。

    <iframe class="mock" title="予定の詳細の、確認が必要な Google カレンダーの予定" src="mocks/09-google-calendar-review.html"></iframe>
    <a class="mock-open" href="mocks/09-google-calendar-review.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の詳細のダイアログ | [予定の詳細のダイアログ](#予定の詳細のダイアログ) |
    | 3 | ラベル | ダイアログのタイトル | [ダイアログのタイトル](#ダイアログのタイトル) |
    | 4 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 5 | ラベル | Google カレンダーの案内 | [Google カレンダーの案内](#google-カレンダーの案内) |
    | 6 | ラベル | 確認が必要な理由 | [確認が必要な理由](#確認が必要な理由) |
    | 7 | ラベル | 日時 | [日時](#日時) |
    | 8 | ラベル | 種類 | [種類](#種類) |
    | 9 | ラベル | タイトル | [タイトル](#タイトル) |
    | 10 | ラベル | 予定者 | [予定者](#予定者) |
    | 11 | ボタン | 下端の閉じる | [下端の閉じる](#下端の閉じる) |
    | 12 | ボタン | 予定をキャンセル | [予定をキャンセル](#予定をキャンセル) |
    | 13 | ボタン | 編集 | [編集](#編集) |

=== "キャンセルのダイアログ"

    予定の詳細で「予定をキャンセル」を押したとき。  
    予定の詳細の上に、キャンセルの理由を入れる確認のダイアログを重ねる。  
    理由を入れるまで、ダイアログの「予定をキャンセルする」を押せない。  
    モックは、予定を buddy で管理する事業所の訪問の予定を開いた直後を描く。

    <iframe class="mock" title="予定の詳細の、キャンセルのダイアログ" src="mocks/10-cancel.html"></iframe>
    <a class="mock-open" href="mocks/10-cancel.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | キャンセルのダイアログの覆い | [キャンセルのダイアログの覆い](#キャンセルのダイアログの覆い) |
    | 2 | ダイアログ | キャンセルのダイアログ | [キャンセルのダイアログ](#キャンセルのダイアログ) |
    | 3 | ラベル | キャンセルのダイアログのタイトル | [キャンセルのダイアログのタイトル](#キャンセルのダイアログのタイトル) |
    | 4 | ラベル | キャンセルする予定の日時 | [キャンセルする予定の日時](#キャンセルする予定の日時) |
    | 5 | ラベル | キャンセルの説明 | [キャンセルの説明](#キャンセルの説明) |
    | 6 | テキストボックス | キャンセルの理由の欄 | [キャンセルの理由の欄](#キャンセルの理由の欄) |
    | 7 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 8 | ボタン | 予定をキャンセルする | [予定をキャンセルする](#予定をキャンセルする) |

=== "キャンセルの送信中"

    理由を入れてダイアログの「予定をキャンセルする」を押し、終わるのを待っているとき。  
    ダイアログを閉じられない。

    <iframe class="mock" title="予定の詳細の、キャンセルの送信中" src="mocks/11-cancelling.html"></iframe>
    <a class="mock-open" href="mocks/11-cancelling.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | キャンセルのダイアログの覆い | [キャンセルのダイアログの覆い](#キャンセルのダイアログの覆い) |
    | 2 | ダイアログ | キャンセルのダイアログ | [キャンセルのダイアログ](#キャンセルのダイアログ) |
    | 3 | ラベル | キャンセルのダイアログのタイトル | [キャンセルのダイアログのタイトル](#キャンセルのダイアログのタイトル) |
    | 4 | ラベル | キャンセルする予定の日時 | [キャンセルする予定の日時](#キャンセルする予定の日時) |
    | 5 | ラベル | キャンセルの説明 | [キャンセルの説明](#キャンセルの説明) |
    | 6 | テキストボックス | キャンセルの理由の欄 | [キャンセルの理由の欄](#キャンセルの理由の欄) |
    | 7 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 8 | ボタン | 予定をキャンセルする | [予定をキャンセルする](#予定をキャンセルする) |

=== "キャンセルの失敗"

    予定をキャンセルできなかったとき。  
    入れた理由は残し、ダイアログを開いたままにする。  
    文は、[キャンセルの失敗の文](#キャンセルの失敗の文) にある。  
    モックは、予定を Google カレンダーで管理する事業所で、Google カレンダーに書けなかったときを描く。

    <iframe class="mock" title="予定の詳細の、キャンセルの失敗" src="mocks/12-cancel-error.html"></iframe>
    <a class="mock-open" href="mocks/12-cancel-error.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | キャンセルのダイアログの覆い | [キャンセルのダイアログの覆い](#キャンセルのダイアログの覆い) |
    | 2 | ダイアログ | キャンセルのダイアログ | [キャンセルのダイアログ](#キャンセルのダイアログ) |
    | 3 | ラベル | キャンセルのダイアログのタイトル | [キャンセルのダイアログのタイトル](#キャンセルのダイアログのタイトル) |
    | 4 | ラベル | キャンセルする予定の日時 | [キャンセルする予定の日時](#キャンセルする予定の日時) |
    | 5 | ラベル | キャンセルの説明 | [キャンセルの説明](#キャンセルの説明) |
    | 6 | テキストボックス | キャンセルの理由の欄 | [キャンセルの理由の欄](#キャンセルの理由の欄) |
    | 7 | メッセージ | キャンセルの失敗の文 | [キャンセルの失敗の文](#キャンセルの失敗の文) |
    | 8 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 9 | ボタン | 予定をキャンセルする | [予定をキャンセルする](#予定をキャンセルする) |

## 覆い

**概要**: ダイアログの背後の予定のカレンダーを、暗くぼかして覆う覆い。

**値のソース**: 文言は無い。  
背後のカレンダーは、`/schedule` の画面として描いたまま残る。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

**操作**: 押すと、[閉じる](#閉じる) を押したときと同じく閉じる。

1. 押し始めと押し終わりがどちらも覆いのときだけ閉じる。
   - ダイアログの中から覆いへ引きずって離したときは閉じない。

## 予定の詳細のダイアログ

**概要**: 予定 1 件の内容を出すダイアログ。  
幅 768px 未満では、画面いっぱいに出す。

**値のソース**: 上端の左にダイアログのタイトル、右上に閉じるボタン、本文に項目の名前と値の行、下端の右に閉じる、予定をキャンセル、編集のボタンをこの順に置く。

本文は、日時の見出しの下に、種類、タイトル、主訪問者か予定者の段、訪問の情報の段、メモの段の順に並べる。  
Google カレンダーの予定では、日時の見出しの上に、Google カレンダーの案内と、確認が必要な理由をこの順に置く。  
キャンセルした予定では、日時の見出しの上にキャンセルの理由を置く。  
予定を読めなかったときは、本文に読み込みの失敗の文だけを出す。

項目の名前と値は、メモを除く全ての段で、名前を左、値を右に置く同じ 1 列の並びにし、値の列の位置をそろえる。  
幅によらず 2 列にしない。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

**操作**: Escape キーを押すと、[閉じる](#閉じる) を押したときと同じく閉じる。

## 閉じる

**概要**: ダイアログを閉じて、予定のカレンダーに戻るボタン。  
読み込み中と失敗のときも押せる。

**値のソース**: 「×」の印。  
読み上げの名前は「閉じる」。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

**操作**: 押すと、確認を出さずに `/schedule` に戻る。

1. search params の `view`、`date`、`staff`、`cancelled` は引き継ぐ。
2. 履歴に積む。

## ダイアログのタイトル

**概要**: 何のダイアログかを示すラベル。

**値のソース**: 「予定の詳細」

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)、[ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

## 種類

**概要**: 予定の種類を示すラベル。

**値のソース**: 「通常」か「訪問」。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## タイトル

**概要**: 通常の予定のタイトルを示すラベル。

**値のソース**: 予定のタイトル。  
確認が必要な Google カレンダーの予定では、Google カレンダーのタイトルをそのまま出す。

**表示**: 次の全てに当てはまるとき。

- 開いた予定が、通常の予定である

**カタログ**: [ScheduleDetailModal の Normal](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--normal)

## キャンセルの理由

**概要**: キャンセルした予定であることと、その理由を示すラベル。

**値のソース**: `キャンセルした予定です。` の文と、キャンセルの理由。  
理由が空なら「なし」。  
注意の色の帯で出し、文で伝える。

**カタログ**: [ScheduleDetailModal の Cancelled](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--cancelled)

## Google カレンダーの案内

**概要**: Google カレンダーの予定であることと、buddy で変えると Google カレンダーにも書くことを伝えるラベル。

**値のソース**: 次の文言。  
枠線で囲み、警告の色にしない。  
本文の先頭に出す。

| 文言 |
| --- |
| 「Google カレンダーの予定です。buddy で変更かキャンセルすると、Google カレンダーにも書きます。」 |

**カタログ**: [ScheduleDetailModalContainer の GoogleCalendar](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--google-calendar)

## 確認が必要な理由

**概要**: Google カレンダーの予定を buddy の予定として読めなかった理由と、直し方を示すラベル。

**値のソース**: 次の 3 つを続けた 1 つの段落。  
[Google カレンダーの案内](#google-カレンダーの案内) の下に、警告の色の帯で出す。  
理由の文は、[予定のカレンダーの通知の予定](../schedule-calendar_予定のカレンダー/index.md#通知の予定) と同じである。

| 箇所 | 文言 |
| --- | --- |
| 太字の先頭 | 「確認が必要な予定です。」 |
| 理由 | 「<理由>。」 |
| 直し方 | 理由ごとに、次の表の文 |

| 理由 | 直し方の文 |
| --- | --- |
| タイトルの利用者かサービス内容が、buddy の訪問の情報と違う | 「buddy で保存し直すと、Google カレンダーのタイトルを buddy の訪問の情報に合わせて書き直します。」 |
| 繰り返しの規則を buddy で表せない | 「Google カレンダーで繰り返しの規則を直してください。」 |
| 訪問の情報を読み取れなかった（タイトルの利用者が見つからない、同じ名前の利用者が 2 人以上いる、サービス内容が見つからない、タイトルを読めない） | 「buddy で編集して訪問の情報を入れるか、Google カレンダーでタイトルを直してください。」 |

**カタログ**: [ScheduleDetailModalContainer の GoogleCalendarNeedsReview](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--google-calendar-needs-review)。  
繰り返しの規則を buddy で表せない予定は [ScheduleDetailModalContainer の GoogleCalendarRecurrenceUnsupported](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--google-calendar-recurrence-unsupported)

## 日時

**概要**: 予定の日付と時間を示す、ダイアログの本文の見出しのラベル。

**値のソース**: `2026年10月20日（火） 09:00〜09:29` の形。  
年月日、曜日、開始と終了の時刻を、デバイスの時間帯で出す。  
翌日に終わる予定は、年月日と曜日を開始の日にし、終了の時刻の前に「翌」を付けて `2026年10月20日（火） 22:00〜翌 01:00` の形にする。  
カレンダーの開始の日と翌日のどちらの描画から開いても、同じ形で出す。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 訪問の情報

**概要**: 訪問の相手と内容の項目を 1 つにまとめる領域。

**値のソース**: 見出し「訪問の情報」と、[利用者](#利用者)、[サービスコード](#サービスコード)、[訪問の区分](#訪問の区分) の 3 つの項目。  
ほかの段と同じ 1 列の並びで、値の列の位置をほかの段にそろえる。

**表示**: 次の全てに当てはまるとき。

- 開いた予定に、訪問の情報がある

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 利用者

**概要**: 訪問する利用者を示すラベル。

**値のソース**: 利用者の名前。  
利用者の一覧に予定の利用者が無いときは「利用者不明」。  
一覧に予定の利用者が無いときには、一覧の取得が終わる前と、取得が失敗したときを含む。

**表示**: 次の全てに当てはまるとき。

- 開いた予定に、訪問の情報がある

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## サービスコード

**概要**: 訪問のサービスコードを示すラベル。

**値のソース**: サービスコード。  
例は「訪看I2」。

**表示**: 次の全てに当てはまるとき。

- 開いた予定に、訪問の情報がある

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 訪問の区分

**概要**: 夜勤、緊急、入院の区分を示すラベル。

**値のソース**: 「夜勤」「緊急」「入院」のうち当てはまるものを「、」でつなぐ。  
無ければ「通常」。

**表示**: 次の全てに当てはまるとき。

- 開いた予定に、訪問の情報がある

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 主訪問者

**概要**: 訪問の予定の主訪問者を示すラベル。  
通常の予定では、同じ行を [予定者](#予定者) として出す。

**値のソース**: 職員の名前。  
職員の一覧に予定の職員が無いときは「職員不明」。  
一覧に予定の職員が無いときには、一覧の取得が終わる前と、取得が失敗したときを含む。

**表示**: 次の全てに当てはまるとき。

- 開いた予定が、訪問の予定である

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 予定者

**概要**: 通常の予定の職員を示すラベル。

**値のソース**: 職員の名前。  
分からないときは、[主訪問者](#主訪問者) と同じく「職員不明」。

**表示**: 次の全てに当てはまるとき。

- 開いた予定が、通常の予定である

**カタログ**: [ScheduleDetailModal の Normal](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--normal)

## メモ

**概要**: 予定のメモを示す領域。

**値のソース**: 見出し「メモ」の下に、メモを出す。  
改行はそのまま出す。  
「なし」とは出さない。

**表示**: 次の全てに当てはまるとき。

- 開いた予定に、メモがある
  - メモが無い予定では、見出しごと出さない。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)

## 下端の閉じる

**概要**: ダイアログを閉じて、予定のカレンダーに戻るボタン。  
上端の [閉じる](#閉じる) と同じく働く。  
[編集](#編集) を出さない職員にも出す。

**値のソース**: 「閉じる」

**表示**: 次の全てに当てはまるとき。

- 開いた予定が、キャンセルした予定でない
  - キャンセルした予定では下端を出さず、上端の閉じるボタンだけで閉じる。

**操作**: 押すと、[閉じる](#閉じる) を押したときと同じく、確認を出さずに `/schedule` に戻る。

## 編集

**概要**: 開いた予定の編集へ進むボタン。  
予定を buddy で管理する事業所と、Google カレンダーで管理する事業所のどちらでも出す。

**値のソース**: 「編集」

**表示**: 次の全てに当てはまるとき。

- 開いた予定が、キャンセルした予定でない
  - キャンセルした予定は変えられないためである。
- 事業所が、予定の正本を buddy に切り替えている途中でない
  - 切り替えている間は、予定を変えられないためである。
- 開いた予定が、繰り返しの規則を buddy で表せない予定でない
  - 繰り返しの規則は、Google カレンダーで直すためである。
- ログインした職員が、開いた予定の職員の予定を編集できる
  - 判定は [権限の確認](#権限の確認) にある。
  - チームを対象にする権限で判定するときは、職員の一覧を読み終えるまで出さない。予定の職員のチームが分からないためである。職員の一覧を読めなかったときも出さない。

**カタログ**: [ScheduleDetailModal の Visit](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodal--visit)、[ScheduleDetailModalContainer の ReadOnly](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--read-only)。  
Google カレンダーの予定は [ScheduleDetailModalContainer の GoogleCalendar](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--google-calendar)、[ScheduleDetailModalContainer の GoogleCalendarCutover](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--google-calendar-cutover)

**操作**: 押すと予定の編集を開く。

1. URL は `/schedule/{予定の id}/edit` にし、search params の `view`、`date`、`staff`、`cancelled` を引き継ぐ。
2. 履歴に積む。

## 予定をキャンセル

**概要**: 予定をキャンセルする前に、理由を入れる [キャンセルのダイアログ](#キャンセルのダイアログ) を開くボタン。  
予定を buddy で管理する事業所と、Google カレンダーで管理する事業所のどちらでも出す。

**値のソース**: 「予定をキャンセル」

**表示**: 次の全てに当てはまるとき。

- 開いた予定が、キャンセルした予定でない
  - キャンセルした予定は変えられないためである。
- 事業所が、予定の正本を buddy に切り替えている途中でない
  - 切り替えている間は、予定を変えられないためである。
- 開いた予定が、繰り返しの規則を buddy で表せない予定でない
  - 繰り返しの規則は、Google カレンダーで直すためである。
- 開いた予定が、予定を buddy で管理する事業所の繰り返しの予定の 1 回でない
  - 繰り返しの予定の 1 回だけをキャンセルする操作が無いためである。
- ログインした職員が、開いた予定の職員の予定を編集できる
  - 判定は [編集](#編集) と同じく、[権限の確認](#権限の確認) にある。

**カタログ**: [ScheduleDetailModalContainer の GoogleCalendar](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--google-calendar)、[ScheduleDetailModalContainer の GoogleCalendarCutover](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--google-calendar-cutover)

**操作**: 押すと、予定の詳細の上に [キャンセルのダイアログ](#キャンセルのダイアログ) を開き、「キャンセルのダイアログ」の状態にする。

1. 前に開いたときのキャンセルの失敗の文は消す。
2. URL は変えない。

## 読み込み中の表示

**概要**: 予定を読んでいる途中であることを示す領域。

**値のソース**: 回転のインジケーターだけ。  
文言は無い。  
つながらないときは、何度か読み直してから [読み込みの失敗の文](#読み込みの失敗の文) に替わるので、その間もこの表示が続く。  
予定が見つからないときと、見る権限が無いときは、読み直さずにすぐ替わる。  
読み直しの規則は、[予定の管理の Design Doc の予定の画面の読み込みと保存](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#予定の画面の読み込みと保存) にある。

**カタログ**: [ScheduleDetailModalContainer の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--loading)

## 読み込みの失敗の文

**概要**: 予定を出せない理由を伝えるメッセージ。

**値のソース**: 理由ごとに、次の文を出す。  
どれも読み上げの対象（alert）として出す。  
文と、その要因の対応は [API との対応の状態と失敗の要因](api.md#状態と失敗の要因) にある。

- 予定が見つからないとき: 「予定が見つかりません。」
  - 予定を Google カレンダーで管理する事業所では、カレンダーの表示の期間の予定と、確認が必要な予定に無いときも当たる。
- 見る権限が無い予定と、ほかの事業所の予定を開いたとき: 「この予定を見る権限がありません。」
- ほかの理由で読めなかったとき: 「予定を取得できませんでした。」

**カタログ**: [ScheduleDetailModalContainer の NotFound](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--not-found)、[ScheduleDetailModalContainer の Forbidden](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--forbidden)。  
ほかの失敗は [ScheduleDetailModalContainer の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-schedule-scheduledetailmodalcontainer--failed)

## キャンセルのダイアログの覆い

**概要**: キャンセルのダイアログの後ろの予定の詳細を覆い、ダイアログの外を押せなくする覆い。

**値のソース**: 文言は無い。

**カタログ**: [ConfirmDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--default)

**操作**: 押すと、[キャンセル](#キャンセル) を押したときと同じく、何も変えずに予定の詳細に戻る。

1. キャンセルを送っている間は、押しても閉じない。

## キャンセルのダイアログ

**概要**: 予定をキャンセルする前に、キャンセルの理由を入れて確認するダイアログ。  
キャンセルした予定は戻せないので、確定の前に毎回出す。

**値のソース**: 本文に、ダイアログのタイトル、キャンセルする予定の日時、キャンセルの説明、キャンセルの理由の欄をこの順に置く。  
下端の右に、「キャンセル」と「予定をキャンセルする」をこの順に置く。  
× は置かない。  
予定の詳細の上に重ねて出す。

**カタログ**: [ConfirmDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--default)

**操作**: Escape キーを押すと、[キャンセル](#キャンセル) を押したときと同じく、何も変えずに予定の詳細に戻る。

1. キャンセルを送っている間は閉じない。

## キャンセルのダイアログのタイトル

**概要**: 何を確認するダイアログかを、問いの形で示すラベル。

**値のソース**: 次の文言。

| 文言 |
| --- |
| 「この予定をキャンセルしますか」 |

**カタログ**: [ConfirmDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--default)

## キャンセルする予定の日時

**概要**: どの予定をキャンセルするかを示すラベル。

**値のソース**: 予定の日時。  
形は [日時](#日時) と同じく、`2026年10月20日（火） 09:00〜09:29` にする。

**カタログ**: [ConfirmDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--default)

## キャンセルの説明

**概要**: キャンセルすると予定がどうなり、理由がどこに残るかを示すラベル。  
取り消せない操作の確認なので、毎回出す。

**値のソース**: 開いた予定が Google カレンダーの予定かで、次の文を出す。

| 開いた予定 | 文言 |
| --- | --- |
| Google カレンダーの予定 | 「Google カレンダーから予定を消します。キャンセルの理由は、Google カレンダーに書けないので残りません。」 |
| ほかの予定 | 「キャンセルした予定は、キャンセルした予定を出すとカレンダーに残り、理由を見られます。」 |

**カタログ**: [ConfirmDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--default)

## キャンセルの理由の欄

**概要**: 予定をキャンセルする理由を入れるテキストボックス。

**値のソース**: 見出し「キャンセルの理由」の複数行の入力。  
未入力のときは、placeholder の「例: 利用者の都合で取りやめ」を出す。  
開いたときは空にする。  
理由は 255 文字まで入れられる。  
前後の空白は除いて送る。

**カタログ**: [TextareaField の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/コンポーネント-base-textareafield--default)

## キャンセルの失敗の文

**概要**: 予定をキャンセルできなかったことと、職員が次にすることを伝えるメッセージ。  
入れた理由は残す。

**値のソース**: 失敗ごとに次の文を出す。  
読み上げでは警告として扱う。  
下端のボタンの上に、幅いっぱいで出す。  
ダイアログを閉じて開き直すと消える。

| 失敗 | 文 |
| --- | --- |
| 画面を開いた後に、予定を編集する権限を外された | 「この操作をする権限がありません。」 |
| Google カレンダーで予定が変更されていた | 「Google カレンダーで予定が変更されていました。予定を開き直して、最新の予定を確認してから、もう一度キャンセルしてください。」 |
| Google カレンダーで予定が消されたか、見つからない | 「Google カレンダーで予定が消されたか、見つかりません。」 |
| 前の保存の結果を確認している | 「前の保存の結果を確認しています。時間をおいて、予定を開き直してください。」 |
| Google カレンダーに書けなかった | 「Google カレンダーに書けませんでした。時間をおいて、やり直してください。」 |
| Google カレンダーに書けたかを確認できなかった | 「Google カレンダーに書けたかを確認できませんでした。時間をおいて、予定を開き直してください。」 |
| Google カレンダーに予定を書く権限が無い | 「Google カレンダーに予定を書く権限がありません。カレンダーの共有の設定を、事業所の管理者に確認してください。」 |
| Google カレンダーが予定を受け付けなかった | 「Google カレンダーが予定を受け付けませんでした。入力を確認してください。」 |
| 予定の職員が Google カレンダーを結び付けていない | 「予定の職員が Google カレンダーを結び付けていません。カレンダーの結び付けを、事業所の管理者に頼んでください。」 |
| 事業所に Google カレンダーと連携する設定が無い | 「この事業所には、Google カレンダーと連携する設定がありません。事業所の管理者に確認してください。」 |
| 画面を開いた後に、マネージャーが予定の正本の切り替えを始めた | 「予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。」 |
| 入力がキャンセルの規則に合わない | 「入力の内容では予定をキャンセルできません。内容を直してください。」 |
| ほかの失敗と、つながらない | 「予定をキャンセルできませんでした。」 |

- Google カレンダーに書けなかったときの文は、予定を Google カレンダーで管理する事業所でだけ出る。
- 文と、その要因の対応は [API との対応の状態と失敗の要因](api.md#状態と失敗の要因) にある。

**カタログ**: [ConfirmDialog の WithError](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--with-error)

## キャンセル

**概要**: 予定をキャンセルせずに、キャンセルのダイアログを閉じるボタン。

**値のソース**: 「キャンセル」

**活性**: 次の全てに当てはまるとき。

- 職員が、キャンセルを送っている途中でない

**カタログ**: [ConfirmDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--default)、[ConfirmDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--submitting)

**操作**: 押すか Escape キーを押すと、何も変えずにダイアログを閉じ、予定の詳細に戻る。

1. 入れた理由は消す。

## 予定をキャンセルする

**概要**: 入れた理由で予定をキャンセルするボタン。

**値のソース**: 次の文言。  
キャンセルした予定は戻せないので、データを失う操作の赤い色にする。  
送っている間は、文字の前に回転の印を出す。

| 時点 | 文言 |
| --- | --- |
| 送る前 | 「予定をキャンセルする」 |
| 送っている間 | 「キャンセルしています」 |

**活性**: 次の全てに当てはまるとき。

- 職員が、キャンセルの理由の欄に、前後の空白を除いて 1 文字以上 255 文字以下を入れている
- 職員が、キャンセルを送っている途中でない

**カタログ**: [ConfirmDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--default)、[ConfirmDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/パターン-confirmdialog--submitting)

**操作**: 押すと、「キャンセルの送信中」の状態にし、予定をキャンセルする。

1. 成功したら、ダイアログと予定の詳細を閉じ、`/schedule` に戻る。
   - search params の `view`、`date`、`staff`、`cancelled` は引き継ぐ。
   - 成功の文は出さない。
2. 失敗したら、「キャンセルの失敗」の状態にし、[キャンセルの失敗の文](#キャンセルの失敗の文) に理由を出す。
   - ダイアログを開いたままにし、入れた理由を残す。

## 全体動作

### 初期処理

事業所と、職員と利用者の一覧を同時に読み、事業所を読み終えたら予定を読む。  
職員と利用者の一覧を読み終える前に予定を読み終えたら、予定を出す。  
一覧を読み終えるまでは、名前の代わりに「職員不明」「利用者不明」を出す。  
名前の出し方は、[主訪問者](#主訪問者) と [利用者](#利用者) にある。  
読む順と失敗の扱いは、[予定の管理の Design Doc の予定の画面の読み込みと保存](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#予定の画面の読み込みと保存) にある。

押せる要素は、予定を読む段階で変わる。

- 読み終える前は、[閉じる](#閉じる) だけを押せる。
- 読めた後は、閉じるのと、予定を編集できる職員では予定のキャンセルと編集ができる。
- 読めなかった後は、閉じるだけができる。
- キャンセルのダイアログを開いている間は、ダイアログの中だけを押せる。

フォーカスは、次のように動く。

- 開いたときに、ダイアログのタイトルへ移す。
- 予定を読み終えてダイアログを描き直したときも、ダイアログのタイトルへ移す。
- Tab キーはダイアログの中だけを回る。
- 閉じると、開く前にフォーカスがあった要素へ戻す。

背後のカレンダーは、`/schedule` の画面として描いたまま残り、操作できない。

キャンセルした予定は、「キャンセルした予定」の状態で出す。  
予定のカレンダーで「キャンセルした予定を出す」を選んでいるときに、キャンセルした予定を押して開く。  
URL で直接開いたときも同じである。

繰り返しの予定の 1 回を開くと、その回の詳細を出す。  
URL の予定の id は、回ごとの id である。

予定を Google カレンダーで管理する事業所では、予定 1 件を直に読まない。  
URL の search params の `view` と `date` の表示の期間の予定と、確認が必要な予定を読み、その中から URL の予定を探す。  
期間の予定は、職員の絞り込みの `staff` で絞らず、`cancelled` はそのまま当てる。  
見つからなければ、「見つからない」の状態にする。  
事業所を読めなかったときは、「読み込みの失敗」の状態にする。

### URL の search params からの復元

search params の `view`、`date`、`staff`、`cancelled` は、閉じたとき、編集へ進むとき、予定をキャンセルした後に引き継ぐ。  
読めない値は、予定のカレンダーと同じ規則でデフォルト値に置き換える。

### 入力の確認と送信

- [予定をキャンセルする](#予定をキャンセルする) は、キャンセルの理由を入れるまで押せない。
  - 理由が空のときと、255 文字を超えたときに、入力の誤りの文は出さない。
- 予定を Google カレンダーで管理する事業所では、キャンセルすると、buddy が Google カレンダーの予定を消す。
  - Google カレンダーに書けたときだけ成功になる。
  - キャンセルのダイアログを開いたときの予定と比べ、Google カレンダーで予定が変わっていれば、キャンセルせずに失敗にする。
  - 書き込みの扱いは、[ADR-0029](../../adr/0029-google-calendar-sync.md) にある。
- キャンセルを拒まれたときと、つながらないときは、「キャンセルの失敗」の状態にし、[キャンセルの失敗の文](#キャンセルの失敗の文) を出す。

### 変えた後の表示

予定をキャンセルすると、予定の詳細を閉じ、予定のカレンダーの予定を読み直した結果を出す。

- 予定を buddy で管理する事業所では、キャンセルした予定は、カレンダーで「キャンセルした予定を出す」を選んでいるときだけ出る。
  - 開くと「キャンセルした予定」の状態になり、入れた理由を出す。
- 予定を Google カレンダーで管理する事業所では、Google カレンダーから予定を消すので、キャンセルの理由は残らない。

### 権限の確認

画面は、ログインした職員の予定の権限から、予定の職員の予定を見られるか、編集できるかを決める。  
規則は [画面仕様書の規約の権限の出し分け](../rules.md#権限の出し分け) にある。

- 見る権限が無い予定を開くと、「見る権限が無い」の状態になる。
- [編集](#編集) は、ログインした職員が次のどれかで予定の職員の予定を編集できるときだけ出す。
  - 自分の予定: 自分の予定の編集
  - ほかの職員の予定: 事業所の全ての予定の編集、指定した職員の予定の編集、指定したチームの職員の予定の編集
- 指定したチームの職員の予定の編集で判定するときは、職員の一覧を読み終えるまで [編集](#編集) を出さない。
- 編集できない予定では、[予定をキャンセル](#予定をキャンセル) と [編集](#編集) を出さず、下端に [下端の閉じる](#下端の閉じる) だけを出す。
- [予定をキャンセル](#予定をキャンセル) は、[編集](#編集) と同じ権限で出す。
- Google カレンダーの予定でも、同じ権限で [予定をキャンセル](#予定をキャンセル) と [編集](#編集) を出す。
  - 予定の正本を切り替えている間と、繰り返しの規則を buddy で表せない予定では、権限によらず出さない。
- 画面を開いた後に予定を編集する権限を外された職員が「予定をキャンセルする」を押すと、「キャンセルの失敗」の状態にし、「この操作をする権限がありません。」を出す。

## 未決

### PRD と実装の食い違い

- PRD の同行者と時間外の勤務の印を、予定の詳細に出していない。
  - 決める人: 開発者が、事業所の責任者に確認して決める
  - 期限: 同行者を予定の作成と編集で入れられるようにするとき
