# buddy のデザインシステムのコンポーネント

デザインシステムの文書のうち、画面の枠と、packages/ui のコンポーネントとパターンの選び方と規則を決める文書。  
原則と画面を作るときの手順は [DESIGN.md](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/DESIGN.md) にある。props と振る舞いは書かず、コンポーネントのコードと story を参照先にする。

## 画面の枠

ログインした後の画面は、上端のヘッダー、左端のナビゲーション、画面の中身で組む。  
予定のカレンダーだけ、ナビゲーションと画面の中身の間に左の欄を置く。  
画面の間を移るリンクは、ナビゲーションに置く。  
画面の中の操作の欄（ミニカレンダーと職員の絞り込み）は、左の欄に置く。  
リンクと操作の欄を別の欄に分けるのは、1 つの欄にまとめると、移動と操作の区別が付かなくなるためである。

- 参考: Outlook と Microsoft Teams。左端のナビゲーションに機能のアイコンと名前を並べ、その右に、機能ごとの欄（Outlook ならミニカレンダー）を別に置く。
- 参考: Material Design 3 のナビゲーションレール。開くと見出し付きのリストになり、たたむとアイコンの下に名前を置いた細い列になる。

サイトの枠の要素ごとの決まりは次のとおり。

- ヘッダーは、左にメニューのボタンとサイトの名前を、右にアカウントのボタンを置く。
  - ほかの操作を置かない。
- ナビゲーションは、機能の名前を見出しにして、その下に画面のアイコンと名前を並べる。
  - 見出しと項目の並びと、項目を出す職員は、[職員の一覧の画面仕様書のナビゲーション](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/staff-list_職員の一覧/index.md#ナビゲーション) にある。
  - 今の画面に、面の色の印と `aria-current` を付ける。
- 幅 768px 以上では、メニューのボタンで、ナビゲーションを開いた形（幅 224px）とたたんだレール（幅 80px）に切り替える。
  - レールでは見出しを出さず、アイコンの下に名前を置く。機能の間を区切り線で分ける。
  - 予定のカレンダーはレールで始め、ほかの画面は開いた形で始める。
  - 768px 未満では `Drawer` に入れ、閉じた状態で始める。
- レールの名前は、5 文字以内にする。
  - 14px の文字で、幅 80px のレールに左右の余白を残して収まるのは 5 文字までである。
  - 正式な名前が 6 文字以上の項目には、レールでだけ出す 5 文字以内の短い名前を業務の語から決める。開いた形では正式な名前を出す。
  - 読み上げる名前は、短い名前の後に括弧で正式な名前を続ける（例: 「所属（部署とチーム）」）。音声で操作する人が、見える名前で指せるようにするためである。
  - 名前を 2 行に折り返す形と、レールを広げる形は採らない。項目の高さがそろわなくなり、レールの幅を変えることになるためである。
- 要確認の項目には、確認が必要な予定の件数を印で示す。
  - 0 件では印を出さない。
  - 読み上げる名前に件数を入れる。
- メニューのボタンは、ナビゲーションの形を切り替え、768px 未満ではドロワーを開く。
  - `aria-expanded` と `aria-controls` を付ける。
- 左の欄は、予定のカレンダーだけに置き、画面の中の操作の欄だけを入れる。
  - 幅は 288px にし、内側の余白を 16px 以上取る。
  - カレンダーのツールバーのボタンで開閉する。幅 768px 以上では開いた状態で始め、たたむと画面の中身を広げる。
  - 768px 未満では `Drawer` に入れ、閉じた状態で始める。
- アカウントのボタンは、職員の名前の先頭の 1 文字を入れた丸と、職員の名前を並べる。
  - 768px 未満では丸だけにする。
  - 押すと、名前とログアウトを入れたメニューをボタンの下に開き、外を押すか Esc で閉じる。

## コンポーネントの選び方

コンポーネントは、BCD Design の Base（基本のコンポーネント）と Case（場面を持つコンポーネント）だけを packages/ui に置く。  
`src/icons/` には、packages/ui のコンポーネントが中で使うアイコン（SVG を描くコンポーネント）を置く。  
アイコンは `index.ts` から export せず、カタログにも載せない。  
`src/hooks/` には、コンポーネントの外でも使う hook（外を押すと閉じる `useDismiss`、`desktop:` の幅かを返す `useIsDesktop`）を置き、`index.ts` から export する。  
apps/web の画面だけが使うアイコンは、`apps/web/src/assets/icons/` の SVG を使う。

| コンポーネント | 使う場面 | 使わない場面 | キーボード |
| --- | --- | --- | --- |
| [`Button`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-button--docs) | 操作を 1 つ実行する。`variant="danger"`（塗りの赤）は、確認のダイアログ（何が失われるかを示して確定する入力のダイアログを含む）でデータを失う操作を確定するボタンだけに使う。その確認のダイアログを開く起点のボタンは `variant="destructive"`（白い面に赤い文字）にする | 画面を移る（`Link` に `buttonClassName` を渡す） | Tab で移り、Enter と Space で押す。押せない間は `aria-disabled` にし、フォーカスは受ける。読み込みの間は押しても実行しない |
| [`Modal`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-modal--docs) | 今の画面の上で、予定の詳細や入力を行い、閉じて元の画面に戻る | 完了の通知、ナビゲーション | 開くとタイトルにフォーカスが移り、タイトルが無ければ × に移る。Tab はダイアログの中だけを回る。Esc で閉じる要求（`onCloseRequest`）を出し、閉じるかは呼び出す側が決める。閉じると、開いたボタンにフォーカスが戻る |
| [`Dialog`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-dialog--docs) | 短い入力を 1 つ受けるか、少ない選択肢から操作を 1 つ選び、元の画面に戻る。入力と確認は、パターンの `InputDialog` と `ConfirmDialog` で組む | 項目の多い入力（`Modal` を使う）、完了の通知 | 開くと `initialFocusRef` の要素にフォーカスが移り、渡さなければ最初の押せる要素に移る。Tab はダイアログの中だけを回る。Esc と覆いで `onClose` を呼び、送っている間は呼ばない。閉じると、開く前の要素にフォーカスが戻る |
| [`RowTable`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-rowtable--docs) | 名前と補足の値を持つ対象を並べ、行を押して詳細へ移るか選ぶか、行ごとに操作を置く。幅 768px 未満では 2 行のリストにする | 列を見比べる表、数の集計の表（`Table` を使う） | Tab で行の名前のリンクかボタンに移り、Enter で押す。行の操作を置いた行は、操作のボタンに移る。ボタンは Space でも押せる。行そのものはフォーカスを受けない |
| [`ActionMenu`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-actionmenu--docs) | 一覧の行に、2 つ以上の操作を「…」のメニューで置く | 操作が 1 つだけ（`Button` を置く）、選んだ値を保つ選択（`SegmentedControl` か選択肢のカード）、ナビゲーション | Tab で「…」のボタンに移り、Enter と Space で開く。開くと最初の項目にフォーカスが移り、Tab で次の項目に移る。Enter と Space で項目を選ぶと閉じる。`staysOpenUntilSettled` の項目は、送った結果が返ってから閉じ、「…」のボタンにフォーカスを戻す。Esc で閉じ、「…」のボタンにフォーカスが戻る。外を押すと閉じる |
| [`HelpToggle`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-helptoggle--docs) | 見出しの右に ? を置き、見出しが何を指すかを 1〜2 文で補う | 手順の説明（`MoreText` を使う）、エラーと注意 | Enter と Space で開閉し、Esc と外を押すと閉じる。ダイアログの中で Esc を押しても、ダイアログは閉じない。`aria-expanded` で開閉を、`aria-controls` で説明を伝える |
| [`MoreText`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-moretext--docs) | 初めてのときだけ要る手順や説明を、「詳しく」で開く | 見出しの短い補い（`HelpToggle` を使う）、操作に欠かせない説明、エラーと注意（常に見える文で出す） | Enter と Space で開閉する。`aria-expanded` で開閉を、`aria-controls` で続きの説明を伝える |
| [`Drawer`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-drawer--docs) | 幅 768px 未満で、画面の枠のナビゲーションと、予定のカレンダーの左の欄（日付と絞り込み）を、左端から開閉する | 予定の詳細や入力（`Modal` を使う）、幅 768px 以上のナビゲーションと左の欄（画面の枠の中に置く） | 開くとタイトルにフォーカスが移る。Tab はドロワーの中だけを回る。Esc で閉じる要求（`onCloseRequest`）を出し、閉じるかは呼び出す側が決める。閉じると、開いたボタンにフォーカスが戻る。開くボタンには `aria-expanded` と `aria-controls` を付ける |
| [`SegmentedControl`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-segmentedcontrol--docs) | 2 から 4 個の選択肢から 1 つを選び、すぐに表示を切り替える（表示の単位、予定の種類） | 選択肢が 5 個以上、送信するまで反映しない入力、同じ主題の内容を観点で切り替える（タブを使う） | Tab で選ばれている選択肢に移り、← と →（↑ と ↓）で選び直す |
| [`Table`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-table--docs) | 同じ項目を持つ行を並べる | 項目名と値の組（`dl` を使う） | コンポーネントの操作はない。見出しのセルは `th` にする |
| [`Loading`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-loading--docs) | 画面全体かダイアログの中身を待つ | ボタンを押した後の待ち（`Button` の `isLoading` を使う）、画面の一部の待ち | 操作はない。`aria-live` で待ちを伝える |
| [`DatePicker`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-datepicker--docs)、[`TimePicker`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-timepicker--docs) | 日付と時刻を 1 つ入力する | 生年月日のように遠い日付、時間の長さ（`NumberPicker`） | ブラウザの入力欄の操作に従う |
| [`MonthPicker`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-monthpicker--docs) | 照合の対象の月のように、日を問わず月を 1 つ入力する | 日まで決める入力と、期間の始まりと終わり（`DatePicker` を 2 つ並べる） | ブラウザの入力欄の操作に従う |
| [`NumberPicker`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-numberpicker--docs) | 分のような、単位の決まった数を入力する | 電話番号や番号のように、計算しない数字 | ブラウザの入力欄の操作に従う |
| [`FormField`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-formfield--docs) | 入力のダイアログの 1 行の入力、選択、ラジオボタンの組に、見出し、補足の文、誤りの文を付ける | 日付と時刻（`DatePicker`、`TimePicker`）、複数行の文（`TextareaField`）、一覧の絞り込み | Tab で欄に移り、欄の操作はブラウザの入力欄に従う。送った後に誤りがあれば、最初の誤りの欄へフォーカスが移り、結び付けた誤りの文を欄の説明として読み上げる |
| [`TextareaField`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-textareafield--docs) | 複数行の文を入力する | 1 行で足りる名前やタイトル | Tab で移る。改行は Enter |
| [`Select`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-select--docs) | 決まった選択肢から 1 つを選ぶ（担当の職員、部署）。標準の矢印を消し、右から 12px に矢印の印を置く | 2 から 4 個の選択肢ですぐに表示を切り替える（`SegmentedControl`）、多い候補から少しを選ぶ（`ChipPicker`） | Tab で移る。上下の矢印キーで選び直す |
| [`FileField`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-filefield--docs) | 端末に置いたファイルを 1 つ選んで送る（照合の実績の CSV） | 文や値の入力（`FormField`、`TextareaField`） | Tab で移り、Enter と Space でファイルを選ぶ画面を開く |
| [`ChipPicker`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-chippicker--docs) | 多い候補から少しを選ぶ（職員の権限の対象の職員）。選んだものだけをチップで並べ、名前で絞った候補から 1 つずつ足す | 1 つだけを選ぶ（`Select`）、候補が数個で全てを見比べる（チェックボックスの組） | Tab で × と足す欄に移る。足す欄で ↓ を押すと候補に移り、↑ と ↓ で移り、Enter で足す。Esc と外を押すと候補を閉じ、Esc は外側のダイアログを閉じない。× で外すと、次の × か足す欄にフォーカスが移る |
| [`StatusBadge`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-base-statusbadge--docs) | 職員や利用者の状態（有効、休職、退職）を文字の印で示す。名前の先頭の 1 文字の丸（`Avatar`）と、名前の前の色の点（`DotLabel`）も同じファイルに置く | 操作の結果の通知、押して状態を変える操作（`Button` か `SegmentedControl` を使う） | 操作はない。`Avatar` と `DotLabel` の点は読み上げない |
| [`ListTools`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-case-listtools--docs) | 一覧の上に、検索、絞り込みのセレクト（`FilterSelect`）、件数（`ListCount`）を並べる。絞り込みで 0 件のときは、表の代わりに `ListEmpty` を出す | 送信するまで反映しない入力のセレクト（`FormField` の中の `Select` を使う）、2 から 4 個の表示の切り替え（`SegmentedControl` を使う） | Tab で検索欄、絞り込み、絞り込みを外すボタンに移る。絞り込みはブラウザのセレクトの操作に従う。件数の変化は `aria-live` で読み上げる |
| [`SearchBox`](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/コンポーネント-case-searchbox--docs) | 一覧を語で絞り込む | 決まった選択肢から選ぶ（`SegmentedControl` か選択肢のカード） | Tab で移る。Esc で語を消す。見えるラベルがないので `aria-label` を渡す |

入力のコンポーネントは、ラベルを入力欄に結び付け、エラーがあれば `aria-invalid` と、エラーの文への `aria-describedby` を付ける。

- 出典: [DADS のコンポーネント](https://design.digital.go.jp/dads/components/)

### 入力の欄の状態

入力の欄の枠と面は、状態ごとに次のようにする。
見た目は DADS のインプットテキストに合わせる。

| 状態 | 枠 | 面と文字 |
| --- | --- | --- |
| デフォルト | 1px の `border-field` | `surface` |
| hover | 1px の `border-field-hover`（黒） | 変えない |
| フォーカス | 枠はそのままにし、外に `focus-ring` を出す | 変えない |
| エラー | 2px の `danger` | 変えない |
| エラーで hover | 2px の `danger-hover`（濃い赤） | 変えない |
| 無効 | 1px の `border-field`。マウスを乗せても変えない | `surface-disabled` と `text-disabled` |

- 枠は `border` で引き、`ring` で引かない。`focus-ring` の黄色の縁は `box-shadow` なので、`ring` の枠と同じ要素に付けると、片方がもう片方を上書きする。
- select は `Select` を使い、`select` を直に書かない。直に書くと、矢印の位置と状態の見た目がそろわなくなる。input と textarea には `fieldControlClassName`（`FormField` の中では `formFieldControlClassName`）を付ける。
- 中に input を置く枠（`SearchBox` の枠、`DatePicker` の label）には `fieldBoxClassName` を付け、中の input の状態を `:has` で読む。
- 確認: 全ての入力のコンポーネントの hover、無効、エラーの枠は、コンポーネントのテスト（`pnpm --filter @buddy/ui test` の `fieldStates.test.tsx`）が確認する。
- 編集できない値は、欄にせず本文の文字で出す。
- 欄を無効にするのは、送っている間、選択肢を読み込む間、ほかの処理を進める間に限り、終わったら編集できる状態に戻す。
  - DADS のインプットテキストは無効の欄を使わないとしているが、送っている間に欄を編集できると、送った値と画面の値が食い違う。選択肢を読み込む間に `Select` を開けると、空の選択肢が見える。
- エラーの枠は 2px にする。DADS のインプットテキストは 1px の赤だが、1px にすると、デフォルトの枠との違いが色だけになる。太さが違えば、色を見分けにくい人も誤りの欄を見つけられる。
- 出典: [DADS のインプットテキストの CSS](https://github.com/digital-go-jp/design-system-example-components-html/blob/caa50d731cf515cfa5eae0093121f11ac5299235/src/components/input-text/input-text.css)

### コンポーネントごとの規則

「コンポーネントの選び方」の表に加えて、コンポーネントごとに次の規則に従う。
DADS から外れる規則は、外れることと理由を、その規則に書く。

#### `Button`

- 押せる領域は 44×44 CSS px 以上にする。S のボタンとアイコンのボタンは、見た目の外に押せる領域を広げる。
- ラベルは文字にする。アイコンだけのボタンには、`aria-label` で名前を付ける。
- 操作の重要度の違いを、色だけで示さない。塗りと枠線の違いでも示す。
- データを失う操作は、起点のボタンを `variant="destructive"` にして確認のダイアログを開き、確認のダイアログの確定のボタンを `variant="danger"` にする。
  - 起点のボタンに赤い塗りを使わない。赤い塗りは、確認の手順の最後の確定の 1 か所だけにする。
  - 起点のボタンを、よく使う安全な操作のボタン（「閉じる」「編集」「完了する」）の隣に並べない。ラベルの違いだけでは押し間違いを防げない。ダイアログの中の配置は、下の `Modal`、`Dialog` の規則にある。
    - 画面の中で安全な操作と同じ行に置くときは、行の反対の端に離して置く（予定の正本の切り替えの「切り替えをやめる」）。
  - 入力のダイアログが、何が失われるかを示して確定するとき（職員の役職を変える）は、その確定のボタンを確認の手順の最後とみなし、`variant="danger"` にする。
  - 確定のボタンの文字は、操作の動詞（「外す」「書き直す」）にする。
  - 出典: [Nielsen Norman Group: Proximity of Consequential Options](https://www.nngroup.com/articles/proximity-consequential-options/)、[GOV.UK Design System: Warning buttons](https://design-system.service.gov.uk/components/button/)
- `className` で色や角丸を変えない。
- 押せない間は `aria-disabled` を付け、押しても実行しない。`Button` は、`disabled` を渡すと `aria-disabled` を付け、クリックと送信を止める。
- 入力が条件を満たさない間に押せなくするボタンは、ボタンのすぐ近くに、押せるようにする条件を文で書き、`aria-describedby` でボタンに結び付ける。ダイアログの確定のボタンは、`InputDialog` と `ConfirmDialog` の `submitHint` に渡す。
- 送っている間と、選択肢やデータを読み込む間は、条件の文を書かずに押せなくする。
  - DADS は押せないボタンの近くに理由を書くとしているが、この 2 つは数秒で終わり、ボタンに回転の印か、送っていることを示す文を出す。理由の文を出しても、読む前に消える。
  - 待ちは `isLoading` で示す。文字を読ませたまま待たせるときは、子に `BusyLabel` を渡し、文字の前に回転の印を出す。
  - 読み込みの間は `aria-busy` を付け、押しても実行しない。
- 出典: [DADS のボタンの使い方](https://design.digital.go.jp/dads/components/button/usage/)、[DADS のボタンのアクセシビリティ](https://design.digital.go.jp/dads/components/button/accessibility/)

#### `ActionMenu`

- `label` には、何の操作かが分かる名前（「青木 一郎の操作」）を渡す。
- モーダルの下端のように下に場所が無いところでは、`placement="top"` で上に開く。「…」の代わりに文言のボタンを出すときは `triggerLabel` を渡す。
- 項目は 5 個までにする。
- データを失う操作には `isDanger` を付け、赤くし、線で分けて最後に置く。
  - 選んだ後に `ConfirmDialog` で確認する。メニューの項目から、確認を挟まずに実行しない。
- 今は選べない項目は `disabled` にし、理由を項目の `description` に書く。
- ダイアログを開かずにその場で送る操作には `staysOpenUntilSettled` を付け、`onSelect` から送る処理の Promise を返す。
  - 送っている間は、項目の文言を送っていることを示す文言にし、`disabled` にする。

#### `Modal`、`Dialog`

- ボタンを押したときだけ開く。押していないのに開くと、閉じたときにフォーカスを戻す先が無くなる。
- 処理の完了と状態の変化の通知、ナビゲーションには使わない。
- データを失う操作の確認と、ダイアログの中で完結する短い入力に `Dialog` を使う。
- 予定の作成と編集は、URL を持つ `Modal` に入力のコンポーネントを置いて行う。DADS はモーダルのダイアログにフォームを入れないとしているが、カレンダーの上で予定を作り、閉じてカレンダーに戻る流れを画面仕様が決めている。
- フッターに操作のボタン（「キャンセル」、確定のボタン、行でできる操作）を置くときは、右上に閉じるボタン（×）を置かず、フッターのボタンで閉じる。
  - × と「キャンセル」が並ぶと、どちらで閉じても同じ結果になるのかを、利用者が判断できないためである。
  - 閉じるのに使うボタンは、入力があれば「キャンセル」、入力の無い詳細では「閉じる」にし、フッターの左端に置く。
  - フッターにデータを失う操作の起点のボタンがあるときは、その 1 つだけをフッターの左端に置き、閉じるのに使うボタンを右のまとまりの先頭に置く。
    - 例は、予定の詳細の「予定をキャンセル」と、確認が必要な予定のダイアログの「buddy の内容で書き直す」である。
    - 戻せない操作を、閉じるボタンと編集のボタンから離すためである。
  - 確認のダイアログで、確定のボタンが「キャンセル」と同じく取り消しの意味に読めるとき（「予定をキャンセルする」「やめる」「書き直す」）は、閉じる側のボタンを「戻る」にする。`ConfirmDialog` の `cancelLabel` に渡す。
    - 「キャンセル」と「予定をキャンセルする」が並ぶと、どちらが予定を取り消すのかを読み違えやすい。「書き直す」も、Google カレンダーでの変更を取り消す操作なので当てる。
    - 「外す」「退職にする」のように、取り消しの意味に読めない確定には当てず、閉じる側を「キャンセル」のままにする。
    - 出典: [UX Movement: When Cancel Buttons Should Not Say Cancel](https://uxmovement.com/buttons/when-cancel-buttons-should-not-say-cancel/)
  - `Modal` は `stickyFooter` を渡すと × を出さない。`Dialog` は `DialogHeader` に `onClose` を渡したときだけ × を出す。
  - フッターを置かないモーダルとダイアログ（キャンセルした予定の詳細、読み込み中、読み込みの失敗）だけは、× を置く。
  - Esc と覆いは、フッターの「キャンセル」と同じく閉じる。入力を変えた `Modal` では、どれで閉じるときも破棄してよいかを確認する。
    - 入力の途中で閉じると変更が消えるときは、`Modal` に `isDirty` を渡す。
  - 入力の無い詳細に選べる操作を並べるときは、主のボタンを置かない。
- `Modal` には `title` を渡し、ダイアログの名前にする。種類の切り替えのような、ヘッダーに足す要素は `headerContent` に置き、タイトルの右に寄せる。
- `Dialog` は、`DialogHeader` の `titleId` と、`Dialog` の `labelledBy` に同じ値を渡す。
- 送っている間は、`Dialog` に `canClose={false}` を渡し、フッターの「キャンセル」も押せなくして、どの操作でも閉じないようにする。
- `Dialog` で送れなかったときは、`DialogFooter` の `error` に文を渡す。
- 出典: [DADS のモーダルダイアログ](https://design.digital.go.jp/dads/components/modal-dialog/)

#### `Drawer`

- モーダルとして扱い、開いている間は後ろを覆い、ドロワーの外を操作できなくする。
- 画面の枠のメニューのボタンか、左の欄を開くボタンから開く。
- 閉じるボタンを置く。
- `title` に、開くボタンの文と同じ名前を渡す。
- 出典: [DADS のドロワーの使い方](https://design.digital.go.jp/dads/components/drawer/usage/)

#### `SegmentedControl`、`Select`

- 選択肢から 1 つだけを選ぶ。複数を選ぶ入力には使わない。
- 選択肢が少ないときは、`Select` を使わない。2 から 4 個ですぐ表示を切り替えるなら `SegmentedControl` にする。
- `Select` の開いた一覧は、ブラウザと OS の標準の表示のままにする。
- 入力のダイアログでは、`Select` を `FormField` の中に置き、`children` に渡される属性をそのまま `Select` に渡す。一覧の絞り込みでは、`ListTools` の `FilterSelect` が `isDense` と `isEmphasized` を付けて `Select` を使う。
- 選んでいない状態を許す `Select` は、先頭に「選んでください」の選択肢を置く。
- `SegmentedControl` の `label` に、選択肢の組の名前を渡す。選択肢の文は短い語にする。
- 出典: [DADS のラジオボタンの使い方](https://design.digital.go.jp/dads/components/radio/usage/)、[DADS のセレクトボックスの使い方](https://design.digital.go.jp/dads/components/select/usage/)

#### `Table`、`RowTable`

- 表は、同じ項目を持つ行の比較に使う。名前と値の組は `dl` にし、画面の配置に表を使わない。
- 1 つの対象を 1 行にし、セルを結合しない。
- 見出しのセルは太字にし、見出しの行とデータの行を `border-strong` の線で分ける。データの行どうしは `border` で分ける。
- セルの文字は、上下の中央に寄せる。
  - DADS のテーブルは文字を上に寄せるとしているが、`Table` のセルは折り返さない 1 行で、`RowTable` の行は高さ 44px の操作のボタンと 1 行の文字を並べる。上に寄せると、文字が同じ行のボタンの文字より上にずれる。
- `Table` の見出しのセルには `Table.HeaderCell` を使い、`Table.Cell` を見出しに使わない。table の要素の display を変えない。変えると、見出しのセルの `th` と表の役割が失われる。
- `RowTable` の行の押し方は、`href`、`onSelect`、`action` のどれか 1 つにする。
  - 画面を移る行は `href`、同じ画面でダイアログを開く行は `onSelect` にする。1 つの行に `href` と `action` の両方を置かない。
  - 行の操作を置く一覧では、右端の列の読み上げの見出しを `trailingHeader="操作"` にする。
- `RowTable` の長い文の列には `isDesktopOnly` を付け、幅 768px 未満の 2 行目に出さない。名前と日時の列には `isNoWrap` を付ける。
- `RowTable` の値の無いセルは `value` を null にし、`emptyLabel` で読み上げる文を渡す。「-」を出さない。
- `RowTable` は横にスクロールさせない。幅 768px 未満では 2 行のリストにする。
- 出典: [DADS のテーブルの使い方](https://design.digital.go.jp/dads/components/table/usage/)

#### `Loading`

- 回転する表示は、画面全体の待ちと、ダイアログの中身の待ちに使う。画面の一部の待ちには使わない。一部が動き続けると、ほかの部分が読みにくくなる。
- DADS は回転する表示を画面全体の待ちに限るが、ダイアログを開いている間はほかを操作できず、画面全体の待ちと同じになるので、ダイアログの中身の待ちにも使う。
- 1 つの画面に複数並べない。
- 待つ時間が長いときは、`description` で何を待つかを書く。
- 出典: [DADS のプログレスインジケーター](https://design.digital.go.jp/dads/components/progress-indicator/)

#### `DatePicker`、`TimePicker`、`MonthPicker`

- カレンダーから選ぶ入力は、近い日付に使う。生年月日のように分かっている遠い日付には使わない。
- ブラウザの `type="date"`、`type="time"`、`type="month"` を使う。DADS は年、月、日を分けた入力欄を勧め、`input type="date"` の使う場面を限るとしているが、予定の日付は近い日を選ぶことが多く、ブラウザのカレンダーから選ぶ方が手数が少ない。
- `label` に項目の名前を渡し、ラベルを空にしない。
  - 見出しを欄の外（ラジオボタンの右など）に置くときは、`DatePicker` に `isLabelHidden` を渡す。`label` は読み上げの名前に残り、枠の高さが 44px になって、隣の 44px の要素と中心がそろう。
- `MonthPicker` は、選んだ月が何に使われるかを `hint` に書く。
- 出典: [DADS の日付ピッカーの使い方](https://design.digital.go.jp/dads/components/date-picker/usage/)、[DADS の日付ピッカーのアクセシビリティ](https://design.digital.go.jp/dads/components/date-picker/accessibility/)

#### `FormField`、`NumberPicker`、`TextareaField`

- 見出しは欄の上に左寄せで置く。見出し（`label`）を省かず、項目の名前を渡す。
- 入力の時点で守る制約は、`hint` で常に出す。誤りの文は `hint` に書かず、`error` で渡す。
- 誤りの文には、何が誤りかと、どう直すかを書く。
- 補足の文と誤りの文は、`aria-describedby` で欄に結び付ける。
- 誤りの文に `role="alert"` と `aria-live` を付けない。送ったときに誤りが複数あると、全ての文が割り込みで読み上げられ、どの欄の誤りかを聞き分けにくい。
- 送った後に誤りがあれば、`useFocusFirstInvalid` で最初の誤りの欄へフォーカスを移す。欄にフォーカスが移ると、結び付けた誤りの文が欄の説明として読み上げられる。
  - 予定のフォームのように、誤りの欄が閉じた編集の欄にあるときは、誤りを出す項目のボタンに `data-invalid` を付け、そのボタンへフォーカスを移す。
  - ラジオボタンの組は、組の要素へフォーカスを移し、組に結び付けた誤りの文を読み上げさせる。`FormField` の `isGroup` は、誤りがあれば組の要素に `tabIndex={-1}` を渡す。
  - 入力するたびに誤りを出す欄は、フォーカスが欄にあるので移さない。
- 送れなかったときの文と、画面の読み込みの失敗の文は、欄の誤りの文ではないので `role="alert"` で読み上げる。
- `TextareaField` に文字数の上限があるときは、見出しか補足の文に上限を書く。
- `NumberPicker` は、単位を `label` に書き（「提供時間（分）」）、`min` と `max` で範囲を渡す。単位を書かずに数だけを求めない。
- ラジオボタンの組は `isGroup` にし、渡す属性を `role="radiogroup"` の要素に付ける。
- 出典: [DADS のインプットテキストの使い方](https://design.digital.go.jp/dads/components/input-text/usage/)、[DADS のインプットテキストのアクセシビリティ](https://design.digital.go.jp/dads/components/input-text/accessibility/)、[DADS のテキストエリアの使い方](https://design.digital.go.jp/dads/components/textarea/usage/)

#### `FileField`

- ファイルを選ぶボタンを置く。ドラッグとドロップだけで選ばせない。
- `label` に項目の名前を渡し、ラベルを空にしない。
- `accept` に選べるファイルの種類を渡し、選べる種類と大きさを `hint` に書く。
- 出典: [DADS のファイルアップロードの使い方](https://design.digital.go.jp/dads/components/file-upload/usage/)

#### `ChipPicker`

- 選んだものだけをチップで並べ、チップの × で 1 つずつ外す。
- `label` に選んでいるものの名前を、`addAriaLabel` に足す欄の用途を書く。候補が無いときの文は `emptyLabel` に書く。
- 候補を読み終えるまでは `options` に `undefined` を渡す。足す欄を押せなくし、選んでいるもののチップの × は押せるままにする。
- 多い候補から少しを選ぶ入力に使う。DADS は複数の選択にチェックボックスの組を使うとしているが、職員の権限の対象のように候補が数十人になると、チェックボックスで全てを並べたときに選んだものを読み取れなくなる。
- 出典: [DADS のチェックボックスの使い方](https://design.digital.go.jp/dads/components/checkbox/usage/)、[DADS のチップタグ](https://design.digital.go.jp/dads/components/chip-tag/)

#### `StatusBadge`

- 状態を、色だけでなく文字で示す。
- 注意してほしい状態は `tone="warning"`、終わった状態は `tone="muted"` にする。
- `Avatar` は、職員と利用者の詳細の見出しで、名前の前に置く。
- `DotLabel` は、チームの名前か職員の名前の前にチームの色の点を置く。必ず名前を並べ、点だけを出さない。
- 出典: [DADS のチップラベル](https://design.digital.go.jp/dads/components/chip-label/)

#### `HelpToggle`、`MoreText`

- 開かないと操作できない情報を入れない。閉じたままでも、画面の本文だけで操作できるようにする。
- キーボードだけで開閉でき、`aria-expanded` で開閉を伝える。
- `HelpToggle` は、見出しの意味を補う説明を見出しの下に重ねて出すコンポーネントで、ディスクロージャーではない。開閉のアイコンを見出しの左に置かず、見出しの右に ? のボタンを置く。
  - DADS のディスクロージャーは、タイトルの左の開閉のアイコンを必須にする。`HelpToggle` はタイトルと本文を持たず、説明は画面の流れを押し下げない。見出しの左にアイコンを置くと、`HelpToggle` を置く見出しと置かない見出しで、文字の位置がずれる。
  - 見出しと並べる親の要素に `relative` を付ける。説明は、その下の左端にそろう。
  - 1 つの見出しに 2 つ置かない。
  - 説明の中に、リンクやボタンを置かない。
- `MoreText` は、文の下の「詳しく」で続きの説明を画面の流れの中に開く。
  - `summary` には、閉じていても意味が通じる 1 文を渡す。
  - 続きの説明の手順は、`ol` で番号を付けて並べる。続きの説明の中に、別の `MoreText` を入れない。
  - 説明を見ながら操作することが多い画面では `defaultOpen` を渡す。
  - 出典: [DADS のディスクロージャーの使い方](https://design.digital.go.jp/dads/components/disclosure/usage/)

#### `ListTools`

- `ListCount` は `ListTools` の最後に置き、右端に寄せる。
- `FilterSelect` の「すべて」に当たる選択肢は、値を空にする。
- 絞り込みの状態を、枠の太さだけで伝えない。選んだ名前を「部署: 看護部」の形で出す。

#### `SearchBox`

- `aria-label` に、何を検索するかを書く（「職員を検索」）。プレースホルダーだけで用途を伝えない。
- 入力のたびに `onSearch` を呼ぶ。間引きが要るときは、呼び出す側で行う。

## パターン

パターンは、コンポーネントを組み合わせた形である。  
中で使う `Dialog` と `Button` は、「コンポーネントごとの規則」の「`Modal`、`Dialog`」と「`Button`」に従う。

### `InputDialog`

`Dialog` に、タイトルのヘッダーと、「キャンセル」と確定のボタンのフッターを組んだ入力のダイアログ。

- 使う場面: 理由やメールアドレスのような、短い入力を 1〜2 項目受けて送る。
- 使わない場面: 項目の多い入力（`Modal` を使う）、取り消せない操作の確認（`ConfirmDialog` を使う）。
- 確定のボタンの文字（`submitLabel`）は操作の動詞（「保存」）にし、送っている間の文字（`busyLabel`）にも同じ動詞を使う。
- 確定のボタンは 1 つだけ置く。
- 入力が足りない間は `canSubmit` を false にする。押せるようにする条件の文は、「`Button`」の規則のとおり `submitHint` に渡す。
- 送っている間は `isSubmitting` を渡す。「キャンセル」、覆い、Esc のどれでも閉じなくなる。
- 送れなかったときは、`error` に文を渡す。
- 「キャンセル」、覆い、Esc では、入力を保存しない。
- 入力を form にするときは `formId` を渡し、確定のボタンをその form の送信のボタンにする。
- タイトルの補いは、`titleAddon` に `HelpToggle` を渡す。
- キーボードの操作
  - 開くと、`initialFocusRef` の欄にフォーカスが移る。渡さなければ、ヘッダーの最初のボタンに移る。
  - Tab と Shift+Tab は、ダイアログの中の要素に移る。
  - Esc と、閉じたときのフォーカスは、「コンポーネントの選び方」の表の `Dialog` の行のとおりに動く。

### `ConfirmDialog`

`role="alertdialog"` の幅の狭い `Dialog` に、問いの形のタイトル、説明、「キャンセル」と確定のボタンを組んだ確認のダイアログ。

- 使う場面: カレンダーを外す、予定を書き直すのような、データを失う操作を実行する前に確認する。
- 使わない場面: 取り消せる操作（確認を挟まずに実行する）、入力を受ける（`InputDialog` を使う）、完了の通知。
- タイトルは、何をするかを問う形にする（カレンダーを外すかを問う）。
- 説明には、何が失われ、何が残るかを書く。
- 確定のボタンの文字を「はい」「OK」にしない。
- 送っている間は `isSubmitting` を渡す。「キャンセル」、覆い、Esc のどれでも閉じなくなる。
- キーボードの操作
  - 開くと「キャンセル」にフォーカスが移る。
  - Tab と Shift+Tab は、ダイアログの中の要素に移る。
  - Esc と、閉じたときのフォーカスは、「コンポーネントの選び方」の表の `Dialog` の行のとおりに動く。

