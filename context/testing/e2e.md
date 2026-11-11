---
type: context
title: E2E のテスト
description: E2E のテストのツールでの書き方、testid の名前、lint の規則に渡す値、流すコマンドと環境、テストデータとログイン、待つ時間の決め方
status: stable
---

# E2E のテスト

E2E のテストのコード（`packages/e2e/tests/`）の書き方は、スキル write-e2e-test と [E2E のテストのコードの設計](../../packages/e2e/DesignDoc.md) に従う。  
E2E のテストのディレクトリは、`context/project.yml` の `e2e.dir`（`packages/e2e`）にある。

## Test Tool

- テストのツールは Playwright（`@playwright/test`）である。
- エビデンスの録画と字幕は、Playwright の録画と、スキル playwright-capture から写した撮影の config と `caption.ts` で撮る（[エビデンス](evidence.md)）。
- スキル write-e2e-test の一般の語は、Playwright の次の API に当たる。

| スキルの語 | Playwright の API |
| --- | --- |
| 確認（自動で待つ assertion） | locator を渡した `expect`。「変わらないことを繰り返し評価する」のは `expect.poll` |
| testid で要素を拾う | `page.getByTestId` |
| 通信の差し替え | `page.route` |
| 新しいタブの受け取り | `context.waitForEvent('page')` |
| ページを読み込むたびに実行するスクリプト | `page.addInitScript` |
| 時計の差し替えと進め方 | `page.clock.install({ time })` の後に `page.clock.fastForward(<間隔>)` |
| 時刻の固定 | `page.clock.setFixedTime(time)`。時刻は、UTC でも日本時間でも同じ日付になるもの（例: `06:00:00Z`）にする |

- buddy の画面は path で route を分ける。
  - 画面の中の移動は、`page.goto` で path を開いて作る。
- 値を読んでから比べる書き方は、lint の規則が一部しか止めない。
  - `count()` と `isVisible()` で読んでから比べる書き方も自分で避け、locator をそのまま `expect` に渡す。

## Test IDs

- testid は、画面仕様書のモック（`docs/screens/<画面 ID>_<画面の名前>/mocks/`）の `data-testid` を正本にする。
  - testid を足すときは、同じ pull request でモックにも足す。
  - E2E が使う testid がモックにあるかは、`pnpm check:screens` が確認する。
  - 形は、小文字の英語と `-` で、`<画面か部品>-<要素>` にする（例: `receipt-check-submit`）。
  - 一覧の行のように同じ要素が並ぶものは、末尾に ID を付ける（例: `staff-filter-staff-{職員の id}`）。
  - 区分のように API の値を末尾に付けるときは、値の `_` をそのまま残す（例: `receipt-summary-schedule_only`）。
- ブローカーが出すログインの画面（`account-login`）は web の画面ではないので、`data-testid` を持たない。
  - E2E は、メールアドレスの入力欄をラベルの「メールアドレス」で、次へをロールの button と名前の「次へ」で指す（`packages/e2e/tests/selectors/idp.ts`）。
- 画面 ID の形は、`docs/screens/index.md` の「画面の ID の規則」にある。
- `packages/ui` のコンポーネントに渡した `data-testid` が中のどの要素に付くかは、コンポーネントごとに違う。
  - 付く先は、コンポーネントのドキュメントコメントを読んで確認する。
  - 例: `SegmentedControl` は組に付け、選択肢の radio には `<data-testid>-<id>` を付ける。

## Lint Rule Options

- テストの書き方の規則は、スキル setup-e2e-lint から `packages/e2e/eslint/e2e-authoring-rule.mjs` に写したものである。
  - 写したまま手を入れない。新しいバージョンと差分を比べるため、整形の対象からも外してある（ルートの `vite.config.ts` の `fmt.ignorePatterns`）。
  - `apm.yml` の e2e を上げたら、setup-e2e-lint の「新しいバージョンの規則を取り込む」の手順で差分を見て置き換える。
- options は `packages/e2e/eslint.config.mjs` で渡す。
  - テストのディレクトリは、デフォルトの `tests/` のままにする。
    - 規則は ESLint の cwd から見た `tests/` だけを対象にする。ルートやエディタから流すと、違反があってもエラーを出さずに通るので、`packages/e2e` で流す。
  - 固定の待ちを許すファイルは、字幕の関数の `tests/fixtures/caption.ts` だけである。撮るときだけ、字幕を読ませるために止まる。
  - 待つ時間の名前を定めるファイルは、`tests/fixtures/timeouts.ts` である。
  - `screenIdPattern` は、`docs/screens/index.md` の画面の ID の規則のドメインと種類の組を止める。ドメインか種類を足したら、`screenIdPattern` にも足す。
    - `schedule-calendar` や `receipt-result-table` のように、画面 ID で始まる testid は `widgets/` に直に書けない。`widgets/` を作るときは、testid の接頭辞を引数で受ける。
  - `widgets/` が開いてよい URL（`widgetGotoAllowedUrl`）は渡さず、規則のデフォルトの `/` を使う。

## Running Tests

- E2E は、ルートの compose で立てた全体に向けて流す。
  - 手順は [CONTRIBUTING.md](../../CONTRIBUTING.md) の E2E Tests にある。
  - API、Hydra、ブローカーは置き換えず、compose の本物を使う。事業所の上流の IdP は、compose のフェイクを使う。
- 整形、lint、E2E の書き方の規則、型のチェックは、`pnpm --filter @buddy/e2e check` で流す。
- project は 3 つある。
  - `setup` は、流すたびに compose のブローカーにログインし、ログインした状態を `packages/e2e/.auth/<ホスト>/` に保存する。録画しない。
  - `e2e` は、その状態で `tests/specs/` の spec を流す。`pnpm e2e` と CI は、`--project=e2e` でこの project だけを流す。
  - `evidence` は、`tests/evidence/` のエビデンスの spec を流す。ログインの状態は、spec が describe ごとに選ぶ。`pnpm --filter @buddy/e2e evidence` で、撮影の config を付けて流す（[エビデンス](evidence.md)）。
- worker は 1 つにする（`packages/e2e/playwright.config.ts`）。
  - spec は職員ごとのログインの状態のファイルを共有するためである。
  - ローカルの dev サーバに向けて流すときも、`--workers` で増やさない。
- 環境変数 `E2E_BASE_URL`（デフォルトは main の checkout の `https://web.buddy.localhost`）で、向ける画面を変える。
  - Google カレンダーの spec が向ける calendarpit と gcalhold は、`E2E_CALENDARPIT_URL` と `E2E_GCALHOLD_URL` で変える。デフォルトは、それぞれ `https://calendarpit.buddy.localhost` と `https://gcalhold.buddy.localhost` である。
  - 職員の登録と停止の spec は、予定の API とブローカーを直に呼ぶ。向ける先は `E2E_SCHEDULE_URL`、`E2E_HYDRA_URL`、`E2E_BROKER_URL`、`E2E_BROKER_INTERNAL_URL` で変える。
    - デフォルトは main の checkout の環境を指す。
      - `E2E_SCHEDULE_URL` は `https://schedule.buddy.localhost`、`E2E_HYDRA_URL` は `https://hydra.buddy.localhost`
      - `E2E_BROKER_URL` は `https://broker.buddy.localhost`、`E2E_BROKER_INTERNAL_URL` は `https://8081.broker.buddy.localhost`

## Test Data and Login

- テストのデータは予定の API に作り、消さない。
  - spec は、タイトルに時刻を入れて自分の作ったデータを見分ける。
- `setup` は、次の 7 人のログインの状態を保存する（`packages/e2e/tests/setup/login.setup.ts`）。保存した状態を使い回さず、流すたびにログインし直す。
  - 青木 陽菜（マネージャー）、森 健太（チームリーダー）、林 さくら（メンバー）
  - 岡田 葵（Google カレンダーを正本にする 3 つ目の事業所のマネージャー）、石田 蓮（予定の正本の切り替えを確認する 4 つ目の事業所の職員）
  - 上野 渚（2 つ目の事業所のマネージャー。止めた職員がいる事業所で撮るのに使う）
  - 中村 結衣（1 つ目の事業所の事務。訪問しない職員で、照合の権限を持つ）
  - spec が別の職員で入るときは、`ACCOUNTS` と `env.ts` の状態のファイルに足す。
  - リーダーで確認する spec は、`test.use({ storageState: LEADER_STATE })` で切り替える。
  - Google カレンダーを正本にする事業所で確認する spec は、`test.use({ storageState: OKADA_STATE })` で切り替える。
  - ログインのメールは、`packages/e2e/tests/fixtures/env.ts` の `LOGIN_EMAIL` と `LEADER.email` である。
  - ログインの状態を保存したアカウントを、並列の worker で共有しない。保存したファイルを書き合うためである。
- E2E は、メールの @ の前の部分を上流の `sub` にして入る。
  - ローカルで同じ職員に別の名前で入ったことがあれば、`portless compose down -v` でデータを消す。
- 職員の登録、休職、退職の spec は、流すたびに新しいメールの職員を登録し、消さない。
  - 休職にした職員がログインの画面へ戻るのを待つ spec は、web が access token を取り直すまで、4 分ほどかかる。
- Google カレンダーの取り込みの spec は、森にカレンダーを結び付けて取り込んだまま残す。
  - 同じ DB で 2 回目を流すと失敗するので、流し直すときは `portless compose down -v` で作り直す。
- 森 健太や上野 渚で入れないときや、職員の一覧に佐藤 美咲がいないときは、シードを変える前の DB である。`portless compose down -v` で作り直す。

## Timeouts

- 待つ時間の名前は、`packages/e2e/tests/fixtures/timeouts.ts` に置く。
- CI は、テストごとの所要時間を、ジョブのログ（list のレポーター）と、JUnit の形式の `packages/e2e/test-results/junit.xml` に書く。
  - junit.xml は、失敗したときだけ artifact の `e2e-test-results` に残る。
- 値を変えるときは、複数の CI の実行のログから、成功したテストごとの所要時間を集めて決める。
