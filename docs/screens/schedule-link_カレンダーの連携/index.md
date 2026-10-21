# schedule-link カレンダーの連携

職員の管理の権限を持つ職員が、職員ごとに Google カレンダーを buddy に結び付け、読めるかを確かめ、外す画面。結び付けたカレンダーの予定は、[予定の取り込み](../schedule-import_予定の取り込み/index.md) で buddy に取り込む。

| 項目 | 値 |
| --- | --- |
| URL | `/schedule/link` |
| 使う人 | 職員の管理の権限を持つ職員（既定はマネージャー） |
| 実装 | `apps/web/src/routes/schedule_.link.tsx`、`apps/web/src/features/calendar/components/CalendarLinkContainer.tsx`、`apps/web/src/features/calendar/components/CalendarLinkView.tsx`、`apps/web/src/features/calendar/components/CalendarShareGuide.tsx`、`apps/web/src/features/calendar/components/CalendarLinkTable.tsx`、`apps/web/src/features/calendar/components/CalendarLinkDialog.tsx`、`apps/web/src/features/calendar/components/CalendarUnlinkDialog.tsx`、`apps/web/src/features/calendar/components/CalendarDialog.tsx`、`apps/web/src/components/site/PageForbiddenMessage.tsx` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。

## 構成

上端のヘッダーの下に、ページの題、説明の文、カレンダーを共有する手順、職員の一覧を縦に並べる。結び付けると外すは、URL を持たないダイアログを一覧の上に重ねて出す。
幅 768px 未満では、職員の一覧の行を、見出しと値の組を縦に積んだ箱にする。

=== "一覧"

    開いた直後に、職員とカレンダーを読み終えたとき。事業所の全ての職員を並べ、結び付けた職員にはカレンダーの ID を出す。

    <iframe class="mock" title="カレンダーの連携の、一覧" src="mocks/01-list.html"></iframe>
    <a class="mock-open" href="mocks/01-list.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | リンク | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ラベル | ログインした職員 | [ログインした職員](#ログインした職員) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページの題 | [ページの題](#ページの題) |
    | 5 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 6 | 領域 | 共有の手順 | [共有の手順](#共有の手順) |
    | 7 | ラベル | サービスアカウントのメールアドレス | [サービスアカウントのメールアドレス](#サービスアカウントのメールアドレス) |
    | 8 | ボタン | コピー | [コピー](#コピー) |
    | 9 | 表 | 職員の一覧 | [職員の一覧](#職員の一覧) |
    | 10 | ラベル | カレンダーの ID | [カレンダーの ID](#カレンダーの-id) |
    | 11 | ラベル | 最後の取り込み | [最後の取り込み](#最後の取り込み) |
    | 12 | ボタン | 結び付ける | [結び付ける](#結び付ける) |
    | 13 | ボタン | 外す | [外す](#外す) |
    | 14 | ボタン | 取り込む | [取り込む](#取り込む) |

=== "結び付けるダイアログ"

    結び付けていない職員の行で、結び付けるを押したとき。カレンダーの ID には、職員のメールアドレスを入れておく。

    <iframe class="mock" title="カレンダーの連携の、結び付けるダイアログ" src="mocks/02-link.html"></iframe>
    <a class="mock-open" href="mocks/02-link.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 結び付けるダイアログ | [結び付けるダイアログ](#結び付けるダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | 職員の名前 | [職員の名前](#職員の名前) |
    | 5 | テキストボックス | カレンダーの ID の入力 | [カレンダーの ID の入力](#カレンダーの-id-の入力) |
    | 6 | ボタン | 読めるか確かめる | [読めるか確かめる](#読めるか確かめる) |
    | 7 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 8 | ボタン | ダイアログの結び付ける | [ダイアログの結び付ける](#ダイアログの結び付ける) |

=== "読めた"

    読めるか確かめるを押し、buddy がカレンダーを読めたとき。ダイアログの結び付けるを押せる。

    <iframe class="mock" title="カレンダーの連携の、読めた" src="mocks/03-link-readable.html"></iframe>
    <a class="mock-open" href="mocks/03-link-readable.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 結び付けるダイアログ | [結び付けるダイアログ](#結び付けるダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | 職員の名前 | [職員の名前](#職員の名前) |
    | 5 | テキストボックス | カレンダーの ID の入力 | [カレンダーの ID の入力](#カレンダーの-id-の入力) |
    | 6 | ボタン | 読めるか確かめる | [読めるか確かめる](#読めるか確かめる) |
    | 7 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 8 | ボタン | ダイアログの結び付ける | [ダイアログの結び付ける](#ダイアログの結び付ける) |
    | 9 | メッセージ | 確かめの結果 | [確かめの結果](#確かめの結果) |

=== "読めない"

    読めるか確かめるか、ダイアログの結び付けるを押し、buddy がカレンダーを読めなかったか、結び付けられなかったとき。モックは、カレンダーを共有していないときを描く。ほかの理由は、確かめの結果の文だけが違う。

    <iframe class="mock" title="カレンダーの連携の、読めない" src="mocks/04-link-unreadable.html"></iframe>
    <a class="mock-open" href="mocks/04-link-unreadable.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 結び付けるダイアログ | [結び付けるダイアログ](#結び付けるダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | 職員の名前 | [職員の名前](#職員の名前) |
    | 5 | テキストボックス | カレンダーの ID の入力 | [カレンダーの ID の入力](#カレンダーの-id-の入力) |
    | 6 | ボタン | 読めるか確かめる | [読めるか確かめる](#読めるか確かめる) |
    | 7 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 8 | ボタン | ダイアログの結び付ける | [ダイアログの結び付ける](#ダイアログの結び付ける) |
    | 9 | メッセージ | 確かめの結果 | [確かめの結果](#確かめの結果) |

=== "外すダイアログ"

    結び付けた職員の行で、外すを押したとき。

    <iframe class="mock" title="カレンダーの連携の、外すダイアログ" src="mocks/05-unlink.html"></iframe>
    <a class="mock-open" href="mocks/05-unlink.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 外すダイアログ | [外すダイアログ](#外すダイアログ) |
    | 3 | ラベル | 外すときの注意 | [外すときの注意](#外すときの注意) |
    | 4 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 5 | ボタン | ダイアログの外す | [ダイアログの外す](#ダイアログの外す) |

=== "読み込み中"

    開いた直後に、職員とカレンダーとサービスアカウントを読んでいるとき。

    <iframe class="mock" title="カレンダーの連携の、読み込み中" src="mocks/06-loading.html"></iframe>
    <a class="mock-open" href="mocks/06-loading.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | リンク | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ラベル | ログインした職員 | [ログインした職員](#ログインした職員) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページの題 | [ページの題](#ページの題) |
    | 5 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 6 | 領域 | 読み込み中の表示 | [読み込み中の表示](#読み込み中の表示) |

=== "読み込みの失敗"

    職員かカレンダーの一覧を読めなかったとき。

    <iframe class="mock" title="カレンダーの連携の、読み込みの失敗" src="mocks/07-error.html"></iframe>
    <a class="mock-open" href="mocks/07-error.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | リンク | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ラベル | ログインした職員 | [ログインした職員](#ログインした職員) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページの題 | [ページの題](#ページの題) |
    | 5 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 6 | メッセージ | 読み込みの失敗の文 | [読み込みの失敗の文](#読み込みの失敗の文) |
    | 7 | ボタン | 読み直す | [読み直す](#読み直す) |

=== "サービスアカウントが無い"

    予定の API に、Google カレンダーを読むサービスアカウントの鍵が設定されていないとき。共有の手順の代わりに知らせを出し、結び付けるを押せない。結び付けたカレンダーを外すことと、予定の取り込みへ移ることはできる。

    <iframe class="mock" title="カレンダーの連携の、サービスアカウントが無い" src="mocks/08-not-configured.html"></iframe>
    <a class="mock-open" href="mocks/08-not-configured.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | リンク | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ラベル | ログインした職員 | [ログインした職員](#ログインした職員) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページの題 | [ページの題](#ページの題) |
    | 5 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 6 | メッセージ | サービスアカウントが無いことの文 | [サービスアカウントが無いことの文](#サービスアカウントが無いことの文) |
    | 7 | 表 | 職員の一覧 | [職員の一覧](#職員の一覧) |
    | 8 | ラベル | カレンダーの ID | [カレンダーの ID](#カレンダーの-id) |
    | 9 | ラベル | 最後の取り込み | [最後の取り込み](#最後の取り込み) |
    | 10 | ボタン | 結び付ける | [結び付ける](#結び付ける) |
    | 11 | ボタン | 外す | [外す](#外す) |
    | 12 | ボタン | 取り込む | [取り込む](#取り込む) |

=== "権限が無い"

    ログインした職員が職員の管理の権限を持たないとき。ナビゲーションに「取り込み」を出さない。

    <iframe class="mock" title="カレンダーの連携の、権限が無い" src="mocks/09-forbidden.html"></iframe>
    <a class="mock-open" href="mocks/09-forbidden.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | リンク | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ラベル | ログインした職員 | [ログインした職員](#ログインした職員) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | 権限が無いことの題 | [権限が無いことの題](#権限が無いことの題) |
    | 5 | ラベル | 権限が無いことの説明 | [権限が無いことの説明](#権限が無いことの説明) |
    | 6 | ボタン | 予定のカレンダーへ | [予定のカレンダーへ](#予定のカレンダーへ) |

## ナビゲーション

**概要**: 予定、照合、取り込みの画面を行き来する。

**値のソース**: 「予定」「照合」「取り込み」のリンク。「取り込み」は、職員の管理の権限を持つ職員にだけ出す。この画面では「取り込み」を今の画面として示す。

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [SiteNav の Import](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-sitenav--import)

### インタラクション

#### 1. 「予定」を押す

1. 予定のカレンダーへ移る。

#### 2. 「照合」を押す

1. 照合の画面へ移る。

#### 3. 「取り込み」を押す

1. 予定の取り込みの画面へ移る。

## ログインした職員

**概要**: ログインしている職員を示す。

**値のソース**: 職員の名前。

**活性条件**: 常に活性

**表示条件**: ログインしているとき。幅 768px 未満では出さない

**カタログ**: [ViewerMenu の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-viewermenu--default)

## ログアウト

**概要**: ログアウトする。

**値のソース**: 「ログアウト」

**活性条件**: 常に活性

**表示条件**: BFF を通して API を呼ぶ動かし方で、ログインしているとき

**カタログ**: [ViewerMenu の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-viewermenu--default)

### インタラクション

#### 1. 押す

1. ログアウトし、`/` へ移る。ログインしていないので、`/` からそのままログインの画面へ移る。

## ページの題

**概要**: 何の画面かを示す。

**値のソース**: 「カレンダーの連携」

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つとき

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

## 説明の文

**概要**: この画面で何をするかを示す。

**値のソース**: 次の文言。

| 文言 |
| --- |
| 「職員ごとに Google カレンダーを結び付けます。結び付けたカレンダーの予定は、予定の取り込みで buddy に取り込めます。」 |

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つとき

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

## 共有の手順

**概要**: buddy がカレンダーを読めるように、職員がカレンダーをサービスアカウントに閲覧で共有する手順を示す。

**値のソース**: 「カレンダーを共有する手順」の見出しと、次の 3 つの手順。

| 手順 | 文言 |
| --- | --- |
| 1 | 「職員が、Google カレンダーの「設定と共有」で、自分のカレンダーの「特定のユーザーまたはグループと共有する」に、次のメールアドレスを足します。」 |
| 2 | 「権限は「予定の変更」を選びます。buddy の予定を、このカレンダーに書き出すためです。」 |
| 3 | 「この画面で、職員の行の「結び付ける」を押し、カレンダーの ID を入れます。カレンダーの ID は、「カレンダーの統合」にあります。個人のカレンダーでは、職員の Google のメールアドレスです。」 |

**活性条件**: 常に活性

**表示条件**: サービスアカウントが設定されているとき

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

## サービスアカウントのメールアドレス

**概要**: 職員がカレンダーを共有する相手の、buddy のサービスアカウントのメールアドレスを示す。

**値のソース**: 「buddy のサービスアカウント」の見出しと、メールアドレス。予定の API が、サービスアカウントの鍵から読んで返す。

**活性条件**: 常に活性

**表示条件**: サービスアカウントが設定されているとき

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

## コピー

**概要**: サービスアカウントのメールアドレスを、職員に送れるようにクリップボードに写す。

**値のソース**: 「コピー」。写した後の 2 秒は「コピーしました」にする。

**活性条件**: 常に活性

**表示条件**: サービスアカウントが設定されているとき

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)、[CalendarLinkView の CopyRejected](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--copy-rejected)

### インタラクション

#### 1. 押す

1. メールアドレスをクリップボードに写し、ボタンの文字を 2 秒だけ「コピーしました」にする。
2. ブラウザが写すことを拒んだときは、メールアドレスの文字を選んだ状態にし、ボタンの文字は変えない。

## 職員の一覧

**概要**: 事業所の職員ごとに、結び付けた Google カレンダーと最後の取り込みを示し、結び付け、外し、取り込みへ移る。

**値のソース**: 「職員」「Google カレンダー」「最後の取り込み」のカラムと、操作の列。行は職員の名前の順に並べる。幅 768px 未満では、行ごとの箱の中に、カラムの名前と値を縦に積む。

**活性条件**: 常に活性

**表示条件**: 職員とカレンダーを読み終えたとき

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

## カレンダーの ID

**概要**: 職員に結び付けた Google カレンダーを示す。

**値のソース**: カレンダーの ID。結び付けていない職員は「結び付けていません」。

**活性条件**: 常に活性

**表示条件**: 職員の一覧を出すとき

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

## 最後の取り込み

**概要**: そのカレンダーから最後に予定を取り込んだ日時と期間を示す。

**値のソース**: 最後に確定した取り込みの終わった日時と期間を「2026/10/20 15:42（2026/10/01〜2026/10/31）」の形で出す。取り込んだことが無ければ「なし」、最後の取り込みが失敗したときは日時の後に「（失敗）」を付ける。結び付けていない職員は「—」。

**活性条件**: 常に活性

**表示条件**: 職員の一覧を出すとき

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

## 結び付ける

**概要**: 職員に Google カレンダーを結び付けるダイアログを開く。

**値のソース**: 「結び付ける」

**活性条件**: サービスアカウントが設定されているとき

**表示条件**: カレンダーを結び付けていない職員の行

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)、[CalendarLinkView の NotConfigured](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--not-configured)

### インタラクション

#### 1. 押す

1. 「結び付けるダイアログ」の状態にする。

## 外す

**概要**: 職員に結び付けたカレンダーを外す、確かめのダイアログを開く。

**値のソース**: 「外す」

**活性条件**: 常に活性

**表示条件**: カレンダーを結び付けた職員の行

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

### インタラクション

#### 1. 押す

1. 「外すダイアログ」の状態にする。

## 取り込む

**概要**: その職員のカレンダーから予定を取り込む画面へ移る。

**値のソース**: 「取り込む」

**活性条件**: 常に活性

**表示条件**: カレンダーを結び付けた職員の行

**カタログ**: [CalendarLinkView の List](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--list)

### インタラクション

#### 1. 押す

1. 予定の取り込みの画面へ移る。職員の欄には、この行の職員を選んでおく。

## 覆い

**概要**: ダイアログの後ろの一覧を覆い、ダイアログの外を押せなくする。

**値のソース**: なし

**活性条件**: 常に活性

**表示条件**: ダイアログを開いているとき

**カタログ**: [CalendarLinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--default)、[CalendarUnlinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarunlinkdialog--default)

### インタラクション

#### 1. 押す

1. ダイアログを閉じ、「一覧」の状態に戻る。結び付けるダイアログで入れた値は捨てる。

## 結び付けるダイアログ

**概要**: 1 人の職員に Google カレンダーを結び付ける。

**値のソース**: 題は「カレンダーを結び付ける」。

**活性条件**: 常に活性

**表示条件**: 一覧で結び付けるを押した後

**カタログ**: [CalendarLinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--default)

## 閉じる

**概要**: 結び付けずにダイアログを閉じる。

**値のソース**: 閉じるのアイコン。読み上げでは「閉じる」。

**活性条件**: 結び付けを送っている間は押せない

**表示条件**: 結び付けるダイアログを開いているとき

**カタログ**: [CalendarLinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--default)

### インタラクション

#### 1. 押すか、Escape キーを押す

1. ダイアログを閉じ、「一覧」の状態に戻る。入れた値は捨てる。

## 職員の名前

**概要**: カレンダーを結び付ける職員を示す。

**値のソース**: 「職員」の見出しと、一覧で選んだ行の職員の名前。

**活性条件**: 常に活性

**表示条件**: 結び付けるダイアログを開いているとき

**カタログ**: [CalendarLinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--default)

## カレンダーの ID の入力

**概要**: 結び付ける Google カレンダーの ID を入れる。

**値のソース**: 見出し、入力、補足を縦に並べる。開いたときは、職員の buddy のメールアドレスを入れておく。前後の空白は送る前に除く。

| 部分 | 文言 |
| --- | --- |
| 見出し | 「カレンダーの ID」 |
| 補足 | 「Google カレンダーの「カレンダーの統合」にある ID。個人のカレンダーでは、Google のメールアドレスです。」 |

**活性条件**: 結び付けを送っている間は入力できない

**表示条件**: 結び付けるダイアログを開いているとき

**カタログ**: [CalendarLinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--default)

### インタラクション

#### 1. 値を変える

1. 確かめの結果を消し、ダイアログの結び付けるを押せなくする。

## 読めるか確かめる

**概要**: buddy のサービスアカウントで、入れたカレンダーを読めるかを確かめる。予定は取り込まない。

**値のソース**: 「読めるか確かめる」。確かめている間は、文字の前に回転の印を出す。

**活性条件**: カレンダーの ID が空でなく、確かめているか結び付けを送っている間でないとき

**表示条件**: 結び付けるダイアログを開いているとき

**カタログ**: [CalendarLinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--default)、[CalendarLinkDialog の Checking](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--checking)

### インタラクション

#### 1. 押す

1. 予定の API にカレンダーを読めるかを問う。
2. 読めたら「読めた」の状態にする。
3. 読めなかったら「読めない」の状態にする。

## 確かめの結果

**概要**: 読めるかを確かめた結果と、結び付けられなかった理由を示す。読めないときは、読み上げでは警告として扱う。

**値のソース**: 次の文。

| 結果 | 文 |
| --- | --- |
| 読めた | 「読めました。結び付けると、予定の取り込みでこのカレンダーを選べます。」 |
| 共有されていないか、カレンダーが無い | 「このカレンダーを読めません。カレンダーを buddy のサービスアカウントに共有したかと、カレンダーの ID が合っているかを確かめてください。」 |
| ほかの職員に結び付いている | 「このカレンダーは、ほかの職員に結び付いています。」 |
| この職員にほかのカレンダーが結び付いている | 「この職員には、ほかのカレンダーが結び付いています。一覧を読み直してください。」 |
| このカレンダーがこの職員にすでに結び付いている | 「このカレンダーは、この職員にすでに結び付いています。一覧を読み直してください。」 |
| Google に届かない | 「Google カレンダーに届きませんでした。時間をおいて、もう一度確かめてください。」 |
| そのほかの失敗 | 「確かめられませんでした。時間をおいて、もう一度確かめてください。」 |

**活性条件**: 常に活性

**表示条件**: 読めるかを確かめた後か、ダイアログの結び付けるが失敗した後。カレンダーの ID の入力を変えると消す

**カタログ**: [CalendarLinkDialog の Readable](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--readable)、[CalendarLinkDialog の Unreadable](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--unreadable)

## キャンセル

**概要**: 何もせずにダイアログを閉じる。結び付けるダイアログと外すダイアログの両方にある。

**値のソース**: 「キャンセル」

**活性条件**: 送っている間は押せない

**表示条件**: ダイアログを開いているとき

**カタログ**: [CalendarLinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--default)、[CalendarUnlinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarunlinkdialog--default)

### インタラクション

#### 1. 押す

1. ダイアログを閉じ、「一覧」の状態に戻る。外すダイアログでは、Escape キーでも閉じる。

## ダイアログの結び付ける

**概要**: 入れたカレンダーを職員に結び付ける。

**値のソース**: 「結び付ける」。送っている間は、文字の前に回転の印を出す。

**活性条件**: 今の入力で、読めるかを確かめて読めたとき

**表示条件**: 結び付けるダイアログを開いているとき

**カタログ**: [CalendarLinkDialog の Readable](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--readable)、[CalendarLinkDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkdialog--submitting)

### インタラクション

#### 1. 押す

1. 予定の API にカレンダーの結び付けを送る。予定の API は、結び付ける前にもう一度読めるかを確かめる。
2. 成功したら、ダイアログを閉じ、一覧を読み直し、その職員の行にカレンダーの ID を出す。
3. 失敗したら、「読めない」の状態にし、[確かめの結果](#確かめの結果) に理由を出す。入力は残す。

## 外すダイアログ

**概要**: カレンダーを外す前に、外すと起きることを示して確かめる。

**値のソース**: 次の文言。

| 文言 |
| --- |
| 「カレンダーを外しますか」 |

**活性条件**: 常に活性

**表示条件**: 一覧で外すを押した後

**カタログ**: [CalendarUnlinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarunlinkdialog--default)

## 外すときの注意

**概要**: 外すと、何が残り、何が消えるかを示す。

**値のソース**: 次の文言。職員の名前とカレンダーの ID を入れる。

| 文言 |
| --- |
| 「職員 A の Google カレンダー（staff-a@example.com）を外します。取り込んだ予定は buddy に残ります。結び付け直すと、取り込み済みの予定は重ならずに数えられます。」 |

**活性条件**: 常に活性

**表示条件**: 外すダイアログを開いているとき

**カタログ**: [CalendarUnlinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarunlinkdialog--default)

## ダイアログの外す

**概要**: 職員に結び付けたカレンダーを外す。

**値のソース**: 「外す」。取り消せない操作の色にする。送っている間は、文字の前に回転の印を出す。

**活性条件**: 送っている間でないとき

**表示条件**: 外すダイアログを開いているとき

**カタログ**: [CalendarUnlinkDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarunlinkdialog--default)、[CalendarUnlinkDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarunlinkdialog--submitting)、[CalendarUnlinkDialog の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarunlinkdialog--failed)

### インタラクション

#### 1. 押す

1. 予定の API に外すことを送る。
2. 成功したら、ダイアログを閉じ、一覧を読み直す。その職員の行は「結び付けていません」になる。
3. 失敗したら、ダイアログの中に「外せませんでした。時間をおいて、もう一度外してください。」を出す。

## 読み込み中の表示

**概要**: 職員とカレンダーを読んでいることを示す。

**値のソース**: 回転の印と、次の文言。

| 文言 |
| --- |
| 「読み込んでいます」 |

**活性条件**: 常に活性

**表示条件**: 職員とカレンダーとサービスアカウントを読み終えるまで

**カタログ**: [CalendarLinkView の Loading](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--loading)

## 読み込みの失敗の文

**概要**: 一覧を出せないことを示す。読み上げでは警告として扱う。

**値のソース**: 「職員とカレンダーを読み込めませんでした。時間をおいて、読み直してください。」

**活性条件**: 常に活性

**表示条件**: 職員かカレンダーの一覧を読めなかったとき

**カタログ**: [CalendarLinkView の LoadError](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--load-error)

## 読み直す

**概要**: 職員とカレンダーを読み直す。

**値のソース**: 「読み直す」

**活性条件**: 常に活性

**表示条件**: 読み込みに失敗したとき

**カタログ**: [CalendarLinkView の LoadError](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--load-error)

### インタラクション

#### 1. 押す

1. 「読み込み中」の状態にし、職員とカレンダーとサービスアカウントを読み直す。

## サービスアカウントが無いことの文

**概要**: buddy が Google カレンダーを読めない設定であることと、誰に頼むかを示す。

**値のソース**: 「サービスアカウントが設定されていないので、カレンダーを結び付けられません。buddy を動かしている管理者に、Google カレンダーの設定を頼んでください。」

**活性条件**: 常に活性

**表示条件**: 予定の API がサービスアカウントの設定が無いと返したとき

**カタログ**: [CalendarLinkView の NotConfigured](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarlinkview--not-configured)

## 権限が無いことの題

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

- 開くと、ログインした職員の権限を読む。職員の管理の権限が無ければ、ほかの API を呼ばず、「権限が無い」の状態にする。
- 権限があれば、職員の一覧、結び付けたカレンダーの一覧、サービスアカウントのメールアドレスを並べて読み、読み終えるまで「読み込み中」の状態にする。
  - サービスアカウントの設定が無いと返ったときは、「サービスアカウントが無い」の状態にする。
  - 職員かカレンダーの一覧を読めなかったときは、「読み込みの失敗」の状態にする。
- URL の search params は読まない。

### 権限の確かめ

画面の判定は表示のためだけにする。予定の API も、職員の管理の権限が無い職員の要求を 403 で拒む。画面を開いた後に権限を外された職員が操作したときは、ダイアログの中か読み込みの失敗の文の位置に、「この操作をする権限がありません。」を出す。

## 未決

- サービスアカウントは全ての事業所で 1 つなので、ほかの事業所の職員がサービスアカウントに共有したカレンダーも、ID を入れれば読めて結び付けられる。カレンダーの ID を職員のメールアドレスに限るか、ほかの対策を取るかを決める。

- 結び付けと取り込みを職員の管理の権限で許すか、新しい権限を足すかは、PRD の Open Questions のとおり、M4 を始めるまでに決める。この画面は、職員の管理の権限で書いた。
- 共有の手順の文言は、Google カレンダーの今の画面の言葉で書いた。Google が画面の言葉を変えたら直す。
- 職員が Google のアカウントを事業所の外で持っていて、カレンダーを共有できないときの案内は書いていない。PRD の Open Questions のとおり、M4 を始めるまでに決める。
- この画面に、Google カレンダーへの書き出しの状態を出すかは決めていない。Google カレンダーで直された予定と、書き出せなかった予定は、[確かめが要る予定](../schedule-review_確かめが要る予定/index.md) で確かめる。
