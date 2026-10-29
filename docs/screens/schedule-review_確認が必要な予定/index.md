# schedule-review 確認が必要な予定

職員の管理の権限を持つ職員が、buddy の予定のうち Google カレンダーと食い違った予定を確認し、buddy の内容で書き直すか、Google カレンダーの内容に合わせる画面。予定は、[カレンダーの連携](../schedule-link_カレンダーの連携/index.md) で職員に結び付けた Google カレンダーと同期する。

| 項目 | 値 |
| --- | --- |
| URL | `/schedule/review` |
| 使う人 | 職員の管理の権限を持つ職員（デフォルトはマネージャー） |
| 実装 | `apps/web/src/routes/schedule_.review.tsx`、`apps/web/src/features/calendar/components/CalendarReviewContainer.tsx`、`apps/web/src/features/calendar/components/CalendarReviewView.tsx`、`apps/web/src/features/calendar/components/CalendarReviewTable.tsx`、`apps/web/src/features/calendar/components/CalendarRewriteDialog.tsx`、`apps/web/src/features/calendar/components/CalendarAcceptDialog.tsx`、`apps/web/src/features/calendar/components/CalendarDialog.tsx`、`apps/web/src/components/site/PageForbiddenMessage.tsx` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。

## 構成

ヘッダーの buddy の右に、機能のタブ（予定、照合）を置く。予定の画面では、画面の中身の上端に、予定の中のタブ（カレンダー、取り込み、要確認）を置く。

上端のヘッダーの下に、ページのタイトル、説明の文、予定の一覧を縦に並べる。書き直すと合わせるは、URL を持たない確認のダイアログを一覧の上に重ねて出す。
幅 768px 未満では、予定の一覧の行を、見出しと値の組を縦に積んだ箱にする。

=== "一覧"

    開いた直後に、確認が必要な予定を読み終え、1 件以上あったとき。モックは、buddy と Google カレンダーの両方で変わった単発の予定、書けなかった単発の予定、Google カレンダーで消された繰り返しの予定、Google カレンダーで終日にされた単発の予定を描く。

    <iframe class="mock" title="確認が必要な予定の、一覧" src="mocks/01-list.html"></iframe>
    <a class="mock-open" href="mocks/01-list.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | タブ | 機能のタブ | [機能のタブ](#機能のタブ) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 5 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 6 | 表 | 予定の一覧 | [予定の一覧](#予定の一覧) |
    | 7 | ラベル | 予定の日時 | [予定の日時](#予定の日時) |
    | 8 | ラベル | 職員 | [職員](#職員) |
    | 9 | ラベル | 理由 | [理由](#理由) |
    | 10 | ラベル | 最後に変わった日時 | [最後に変わった日時](#最後に変わった日時) |
    | 11 | ボタン | 予定を開く | [予定を開く](#予定を開く) |
    | 12 | ボタン | Google の内容に合わせる | [Google の内容に合わせる](#google-の内容に合わせる) |
    | 13 | ボタン | buddy の内容で書き直す | [buddy の内容で書き直す](#buddy-の内容で書き直す) |
    | 14 | タブ | 予定の中のタブ | [予定の中のタブ](#予定の中のタブ) |

=== "空"

    確認が必要な予定を読み終え、1 件も無かったとき。

    <iframe class="mock" title="確認が必要な予定の、空" src="mocks/02-empty.html"></iframe>
    <a class="mock-open" href="mocks/02-empty.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | タブ | 機能のタブ | [機能のタブ](#機能のタブ) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 5 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 6 | メッセージ | 予定が無いことの文 | [予定が無いことの文](#予定が無いことの文) |
    | 7 | タブ | 予定の中のタブ | [予定の中のタブ](#予定の中のタブ) |

=== "読み込み中"

    開いた直後か読み直した後に、確認が必要な予定を読んでいるとき。

    <iframe class="mock" title="確認が必要な予定の、読み込み中" src="mocks/03-loading.html"></iframe>
    <a class="mock-open" href="mocks/03-loading.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | タブ | 機能のタブ | [機能のタブ](#機能のタブ) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 5 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 6 | 領域 | 読み込み中の表示 | [読み込み中の表示](#読み込み中の表示) |
    | 7 | タブ | 予定の中のタブ | [予定の中のタブ](#予定の中のタブ) |

=== "読み込みの失敗"

    確認が必要な予定を読めなかったとき。

    <iframe class="mock" title="確認が必要な予定の、読み込みの失敗" src="mocks/04-error.html"></iframe>
    <a class="mock-open" href="mocks/04-error.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | タブ | 機能のタブ | [機能のタブ](#機能のタブ) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 5 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 6 | メッセージ | 読み込みの失敗の文 | [読み込みの失敗の文](#読み込みの失敗の文) |
    | 7 | ボタン | 読み直す | [読み直す](#読み直す) |
    | 8 | タブ | 予定の中のタブ | [予定の中のタブ](#予定の中のタブ) |

=== "書き直すダイアログ"

    一覧の行で、buddy の内容で書き直すを押したとき。モックは、1 行目の予定を書き直すときを描く。

    <iframe class="mock" title="確認が必要な予定の、書き直すダイアログ" src="mocks/05-rewrite.html"></iframe>
    <a class="mock-open" href="mocks/05-rewrite.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 書き直すダイアログ | [書き直すダイアログ](#書き直すダイアログ) |
    | 3 | ラベル | 書き直す予定 | [書き直す予定](#書き直す予定) |
    | 4 | ラベル | 書き直すときの注意 | [書き直すときの注意](#書き直すときの注意) |
    | 5 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 6 | ボタン | ダイアログの書き直す | [ダイアログの書き直す](#ダイアログの書き直す) |

=== "書き直しの送信中"

    ダイアログの書き直すを押し、予定の API のレスポンスを待っているとき。ダイアログを閉じられない。

    <iframe class="mock" title="確認が必要な予定の、書き直しの送信中" src="mocks/06-rewriting.html"></iframe>
    <a class="mock-open" href="mocks/06-rewriting.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 書き直すダイアログ | [書き直すダイアログ](#書き直すダイアログ) |
    | 3 | ラベル | 書き直す予定 | [書き直す予定](#書き直す予定) |
    | 4 | ラベル | 書き直すときの注意 | [書き直すときの注意](#書き直すときの注意) |
    | 5 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 6 | ボタン | ダイアログの書き直す | [ダイアログの書き直す](#ダイアログの書き直す) |

=== "書き直しの失敗"

    ダイアログの書き直すを押し、書き直す待ちにできなかったとき。モックは、ほかの画面ですでに書き直す待ちにしていたときを描く。ほかの理由は、書き直しの失敗の文だけが違う。

    <iframe class="mock" title="確認が必要な予定の、書き直しの失敗" src="mocks/07-rewrite-error.html"></iframe>
    <a class="mock-open" href="mocks/07-rewrite-error.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 書き直すダイアログ | [書き直すダイアログ](#書き直すダイアログ) |
    | 3 | ラベル | 書き直す予定 | [書き直す予定](#書き直す予定) |
    | 4 | ラベル | 書き直すときの注意 | [書き直すときの注意](#書き直すときの注意) |
    | 5 | メッセージ | 書き直しの失敗の文 | [書き直しの失敗の文](#書き直しの失敗の文) |
    | 6 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 7 | ボタン | ダイアログの書き直す | [ダイアログの書き直す](#ダイアログの書き直す) |

=== "合わせるダイアログ"

    一覧の行で、Google の内容に合わせるを押したとき。モックは、1 行目の予定を合わせるときを描く。

    <iframe class="mock" title="確認が必要な予定の、合わせるダイアログ" src="mocks/09-accept.html"></iframe>
    <a class="mock-open" href="mocks/09-accept.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 合わせるダイアログ | [合わせるダイアログ](#合わせるダイアログ) |
    | 3 | ラベル | 合わせる予定 | [合わせる予定](#合わせる予定) |
    | 4 | ラベル | 合わせるときの注意 | [合わせるときの注意](#合わせるときの注意) |
    | 5 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 6 | ボタン | ダイアログの合わせる | [ダイアログの合わせる](#ダイアログの合わせる) |

=== "合わせるの送信中"

    ダイアログの合わせるを押し、予定の API のレスポンスを待っているとき。ダイアログを閉じられない。

    <iframe class="mock" title="確認が必要な予定の、合わせるの送信中" src="mocks/10-accepting.html"></iframe>
    <a class="mock-open" href="mocks/10-accepting.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 合わせるダイアログ | [合わせるダイアログ](#合わせるダイアログ) |
    | 3 | ラベル | 合わせる予定 | [合わせる予定](#合わせる予定) |
    | 4 | ラベル | 合わせるときの注意 | [合わせるときの注意](#合わせるときの注意) |
    | 5 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 6 | ボタン | ダイアログの合わせる | [ダイアログの合わせる](#ダイアログの合わせる) |

=== "合わせるの失敗"

    ダイアログの合わせるを押し、Google カレンダーの内容に合わせられなかったとき。モックは、Google カレンダーで予定が終日にされていたときを描く。ほかの理由は、合わせるの失敗の文だけが違う。

    <iframe class="mock" title="確認が必要な予定の、合わせるの失敗" src="mocks/11-accept-error.html"></iframe>
    <a class="mock-open" href="mocks/11-accept-error.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 合わせるダイアログ | [合わせるダイアログ](#合わせるダイアログ) |
    | 3 | ラベル | 合わせる予定 | [合わせる予定](#合わせる予定) |
    | 4 | ラベル | 合わせるときの注意 | [合わせるときの注意](#合わせるときの注意) |
    | 5 | メッセージ | 合わせるの失敗の文 | [合わせるの失敗の文](#合わせるの失敗の文) |
    | 6 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 7 | ボタン | ダイアログの合わせる | [ダイアログの合わせる](#ダイアログの合わせる) |

=== "権限が無い"

    ログインした職員が職員の管理の権限を持たないとき。予定の中のタブを出さない。

    <iframe class="mock" title="確認が必要な予定の、権限が無い" src="mocks/08-forbidden.html"></iframe>
    <a class="mock-open" href="mocks/08-forbidden.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | タブ | 機能のタブ | [機能のタブ](#機能のタブ) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | 権限が無いことのタイトル | [権限が無いことのタイトル](#権限が無いことのタイトル) |
    | 5 | ラベル | 権限が無いことの説明 | [権限が無いことの説明](#権限が無いことの説明) |
    | 6 | ボタン | 予定のカレンダーへ | [予定のカレンダーへ](#予定のカレンダーへ) |

=== "キャンセルした予定を書き直すダイアログ"

    一覧の、buddy でキャンセルした単発の予定の行で、buddy の内容で書き直すを押したとき。モックは、5 行目の予定を書き直すときを描く。送信中と失敗は、「書き直しの送信中」と「書き直しの失敗」の状態と、書き直すときの注意の文だけが違う。

    <iframe class="mock" title="確認が必要な予定の、キャンセルした予定を書き直すダイアログ" src="mocks/12-rewrite-cancelled.html"></iframe>
    <a class="mock-open" href="mocks/12-rewrite-cancelled.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 書き直すダイアログ | [書き直すダイアログ](#書き直すダイアログ) |
    | 3 | ラベル | 書き直す予定 | [書き直す予定](#書き直す予定) |
    | 4 | ラベル | 書き直すときの注意 | [書き直すときの注意](#書き直すときの注意) |
    | 5 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 6 | ボタン | ダイアログの書き直す | [ダイアログの書き直す](#ダイアログの書き直す) |

## 機能のタブ

**概要**: 予定と照合の画面を行き来する。

**値のソース**: 「予定」「照合」。今の機能のタブに下線を引く。この画面では「予定」に引く。

**活性条件**: 常に活性

**表示条件**: ヘッダーの buddy の右に、常に出す。

**カタログ**: [SiteNav の Schedule](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-sitenav--schedule)

### インタラクション

#### 1. 「予定」を押す

1. 予定のカレンダーへ移る。

#### 2. 「照合」を押す

1. 照合の画面へ移る。

## 予定の中のタブ

**概要**: 予定のカレンダー、予定の取り込み、確認が必要な予定の画面を行き来する。

**値のソース**: 「カレンダー」「取り込み」「要確認」。今の画面のタブに下線を引く。この画面では「要確認」に引く。

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つ職員にだけ、画面の中身の上端に出す。

### インタラクション

#### 1. 「カレンダー」を押す

1. 予定のカレンダーへ移る。

#### 2. 「取り込み」を押す

1. 予定の取り込みの画面へ移る。

#### 3. 「要確認」を押す

1. この画面を開き直す。

## アカウント

**概要**: ログインしている職員を示し、名前とログアウトを入れたメニューを開く。

**値のソース**: 職員の名前の先頭の 1 文字を入れた丸いボタン。読み上げる名前は「アカウント」。

**活性条件**: 常に活性

**表示条件**: ログインしているとき

**カタログ**: [ViewerMenu の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-viewermenu--default)

### インタラクション

#### 1. 押す

1. 職員の名前とログアウトのボタンを入れたメニューを、ボタンの下に開く。
2. もう一度押すか、メニューの外を押すか、Escape キーを押すと閉じる。

## ログアウト

**概要**: ログアウトする。

**値のソース**: 「ログアウト」

**活性条件**: 常に活性

**表示条件**: アカウントのメニューを開いている間。BFF を通して API を呼ぶ構成で、ログインしているとき

**カタログ**: [ViewerMenu の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-viewermenu--default)

### インタラクション

#### 1. 押す

1. ログアウトし、`/` へ移る。ログインしていないので、`/` からそのままログインの画面へ移る。

## ページのタイトル

**概要**: 何の画面かを示す。

**値のソース**: 「確認が必要な予定」

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 説明の文

**概要**: 一覧に何が出るかと、書き直すと合わせるで何が起きるかを示す。

**値のソース**: 次の文言。

| 文言 |
| --- |
| 「buddy の予定のうち、Google カレンダーに書き出せなかった予定と、buddy と Google カレンダーの両方で変わった予定です。片方だけで変わった予定は、変わった側に合わせるので、ここには出ません。buddy の内容で書き直すと Google カレンダーの予定を buddy の内容にし、Google の内容に合わせると buddy の予定を Google カレンダーの内容にします。」 |

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 予定の一覧

**概要**: Google カレンダーと食い違った予定ごとに、日時、職員、理由、最後に変わった日時を示し、予定を開くか、buddy の内容で書き直すか、Google の内容に合わせる。

**値のソース**: 「予定の日時」「職員」「理由」「最後に変わった日時」のカラムと、操作の列。行は、書き出しの状態が新しく変わった順に並べる。予定のタイトル、利用者名、カレンダーの ID は、個人の情報を出さないために出さない。幅 768px 未満では、行ごとの箱の中に、カラムの名前と値を縦に積む。

**活性条件**: 常に活性

**表示条件**: 確認が必要な予定を読み終え、1 件以上あったとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 予定の日時

**概要**: どの予定かを、日付と時刻で示す。

**値のソース**: 単発の予定は「2026/11/04（水）09:00〜09:29」の形で出す。繰り返しの予定は、最初の回の日付に「から毎回」を付け、「2026/11/03（火）から毎回 10:00〜11:00」の形で出す。

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 職員

**概要**: 予定の職員を示す。予定は、この職員に結び付けた Google カレンダーと同期する。

**値のソース**: 職員の名前。

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 理由

**概要**: 確認が必要な理由を、マネージャーが次にすることの分かる文で示す。

**値のソース**: 次の文。

| 理由 | 文 |
| --- | --- |
| buddy と Google カレンダーの両方で単発の予定が変わった | 「buddy と Google カレンダーの両方で予定が変わりました。どちらの内容に合わせるかを選んでください。」 |
| buddy でキャンセルした単発の予定が、Google カレンダーで変わっていた | 「buddy でキャンセルした予定が、Google カレンダーで変わっていました。buddy の内容で書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。」 |
| buddy と Google カレンダーの両方で繰り返しの予定が変わった | 「buddy と Google カレンダーの両方で繰り返しの予定が変わりました。buddy の内容で書き直すか、Google カレンダーで元に戻すよう職員に頼んでください。」 |
| Google カレンダーでの変更を buddy の予定に読み替えられない | 「Google カレンダーでの変更を、buddy の予定に読み替えられません。終日の予定、タイトルの利用者が見つからない予定、繰り返しの予定そのものの変更が当たります。buddy の内容で書き直すか、Google カレンダーで直すよう職員に頼んでください。」 |
| Google カレンダーで予定が消されていた | 「Google カレンダーで予定が見つかりません。予定が消されたか、カレンダーの共有が外れていないかを、職員に確認してください。」 |
| カレンダーに書く権限が無い | 「Google カレンダーに書けません。カレンダーが「予定の変更」の権限で共有されているかを、職員に確認してください。」 |
| Google カレンダーが予定の内容を受け付けなかった | 「Google カレンダーが予定の内容を受け付けませんでした。予定を開いて内容を確認してください。」 |
| Google に届かず、書き直しの上限に達した | 「Google カレンダーに届かず、書き出せませんでした。」 |
| そのほか | 「Google カレンダーに書き出せませんでした。」 |

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 最後に変わった日時

**概要**: 確認が必要な状態に最後に変わった日時を示す。

**値のソース**: 書き出しの状態が最後に変わった日時を、デバイスの時間帯で「2026/10/22 10:00」の形で出す。

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 予定を開く

**概要**: 予定の詳細を開き、buddy の内容を確認する。

**値のソース**: 「予定を開く」

**活性条件**: 常に活性

**表示条件**: 単発の予定の行。繰り返しの予定の行には出さない

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

### インタラクション

#### 1. 押す

1. その予定の詳細（`/schedule/{予定の ID}`）へ移る。

## Google の内容に合わせる

**概要**: buddy の予定を Google カレンダーの内容に合わせる、確認のダイアログを開く。

**値のソース**: 「Google の内容に合わせる」

**活性条件**: 常に活性

**表示条件**: 単発の予定で、buddy と Google カレンダーの両方で変わったか、Google カレンダーで予定が見つからない行。繰り返しの予定の行、buddy でキャンセルした予定の行、書けなかった行、読み替えられない行には出さない

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

### インタラクション

#### 1. 押す

1. 「合わせるダイアログ」の状態にする。

## buddy の内容で書き直す

**概要**: Google カレンダーの予定を buddy の内容で書き直す、確認のダイアログを開く。

**値のソース**: 「buddy の内容で書き直す」

**活性条件**: 常に活性

**表示条件**: 予定の一覧の全ての行

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

### インタラクション

#### 1. 押す

1. 「書き直すダイアログ」の状態にする。buddy でキャンセルした単発の予定の行では、「キャンセルした予定を書き直すダイアログ」の状態にする。

## 予定が無いことの文

**概要**: 確認が必要な予定が無いことを示す。

**値のソース**: 「確認が必要な予定はありません。」

**活性条件**: 常に活性

**表示条件**: 確認が必要な予定を読み終え、1 件も無かったとき

**カタログ**: [CalendarReviewView の Empty](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--empty)

## 読み込み中の表示

**概要**: 確認が必要な予定を読んでいることを示す。

**値のソース**: 回転の印と、次の文言。

| 文言 |
| --- |
| 「読み込んでいます」 |

**活性条件**: 常に活性

**表示条件**: 確認が必要な予定を読み終えるまで

**カタログ**: [CalendarReviewView の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--loading)

## 読み込みの失敗の文

**概要**: 一覧を出せないことを示す。読み上げでは警告として扱う。

**値のソース**: 「確認が必要な予定を読み込めませんでした。時間をおいて、読み直してください。」。予定の API が権限で拒んだときは「この操作をする権限がありません。」

**活性条件**: 常に活性

**表示条件**: 確認が必要な予定を読めなかったとき

**カタログ**: [CalendarReviewView の LoadError](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--load-error)

## 読み直す

**概要**: 確認が必要な予定を読み直す。

**値のソース**: 「読み直す」

**活性条件**: 常に活性

**表示条件**: 読み込みに失敗したとき

**カタログ**: [CalendarReviewView の LoadError](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--load-error)

### インタラクション

#### 1. 押す

1. 「読み込み中」の状態にし、確認が必要な予定を読み直す。

## 覆い

**概要**: ダイアログの後ろの一覧を覆い、ダイアログの外を押せなくする。

**値のソース**: なし

**活性条件**: 書き直しか合わせるを送っている間は押しても閉じない

**表示条件**: 書き直すダイアログか合わせるダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)、[CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)

### インタラクション

#### 1. 押す

1. ダイアログを閉じ、「一覧」の状態に戻る。

## 書き直すダイアログ

**概要**: Google カレンダーの予定を buddy の内容で書き直す前に、Google カレンダーでの変更が消えることを示して確認する。

**値のソース**: タイトルは次の文言。

| 文言 |
| --- |
| 「buddy の内容で書き直しますか」 |

**活性条件**: 常に活性

**表示条件**: 一覧で buddy の内容で書き直すを押した後

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)

## 書き直す予定

**概要**: どの予定を書き直すかを示す。

**値のソース**: 一覧の行の予定の日時と職員の名前を「、」でつなぎ、「2026/11/04（水）09:00〜09:29、青木 一郎」の形で出す。

**活性条件**: 常に活性

**表示条件**: 書き直すダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)

## 書き直すときの注意

**概要**: 書き直すと何が消え、いつ Google カレンダーに出るかを示す。

**値のソース**: 次の文言。

| 予定 | 文言 |
| --- | --- |
| buddy でキャンセルした単発の予定 | 「buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。Google カレンダーの予定は、数十秒のうちに消えます。」 |
| そのほかの予定 | 「Google カレンダーの予定のタイトルと日時を buddy の内容にします。Google カレンダーで直したタイトルと日時は消えます。消された予定は作り直します。書き直しは、数十秒のうちに Google カレンダーに出ます。」 |

**活性条件**: 常に活性

**表示条件**: 書き直すダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)、[CalendarRewriteDialog の Cancelled](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--cancelled)

## 書き直しの失敗の文

**概要**: 書き直す待ちにできなかったことと、次にすることを示す。読み上げでは警告として扱う。

**値のソース**: 次の文。

| 理由 | 文 |
| --- | --- |
| ほかの画面ですでに書き直す待ちにしたか、書き出し終えた | 「この予定は、すでに書き直す待ちにしたか、書き出し終えています。一覧を読み直してください。」 |
| 予定の API が権限で拒んだ | 「この操作をする権限がありません。」 |
| そのほかの失敗 | 「書き直す待ちにできませんでした。時間をおいて、もう一度書き直してください。」 |

**活性条件**: 常に活性

**表示条件**: ダイアログの書き直すが失敗した後。ダイアログを閉じると消す

**カタログ**: [CalendarRewriteDialog の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--failed)

## キャンセル

**概要**: 書き直さず、合わせずにダイアログを閉じる。

**値のソース**: 「キャンセル」

**活性条件**: 書き直しか合わせるを送っている間は押せない

**表示条件**: 書き直すダイアログか合わせるダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)、[CalendarRewriteDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--submitting)、[CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)

### インタラクション

#### 1. 押すか、Escape キーを押す

1. ダイアログを閉じ、「一覧」の状態に戻る。送っている間は、Escape キーでも閉じない。

## ダイアログの書き直す

**概要**: 予定を、Google カレンダーの変更を比べずに buddy の内容で書き直す待ちにする。

**値のソース**: 「書き直す」。送っている間は、文字の前に回転の印を出す。

**活性条件**: 送っている間でないとき

**表示条件**: 書き直すダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)、[CalendarRewriteDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--submitting)

### インタラクション

#### 1. 押す

1. 「書き直しの送信中」の状態にし、予定の API に書き直しを送る。
2. 成功したら、ダイアログを閉じ、一覧を読み直す。その予定は一覧から消える。書き出しの処理が、数十秒のうちに Google カレンダーに書く。Google カレンダーで消された予定は作り直す。buddy でキャンセルした単発の予定は、Google カレンダーの予定を消す。
3. 失敗したら、「書き直しの失敗」の状態にし、[書き直しの失敗の文](#書き直しの失敗の文) に理由を出す。一覧も読み直す。

## 合わせるダイアログ

**概要**: buddy の予定を Google カレンダーの内容に合わせる前に、buddy での変更が消えることを示して確認する。

**値のソース**: タイトルは次の文言。

| 文言 |
| --- |
| 「Google カレンダーの内容に合わせますか」 |

**活性条件**: 常に活性

**表示条件**: 一覧で Google の内容に合わせるを押した後

**カタログ**: [CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)

## 合わせる予定

**概要**: どの予定を合わせるかを示す。

**値のソース**: [書き直す予定](#書き直す予定) と同じ形で出す。

**活性条件**: 常に活性

**表示条件**: 合わせるダイアログを開いているとき

**カタログ**: [CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)

## 合わせるときの注意

**概要**: 合わせると buddy の何が消えるかを示す。

**値のソース**: 次の文言。

| 文言 |
| --- |
| 「buddy の予定のタイトルと日時を、Google カレンダーの今の内容にします。buddy で変えたタイトルと日時は消えます。Google カレンダーで消された予定は、buddy でもキャンセルします。」 |

**活性条件**: 常に活性

**表示条件**: 合わせるダイアログを開いているとき

**カタログ**: [CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)

## 合わせるの失敗の文

**概要**: Google カレンダーの内容に合わせられなかったことと、次にすることを示す。読み上げでは警告として扱う。

**値のソース**: 次の文。

| 理由 | 文 |
| --- | --- |
| ほかの画面ですでに書き直す待ちにしたか、解いた | 「この予定は、すでに書き直す待ちにしたか、解いています。一覧を読み直してください。」 |
| Google カレンダーの内容に合わせられない予定 | 「この予定は、Google カレンダーの内容に合わせられません。buddy の内容で書き直してください。」 |
| Google カレンダーの予定を読み替えられない | 「Google カレンダーの予定を、buddy の予定に読み替えられません。終日の予定か、タイトルの利用者が見つからない予定です。buddy の内容で書き直すか、Google カレンダーで直すよう職員に頼んでください。」 |
| Google カレンダーを読めない | 「Google カレンダーを読めません。カレンダーの共有が外れていないかを、職員に確認してください。」 |
| サービスアカウントが設定されていない | 「この事業所のサービスアカウントが設定されていないので、Google カレンダーを読めません。buddy を動かしている管理者に、Google カレンダーの設定を頼んでください。」 |
| 予定の API が権限で拒んだ | 「この操作をする権限がありません。」 |
| そのほかの失敗 | 「Google カレンダーの内容に合わせられませんでした。時間をおいて、もう一度試してください。」 |

**活性条件**: 常に活性

**表示条件**: ダイアログの合わせるが失敗した後。ダイアログを閉じると消す

**カタログ**: [CalendarAcceptDialog の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--failed)

## ダイアログの合わせる

**概要**: 予定の API が Google カレンダーの今の予定を読み、buddy の予定をその内容にする。

**値のソース**: 「合わせる」。送っている間は、文字の前に回転の印を出す。

**活性条件**: 送っている間でないとき

**表示条件**: 合わせるダイアログを開いているとき

**カタログ**: [CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)、[CalendarAcceptDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--submitting)

### インタラクション

#### 1. 押す

1. 「合わせるの送信中」の状態にし、予定の API に合わせるを送る。
2. 成功したら、ダイアログを閉じ、一覧と予定を読み直す。その予定は一覧から消え、予定のカレンダーに Google カレンダーの日時とタイトルで出る。Google カレンダーで消された予定は、キャンセルした予定になる。
3. 失敗したら、「合わせるの失敗」の状態にし、[合わせるの失敗の文](#合わせるの失敗の文) に理由を出す。一覧も読み直す。

## 権限が無いことのタイトル

**概要**: この画面を開けないことを示す。

**値のソース**: 「この画面を開く権限がありません」

**活性条件**: 常に活性

**表示条件**: ログインした職員が職員の管理の権限を持たないとき

**カタログ**: [PageForbiddenMessage の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-pageforbiddenmessage--default)

## 権限が無いことの説明

**概要**: 誰が開けるかと、どうすればよいかを示す。

**値のソース**: 次の文言。

| 文言 |
| --- |
| 「職員の管理の権限を持つ職員だけが開けます。権限が要るときは、職員の管理の権限を持つ職員に頼んでください。」 |

**活性条件**: 常に活性

**表示条件**: ログインした職員が職員の管理の権限を持たないとき

**カタログ**: [PageForbiddenMessage の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-pageforbiddenmessage--default)

## 予定のカレンダーへ

**概要**: 予定のカレンダーへ戻る。

**値のソース**: 「予定のカレンダーへ」

**活性条件**: 常に活性

**表示条件**: ログインした職員が職員の管理の権限を持たないとき

**カタログ**: [PageForbiddenMessage の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-pageforbiddenmessage--default)

### インタラクション

#### 1. 押す

1. 予定のカレンダーへ移る。

## 全体動作

### 初期処理

- 開くと、ログインした職員の権限を読む。職員の管理の権限が無ければ、予定の API を呼ばず、「権限が無い」の状態にする。
- 権限があれば、確認が必要な予定を読み、読み終えるまで「読み込み中」の状態にする。
  - 1 件以上あれば「一覧」、1 件も無ければ「空」の状態にする。
  - 読めなかったときは、「読み込みの失敗」の状態にする。
- URL の search params は読まない。

### 一覧に出る予定

- buddy で予定を作り、変え、キャンセルすると、予定の API は、予定の職員が結び付けた Google カレンダーに書き出す。Google カレンダーで職員が変えた予定は、予定の API が数分ごとに読み、buddy の予定に当てる。片方だけで変わった予定は、変わった側に合わせ、この一覧に出さない。
  - buddy と Google カレンダーの両方で予定が変わったときと、Google カレンダーで予定が消されていたときは、どちらの変更も消さないように止め、一覧に出す。この予定は、解くまで buddy で予定を変えても書き出さず、Google カレンダーの変更も当てない。
    - Google カレンダーで消された予定を buddy でキャンセルしたときは、一覧に出さない。職員を替えたときも出さず、新しい職員のカレンダーに作る。
    - Google カレンダーで変えられた予定を buddy でキャンセルしたときは、一覧に出す。キャンセルは Google の内容に戻せないので、buddy の内容で書き直して Google カレンダーの予定を消すことだけができる。
  - Google カレンダーでの変更を buddy の予定に読み替えられないとき（終日の予定、タイトルの利用者が見つからない予定、繰り返しの予定そのものの変更）も、一覧に出す。職員が Google カレンダーで読み替えられる形に直すと、予定の API が当てて、一覧から消す。
  - カレンダーに書く権限が無いときと、Google に届かず書き直しの上限に達したときも、一覧に出す。この予定は、buddy で予定を変えると書き出し直す。
- 職員のカレンダーの結び付けを外しても、そのカレンダーの予定は一覧に残る。予定の API は外したカレンダーに書かないので、buddy の内容で書き直しても、外したカレンダーの予定は消さず、書き直さない。書き直す待ちを終えて、一覧から消すだけである。キャンセルしていない予定は、職員が別のカレンダーを結び付け直していれば、そのカレンダーに buddy の内容で作る。一覧と書き直すダイアログは、結び付けを外したかを示さない。
- 書き出しと同期の設計は、[予定の API の Design Doc の Google カレンダーとの同期](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#google-カレンダーとの同期) にある。

### 権限の確認

画面の判定は表示のためだけにする。予定の API も、職員の管理の権限が無い職員のリクエストを 403 で拒む。画面を開いた後に権限を外された職員が操作したときは、読み込みの失敗の文、書き直しの失敗の文、合わせるの失敗の文の位置に、「この操作をする権限がありません。」を出す。

## 未決

- 繰り返しの予定そのもの（規則、時刻、タイトル）の Google カレンダーでの変更は、buddy に当てられない。一覧の繰り返しの予定は、buddy の内容で書き直すか、職員に Google カレンダーで元に戻してもらうことだけができる。
- 繰り返しの予定の行には予定を開くを出さない。繰り返しの予定の内容を確認する画面への移り方は決めていない。
