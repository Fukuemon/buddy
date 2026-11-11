---
type: context
title: エビデンス
description: エビデンスを付ける変更、元のファイルの配置先と公開の範囲、撮影の手段（エビデンスの spec と見本）、撮る環境と撮るコマンド、ログインとテストデータ、スレッドに投稿してから本文に並べる載せ方、検証シナリオの決まり。検証環境の値は検証環境ができてから決める
status: draft
---

# エビデンス

機能の追加と改修で何を確認したかを示す動画と画像の取り決め。  
観点の決め方と pull request への載せ方は、パッケージ capture のスキル capture-pull-request に、撮る仕組みと字幕の書き方はスキル playwright-capture にある。  
buddy は、spec の配置先、テストの名前、本文の表の形がスキルと違う。違う点は [Capture Tools](#capture-tools) と [Attachment](#attachment) にある。

## Evidence Scope

- 機能の追加と改修の pull request には、確認したことのエビデンスの動画を付ける。
  - 画面の変更に限らず、API だけの変更にも付ける。
- 文書、スキル、設定だけの変更には付けない。
  - 振る舞いが変わりうる設定の変更には付ける。例は、依存のライブラリの更新である。
- 不具合の再現と改修前の動きは、issue に付けてよい。

## Storage and Visibility

- エビデンスはリポジトリにコミットしない。
- pull request のエビデンスは、先に pull request のコメントに投稿し、利用者が確認してから、本文の「検証とエビデンス」の表に並べる。
  - コメントは、観点のまとまりごとに 1 つ立てる。このコメントを最初のコメントと呼ぶ。
  - 最初のコメントと、その後に同じまとまりで足すコメントを、まとめてスレッドと呼ぶ。pull request の会話のコメントには返信の階層が無いので、足すコメントの先頭に、最初のコメントへのリンクを書く。
  - 本文の表には、スレッドに上げた動画と画像の URL を写す。上げ直さない。上げ直すと、スレッドと本文で別の URL になる。
  - 利用者が確認する前の動画を、本文に並べない。観点や撮り方を直すと、本文のエビデンスも差し替えになるためである。
  - 観点の条件と期待結果とエビデンスは、本文の 1 つの表で読み合わせる。spec と実行の出力は、スレッドに置く。
- Google Drive には置かない。
- 上げる前の元のファイルと下書きは、`.ai-out/evidence/<入れる先>/` に一時的に置く。
  - capture-pull-request の下書きの根は `.ai-out/evidence` にし、スキルのデフォルトの `prs` の下に置かない。スキルの「下書きのディレクトリ」は `.ai-out/evidence/<入れる先>/` である。
  - `.ai-out/` は Git で追跡しない。本文に並べ終えたら消す。
  - `<入れる先>` は、issue なら `issue-<番号>`、pull request なら `pr-<番号>` にする。
  - 最初に撮ったときの入れる先を使い続ける。改修前と改修後が別のフォルダに分かれないためである。
    - pull request を作る前に撮ったなら、作った後も `issue-<番号>` を使う。
- 撮影の config は、元の録画、HTML report、JSON reporter の出力を `packages/e2e/evidence/` に書く。Git で追跡しない。
- 上げる動画と判定のスクリーンショットは、playwright-capture の `scripts/collect.mjs` で、`.ai-out/evidence/<入れる先>/videos/<テストのフォルダ>/` にまとめる。
  - `<テストのフォルダ>` は、テストの名前の空白とファイル名に使えない文字を `_` にした名前である。
    - setup の project も一緒に流れるので、名前の末尾に、project の名前の `_evidence` が付く。
    - setup のテストの名前の空のフォルダもできる。上げないので消してよい。
  - 動画は `<テストのフォルダ>_<バージョン>.mp4`、判定のスクリーンショットは `<テストのフォルダ>_<バージョン>_check-<番号>.png` である。`<バージョン>` は、環境変数 `VARIANT` の値（デフォルトは `改修後`）である。
  - 改修前と並べた画像は、`<テストのフォルダ>_compare-check-<番号>.png` である。
  - 上げるのは、mp4 と判定のスクリーンショットと、並べた画像である。
- 上げたファイルは、リポジトリを見られる人が開ける。
  - リポジトリを public にすると、見られる人が誰にでも広がる。
  - 写すのは、ローカルのシード、テストデータ、仮の名前だけにする。実在の利用者、職員、事業所のデータは、検証環境で撮るときも写さない。
  - ログインの値とトークンを、画面と字幕に写さない。
- エビデンスは、pull request と issue ごとに本文で見る。
  - 要求をまたぐエビデンスの一覧と、改修前と改修後を並べた比較の画面は持たない。
  - エビデンスを見るための自前の閲覧の環境も作らない。

## Capture Tools

- エビデンスは、Playwright の spec を、撮影の config `packages/e2e/playwright.capture.config.ts` で流して撮る。
  - 撮影の config と字幕の関数 `packages/e2e/tests/fixtures/caption.ts` は、スキル playwright-capture の references から写した。
    - 字幕の見た目を直すときは、写したファイルを直す。
  - 撮影の config は、E2E の config に、録画、操作の前の止め、カーソルと押す要素の枠を足す。録画の大きさは、evidence の project の画面と同じ 1280x800 である。
  - spec は、`intro`、`step`、`check` で字幕を出す。字幕の書き方は playwright-capture の「字幕を書く」にある。
  - 画面を開いただけの状態は、`step` にも `check` にもせず、`intro` に書く。
    - 操作を持たない `step` は、字幕が 1 秒未満で消えて読めない。
    - `check` は判定の文に使う。前提を `check` にすると、判定のスクリーンショットに前提が混じり、改修前と比べる番号もずれる。
    - 前提の情報（撮る職員、予定、画面の状態）は、`intro` の 2 行目に「前提 …」で書く。1 行目は、この録画で確認することである。
    - 前提の画面の要素が出たことは、`intro` の前に `expect` で待つ。
  - 録画は H.264 の mp4 にまとめるので、変換しない。
  - agent-browser では、エビデンスを撮らない。spec を書く前に、画面の操作の位置を確認するのには使ってよい。
- 配置先は `packages/e2e/tests/evidence/<機能>/<振る舞い>.e2e.ts` にする。
  - spec は、capture-pull-request の下書きのディレクトリの `specs/` に置かず、この配置先に置いてコミットする。過去の pull request の機能も撮り直せるようにするためである。
    - スキルの `references/spec-template.e2e.ts` は使わない。
  - `<機能>` と `<振る舞い>` は、E2E の spec と同じ名前の付け方（スキル write-e2e-test の「名前」）にする。
  - 1 つの test が 1 つの観点を撮る。
  - テストの名前は「`<name>` {条件}の場合、{期待}であること」にする。
    - `<name>` は、観点が分かる英小文字、数字、ハイフンの名前である。観点の番号として、テストのフォルダとファイルの名前の先頭になる。
    - スキルの plan.md とスレッドの表の観点の番号には、`<まとまりの番号>-<連番>` ではなく `<name>` を書く。
    - 改修前か改修後かを、テストの名前に入れない。
  - 本文の表の「確認の方法」には、pull request のテンプレートのとおり、spec のファイル名と `<name>` を書く（`` `<spec のファイル名>` の `<name>` ``）。
  - 撮る職員は、describe の `test.use({ storageState })` で選ぶ。describe の名前に、職員の名前と役職を書く。
  - 過去の pull request の機能も、同じ配置先に機能ごとに足す。同じ spec で、改修のたびに撮り直す。
- spec の中で、改修前か改修後かを分岐しない。
  - 改修前と比べるテストには、タグ `@compare` を付ける。
  - `check` の文は改修後の期待にし、確認する関数は、改修前と改修後の両方で通るものにする。
  - 改修前と改修後で、`check` を同じ順に同じ数だけ呼ぶ。
- 見本の spec
  - pull request のエビデンス: `packages/e2e/tests/evidence/schedule/create-dialog.e2e.ts`
  - 録画の外で前準備をするエビデンス: `packages/e2e/tests/evidence/schedule/schedule-deletion-acceptance.e2e.ts`
  - 検証シナリオのエビデンスのテンプレート: `packages/e2e/templates/verification-scenario.e2e.ts`
    - テンプレートは、`tsconfig.json` と ESLint の対象の外に置いてある。
- CI の E2E は、エビデンスの spec を流さない。
  - project の分け方は [E2E のテスト](e2e.md) の Running Tests にある。
- Playwright の録画のほかで撮った WebM を入れるときだけ、次で H.264 の mp4 に変換する。
  - `yuv420p` は幅か高さが奇数だと失敗するので、`scale` で偶数にそろえる。

  ```sh
  ffmpeg -i <名前>.webm -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -movflags +faststart <名前>.mp4
  ```

## Capture Environment

撮るときに開く画面は、変更の種類で選ぶ。

- 手動検証のシナリオがある変更は、検証環境か、ローカルの compose の画面を開く。
- 画面の操作から API までを通す変更と、API だけの変更は、ローカルの compose の画面を開く。
  - API だけの変更は、その API を呼ぶ画面の操作で撮る。
- 画面の UI と見た目の変更は、Storybook の story を開く。
- 画面仕様書とモックの変更は、画面仕様書のモックを開く。

### 撮るコマンド

pull request のエビデンスは、worktrunk で作った worktree の環境で撮る。  
環境の起動の手順は [CONTRIBUTING.md の Running Locally](../../CONTRIBUTING.md#running-locally) にある。  
E2E の設定が worktree の `.env` から URL を読むので、URL の環境変数は渡さない。

```sh
portless compose up -d --build --wait
pnpm --filter @buddy/e2e evidence -g '<name> '
node .claude/skills/playwright-capture/scripts/collect.mjs packages/e2e/evidence/.playwright/改修後.json .ai-out/evidence/<入れる先>/videos
```

- `-g` の `<name>` の後に空白を入れる。入れないと、`<name>` で始まる別の観点も流れる。例は、`schedule-create-dialog` に対する `schedule-create-dialog-close` である。
- テストが失敗しても `collect.mjs` を流す。どこで止まったかを録画で見るためである。
- HTML report は `pnpm --filter @buddy/e2e exec playwright show-report evidence/report/改修後` で開く。step の一覧、判定のスクリーンショット、動画が並ぶ。
- 撮影で作ったデータは、その worktree の DB に残る。
  - E2E の後に撮るときと、撮った後に E2E を流すときは、`portless compose down -v` の後に起動し直し、DB を作り直す。E2E が残した予定が、撮る予定に重なることがある。
- 字幕の上の段には、テストの名前と、撮ったバージョン（`VARIANT`）が出る。

| 環境変数 | 値 | デフォルト |
| --- | --- | --- |
| `VARIANT` | 撮ったバージョンの名前。字幕と、ファイル名の `<バージョン>` に出る | `改修後` |
| `E2E_BASE_URL` | 撮る web の URL | worktree の `.env` の値。無ければ `https://web.buddy.localhost` |
| `E2E_STORYBOOK_URL` | Storybook の URL | `http://localhost:6006` |
| `E2E_SCHEDULE_URL` | 撮る予定の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す | worktree の `.env` の値。無ければ `https://schedule.buddy.localhost` |
| `E2E_RECEIPT_URL` | 撮る照合の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す | worktree の `.env` の値。無ければ `https://receipt.buddy.localhost` |
| `E2E_HYDRA_URL` | 撮る compose の Hydra の URL。API の参照のページに入れるトークンを、ここから取る | worktree の `.env` の値。無ければ `https://hydra.buddy.localhost` |

- コマンドの前で渡した環境変数は、`.env` の値より優先される。

### compose の外で撮るとき

- Storybook、ドキュメントサイト、fake、開発サーバーで撮る spec は、`--no-deps` を付けて流す。
  - evidence の project は setup に依存する。`E2E_BASE_URL` を compose の外に向けると、setup のログインが失敗して spec が流れない。
  - `--no-deps` で流すと setup が流れないので、テストのフォルダの名前の末尾に `_evidence` が付かない。compose で撮ったフォルダには付く。
  - 改修前と改修後は、同じ流し方で撮る。流し方が違うとフォルダの名前が変わり、`compare.sh` で組にできない。

  ```sh
  pnpm --filter @buddy/e2e evidence --no-deps -g '<name> '
  ```

- Storybook の番号は、兄弟の worktree の Storybook とぶつかることがある。撮る前に、`E2E_STORYBOOK_URL` の番号で待ち受けているプロセスが、撮る worktree のものかを確認する。
  - `lsof -iTCP:<番号> -sTCP:LISTEN` でプロセスの番号を出し、`lsof -a -p <プロセスの番号> -d cwd` でそのディレクトリを見る。
  - 別の worktree のものなら、空いた番号で起動し直し、`E2E_STORYBOOK_URL` に渡す。確認しないと、別のバージョンの Storybook を撮ってしまう。
- worktree で `pnpm --filter @buddy/web dev:msw` を撮るときは、`apps/web/.env.msw` の IdP と Valkey を、環境変数で worktree の compose に向ける。
  - `.env.msw` の値は、main の checkout の compose のポート（9000、6379）を指す。
  - 起動するときに、次の 2 つを渡す。
    - `OIDC_ISSUER=http://localhost:<worktree の IdP のポート>/buddy`
    - `SESSION_STORE_URL=redis://localhost:<worktree の Valkey のポート>`
  - 開発サーバーは、起動すると `apps/web/src/routeTree.gen.ts` を書き換える。撮った後に戻す。

### 改修前と比べるとき

- `apps/web` だけの改修では、改修前のブランチの worktree を作り、その環境を `portless compose up -d --build --wait` で起動する。
  - spec は、両方とも改修後の worktree から流す。
    - 改修後を、URL を渡さずに撮ってまとめる。
    - 改修前は、`E2E_BASE_URL` を改修前の環境の web（改修前の worktree の `.env` の `WEB_ORIGIN`）に向け、`VARIANT=改修前` でタグ `@compare` のテストだけを撮る。
    - 前準備で API を呼ぶ spec は、`E2E_SCHEDULE_URL`、`E2E_HYDRA_URL` のように spec が使う URL も、改修前の環境に向ける。向けないと、改修後の環境の API を呼ぶ。改修後の compose を止めていれば、前準備が失敗する。URL の環境変数の一覧は `packages/e2e/tests/fixtures/env.ts` にある。
    - compose のコンテナを docker で操作する spec は、`E2E_COMPOSE_PROJECT` に改修前の worktree の `.env` の `COMPOSE_PROJECT_NAME` を渡す。
      - 当たるのは、`packages/e2e/tests/fixtures/sessionFaults.ts` を使う spec である。渡さないと、改修後の compose のコンテナを操作する。
    - setup の project は、`E2E_BASE_URL` の環境にログインし、ホストごとのファイルに状態を保存する。改修前の環境でもログインの場面は録画されない。
    - まとめた後に、`compare.sh` で改修前と改修後の判定のスクリーンショットを並べる。

    ```sh
    VARIANT=改修前 E2E_BASE_URL=https://web.<改修前のプロジェクト>.localhost \
      pnpm --filter @buddy/e2e evidence --grep @compare tests/evidence/<機能>/<振る舞い>.e2e.ts
    node .claude/skills/playwright-capture/scripts/collect.mjs packages/e2e/evidence/.playwright/改修前.json .ai-out/evidence/<入れる先>/videos
    sh .claude/skills/playwright-capture/scripts/compare.sh .ai-out/evidence/<入れる先>/videos/<テストのフォルダ>
    ```

  - 撮り終えたら、改修前の worktree を `wt remove <ブランチ>` で消す。

- `services/*` も変わる改修と検証環境では、改修前と改修後の環境で 1 回ずつ流す。

### Storybook、モック、スマートフォンの幅、API の参照のページ

- Storybook の story は、`pnpm --filter @buddy/web storybook` で起動し、`storyUrl(<story の ID>)` を開いて撮る。
  - `storyUrl` が返すのは、Storybook の枠を外した `iframe.html` の URL である。
- 画面仕様書のモックは、`mockUrl(<docs/screens/ からの相対パス>)` で、リポジトリのファイルを `file://` のまま開いて撮る。
  - ドキュメントサイトを起動しなくてよい。
- `storyUrl` と `mockUrl` は、`packages/e2e/tests/fixtures/evidence.ts` にある。
- スマートフォンの幅は、describe の `test.use({ viewport: PHONE_VIEWPORT })` で撮る。`PHONE_VIEWPORT`（390x844）は `packages/e2e/tests/fixtures/recording.ts` にある。
  - 録画の大きさは 1280x800 のままで、画面は左右に余白を付けて入る。
  - 幅だけをそろえ、タッチの操作は再現しない。
  - 幅は本文の撮った条件に書く。
- API だけの変更のうち、画面から確認できない操作は、API の参照のページ（Scalar）の「Test Request」から送って撮る。
  - 録画する page で、次の順に呼ぶ。
    1. `packages/e2e/tests/fixtures/apiReference.ts` の `routeApiReference`
    2. `packages/e2e/tests/screens/apiReference.ts` の `openApiReference`
  - トークンが要るときは、fixtures の `issueAccessToken` で、録画の外の前準備で取る。
  - クライアントの欄への入力とレスポンスのスクロールには、`packages/e2e/tests/widgets/apiClient/actions/` の関数を使う。
  - ページはドキュメントサイトを起動せずに `docs/api/` のファイルから開く。リクエストは、撮る compose の API へ送り直す。
  - トークンは認証の欄に伏せ字のまま入れる。字幕には職員の名前だけを出し、トークンの値を出さない。

## Login and Test Data

- ログインは、setup の project が保存した状態を、spec が describe の `test.use({ storageState })` で読む。録画にログインの場面を映さない。
  - evidence の project は `storageState` を持たない。撮る職員は、describe の `test.use({ storageState: LOGIN_STATE })` のように選ぶ。テストの中の `browser.newContext()` も project の `use` を継ぐので、project に置くと前準備のコンテキストまでログイン済みになるためである。
  - setup が保存する職員と足し方は、[E2E のテスト](e2e.md) の Test Data and Login にある。
  - setup に置けない職員（spec の中で登録した職員など）で撮るときは、`prepareOutsideRecording` の中でログインし、`carryLoginTo` に fixture の `context` を渡して cookie を移す。
- テストデータは、シードの職員と利用者を使い、足りないものは録画の外の前準備で作る。
  - 前準備は、`packages/e2e/tests/fixtures/recording.ts` の `prepareOutsideRecording` で、別のブラウザのコンテキストで行う。別のコンテキストは録画されない。
  - 前準備が要るテストは、fixture の `page` を受け取らず、前準備の後に `context.newPage()` で録画する page を開く。fixture の `page` を開いてから前準備をすると、その間が録画に空白の画面として残る。
  - 録画するコンテキストに、2 つ目の page を開かない。`collect.mjs` はテストの最初の動画の添付を mp4 にするので、2 つ目の page の動画が選ばれることがある。
    - 別のタブで操作する前提（別のタブで設定を変える）は、`prepareOutsideRecording` の別のコンテキストで開く。
  - 作り方は E2E の spec と同じく、画面の操作か、予定の API か、calendarpit の管理の API にする。
  - 録画の中では、観点の操作だけを行う。
    - 観点の前提が録画の途中の出来事（開いた後に権限を外される）のときだけ、字幕で撮影のためと断って、録画の中で API を呼んでよい。
  - 撮った後にデータを消さない。撮り終えたら `down -v` で compose ごと消す。
  - ほかの撮影の前提を変える操作は、撮った後に `try/finally` で戻す。
    - 当たる操作は、カレンダーの結び付けと、職員の名前、チーム、権限の変更である。シードのままの DB を前提にする spec があり、戻さないと、全部を 1 回で流したときにその spec が失敗する。
    - 戻せない変更（予定の管理の移行の完了のように、戻す API が無いもの）を持つ spec は、spec の先頭のコメントに「DB を作り直してから単独で流す」と書く。その spec は、`portless compose down -v` の後に起動し直してから、ファイルを指定して流す。
- 認証コードを求められる環境（検証環境）のログインの手順は、検証環境ができてから決める。

## Attachment

ファイルは、gh の `--attach` で pull request のコメントに上げる。  
gh の振る舞いのうちリポジトリによらないものは、capture-pull-request の `references/attach-with-gh.md` にある。参照の書き換え、同じファイルを 2 度渡したとき、一部のファイルが失敗したとき、`-F` での本文の置き換えが当たる。  
ここには、buddy の値と、スキルの手順と違う点を書く。

`--attach` は gh の 2.99 以降にある。  
先に `gh pr comment --help` に `--attach` があるかを確認し、無ければ `mise which gh` のパスの gh を使う。

上げるには、gh でログインしたアカウントが、pull request にコメントを書け、本文を編集できる権限（リポジトリへの書き込みか、自分が作った pull request と issue）を持つ。

上げられるファイルの大きさの上限は、GitHub の文書の [Attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files) で確認する。  
超えるときは、観点を分けて短く撮り直す。  
コメントと本文の文字数の上限は、GitHub の文書の [Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) の Text limits で確認する。

### スキルの手順と違う点

- スレッドは、pull request の会話のコメントで作る。
  - 観点ごとの返信に分けず、観点の表、撮った条件、観点ごとの判定の値と `<details>` を、最初のコメントにまとめる。
  - 上限を超えるときと撮り直したときだけ、コメントを足す。足すコメントの先頭に、最初のコメントへのリンクを書く。
- 本文には、スキルの `pr-video-section.md` と `scripts/update-pr-body.mjs` を使わない。
  - pull request のテンプレートの `## 検証とエビデンス` に、条件、期待結果、確認の方法、結果、エビデンスの表を並べる。動画は、表の「エビデンス」の列のセルに書く。

### 載せる順

1. 観点のまとまりごとに、スレッドの下書きを `.ai-out/evidence/<入れる先>/thread-<番号>-<話題>.md` に書く。
   - 先頭に、観点の表と撮った条件（撮ったコミット、viewport、データ）を置く。表の列は、pull request のテンプレートの「検証とエビデンス」のとおりにする。
   - 観点ごとに、判定の値と、spec と実行の出力の `<details>` を置く。
   - 動画は、表の「エビデンス」の列のセルに、1 本ずつ次の形で書く。`<details>` は閉じて出て、開くとその場で再生できる。改修前と比べるときは、同じセルに「改修前」と「改修後」の 2 つを並べる。

     ```html
     <details><summary><観点名> 改修後の動画</summary><video src="<URL>" controls muted></video></details>
     ```

   - 下書きでは、動画と画像の参照を、リポジトリのルートからの相対パスで `![<名前>](./.ai-out/evidence/<入れる先>/videos/<テストのフォルダ>/<ファイル>)` にし、`--attach` に渡す。投稿した後に、控えた動画の URL を `<video>` の `src` に書き、同じコメントを書き換える。
     - 動画を `<video src="./.ai-out/...">` のまま渡さない。`--attach` は `<video>` の `src` を書き換えず、動画は、どの動画のものかを示す名前の無い URL だけの行で、コメントの末尾に足される。
2. 利用者が下書きを確認してから、最初のコメントを投稿する。
3. 利用者が、投稿したスレッドを pull request の画面で確認する。
   - 直す点があれば、同じコメントを書き換える。
4. 利用者が良いと言ったら、スレッドの動画と画像の URL を、本文の「検証とエビデンス」の表に並べる。
   - 表の上に、スレッドの最初のコメントへのリンクを置く。

### 最初のコメントを投稿する

- リポジトリのルートで、`gh pr comment <番号> -F <下書き> --attach <動画> --attach <画像>` を流す。
- `gh pr comment` は、投稿したコメントの URL（`https://github.com/Fukuemon/buddy/pull/<番号>#issuecomment-<ID>`）を標準出力に出す。URL と、末尾の `<ID>` を控える。書き換えと本文のリンクに使う。
  - コメントの一覧の最後の 1 件から ID を取らない。投稿の間に別のコメントが入ると、別のコメントを書き換える。
- 投稿したコメントを書き換えるときは、取ったコメントの本文を直して、控えた ID で書き戻す。
  - `gh api -X PATCH repos/Fukuemon/buddy/issues/comments/<ID> -F body=@<直した本文>`
  - 動画を差し替えるときは、書き換えずに、撮り直したときの手順で新しいコメントを投稿する。
- 一部のファイルが上がらなかったときは、同じコメントを投稿し直さず、スレッドに足すコメントで上げる。
- 動画を `<video src="./.ai-out/...">` のまま投稿したときも、同じコメントを投稿し直さない。末尾の URL と動画を、ファイルの大きさで対応させてから、`<video>` の `src` を書き換える。
  - 各 URL から取得したファイルの大きさを `curl -sL <URL> | wc -c` で数え、元の動画の大きさを `wc -c < <ファイル>` で数えて比べる。

### 本文に並べる

- 今の本文を `gh pr view <番号> --json body -q .body` で `.ai-out/evidence/<入れる先>/pr-body.orig.md` に取り、「検証とエビデンス」の表だけを直す。
  - スレッドの下書きから本文を作り直さない。画面で直した本文が消える。
- 「エビデンス」の列に、スレッドの動画を「載せる順」の `<details>` と `<video>` の形で書き、画像を `![<判定の文>](<URL>)` で書く。
  - 表のセルの中では、URL だけの行と `![<名前>](<URL>)` の動画は再生できない。`<video>` のタグなら再生の枠になる。
  - 表の下に、観点ごとの動画の見出しを置かない。
- 本文は `gh pr edit <番号> -F <本文>` で書き戻し、`--attach` は渡さない。
- 本文が上限を超えたら、表とスクリーンショットを本文に残し、`<details>` の中身はスレッドにだけ置く。
- issue に不具合の再現と改修前の動きを入れるときは、`gh issue create` か `gh issue edit` の `-F <本文> --attach <ファイル>` で、本文に直接入れる。

### 撮り直したとき

- 撮り直した観点の動画を、スレッドに足すコメントで投稿する。コメントに、撮り直した観点と理由を書く。
  - コメントは、レビューする人への知らせも兼ねる。本文の書き換えは、レビューする人に通知されない。
- 足すコメントでも、動画は表の「エビデンス」の列の `<details>` と `<video>` で書く。
- 利用者が確認してから、本文の表のその観点の `<video>` の `src` だけを、足したコメントの動画の URL に書き換える。
- 本文の表の上のリンクは、最初のコメントを指したままにする。最初のコメントの末尾に、足したコメントへのリンクを書き足し、最初のコメントから撮り直しをたどれるようにする。

### 入ったことを確認する

スレッドのコメントと本文の、上げた先の URL の数と、書き換わらずに残った参照の数を数える。

```sh
gh api repos/Fukuemon/buddy/issues/comments/<ID> --jq .body | grep -o 'github.com/user-attachments/assets/' | wc -l
gh api repos/Fukuemon/buddy/issues/comments/<ID> --jq .body | grep -c '](\./\.ai-out/'
gh api repos/Fukuemon/buddy/pulls/<番号> --jq .body | grep -o 'github.com/user-attachments/assets/' | wc -l
gh api repos/Fukuemon/buddy/pulls/<番号> --jq .body | grep -c '](\./\.ai-out/'
```

- コメントの 1 つ目の数が、そのコメントに上げたファイルの数と合い、本文の 1 つ目の数が、スレッドから並べた URL の数と合う。
- 2 つ目がどちらも 0 になる。
- pull request の画面にログインして開き、再生できることを確認する。ログインしていない画面では、動画はリンクで出る。

### コメントの動画を本文に移す

過去の pull request のコメントに付けた動画は、上げ直さずに、URL を本文の表へ移す。

1. エビデンスのコメントを取る。

   ```sh
   gh api --paginate repos/Fukuemon/buddy/issues/<番号>/comments --jq '.[] | select(.body | test("user-attachments")) | {id, html_url, body}'
   ```

2. コメントの本文から `https://github.com/user-attachments/assets/<ID>` の URL を取り、「本文に並べる」の手順で表の「エビデンス」の列に書く。
3. 「入ったことを確認する」の本文の数が、移した URL の数と合うことを確認する。

差分行のコメントに動画を添える手順は、まだ決めていない。

## Verification Scenarios

検証シナリオは、検証環境ができてから使う。  
決まっている値は次のとおり。

- 検証の設計と検証シナリオのファイルは、`docs/verification/<要求の番号>-<主題>/` に置く。`<要求の番号>` は、検証する要求の issue の番号である。
  - buddy は public なので、置くのは公開してよい中身だけにする。
  - 実在の利用者、職員、事業所の名前とデータを書かない。例の値は、ローカルのシードとテストデータの値にする。
  - 検証環境の URL、ログインの値、トークンを書かない。
- 検証シナリオの spec は、テンプレートの `packages/e2e/templates/verification-scenario.e2e.ts` を写して書く。spec の配置先は、pull request のエビデンスと同じ `packages/e2e/tests/evidence/<機能>/` である。
  - テストの名前は、スキル write-verification-spec の `S<番号> <シナリオ名>` ではなく、pull request のエビデンスと同じ「`<name>` {条件}の場合、{期待}であること」にする。`<name>` は `s<番号>-<話題>` にする。
  - シナリオの識別子（`@scenario-id`）は、spec の先頭のコメントに書く。
  - 字幕は、シナリオの「前提」「もし」「かつ」「ならば」の文を、頭の語を消さずに写す。頭の語の後には空白を置き、コロンを付けない。字幕の色が頭の語で決まる。
    - 操作を持たない「前提」の文は、Capture Tools のとおり `intro` の 2 行目に写す。
  - 例の列と値は、シナリオアウトラインの例の表と、検証シナリオの pull request のチェックの「<列>=<値>」から、文言を変えずに写す。テストの名前の末尾に `<例の番号>_<例の値>` を足す。
  - 改修前と違ってよい差（シナリオの備考）は spec に書かず、撮った後にスキル run-verification-scenarios で備考と照合する。
- エビデンスの一覧は、要求ごとの README にし、`docs/verification/<要求の番号>-<主題>/README.md` に置く。
  - 撮るシナリオ、spec を置かないシナリオ、撮影のための操作と、spec とシナリオの対応を書く。
- 実施の結果を記録する場所は、検証シナリオの pull request である。
  - シナリオごとの mp4 と判定のスクリーンショットを添付する。
  - 添付した後に、担当者、実施日、OK か NG かを書くのは人が行う。
  - 添付する正式なエビデンスは、検証環境で撮ったものにする。ローカル環境で撮ったものは、検証環境で実施する前の確認に使い、添付するかは担当者が決める。
- シナリオを直すときは、検証シナリオの pull request のブランチで直し、pull request の本文に転記した文も同じ文に直す。

次の値は、検証環境ができてから決める。

- 検証環境で撮るときの URL、環境の呼び名、ログインの手順、認証コードを書くファイル
