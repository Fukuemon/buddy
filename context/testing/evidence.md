---
type: context
title: エビデンス
description: エビデンスを付ける変更、元のファイルの配置先と公開の範囲、撮影の手段（エビデンスの spec と見本）、撮る環境と撮るコマンド、ログインとテストデータ、スレッドに投稿してから本文に並べる載せ方、検証シナリオの決まり。検証環境の値は検証環境ができてから決める
status: draft
---

# エビデンス

機能の追加と改修で何を確認したかを示す動画と画像の取り決め。  
観点の決め方、撮り方、pull request への載せ方は、パッケージ verification のスキル capture-pull-request にある。  
buddy は、spec の配置先と本文の表の形がスキルと違う。違う点は [Capture Tools](#capture-tools) と [Attachment](#attachment) にある。

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
  - `<入れる先>` は、撮る人が環境変数 `EVIDENCE_FOR` で渡す。薄い層は、`issue-<番号>` か `pr-<番号>` の形でなければ撮らずに失敗する。
  - 配置先と名前は、kit の `prEvidenceDir` と `recordEvidence` が決める。ファイル名は、スキル capture-browser-evidence の規則ではなく kit の形にする。
    - 観点ごとに `<入れる先>/evidence/<name>_<title>/` ができる。`<name>` と `<title>` は、spec の `recordPrEvidence` に渡した値で、空白とファイル名に使えない文字は `-` になる。
    - 動画は `<name>_実施.mp4` に出る。改修前と改修後を撮ったときは、`<name>_改修前.mp4` と `<name>_改修後.mp4` に出る。
  - 上げるのは、観点ごとの配置先の直下の mp4 と、`frames/` の判定のスクリーンショットである。`cut/` に同じ名前の mp4 があれば、直下の mp4 の代わりに `cut/` の mp4 を上げる。
    - README、`.records/`、`prepare/` は確認に使い、上げない。
- 上げたファイルは、リポジトリを見られる人が開ける。
  - リポジトリを public にすると、見られる人が誰にでも広がる。
  - 写すのは、ローカルのシード、テストデータ、仮の名前だけにする。実在の利用者、職員、事業所のデータは、検証環境で撮るときも写さない。
  - ログインの値とトークンを、画面と字幕に写さない。
- エビデンスは、pull request と issue ごとに本文で見る。
  - 要求をまたぐエビデンスの一覧と、改修前と改修後を並べた比較の画面は持たない。
  - エビデンスを見るための自前の閲覧の環境も作らない。

## Capture Tools

- エビデンスは、Playwright の spec で撮る。
  - spec は、薄い層の `packages/e2e/tests/fixtures/evidence.ts` の `recordPrEvidence` を呼ぶ。
    - 薄い層は、`EVIDENCE_FOR` を `pr`、`name` を観点の番号（`no`）、`title` を観点名にした `PrViewpoint` を作り、kit の `recordEvidence` に渡す。
    - 字幕の 1 段目は `PR <入れる先> <name>` になる。
  - 録画の設計は [agent-harness の e2e の Design Doc](https://github.com/Fukuemon/agent-harness/blob/3eb26d7f7792b15de0880093832823d86bcddc1c/packages/e2e/DesignDoc.md) にある。
  - kit は字幕とカーソルを重ね、H.264 の mp4 を書き出す。変換しない。
  - agent-browser では、エビデンスを撮らない。spec を書く前に、画面の操作の位置を確認するのには使ってよい。
- 配置先は `packages/e2e/tests/evidence/<機能>/<振る舞い>.e2e.ts` にする。
  - spec は、capture-pull-request の下書きのディレクトリの `specs/` に置かず、この配置先に置いてコミットする。過去の pull request の機能も撮り直せるようにするためである。
    - スキルの `references/spec-template.e2e.ts` と `viewpointFromTitle` は使わない。
  - `<機能>` と `<振る舞い>` は、E2E の spec と同じ名前の付け方（スキル write-e2e-test の「名前」）にする。
  - 1 つの test が 1 つの観点を撮る。テストの名前は、E2E と同じ「{条件}の場合、{期待}であること」にする。
  - `recordPrEvidence` の `name` は、観点が分かる英小文字、数字、ハイフンにする。観点の番号として、配置先とファイル名の先頭になる。
    - スキルの plan.md とスレッドの表の観点の番号には、`<まとまりの番号>-<連番>` ではなく `name` を書く。
  - 本文の表の「確認の方法」には、pull request のテンプレートのとおり、spec のファイル名と `name` を書く（`` `<spec のファイル名>` の `<name>` ``）。
  - `actor` には、`prepare` でログインする職員の名前と役職を書く。kit の観点はアクターを持たないので、字幕と README には出ない。
  - 過去の pull request の機能も、同じ配置先に機能ごとに足す。同じ spec で、改修のたびに撮り直す。
- 見本の spec
  - pull request のエビデンス: `packages/e2e/tests/evidence/schedule/create-dialog.e2e.ts`。薄い層の `recordPrEvidence` を呼ぶ。
  - 検証シナリオのエビデンス: `packages/e2e/templates/verification-scenario.e2e.ts`。
    - 検証環境の値が決まるまで、kit を直に呼び、配置先とアプリの値を spec に書く。
    - テンプレートは、`tsconfig.json` と ESLint の対象の外に置いてある。
- viewport は、`recordPrEvidence` のデフォルトの `DESKTOP_VIEWPORT`（1280x800）にする。
- CI の E2E は、エビデンスの spec を流さない。
  - project の分け方は [E2E のテスト](e2e.md) の Running Tests にある。
- kit 以外で撮った WebM を入れるときだけ、次で H.264 の mp4 に変換する。
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

compose を、E2E と別のプロジェクトの名前で、portless で起動して撮る。  
撮影で作ったデータが、E2E を流す DB に残らないようにするためである。

```sh
p=buddy-evidence
# worktree では mise が .env の名前と URL を渡すので、撮る compose の値で上書きする
export COMPOSE_PROJECT_NAME=$p POSTGRES_PORT=15850 VALKEY_PORT=6850 \
  WEB_ORIGIN=https://web.$p.localhost HYDRA_PUBLIC_ORIGIN=https://hydra.$p.localhost \
  BROKER_ORIGIN=https://broker.$p.localhost IDP_ORIGIN=https://idp.$p.localhost
portless compose -p $p up -d --build --wait
EVIDENCE_FOR=<入れる先> E2E_BASE_URL=https://web.$p.localhost \
  E2E_CALENDARPIT_URL=https://calendarpit.$p.localhost E2E_GCALHOLD_URL=https://gcalhold.$p.localhost \
  E2E_SCHEDULE_URL=https://schedule.$p.localhost E2E_RECEIPT_URL=https://receipt.$p.localhost \
  E2E_HYDRA_URL=https://hydra.$p.localhost \
  pnpm --filter @buddy/e2e evidence -g '<test の名前の一部>'
portless compose -p $p down -v
```

| 環境変数 | 値 | デフォルト |
| --- | --- | --- |
| `EVIDENCE_FOR` | 入れる先。`issue-<番号>` か `pr-<番号>`。出力の配置先と字幕に出る | なし。無ければ spec が失敗する |
| `E2E_BASE_URL` | 撮る web の URL | `https://web.buddy.localhost` |
| `EVIDENCE_BEFORE_URL` | 改修前の web の URL。渡すと、改修前と改修後を 1 回で撮る | なし |
| `EVIDENCE_ONLY` | `before` か `after`。`E2E_BASE_URL` をその版として 1 つだけ撮る | なし |
| `E2E_STORYBOOK_URL` | Storybook の URL | `http://localhost:6006` |
| `E2E_SCHEDULE_URL` | 撮る予定の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す | `https://schedule.buddy.localhost` |
| `E2E_RECEIPT_URL` | 撮る照合の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す | `https://receipt.buddy.localhost` |
| `E2E_HYDRA_URL` | 撮る compose の Hydra の URL。API の参照のページに入れるトークンを、ここから取る | `https://hydra.buddy.localhost` |

- pull request のエビデンスは、ローカルの compose で撮る。
  - 実施日を渡さないので、改修前と改修後を別の日に撮っても同じ配置先にそろう。
- 字幕の 1 段目には、撮った worktree のコミットが出る。
  - 未コミットの変更があれば `-dirty` が付く。

### 改修前と比べるとき

- `apps/web` だけの改修では、改修前のブランチの worktree で、2 つ目の compose を別の `-p` とポートで起動する。
  - spec は、両方とも改修後の worktree から流す。
    - 改修前は、`E2E_BASE_URL` を改修前の compose の web に向け、`EVIDENCE_ONLY=before` で撮る。
    - 改修後は、`E2E_BASE_URL` を改修後の compose の web に向け、`EVIDENCE_ONLY=after` で撮る。
    - 観点の配置先の `compare/` に比較の画像ができる。
  - 2 つ目の compose の起動の例は次のとおり。改修前の spec は `E2E_BASE_URL=https://web.buddy-evidence-before.localhost` で流す。

    ```sh
    p=buddy-evidence-before
    export COMPOSE_PROJECT_NAME=$p POSTGRES_PORT=15860 VALKEY_PORT=6860 \
      WEB_ORIGIN=https://web.$p.localhost HYDRA_PUBLIC_ORIGIN=https://hydra.$p.localhost \
      BROKER_ORIGIN=https://broker.$p.localhost IDP_ORIGIN=https://idp.$p.localhost
    portless compose -p $p up -d --build --wait
    ```

- `services/*` も変わる改修と検証環境では、改修前と改修後の環境で 1 回ずつ流す。

### Storybook、モック、スマートフォンの幅、API の参照のページ

- Storybook の story は、`pnpm --filter @buddy/web storybook` で起動し、`storyUrl(<story の ID>)` を開いて撮る。
  - `storyUrl` が返すのは、Storybook の枠を外した `iframe.html` の URL である。
- 画面仕様書のモックは、`mockUrl(<docs/screens/ からの相対パス>)` で、リポジトリのファイルを `file://` のまま開いて撮る。
  - ドキュメントサイトを起動しなくてよい。
- ログインしない story とモックでも、`prepare` で同じ URL を開く。
  - kit は `prepare` が開いた画面から sessionStorage を読むので、何も開かないと失敗する。
- スマートフォンの幅は、`recordPrEvidence` の `viewport` に `PHONE_VIEWPORT`（390x844）を渡して撮る。
  - 幅だけをそろえ、タッチの操作は再現しない。
  - 幅は本文の撮った条件に書く。
- API だけの変更のうち、画面から確認できない操作は、API の参照のページ（Scalar）の「Test Request」から送って撮る。
  - `prepare` で、次の順に呼ぶ。
    1. `packages/e2e/tests/fixtures/apiReference.ts` の `routeApiReference`
    2. `packages/e2e/tests/screens/apiReference.ts` の `openApiReference`
    3. トークンが要るときは、fixtures の `issueAccessToken`
  - 録画の中でも、`routeApiReference` を呼んでからページを開く。
  - クライアントの欄への入力とレスポンスのスクロールには、`packages/e2e/tests/widgets/apiClient/actions/` の関数を使う。
  - ページはドキュメントサイトを起動せずに `docs/api/` のファイルから開く。リクエストは、撮る compose の API へ送り直す。
  - トークンは認証の欄に伏せ字のまま入れる。字幕には職員の名前だけを出し、トークンの値を出さない。

## Login and Test Data

- `recordPrEvidence` の `prepare` で、`packages/e2e/tests/screens/login.ts` の `signInAtBroker` を使って compose のブローカーにログインする。
  - メールは `packages/e2e/tests/fixtures/env.ts` の `LOGIN_EMAIL`（青木 陽菜、マネージャー）か `LEADER.email`（森 健太、チームリーダー）にする。
  - `setup` の project が保存したログインの状態は使わない。`recordEvidence` は新しいコンテキストで録画するためである。
- テストデータは、シードの職員と利用者を使い、足りないものは `prepare` で作る。
  - 作り方は E2E の spec と同じく、画面の操作か calendarpit の管理の API にする。
  - 録画の中では、観点の操作だけを行う。
    - 観点の前提が録画の途中の出来事（開いた後に権限を外される）のときだけ、字幕で撮影のためと断って、録画の中で API を呼んでよい。
  - 撮った後にデータを消さない。撮り終えたら `down -v` で compose ごと消す。
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

   - 下書きでは、動画と画像の参照を、リポジトリのルートからの相対パスで `![<名前>](./.ai-out/evidence/<入れる先>/evidence/<観点の配置先>/<ファイル>)` にし、`--attach` に渡す。投稿した後に、控えた動画の URL を `<video>` の `src` に書き、同じコメントを書き換える。
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
- 検証シナリオの spec は、見本の `packages/e2e/templates/verification-scenario.e2e.ts` を写して書く。
  - `Scenario` の `id` は、シナリオの `@scenario-id` にする。
  - `Scenario` の `issue`、`actor`、`no`、`title` は、配置先のフォルダの名前（`<issue>/<アクター>/S<n>_<シナリオ名>/`）になる。検証シナリオの pull request のエビデンスの名前と同じにする。
  - 例の列と値は、シナリオアウトラインの例の表と、検証シナリオの pull request のチェックの「<列>=<値>」から、文言を変えずに写す。
  - 改修前と違ってよい差（シナリオの備考）は、`<root>/<issue>/differences.ts` に写し、その要求の spec から import する。そのスクリーンショットだけの差は `check` の 2 つ目の引数に、どのスクリーンショットにも映りうる差は `Scenario` の `differences` に渡す。
  - 撮る日の違う 2 回目は、1 回目の実施日を渡して同じ配置先にそろえる。
- エビデンスの一覧は、要求ごとの README にし、`docs/verification/<要求の番号>-<主題>/README.md` に置く。
  - 撮るシナリオ、spec を置かないシナリオ、撮影のための操作と、spec とシナリオの対応を書く。
- 実施の結果を記録する場所は、検証シナリオの pull request である。
  - シナリオごとの配置先の mp4 を添付する。隠しフォルダの `.records/` は添付しない。
  - 添付した後に、担当者、実施日、OK か NG かを書くのは人が行う。
  - 添付する正式なエビデンスは、検証環境で撮ったものにする。ローカル環境で撮ったものは、検証環境で実施する前の確認に使い、添付するかは担当者が決める。
- シナリオを直すときは、検証シナリオの pull request のブランチで直し、pull request の本文に転記した文も同じ文に直す。

次の値は、検証環境ができてから決める。

- 検証シナリオのエビデンスの spec の配置先（`<root>`）
- 検証環境で撮るときの URL、環境の呼び名、ログインの手順、認証コードを書くファイル
- 改修前と改修後の web を 1 つの backend につないで起動し、`EVIDENCE_BEFORE_URL` で 1 回で両方を撮るときの起動のしかた
