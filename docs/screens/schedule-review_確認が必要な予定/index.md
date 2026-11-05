# schedule-review 確認が必要な予定

buddy の予定のうち、Google カレンダーと食い違った予定を確認する画面。  
職員の管理の権限を持つ職員が、buddy の内容で書き直すか、Google カレンダーの内容に合わせる。  
予定は、[カレンダーの連携](../schedule-link_カレンダーの連携/index.md) で職員に結び付けた Google カレンダーと同期する。

| 項目 | 値 |
| --- | --- |
| URL | `/schedule/review` |
| 使う人 | 職員の管理の権限を持つ職員。デフォルトはマネージャー |
| 実装 | `apps/web/src/routes/schedule_.review.tsx`、`apps/web/src/features/calendar/components/CalendarReviewContainer.tsx` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。

画面を描くコンポーネントのうち、実装の行のほかのものは次のとおり。

- `apps/web/src/features/calendar/components/CalendarReviewView.tsx`
- `apps/web/src/features/calendar/components/CalendarReviewTable.tsx`
- `apps/web/src/features/calendar/components/CalendarReviewDialog.tsx`
- `apps/web/src/features/calendar/components/CalendarRewriteDialog.tsx`
- `apps/web/src/features/calendar/components/CalendarAcceptDialog.tsx`
- `apps/web/src/components/page/PageForbiddenMessage.tsx`

## 構成

ヘッダーの左に、メニューのボタンと buddy を置く。  
ヘッダーの右には、アカウントのボタンを置く。  
ヘッダーの下の左端には、画面の間を移るナビゲーションを置く。  
ナビゲーションの見出しと項目、出す職員は、[職員の一覧のナビゲーション](../staff-list_職員の一覧/index.md#ナビゲーション) にある。  
今の画面の要確認に印を付ける。  
幅 768px 以上では、ナビゲーションを幅 224px の開いた形で始め、メニューのボタンで幅 80px のレールと切り替える。  
幅 768px 未満では、ナビゲーションをドロワーにし、閉じた状態で始める。  
ナビゲーション、要確認、取り込みの印は、幅 768px 未満ではドロワーを開くと出る。

ヘッダーの下の、ナビゲーションの右に、ページのタイトル、説明の文、予定の一覧を縦に並べる。  
説明の文は 1 文だけを常に出し、初めてのときだけ要る説明は、見出しの右の ? のヘルプに入れる。  
予定の一覧は、行全体を押せる表にする。  
行を押すと、予定と、選べる操作を入れた予定の確認のダイアログを一覧の上に重ねて出す。  
ダイアログで buddy の内容で書き直すか Google の内容に合わせるを押すと、確認のダイアログに替える。  
ダイアログは URL を持たない。

幅 768px 未満では、予定の一覧の行を、1 行目に予定の日時、2 行目に職員と最後に変わった日時を「・」でつなげた 2 行のリストの行にする。  
理由は長い文なので、幅 768px 未満では一覧に出さず、予定の確認のダイアログだけに出す。  
理由の印は、幅 768px 以上でだけ出る。

=== "一覧"

    開いた直後に、確認が必要な予定を読み終え、1 件以上あったとき。  
    モックは、buddy と Google カレンダーの両方で変わった単発の予定、書けなかった単発の予定、Google カレンダーで消された繰り返しの予定、Google カレンダーで終日にされた単発の予定、buddy でキャンセルした単発の予定を描く。  
    ヘルプの説明は、? を押すと出る。

    <iframe class="mock" title="確認が必要な予定の、一覧" src="mocks/01-list.html"></iframe>
    <a class="mock-open" href="mocks/01-list.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 領域 | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 5 | ボタン | ヘルプ | [ヘルプ](#ヘルプ) |
    | 6 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 7 | 表 | 予定の一覧 | [予定の一覧](#予定の一覧) |
    | 8 | 領域 | 予定の行 | [予定の行](#予定の行) |
    | 9 | ラベル | 予定の日時 | [予定の日時](#予定の日時) |
    | 10 | ラベル | 職員 | [職員](#職員) |
    | 11 | ラベル | 理由 | [理由](#理由) |
    | 12 | ラベル | 最後に変わった日時 | [最後に変わった日時](#最後に変わった日時) |
    | 13 | リンク | 要確認 | [要確認](#要確認) |
    | 14 | リンク | 取り込み | [取り込み](#取り込み) |
    | 15 | ボタン | メニュー | [メニュー](#メニュー) |

=== "空"

    確認が必要な予定を読み終え、1 件も無かったとき。

    <iframe class="mock" title="確認が必要な予定の、空" src="mocks/02-empty.html"></iframe>
    <a class="mock-open" href="mocks/02-empty.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 領域 | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 5 | ボタン | ヘルプ | [ヘルプ](#ヘルプ) |
    | 6 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 7 | メッセージ | 予定が無いことの文 | [予定が無いことの文](#予定が無いことの文) |
    | 8 | リンク | 要確認 | [要確認](#要確認) |
    | 9 | リンク | 取り込み | [取り込み](#取り込み) |
    | 10 | ボタン | メニュー | [メニュー](#メニュー) |

=== "読み込み中"

    開いた直後か読み直した後に、確認が必要な予定を読んでいるとき。

    <iframe class="mock" title="確認が必要な予定の、読み込み中" src="mocks/03-loading.html"></iframe>
    <a class="mock-open" href="mocks/03-loading.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 領域 | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 5 | ボタン | ヘルプ | [ヘルプ](#ヘルプ) |
    | 6 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 7 | 領域 | 読み込み中の表示 | [読み込み中の表示](#読み込み中の表示) |
    | 8 | リンク | 要確認 | [要確認](#要確認) |
    | 9 | リンク | 取り込み | [取り込み](#取り込み) |
    | 10 | ボタン | メニュー | [メニュー](#メニュー) |

=== "読み込みの失敗"

    確認が必要な予定を読めなかったとき。

    <iframe class="mock" title="確認が必要な予定の、読み込みの失敗" src="mocks/04-error.html"></iframe>
    <a class="mock-open" href="mocks/04-error.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 領域 | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページのタイトル | [ページのタイトル](#ページのタイトル) |
    | 5 | ボタン | ヘルプ | [ヘルプ](#ヘルプ) |
    | 6 | ラベル | 説明の文 | [説明の文](#説明の文) |
    | 7 | メッセージ | 読み込みの失敗の文 | [読み込みの失敗の文](#読み込みの失敗の文) |
    | 8 | ボタン | 読み直す | [読み直す](#読み直す) |
    | 9 | リンク | 要確認 | [要確認](#要確認) |
    | 10 | リンク | 取り込み | [取り込み](#取り込み) |
    | 11 | ボタン | メニュー | [メニュー](#メニュー) |

=== "予定の確認"

    予定を Google カレンダーで管理する事業所で、一覧の行を押したとき。  
    モックは、1 行目の、buddy と Google カレンダーの両方で変わった単発の予定を描く。  
    ほかの行は、理由と、出す操作だけが違う。  
    予定を buddy で管理する事業所では、「予定を buddy で管理する事業所の予定の確認」の状態になる。

    <iframe class="mock" title="確認が必要な予定の、予定の確認" src="mocks/05-detail.html"></iframe>
    <a class="mock-open" href="mocks/05-detail.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の確認のダイアログ | [予定の確認のダイアログ](#予定の確認のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログの予定の日時 | [ダイアログの予定の日時](#ダイアログの予定の日時) |
    | 5 | ラベル | ダイアログの職員 | [ダイアログの職員](#ダイアログの職員) |
    | 6 | ラベル | ダイアログの最後に変わった日時 | [ダイアログの最後に変わった日時](#ダイアログの最後に変わった日時) |
    | 7 | ラベル | ダイアログの理由 | [ダイアログの理由](#ダイアログの理由) |
    | 8 | ボタン | 予定を開く | [予定を開く](#予定を開く) |
    | 9 | ボタン | Google の内容に合わせる | [Google の内容に合わせる](#google-の内容に合わせる) |
    | 10 | ボタン | buddy の内容で書き直す | [buddy の内容で書き直す](#buddy-の内容で書き直す) |

=== "書き直すダイアログ"

    予定の確認のダイアログで、buddy の内容で書き直すを押したとき。  
    モックは、1 行目の予定を書き直すときを描く。

    <iframe class="mock" title="確認が必要な予定の、書き直すダイアログ" src="mocks/06-rewrite.html"></iframe>
    <a class="mock-open" href="mocks/06-rewrite.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 書き直すダイアログ | [書き直すダイアログ](#書き直すダイアログ) |
    | 3 | ラベル | 書き直す予定 | [書き直す予定](#書き直す予定) |
    | 4 | ラベル | 書き直すときの注意 | [書き直すときの注意](#書き直すときの注意) |
    | 5 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 6 | ボタン | ダイアログの書き直す | [ダイアログの書き直す](#ダイアログの書き直す) |

=== "書き直しの送信中"

    ダイアログの書き直すを押し、終わるのを待っているとき。  
    ダイアログを閉じられない。

    <iframe class="mock" title="確認が必要な予定の、書き直しの送信中" src="mocks/07-rewriting.html"></iframe>
    <a class="mock-open" href="mocks/07-rewriting.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 書き直すダイアログ | [書き直すダイアログ](#書き直すダイアログ) |
    | 3 | ラベル | 書き直す予定 | [書き直す予定](#書き直す予定) |
    | 4 | ラベル | 書き直すときの注意 | [書き直すときの注意](#書き直すときの注意) |
    | 5 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 6 | ボタン | ダイアログの書き直す | [ダイアログの書き直す](#ダイアログの書き直す) |

=== "書き直しの失敗"

    ダイアログの書き直すを押し、書き直しを始められなかったとき。  
    モックは、ほかの画面ですでに書き直しを始めていたときを描く。  
    ほかの理由は、書き直しの失敗の文だけが違う。

    <iframe class="mock" title="確認が必要な予定の、書き直しの失敗" src="mocks/08-rewrite-error.html"></iframe>
    <a class="mock-open" href="mocks/08-rewrite-error.html" target="_blank">別タブで開く</a>

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

    予定の確認のダイアログで、Google の内容に合わせるを押したとき。  
    モックは、1 行目の予定を合わせるときを描く。

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

    ダイアログの合わせるを押し、終わるのを待っているとき。  
    ダイアログを閉じられない。

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

    ダイアログの合わせるを押し、Google カレンダーの内容に合わせられなかったとき。  
    モックは、Google カレンダーで予定が終日にされていたときを描く。  
    ほかの理由は、合わせるの失敗の文だけが違う。

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

=== "キャンセルした予定の確認"

    一覧の、buddy でキャンセルした単発の予定の行を押したとき。  
    モックは、5 行目の予定を描く。  
    Google の内容に合わせるは出さない。

    <iframe class="mock" title="確認が必要な予定の、キャンセルした予定の確認" src="mocks/12-detail-cancelled.html"></iframe>
    <a class="mock-open" href="mocks/12-detail-cancelled.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の確認のダイアログ | [予定の確認のダイアログ](#予定の確認のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログの予定の日時 | [ダイアログの予定の日時](#ダイアログの予定の日時) |
    | 5 | ラベル | ダイアログの職員 | [ダイアログの職員](#ダイアログの職員) |
    | 6 | ラベル | ダイアログの最後に変わった日時 | [ダイアログの最後に変わった日時](#ダイアログの最後に変わった日時) |
    | 7 | ラベル | ダイアログの理由 | [ダイアログの理由](#ダイアログの理由) |
    | 8 | ボタン | 予定を開く | [予定を開く](#予定を開く) |
    | 9 | ボタン | buddy の内容で書き直す | [buddy の内容で書き直す](#buddy-の内容で書き直す) |

=== "キャンセルした予定を書き直すダイアログ"

    キャンセルした予定の確認のダイアログで、buddy の内容で書き直すを押したとき。  
    モックは、5 行目の予定を書き直すときを描く。  
    送信中と失敗は、「書き直しの送信中」と「書き直しの失敗」の状態と、書き直すときの注意の文だけが違う。

    <iframe class="mock" title="確認が必要な予定の、キャンセルした予定を書き直すダイアログ" src="mocks/13-rewrite-cancelled.html"></iframe>
    <a class="mock-open" href="mocks/13-rewrite-cancelled.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 書き直すダイアログ | [書き直すダイアログ](#書き直すダイアログ) |
    | 3 | ラベル | 書き直す予定 | [書き直す予定](#書き直す予定) |
    | 4 | ラベル | 書き直すときの注意 | [書き直すときの注意](#書き直すときの注意) |
    | 5 | ボタン | キャンセル | [キャンセル](#キャンセル) |
    | 6 | ボタン | ダイアログの書き直す | [ダイアログの書き直す](#ダイアログの書き直す) |

=== "権限が無い"

    ログインした職員が職員の管理の権限を持たないとき。  
    ナビゲーションに、取り込み、要確認、連携と、見出し「職員」と「利用者」のまとまりを出さず、今の画面の印をどの項目にも付けない。

    <iframe class="mock" title="確認が必要な予定の、権限が無い" src="mocks/14-forbidden.html"></iframe>
    <a class="mock-open" href="mocks/14-forbidden.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 領域 | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ボタン | アカウント | [アカウント](#アカウント) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | 権限が無いことのタイトル | [権限が無いことのタイトル](#権限が無いことのタイトル) |
    | 5 | ラベル | 権限が無いことの説明 | [権限が無いことの説明](#権限が無いことの説明) |
    | 6 | ボタン | 予定のカレンダーへ | [予定のカレンダーへ](#予定のカレンダーへ) |
    | 7 | ボタン | メニュー | [メニュー](#メニュー) |

=== "予定を buddy で管理する事業所の予定の確認"

    予定を buddy で管理する事業所で、一覧の行を押したとき。  
    この事業所では Google カレンダーの内容に合わせられないので、Google の内容に合わせるを出さない。  
    事業所がどちらで予定を管理するかが分かるまでも、この状態と同じく出さない。  
    モックは、「予定の確認」の状態と同じ、1 行目の予定を描く。

    <iframe class="mock" title="確認が必要な予定の、予定を buddy で管理する事業所の予定の確認" src="mocks/15-detail-buddy-primary.html"></iframe>
    <a class="mock-open" href="mocks/15-detail-buddy-primary.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | 覆い | 覆い | [覆い](#覆い) |
    | 2 | ダイアログ | 予定の確認のダイアログ | [予定の確認のダイアログ](#予定の確認のダイアログ) |
    | 3 | ボタン | 閉じる | [閉じる](#閉じる) |
    | 4 | ラベル | ダイアログの予定の日時 | [ダイアログの予定の日時](#ダイアログの予定の日時) |
    | 5 | ラベル | ダイアログの職員 | [ダイアログの職員](#ダイアログの職員) |
    | 6 | ラベル | ダイアログの最後に変わった日時 | [ダイアログの最後に変わった日時](#ダイアログの最後に変わった日時) |
    | 7 | ラベル | ダイアログの理由 | [ダイアログの理由](#ダイアログの理由) |
    | 8 | ボタン | 予定を開く | [予定を開く](#予定を開く) |
    | 9 | ボタン | buddy の内容で書き直す | [buddy の内容で書き直す](#buddy-の内容で書き直す) |

## メニュー

**概要**: ナビゲーションの形を切り替える。  
幅 768px 未満では、ナビゲーションのドロワーを開く。

**値のソース**: 3 本の横線のアイコン。  
読み上げる名前は「メニュー」。

**活性条件**: 常に活性

**表示条件**: 常に、ヘッダーの左端に出す。

**カタログ**: [SiteLayoutContainer の Mobile](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-sitelayoutcontainer--mobile)

### インタラクション

#### 1. 幅 768px 以上で押す

1. ナビゲーションを、開いた形からレールに切り替える。
  - もう一度押すと開いた形に戻る。

#### 2. 幅 768px 未満で押す

1. 左端からナビゲーションのドロワーが開く。

## ナビゲーション

**概要**: 予定、照合、職員、利用者の画面の間を移る。

**値のソース**: 見出しと項目、出す職員は、[職員の一覧のナビゲーション](../staff-list_職員の一覧/index.md#ナビゲーション) にある。  
この画面では「要確認」に今の画面の印を付ける。

**活性条件**: 常に活性

**表示条件**: 常に、ヘッダーの下の左端に出す。  
幅 768px 以上では、この画面では開いた形で始める。  
幅 768px 未満では、メニューのボタンで開いたドロワーの中に出す。  
モックは、職員の管理の権限を持つ職員の画面を描く。

**カタログ**: [SiteNav の Manager](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-sitenav--manager)

### インタラクション

#### 1. 「カレンダー」を押す

1. 予定のカレンダーへ移る。

#### 2. 「連携」を押す

1. カレンダーの連携の画面へ移る。

#### 3. 「照合」を押す

1. 照合の画面へ移る。

#### 4. 「職員」「部署とチーム」「利用者」を押す

1. 職員の一覧、部署とチーム、利用者の一覧へ移る。

#### 5. 幅 768px 未満で、閉じるボタンか覆いを押すか、Escape キーを押す

1. ナビゲーションのドロワーが閉じ、フォーカスがメニューのボタンに戻る。

## 要確認

**概要**: 確認が必要な予定の件数を示し、確認が必要な予定の画面を開く。

**値のソース**: 鈴のアイコンと「要確認」。  
確認が必要な予定の件数の印を、開いた形では項目の右端に、レールではアイコンの右上に出す。  
0 件のとき、一覧を読み込んでいるとき、一覧の取得に失敗したときは印を出さない。  
読み上げる名前は、「要確認 3 件」のように件数を入れる。

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つ職員にだけ、ナビゲーションの「取り込み」と「連携」の間に出す。  
モックは、職員の管理の権限を持つ職員の画面を描く。

**カタログ**: [CalendarReviewBadge の WithReview](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewbadge--with-review)、[CalendarReviewBadge の NoReview](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewbadge--no-review)

### インタラクション

#### 1. 押す

1. この画面を開き直す。

## 取り込み

**概要**: 予定の取り込みの画面を開く。

**値のソース**: ダウンロードのアイコンと「取り込み」。

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つ職員にだけ、ナビゲーションの「カレンダー」と「要確認」の間に出す。  
モックは、職員の管理の権限を持つ職員の画面を描く。

**カタログ**: [SiteNav の Manager](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-sitenav--manager)

### インタラクション

#### 1. 押す

1. 予定の取り込みの画面へ移る。

## アカウント

**概要**: ログインしている職員を示し、名前、自分の情報、ログアウトを入れたメニューを開く。

**値のソース**: 職員の名前の先頭の 1 文字を入れた丸と、職員の名前を並べたボタン。  
幅 768px 未満では、丸だけを出す。  
読み上げる名前は「アカウント（<職員の名前>）」にする。  
幅 768px 未満で名前を隠しても、読み上げる名前は変えない。

**活性条件**: 常に活性

**表示条件**: ログインしているとき

**カタログ**: [ViewerMenu の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-viewermenu--default)

### インタラクション

#### 1. 押す

1. 職員の名前、自分の情報のリンク、ログアウトのボタンを入れたメニューを、ボタンの下に開く。
2. もう一度押すか、メニューの外を押すか、Escape キーを押すと閉じる。

#### 2. メニューの「自分の情報」を押す

1. メニューを閉じ、[自分の情報](../account-profile_自分の情報/index.md) へ移る。

## ログアウト

**概要**: ログアウトする。

**値のソース**: 「ログアウト」

**活性条件**: 常に活性

**表示条件**: アカウントのメニューを開いている間。  
ログインしているとき

**カタログ**: [ViewerMenu の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-viewermenu--default)

### インタラクション

#### 1. 押す

1. ログアウトし、`/` へ移る。
  - ログインしていないので、`/` からそのままログインの画面へ移る。

## ページのタイトル

**概要**: 何の画面かを示す。

**値のソース**: 「確認が必要な予定」

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 説明の文

**概要**: 一覧に何が出るかを示す。  
選べる操作は予定の確認のダイアログのボタンが、操作で起きることは確認のダイアログが示すので、ここでは繰り返さない。

**値のソース**: 次の文言。

| 文言 |
| --- |
| 「Google カレンダーと食い違った予定です。」 |

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## ヘルプ

**概要**: 一覧に出ない予定があることを、初めてのときだけ要る説明として示す。

**値のソース**: ? のボタン。  
読み上げる名前は「ヘルプ」。  
押すと、見出しの下に次の説明を出す。

| 文言 |
| --- |
| 「片方だけで変わった予定は、変わった側に合わせるので、ここには出ません。」 |

**活性条件**: 常に活性

**表示条件**: 職員の管理の権限を持つとき。  
見出し「確認が必要な予定」の右に出す

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

### インタラクション

#### 1. 押す

1. 見出しの下に説明を出す。
  - 説明の外を押すか、Escape キーを押すと閉じる。

## 予定の一覧

**概要**: Google カレンダーと食い違った予定ごとに、日時、職員、理由、最後に変わった日時を示す。  
行を押すと、予定の確認のダイアログを開く。

**値のソース**: 「予定の日時」「職員」「理由」「最後に変わった日時」のカラムと、右端の「›」。  
行は、書き出しの状態が新しく変わった順に並べる。  
予定のタイトル、利用者名、カレンダーの ID は、個人の情報を出さないために出さない。  
行ごとのボタンは置かない。

幅 768px 未満では、1 行目に予定の日時を、2 行目に職員と最後に変わった日時を「・」でつなげて出し、理由は出さない。  
職員と最後に変わった日時は折り返さない。

buddy で作り、変え、キャンセルした予定は、予定の職員が結び付けた Google カレンダーに書き出す。  
Google カレンダーで職員が変えた予定は、数分のうちに buddy の予定に当てる。  
片方だけで変わった予定は、変わった側に合わせ、この一覧に出さない。

一覧に出る予定は、次のとおり。

- buddy と Google カレンダーの両方で予定が変わったときと、Google カレンダーで予定が消されていたときは、どちらの変更も消さないように止め、一覧に出す。
  - この予定は、解くまで buddy で予定を変えても書き出さず、Google カレンダーの変更も当てない。
  - Google カレンダーで消された予定を buddy でキャンセルしたときは、一覧に出さない。職員を替えたときも出さず、新しい職員のカレンダーに作る。
  - Google カレンダーで変えられた予定を buddy でキャンセルしたときは、一覧に出す。キャンセルは Google の内容に戻せないので、buddy の内容で書き直して Google カレンダーの予定を消すことだけができる。
- Google カレンダーでの変更を buddy の予定として取り込めないときも、一覧に出す。
  - 取り込めないのは、終日の予定、タイトルの利用者が見つからない予定、繰り返しの予定そのものの変更である。
  - 職員が Google カレンダーで取り込める形に直すと、buddy の予定に当て、一覧から消す。
  - 繰り返しの予定そのものの規則、時刻、タイトルを Google カレンダーで変えても、buddy に当てない。一覧の繰り返しの予定は、buddy の内容で書き直すか、職員に Google カレンダーで元に戻してもらうことだけができる。
- カレンダーに書く権限が無いときと、Google に届かず書き直しの上限に達したときも、一覧に出す。
  - この予定は、buddy で予定を変えると書き出し直す。

**活性条件**: 常に活性

**表示条件**: 確認が必要な予定を読み終え、1 件以上あったとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 予定の行

**概要**: 1 件の予定を示し、押すと予定の確認のダイアログを開く。

**値のソース**: 予定の日時、職員、理由、最後に変わった日時と、右端の「›」。  
予定の日時は折り返さない。

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

### インタラクション

#### 1. 押す

1. 「予定の確認」の状態にする。
  - buddy でキャンセルした単発の予定の行では、「キャンセルした予定の確認」の状態にする。

## 予定の日時

**概要**: どの予定かを、日付と時刻で示す。

**値のソース**: 単発の予定は「2026/11/04（水）09:00〜09:29」の形で出す。  
終了が翌日の予定は、終了の時刻の前に「翌」を付け、「2026/11/13（金）22:00〜翌 01:00」の形で出す。  
繰り返しの予定は、最初の回の日付に「から毎回」を付け、「2026/11/03（火）から毎回 10:00〜11:00」の形で出す。

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 職員

**概要**: 予定の職員を示す。  
予定は、この職員に結び付けた Google カレンダーと同期する。

**値のソース**: 職員の名前。

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 理由

**概要**: 確認が必要な理由を、何が起きたかの 1 文で示す。  
次にすることは、予定の確認のダイアログのボタンと、[ダイアログの理由](#ダイアログの理由) の続きの文が示すので、一覧では繰り返さない。

**値のソース**: 次の文。

| 理由 | 文 |
| --- | --- |
| buddy と Google カレンダーの両方で単発の予定が変わった | 「buddy と Google カレンダーの両方で予定が変わりました。」 |
| buddy でキャンセルした単発の予定が、Google カレンダーで変わっていた | 「buddy でキャンセルした予定が、Google カレンダーで変わっていました。」 |
| buddy と Google カレンダーの両方で繰り返しの予定が変わった | 「buddy と Google カレンダーの両方で繰り返しの予定が変わりました。」 |
| Google カレンダーでの変更を buddy の予定として取り込めない | 「Google カレンダーでの変更を、buddy の予定として取り込めません。」 |
| Google カレンダーで予定が消されていた | 「Google カレンダーで予定が見つかりません。」 |
| カレンダーに書く権限が無い | 「Google カレンダーに書けません。」 |
| Google カレンダーが予定の内容を受け付けなかった | 「Google カレンダーが予定の内容を受け付けませんでした。」 |
| Google に届かず、書き直しの上限に達した | 「Google カレンダーに届かず、書き出せませんでした。」 |
| そのほか | 「Google カレンダーに書き出せませんでした。」 |

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき。  
幅 768px 未満では出さず、予定の確認のダイアログの理由で示す

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 最後に変わった日時

**概要**: 確認が必要な状態に最後に変わった日時を示す。

**値のソース**: 書き出しの状態が最後に変わった日時を、デバイスの時間帯で「2026/10/22 10:00」の形で出す。

**活性条件**: 常に活性

**表示条件**: 予定の一覧を出すとき

**カタログ**: [CalendarReviewView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewview--default)

## 予定の確認のダイアログ

**概要**: 一覧で押した予定の日時、職員、理由を示し、その予定で選べる操作を並べる。

**値のソース**: タイトルは「食い違った予定」。  
本文に、予定の日時、職員、最後に変わった日時、理由、予定を開くを縦に並べる。  
フッターの右に、その予定で選べる操作を、Google の内容に合わせる、buddy の内容で書き直すの順に並べる。  
どちらも主ボタンの色にしない。  
どちらを選んでも片方の変更が消えるので、片方を勧めないためである。

**活性条件**: 常に活性

**表示条件**: 一覧で予定の行を押した後

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)

## 閉じる

**概要**: 何も選ばずに、予定の確認のダイアログを閉じる。

**値のソース**: 閉じるのアイコン。  
読み上げでは「閉じる」。  
ダイアログの右上に出す。

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログを開いているとき

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)

### インタラクション

#### 1. 押すか、Escape キーを押す

1. ダイアログを閉じ、「一覧」の状態に戻る。

## ダイアログの予定の日時

**概要**: どの予定かを、日付と時刻で示す。

**値のソース**: 「予定の日時」の見出しと、[予定の日時](#予定の日時) と同じ形の値。

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログを開いているとき

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)

## ダイアログの職員

**概要**: 予定の職員を示す。

**値のソース**: 「職員」の見出しと、職員の名前。

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログを開いているとき

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)

## ダイアログの最後に変わった日時

**概要**: 確認が必要な状態に最後に変わった日時を示す。

**値のソース**: 「最後に変わった日時」の見出しと、[最後に変わった日時](#最後に変わった日時) と同じ形の値。

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログを開いているとき

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)

## ダイアログの理由

**概要**: 確認が必要な理由と、ボタンで足りないときに職員が次にすることを示す。

**値のソース**: [理由](#理由) の文の後に、次の続きの文をつなげる。  
続きの文が無い理由は、理由の文だけを出す。  
ボタンが示す、合わせる、書き直す、予定を開くの操作は、続きの文で繰り返さない。

| 理由 | 続きの文 |
| --- | --- |
| buddy でキャンセルした単発の予定が、Google カレンダーで変わっていた | 「書き直すと Google カレンダーの予定を消すので、消してよいかを職員に確認してください。」 |
| buddy と Google カレンダーの両方で繰り返しの予定が変わった | 「Google カレンダーで元に戻すときは、職員に頼んでください。」 |
| Google カレンダーでの変更を buddy の予定として取り込めない | 「終日の予定、タイトルの利用者が見つからない予定、繰り返しの予定そのものの変更が当たります。Google カレンダーで直すときは、職員に頼んでください。」 |
| Google カレンダーで予定が消されていた | 「予定が消されたか、カレンダーの共有が外れていないかを、職員に確認してください。」 |
| カレンダーに書く権限が無い | 「カレンダーが「予定の変更」の権限で共有されているかを、職員に確認してください。」 |

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログを開いているとき

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)

## 予定を開く

**概要**: 予定の詳細を開き、buddy の内容を確認する。

**値のソース**: 「予定を開く」。  
文字だけのボタンにする。

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログで、単発の予定のとき。  
繰り返しの予定には出さない

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)

### インタラクション

#### 1. 押す

1. その予定の詳細（`/schedule/{予定の ID}`）へ移る。

## Google の内容に合わせる

**概要**: buddy の予定を Google カレンダーの内容に合わせる、確認のダイアログを開く。

**値のソース**: 「Google の内容に合わせる」

**活性条件**: 常に活性

**表示条件**: 事業所が予定を Google カレンダーで管理していて、予定の確認のダイアログで、単発の予定が buddy と Google カレンダーの両方で変わったか、Google カレンダーで予定が見つからないとき。  
繰り返しの予定、buddy でキャンセルした予定、書けなかった予定、buddy の予定として取り込めない予定には出さない。  
予定を buddy で管理する事業所では、どの予定にも出さず、合わせるダイアログも開けない。  
その事業所では、Google カレンダーの内容に合わせる操作を受け付けないためである。  
事業所がどちらで予定を管理するかが分かるまでも出さない

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)、[CalendarReviewContainer の GooglePrimary](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewcontainer--google-primary)、[CalendarReviewContainer の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewcontainer--default)

### インタラクション

#### 1. 押す

1. 「合わせるダイアログ」の状態にする。

## buddy の内容で書き直す

**概要**: Google カレンダーの予定を buddy の内容で書き直す、確認のダイアログを開く。

**値のソース**: 「buddy の内容で書き直す」

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログを開いているとき。  
全ての予定に出す

**カタログ**: [CalendarReviewDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--default)、[CalendarReviewDialog の Cancelled](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarreviewdialog--cancelled)

### インタラクション

#### 1. 押す

1. 「書き直すダイアログ」の状態にする。
  - buddy でキャンセルした単発の予定では、「キャンセルした予定を書き直すダイアログ」の状態にする。

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

**概要**: 一覧を出せないことを示す。  
読み上げでは警告として扱う。

**値のソース**: 「確認が必要な予定を読み込めませんでした。時間をおいて、読み直してください。」。  
画面を開いた後に権限を外されたときは「この操作をする権限がありません。」

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

**表示条件**: 予定の確認のダイアログ、書き直すダイアログ、合わせるダイアログのどれかを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)、[CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)

### インタラクション

#### 1. 押す

1. 予定の確認のダイアログでは、ダイアログを閉じ、「一覧」の状態に戻る。
2. 書き直すダイアログと合わせるダイアログでは、何も変えずに、開く前の予定の確認のダイアログに戻る。

## 書き直すダイアログ

**概要**: Google カレンダーの予定を buddy の内容で書き直す前に、Google カレンダーでの変更が消えることを示して確認する。

**値のソース**: タイトルは次の文言。

| 文言 |
| --- |
| 「buddy の内容で書き直しますか」 |

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログで buddy の内容で書き直すを押した後

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)

## 書き直す予定

**概要**: どの予定を書き直すかを示す。

**値のソース**: 一覧の行の予定の日時と職員の名前を「、」でつなぎ、「2026/11/04（水）09:00〜09:29、青木 一郎」の形で出す。

**活性条件**: 常に活性

**表示条件**: 書き直すダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)

## 書き直すときの注意

**概要**: 書き直すと何が消えるかを示す。  
取り消せない操作の確認なので、毎回出す。

**値のソース**: 次の文言。

| 予定 | 文言 |
| --- | --- |
| buddy でキャンセルした単発の予定 | 「buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。」 |
| そのほかの予定 | 「Google カレンダーの予定のタイトルと日時を buddy の内容にします。Google カレンダーで直したタイトルと日時は消えます。消された予定は作り直します。」 |

**活性条件**: 常に活性

**表示条件**: 書き直すダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)、[CalendarRewriteDialog の Cancelled](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--cancelled)

## 書き直しの失敗の文

**概要**: 書き直しを始められなかったことと、次にすることを示す。  
読み上げでは警告として扱う。

**値のソース**: 次の文。

| 理由 | 文 |
| --- | --- |
| ほかの画面ですでに書き直しを始めたか、書き出し終えた | 「この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。」 |
| 画面を開いた後に権限を外された | 「この操作をする権限がありません。」 |
| そのほかの失敗 | 「書き直せませんでした。時間をおいて、もう一度書き直してください。」 |

**活性条件**: 常に活性

**表示条件**: ダイアログの書き直すが失敗した後。  
ダイアログを閉じると消す

**カタログ**: [CalendarRewriteDialog の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--failed)

## キャンセル

**概要**: 書き直さず、合わせずにダイアログを閉じる。

**値のソース**: 「キャンセル」

**活性条件**: 書き直しか合わせるを送っている間は押せない

**表示条件**: 書き直すダイアログか合わせるダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)、[CalendarRewriteDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--submitting)、[CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)

### インタラクション

#### 1. 押すか、Escape キーを押す

1. 何も変えずに、開く前の予定の確認のダイアログに戻る。
  - 送っている間は、Escape キーでも閉じない。

## ダイアログの書き直す

**概要**: 予定を、Google カレンダーの変更を比べずに buddy の内容で書き直す。

**値のソース**: 「書き直す」。  
Google カレンダーでの変更が消えるので、データを失う操作の赤い色にする。  
送っている間は、文字の前に回転の印を出す。

**活性条件**: 送っている間でないとき

**表示条件**: 書き直すダイアログを開いているとき

**カタログ**: [CalendarRewriteDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--default)、[CalendarRewriteDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendarrewritedialog--submitting)

### インタラクション

#### 1. 押す

1. 「書き直しの送信中」の状態にし、Google カレンダーの予定を buddy の内容で書き直す。
2. 成功したら、ダイアログを閉じ、一覧を読み直す。
  - その予定は一覧から消える。
  - 数十秒のうちに Google カレンダーに書く。
  - Google カレンダーで消された予定は作り直す。
  - buddy でキャンセルした単発の予定は、Google カレンダーの予定を消す。
3. 失敗したら、「書き直しの失敗」の状態にし、[書き直しの失敗の文](#書き直しの失敗の文) に理由を出す。
  - 一覧も読み直す。

## 合わせるダイアログ

**概要**: buddy の予定を Google カレンダーの内容に合わせる前に、buddy での変更が消えることを示して確認する。

**値のソース**: タイトルは次の文言。

| 文言 |
| --- |
| 「Google カレンダーの内容に合わせますか」 |

**活性条件**: 常に活性

**表示条件**: 予定の確認のダイアログで Google の内容に合わせるを押した後

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

**概要**: Google カレンダーの内容に合わせられなかったことと、次にすることを示す。  
読み上げでは警告として扱う。

**値のソース**: 次の文。

| 理由 | 文 |
| --- | --- |
| ほかの画面ですでに書き直しを始めたか、合わせ終えた | 「この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。」 |
| Google カレンダーの内容に合わせられない予定 | 「この予定は、Google カレンダーの内容に合わせられません。buddy の内容で書き直してください。」 |
| Google カレンダーの予定を buddy の予定として取り込めない | 「Google カレンダーの予定を、buddy の予定として取り込めません。終日の予定か、タイトルの利用者が見つからない予定です。buddy の内容で書き直すか、Google カレンダーで直すよう職員に頼んでください。」 |
| Google カレンダーを読めない | 「Google カレンダーを読めません。カレンダーの共有が外れていないかを、職員に確認してください。」 |
| 事業所の Google カレンダーの設定が無い | 「この事業所では、まだ Google カレンダーを使う準備ができていません。事業所の管理者に、設定を頼んでください。」 |
| 画面を開いた後に権限を外された | 「この操作をする権限がありません。」 |
| そのほかの失敗 | 「Google カレンダーの内容に合わせられませんでした。時間をおいて、もう一度試してください。」 |

**活性条件**: 常に活性

**表示条件**: ダイアログの合わせるが失敗した後。  
ダイアログを閉じると消す

**カタログ**: [CalendarAcceptDialog の Failed](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--failed)

## ダイアログの合わせる

**概要**: Google カレンダーの今の予定を読み、buddy の予定をその内容にする。

**値のソース**: 「合わせる」。  
buddy での変更が消えるので、データを失う操作の赤い色にする。  
送っている間は、文字の前に回転の印を出す。

**活性条件**: 送っている間でないとき

**表示条件**: 合わせるダイアログを開いているとき

**カタログ**: [CalendarAcceptDialog の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--default)、[CalendarAcceptDialog の Submitting](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-calendar-calendaracceptdialog--submitting)

### インタラクション

#### 1. 押す

1. 「合わせるの送信中」の状態にし、Google カレンダーの今の予定を読んで、buddy の予定をその内容にする。
2. 成功したら、ダイアログを閉じ、一覧と予定を読み直す。
  - その予定は一覧から消え、予定のカレンダーに Google カレンダーの日時とタイトルで出る。
  - Google カレンダーで消された予定は、キャンセルした予定になる。
3. 失敗したら、「合わせるの失敗」の状態にし、[合わせるの失敗の文](#合わせるの失敗の文) に理由を出す。
  - 一覧も読み直す。

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

- ログインした職員が職員の管理の権限を持たなければ、「権限が無い」の状態にする。
- 権限があれば、確認が必要な予定を読み終えるまで、「読み込み中」の状態にする。
  - 1 件以上あれば「一覧」、1 件も無ければ「空」の状態にする。
  - 読めなかったときは、「読み込みの失敗」の状態にする。
- 同時に事業所を読み、予定を Google カレンダーで管理する事業所のときだけ、予定の確認のダイアログに [Google の内容に合わせる](#google-の内容に合わせる) を出す。
  - 事業所を読み終える前と、読めなかったときは出さない。
- URL の search params は読まない。

### 変えた後の表示

- buddy の内容で書き直すか、Google の内容に合わせると、その予定は一覧から消え、ナビゲーションの要確認の件数が減る。
- 職員のカレンダーの結び付けを外しても、そのカレンダーの予定は一覧に残る。
  - buddy の内容で書き直しても、外したカレンダーの予定は消さず、書き直さない。一覧から消すだけである。
  - キャンセルしていない予定は、職員が別のカレンダーを結び付け直していれば、そのカレンダーに buddy の内容で作る。
  - 一覧と書き直すダイアログは、結び付けを外したかを示さない。
- 書き出しと同期の処理の流れは、[Google カレンダーとの連携の Design Doc の Google カレンダーへの書き出し](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/internal/features/calendar/DesignDoc.md#google-カレンダーへの書き出し) と [Google カレンダーとの同期](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/internal/features/calendar/DesignDoc.md#google-カレンダーとの同期) にある。

### 権限の確認

職員の管理の権限を持たない職員には、「権限が無い」の状態を出し、予定の一覧を出さない。  
画面を開いた後に権限を外された職員が操作したときは、読み込みの失敗の文、書き直しの失敗の文、合わせるの失敗の文の位置に、「この操作をする権限がありません。」を出す。

## 未決

### 決まっていないこと

- 繰り返しの予定の行から、繰り返しの予定の内容を確認する画面へ、どう移るか。
  - 今の動き: 繰り返しの予定の行には、予定を開くを出さない。
  - 決める人: 開発者
  - 期限: 繰り返しの予定の内容を見る画面を作るとき
