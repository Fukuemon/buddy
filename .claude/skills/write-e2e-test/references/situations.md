# 場面ごとの書き方

## 新しいタブを開く画面

1. 新しいタブは `context.waitForEvent('page')` で受け取る。ブラウザの API は差し替えない。
2. タブをまたいで引き継がれるはずの値は、`addInitScript` で元のタブにだけ入れる。`window.open` で開いたタブは `sessionStorage` の写しを受け取り、`window.name` は受け取らない。
3. 画面の中の移動は、遷移元の描画(行の testid など)を待ってから `page.goto` で path を開いて作る。buddy の画面は path で route を分ける。
4. 観点は、遷移先の画面の既存の spec に足す。
5. 手元の dev サーバに向けて流すときは、`--workers` で worker を増やさない。`playwright.config.ts` は worker を 1 つにしている。

## 時間で動く画面

- 一定の間隔で取り直す画面は、`page.clock.install({ time })` の後に `page.clock.fastForward(<間隔>)` で進める。
- 時計を差し替えるのは、要るテストだけにする。
- 日付だけを固定するなら `page.clock.setFixedTime(time)` を使う。時刻は、UTC でも日本時間でも同じ日付になるもの(例: `06:00:00Z`)にする。

## testid を付ける

testid の名前は、`context/conventions.md` の E2E の節に従う。付け方は次のとおり。

| 場面 | 付け方 |
| --- | --- |
| 画面の接頭辞を自分で決める共通の枠を、入れ子で使う | 外側の枠が印を渡し、内側の枠は、明示で渡されたときだけ付ける |
| 一覧の見出し | 表示の文言でなく、列のキーから作る |
| コンポーネントの中のボタンや入力欄 | コンポーネントに、中の要素へ付けるための引数を足す |
| フレームワークが描かない DOM | その DOM を作る処理の中で、属性を付ける |
| 選ばれているかが変わるボタン | `aria-pressed` を出す。選ばれていないときも `"false"` を出す |

`packages/ui` のコンポーネントに渡した `data-testid` が中のどの要素に付くかは、コンポーネントごとに違う。`SegmentedControl` は組に付け、選択肢の radio には `<data-testid>-<id>` を付ける。付く先は、コンポーネントの文書コメントを読んで確かめる。
