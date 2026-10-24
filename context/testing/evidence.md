---
type: context
title: エビデンス
description: エビデンスを付ける変更、元のファイルの配置先と公開の範囲、撮影の手段（エビデンスの spec と見本）、撮る環境と撮るコマンド、ログインとテストデータ、gh の --attach での添付の仕方、検証シナリオの決まり。検証環境の値は検証環境ができてから決める
status: draft
---

# エビデンス

機能の追加と改修で何を確認したかを示す動画と画像の取り決め。  
観点の決め方、撮り方、pull request の本文への入れ方は、パッケージ verification のスキル attach-evidence にある。ここには、buddy で決めた値だけを書く。  
エビデンスの動画は、`packages/e2e/kit/` の `recording` と `evidence` を呼ぶ Playwright の spec で撮る。

## Evidence Scope

- 機能の追加と改修の pull request には、確認したことのエビデンスの動画を付ける。画面の変更に限らず、API だけの変更にも付ける。
- 文書、スキル、設定だけの変更には付けない。
  - 振る舞いが変わりうる設定の変更には付ける。例は、依存のライブラリの更新である。
- 不具合の再現と改修前の動きは、issue に付けてよい。

## Storage and Visibility

- エビデンスはリポジトリにコミットせず、pull request の本文の「検証とエビデンス」の表に直接入れる。入れた動画は、本文の中で再生できる。
  - コメントには付けない。観点の条件と期待結果とエビデンスを、本文の 1 つの表で読み合わせるためである。
  - 例外は、スキル attach-evidence がコメントを使うとする、撮り直したときの知らせと、本文が上限を超えたときだけにする。
- Google Drive には置かない。
- 入れる前の元のファイルは、`.ai-out/evidence/<番号>/` に一時的に置く。`.ai-out/` は Git で追跡しない。本文に入れ終えたら消す。
  - `<番号>` は、本文に入れる pull request の番号にする。pull request を作る前に撮るときは、対応する issue の番号にする。
  - 配置先と名前は、スキル capture-browser-evidence の配置先と名前の規則ではなく、`packages/e2e/kit/` の `evidence` が決める。ファイルは `<番号>/<name>.mp4` と `<番号>/<name>/` に出る。`<name>` は、spec の `recordPrEvidence` に渡した `name` である。
  - `<name>/` には、kit の README、判定のスクリーンショット（`frames/`）、撮った記録（`.records/`）、改修前と比べたときの比較の画像（`compare/`）が入る。
  - 本文に入れるのは、`<name>.mp4` と、`<name>/frames/` の判定のスクリーンショットである。README と `.records/` は確認に使い、入れない。
- 本文に入れたファイルは、リポジトリを見られる人が開ける。リポジトリを public にすると、見られる人が誰にでも広がる。
  - 写すのは、ローカルのシード、テストデータ、仮の名前だけにする。実在の利用者、職員、事業所のデータは、検証環境で撮るときも写さない。
  - ログインの値とトークンを、画面と字幕に写さない。
- 本文への添付は、pull request と issue ごとにエビデンスを見る形である。要求をまたぐエビデンスの一覧と、改修前と改修後を並べた比較の画面は持たない。それらを見る自前の閲覧の環境も作らない。

## Capture Tools

- エビデンスは、Playwright の spec で撮る。spec は、薄い層の `packages/e2e/tests/fixtures/evidence.ts` の `recordPrEvidence` から、`packages/e2e/kit/` の `recordEvidence` を呼ぶ。録画の設計は [エビデンスの録画](../../packages/e2e/kit/recording/DesignDoc.md) にある。
  - kit は字幕とカーソルを重ね、H.264 の mp4 を書き出す。変換しない。
  - agent-browser では、エビデンスを撮らない。spec を書く前に、画面の操作の位置を確認するのには使ってよい。
- 配置先は `packages/e2e/tests/evidence/<機能>/<振る舞い>.e2e.ts` にする。`<機能>` と `<振る舞い>` は、E2E の spec と同じ名前の付け方（スキル write-e2e-test の「名前」）にする。
  - 1 つの test が 1 つの観点を撮る。テストの名前は、E2E と同じ「{条件}の場合、{期待}であること」にする。
  - `recordPrEvidence` の `name` は、観点が分かる英小文字、数字、ハイフンにする。本文に入れる動画のファイル名になり、本文の表の「確認の方法」に test の名前と並べて書く。
  - 字幕に出すアクターは、`prepare` でログインする職員の名前と役職にする。
  - 過去の pull request の機能も、同じ配置先に機能ごとに足す。同じ spec で、改修のたびに撮り直す。
- 見本の spec
  - pull request のエビデンス: `packages/e2e/tests/evidence/schedule/create-dialog.e2e.ts`。薄い層の `recordPrEvidence` を呼ぶ。
  - 検証シナリオのエビデンス: `packages/e2e/templates/verification-scenario.e2e.ts`。検証環境の値が決まるまで、kit を直に呼び、配置先とアプリの値を spec に書く。テンプレートは、`tsconfig.json` と ESLint の対象の外に置いてある。
- viewport は、`recordPrEvidence` のデフォルトの `DESKTOP_VIEWPORT`（1280x800）にする。
- CI の E2E は、エビデンスの spec を流さない。
  - `packages/e2e/playwright.config.ts` の `e2e` の project は `tests/specs/` だけを、`evidence` の project は `tests/evidence/` だけを流す。
  - `pnpm e2e` と CI は `--project=e2e` で流す。
- kit 以外で撮った WebM を入れるときだけ、次で H.264 の mp4 に変換する。`yuv420p` は幅か高さが奇数だと失敗するので、`scale` で偶数にそろえる。

  ```sh
  ffmpeg -i <名前>.webm -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -movflags +faststart <名前>.mp4
  ```

## Capture Environment

撮る画面は、変更の種類で次のように選ぶ。

| 変更 | 開くもの |
| --- | --- |
| 手動検証のシナリオがある | 検証環境か、ローカルの compose の画面 |
| 画面の操作から API までを通す、API だけ | ローカルの compose の画面。API だけの変更は、その API を呼ぶ画面の操作で撮る |
| 画面の UI と見た目 | Storybook の story |
| 画面仕様書とモック | 画面仕様書のモック |

### 撮るコマンド

compose を、E2E と別のプロジェクトの名前とポートで起動して撮る。  
撮影で作ったデータが、E2E を流す DB に残らないようにするためである。

```sh
export WEB_PORT=3850 SCHEDULE_PORT=8850 RECEIPT_PORT=8851 GCALHOLD_PORT=8852 \
  VALKEY_PORT=6850 IDP_PORT=9850 CALENDARPIT_PORT=4850 POSTGRES_PORT=15850 \
  HYDRA_PUBLIC_PORT=4854 HYDRA_ADMIN_PORT=4855 BROKER_PORT=8853
docker compose -p buddy-evidence up --build --wait
EVIDENCE_NO=<番号> E2E_BASE_URL=http://localhost:3850 \
  E2E_CALENDARPIT_URL=http://localhost:4850 E2E_GCALHOLD_URL=http://localhost:8852 \
  E2E_SCHEDULE_URL=http://localhost:8850 E2E_RECEIPT_URL=http://localhost:8851 \
  E2E_HYDRA_URL=http://localhost:4854 \
  pnpm --filter @buddy/e2e evidence -g '<test の名前の一部>'
docker compose -p buddy-evidence down -v
```

| 環境変数 | 値 | デフォルト |
| --- | --- | --- |
| `EVIDENCE_NO` | 本文に入れる pull request の番号か、作る前なら issue の番号。出力の配置先と字幕に出る | なし。無ければ spec が失敗する |
| `E2E_BASE_URL` | 撮る web の URL | `http://localhost:3000` |
| `EVIDENCE_BEFORE_URL` | 改修前の web の URL。渡すと、改修前と改修後を 1 回で撮る | なし |
| `EVIDENCE_ONLY` | `before` か `after`。`E2E_BASE_URL` をその版として 1 つだけ撮る | なし |
| `E2E_STORYBOOK_URL` | Storybook の URL | `http://localhost:6006` |
| `E2E_SCHEDULE_URL` | 撮る予定の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す | `http://localhost:8080` |
| `E2E_RECEIPT_URL` | 撮る照合の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す | `http://localhost:8090` |
| `E2E_HYDRA_URL` | 撮る compose の Hydra の URL。API の参照のページに入れるトークンを、ここから取る | `http://localhost:4444` |

- pull request のエビデンスは、ローカルの compose で撮る。実施日を渡さないので、改修前と改修後を別の日に撮っても同じ配置先にそろう。
- 字幕の 1 段目には、撮った worktree のコミットが出る。未コミットの変更があれば `-dirty` が付く。

### 改修前と比べるとき

- `apps/web` だけの改修では、改修前のブランチの worktree で、2 つ目の compose を別の `-p` とポートで起動する。
  - spec は、両方とも改修後の worktree から流す。改修前は `E2E_BASE_URL` を改修前の compose の web に向けて `EVIDENCE_ONLY=before` で、改修後は改修後の compose に向けて `EVIDENCE_ONLY=after` で撮る。同じ `<name>/` の `compare/` に比較の画像ができる。
  - 2 つ目の compose のポートの組の例は次のとおり。改修前の spec は `E2E_BASE_URL=http://localhost:3860` で流す。

    ```sh
    export WEB_PORT=3860 SCHEDULE_PORT=8860 RECEIPT_PORT=8861 GCALHOLD_PORT=8862 \
      VALKEY_PORT=6860 IDP_PORT=9860 CALENDARPIT_PORT=4860 POSTGRES_PORT=15860 \
      HYDRA_PUBLIC_PORT=4864 HYDRA_ADMIN_PORT=4865 BROKER_PORT=8863
    docker compose -p buddy-evidence-before up --build --wait
    ```

- `services/*` も変わる改修と検証環境では、改修前と改修後の環境で 1 回ずつ流す。

### Storybook、モック、スマートフォンの幅、API の参照のページ

- Storybook の story は、`pnpm --filter @buddy/web storybook` で起動し、`storyUrl(<story の ID>)` を開いて撮る。Storybook の枠を外した `iframe.html` の URL である。
- 画面仕様書のモックは、`mockUrl(<docs/screens/ からの相対パス>)` で、リポジトリのファイルを `file://` のまま開いて撮る。ドキュメントサイトを起動しなくてよい。
- ログインしない story とモックでも、`prepare` で同じ URL を開く。kit は `prepare` が開いた画面から sessionStorage を読むので、何も開かないと失敗する。
- スマートフォンの幅は、`recordPrEvidence` の `viewport` に `PHONE_VIEWPORT`（390x844）を渡して撮る。幅だけをそろえ、タッチの操作は再現しない。幅は本文の撮った条件に書く。
- API だけの変更のうち、画面から確認できない操作は、API の参照のページ（Scalar）の「Test Request」から送って撮る。
  - `prepare` に `packages/e2e/tests/fixtures/apiReference.ts` の `prepareApiReference` を渡し、録画の中で `routeApiReference` を張ってからページを開く。ページはドキュメントサイトを起動せずに `docs/api/` のファイルから開き、リクエストを撮る compose の API へ送り直す。
  - トークンは認証の欄に伏せ字のまま入れる。字幕には職員の名前だけを出し、トークンの値を出さない。

## Login and Test Data

- `recordPrEvidence` の `prepare` で、`packages/e2e/tests/screens/login.ts` の `signInAtBroker` で compose のブローカーにログインする。メールは `packages/e2e/tests/fixtures/env.ts` の `LOGIN_EMAIL`（青木 陽菜、マネージャー）か `LEADER.email`（森 健太、チームリーダー）にする。
  - `setup` の project が保存したログインの状態は使わない。`recordEvidence` は新しいコンテキストで録画するためである。
- テストデータは、シードの職員と利用者を使い、足りないものは `prepare` で作る。作り方は E2E の spec と同じく、画面の操作か calendarpit の管理の API にする。
  - 録画の中では、観点の操作だけを行う。
  - 撮った後にデータを消さない。撮り終えたら `down -v` で compose ごと消す。
- 認証コードを求められる環境（検証環境）のログインの手順は、検証環境ができてから決める。

## Attachment

ファイルは、gh の `--attach` で pull request と issue の本文に入れる。`--attach` は gh の 2.99 以降にある。  
先に `gh pr create --help` に `--attach` があるかを確認し、無ければ `mise which gh` のパスの gh を使う。  
上げられるファイルの大きさの上限は、GitHub の文書の [Attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files) で確認する。超えるときは、観点を分けて短く撮り直す。

### 本文に入れる

- 本文は `.ai-out/prs/` のファイルに書き、エビデンスの参照を `![<名前>](./.ai-out/evidence/<番号>/<ファイル>)` にする。
- リポジトリのルートで流し、`--attach` に本文と同じパスを渡す。gh が本文の参照を、アップロード先の URL に書き換える。
  - 作るとき: `gh pr create -B develop -t "<題>" -F <本文> --attach <動画> --attach <画像>`。マージ先は `develop` である。
  - 作った後に足すとき: `gh pr edit <番号> -F <本文> --attach <足すファイル>`
  - 撮り直して差し替えるとき: 作った後に足すときと同じ手順で、差し替える観点の参照だけを新しいファイルに書き換える。
- `-F` は本文を全部置き換える。作った後に足すときは、先に `gh pr view <番号> --json body -q .body` で今の本文を取り、入れ済みの URL を残したまま、足すファイルの参照だけを書く。`--attach` には足すファイルだけを渡す。
- 同じファイルを 2 度渡すと失敗する。
- 本文が参照しないファイルは、本文の末尾に足される。
- 一部のファイルだけが失敗すると、gh は 0 以外で終わり、上がったファイルだけで本文を作る。失敗したファイルを、作った後に足す手順で足す。
- issue には、`gh issue create` か `gh issue edit` の `--attach` を、同じ形で使う。
- 本文の文字数の上限は未確認である。超えたら、スキル attach-evidence のとおり、表とスクリーンショットを本文に残し、`<details>` の中身をコメントへ移す。

### 入ったことを確認する

```sh
gh api repos/Fukuemon/buddy/pulls/<番号> --jq .body | grep -o 'github.com/user-attachments/assets/' | wc -l
gh api repos/Fukuemon/buddy/pulls/<番号> --jq .body | grep -c '](\./\.ai-out/'
```

- 1 つ目の数が、本文に入れたファイルの数の合計と合う。
- 2 つ目が 0 で、書き換わらずに残った参照が無い。
- 表のセルの中の動画の参照は `[<名前>](<URL>)` に書き換わる。pull request の画面にログインして開き、再生できることを確認する。ログインしていない画面では、動画はリンクで出る。

### コメントの動画を本文に移す

過去の pull request のコメントに付けた動画は、アップロードし直さずに、URL を本文の表へ移す。

1. エビデンスのコメントを取る。

   ```sh
   gh api repos/Fukuemon/buddy/issues/<番号>/comments --jq '.[] | select(.body | test("user-attachments")) | {id, body}'
   ```

2. コメントの本文から `https://github.com/user-attachments/assets/<ID>` の URL を取り、観点ごとに本文の表の「エビデンス」の列に `[<name>](<URL>)` で書く。
3. `gh pr edit <番号> -F <本文>` で本文を置き換える。`--attach` は渡さない。
4. 「入ったことを確認する」の 1 つ目の数が、移した URL の数と合うことを確認する。
5. コメントは消さない。コメントを消したときに、本文の URL が開けるかは未確認である。

差分行のコメントに動画を添える手順は、まだ決めていない。

## Verification Scenarios

検証シナリオは、検証環境ができてから使う。決まっている値は次のとおり。

- 検証シナリオの spec は、見本の `packages/e2e/templates/verification-scenario.e2e.ts` を写して書く。
  - `Scenario` の `id` は、シナリオの `@scenario-id` にする。
  - `Scenario` の `issue`、`actor`、`no`、`title` は、配置先のフォルダの名前（`<issue>/<アクター>/S<n>_<シナリオ名>/`）になる。検証シナリオの pull request のエビデンスの名前と同じにする。
  - 例の列と値は、シナリオアウトラインの例の表と、検証シナリオの pull request のチェックの「<列>=<値>」から、文言を変えずに写す。
  - 改修前と違ってよい差（シナリオの備考）は、`<root>/<issue>/differences.ts` に写し、その要求の spec から import する。そのスクリーンショットだけの差は `check` の 2 つ目の引数に、どのスクリーンショットにも映りうる差は `Scenario` の `differences` に渡す。
  - 撮る日の違う 2 回目は、1 回目の実施日を渡して同じ配置先にそろえる。
- エビデンスの一覧は、要求ごとの README にする。撮るシナリオ、spec を置かないシナリオ、撮影のための操作と、spec とシナリオの対応を書く。
- 実施の結果を記録する場所は、検証シナリオの pull request である。
  - シナリオごとの配置先の mp4 を添付する。隠しフォルダの `.records/` は添付しない。
  - 添付した後に、担当者、実施日、OK か NG かを書くのは人が行う。
  - 添付する正式なエビデンスは、検証環境で撮ったものにする。ローカル環境で撮ったものは、検証環境で実施する前の確認に使い、添付するかは担当者が決める。
- シナリオを直すときは、検証シナリオの pull request のブランチで直し、pull request の本文に転記した文も同じ文に直す。

次の値は、検証環境ができてから決める。

- 検証シナリオのファイルと pull request の配置先と、検証シナリオのエビデンスの spec の配置先（`<root>`）
- 検証環境で撮るときの URL、環境の呼び名、ログインの手順、認証コードを書くファイル
- 改修前と改修後の web を 1 つの backend につないで起動し、`EVIDENCE_BEFORE_URL` で 1 回で両方を撮るときの起動のしかた
