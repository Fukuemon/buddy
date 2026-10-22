---
type: context
title: エビデンス
description: エビデンスを付ける変更、格納先（pull request と issue への添付）、エビデンスの spec の配置先と撮るコマンド、ログインとテストデータ、Storybook とモックの撮り方。検証環境の値は検証環境ができてから決める
status: draft
---

# エビデンス

機能の追加と改修で何を確かめたかを示す動画と画像の取り決め。  
撮る観点の決め方と添付の手順は、スキル attach-evidence にある。  
エビデンスの動画は、`packages/e2e/kit/` の `recording` と `evidence` を呼ぶ Playwright の spec で撮る。

## エビデンスを付ける変更

- 機能の追加と改修の pull request には、確かめたことのエビデンスの動画を付ける。画面の変更に限らず、API だけの変更にも付ける。
- 文書、スキル、設定だけの変更には付けない。
  - 振る舞いが変わりうる設定の変更には付ける。例は、依存のライブラリの更新である。
- 不具合の再現と改修前の動きは、issue に付けてよい。

## 格納先

- エビデンスはリポジトリにコミットせず、pull request と issue に gh の `--attach` で直接添付する。添付した動画は、本文の中で再生できる。
- Google Drive には置かない。
- 添付する前の元のファイルは、`.ai-out/evidence/<pull request か issue の番号>/` に一時的に置く。`.ai-out/` は Git で追跡しない。添付を終えたら消す。
- 添付したファイルは、リポジトリを見られる人が開ける。リポジトリを public にすると、見られる人が誰にでも広がる。
  - 写すのは、ローカルのシード、テストデータ、仮の名前だけにする。実在の利用者、職員、事業所のデータは、検証環境で撮るときも写さない。
  - ログインの値とトークンを、画面と字幕に写さない。
- 添付は、pull request と issue ごとにエビデンスを見る形である。要求をまたぐエビデンスの一覧と、改修前と改修後を並べた比較の画面は持たない。それらを見る自前の閲覧の環境は、#69 で扱う。

## エビデンスの spec

pull request と issue のエビデンスは、Playwright の spec で撮る。  
spec は、`packages/e2e/tests/fixtures/evidence.ts` の `recordPrEvidence` から、`packages/e2e/kit/` の `recordEvidence` を呼ぶ。  
spec の書き方はスキル write-verification-spec に、流し方と確かめ方は run-verification-scenarios にある。

- 配置先は `packages/e2e/tests/evidence/<機能>/<振る舞い>.e2e.ts` にする。`<機能>` と `<振る舞い>` は、E2E の spec と同じ名前の付け方（スキル write-e2e-test の「名前」）にする。
  - 1 つの test が 1 つの観点を撮る。`recordPrEvidence` の `name` が、添付する動画のファイル名になる。
  - 過去の pull request の機能も、同じ配置先に機能ごとに足す。同じ spec で、改修のたびに撮り直す。
- CI の E2E は、エビデンスの spec を流さない。
  - `packages/e2e/playwright.config.ts` の `e2e` の project は `tests/specs/` だけを、`evidence` の project は `tests/evidence/` だけを流す。
  - `pnpm e2e` と CI は `--project=e2e` で流す。
- 出力は `.ai-out/evidence/<番号>/` に置く。`<番号>` は、添付する pull request か issue の番号である。
  - 添付するのは `<name>.mp4` である。kit の README、判定のスクリーンショット（`frames/`）、撮った記録（`.records/`）は `<name>/` に入る。
  - `.ai-out/` は、ルートの `.gitignore` が Git の追跡から外している。

### 撮るコマンド

compose を、E2E と別のプロジェクトの名前とポートで起動して撮る。  
撮影で作ったデータが、E2E を流す DB に残らないようにするためである。

```sh
export WEB_PORT=3850 SCHEDULE_API_PORT=8850 RECEIPT_API_PORT=8851 GCALHOLD_PORT=8852 \
  VALKEY_PORT=6850 IDP_PORT=9850 CALENDARPIT_PORT=4850 POSTGRES_PORT=15850
docker compose -p buddy-evidence up --build --wait
EVIDENCE_NO=<番号> E2E_BASE_URL=http://localhost:3850 \
  E2E_CALENDARPIT_URL=http://localhost:4850 E2E_GCALHOLD_URL=http://localhost:8852 \
  pnpm --filter @buddy/e2e evidence -g '<test の名前の一部>'
docker compose -p buddy-evidence down -v
```

| 環境変数 | 値 | デフォルト |
| --- | --- | --- |
| `EVIDENCE_NO` | 添付する pull request か issue の番号。出力の配置先と字幕に出る | なし。無ければ spec が失敗する |
| `E2E_BASE_URL` | 撮る web の URL | `http://localhost:3000` |
| `EVIDENCE_BEFORE_URL` | 改修前の web の URL。渡すと、改修前と改修後を 1 回で撮る | なし |
| `EVIDENCE_ONLY` | `before` か `after`。`E2E_BASE_URL` をその版として 1 つだけ撮る | なし |
| `E2E_STORYBOOK_URL` | Storybook の URL | `http://localhost:6006` |

- 改修前と比べるときは、改修前のブランチの worktree で、2 つ目の compose を別の `-p` とポートで起動する。
  - spec は、両方とも改修後の worktree から流す。改修前は `E2E_BASE_URL` を改修前の compose の web に向けて `EVIDENCE_ONLY=before` で、改修後は改修後の compose に向けて `EVIDENCE_ONLY=after` で撮る。同じ `<name>/` の `compare/` に比較の画像ができる。
  - 2 つ目の compose のポートの組の例は次のとおり。改修前の spec は `E2E_BASE_URL=http://localhost:3860` で流す。

    ```sh
    export WEB_PORT=3860 SCHEDULE_API_PORT=8860 RECEIPT_API_PORT=8861 GCALHOLD_PORT=8862 \
      VALKEY_PORT=6860 IDP_PORT=9860 CALENDARPIT_PORT=4860 POSTGRES_PORT=15860
    docker compose -p buddy-evidence-before up --build --wait
    ```

- 字幕の 1 段目には、撮った worktree のコミットが出る。未コミットの変更があれば `-dirty` が付く。

### ログインとテストデータ

- `recordPrEvidence` の `prepare` で、compose の IdP にログインする。名前は `packages/e2e/tests/fixtures/env.ts` の `LOGIN_NAME`（青木 陽菜、マネージャー）か `LEADER.loginName`（森 健太、チームリーダー）にする。
  - `setup` の project が保存したログインの状態は使わない。`recordEvidence` は新しいコンテキストで録画するためである。
- テストデータは、シードの職員と利用者を使い、足りないものは `prepare` で作る。作り方は E2E の spec と同じく、画面の操作か calendarpit の管理の API にする。
  - 録画の中では、観点の操作だけを行う。
  - 撮った後にデータを消さない。撮り終えたら `down -v` で compose ごと消す。

### Storybook、モック、スマートフォンの幅

- Storybook の story は、`pnpm --filter @buddy/web storybook` で起動し、`storyUrl(<story の ID>)` を開いて撮る。Storybook の枠を外した `iframe.html` の URL である。
- 画面仕様書のモックは、`mockUrl(<docs/screens/ からの相対パス>)` で、リポジトリのファイルを `file://` のまま開いて撮る。文書のサイトを起動しなくてよい。
- ログインしない story とモックでも、`prepare` で同じ URL を開く。kit は `prepare` が開いた画面から sessionStorage を読むので、何も開かないと失敗する。
- スマートフォンの幅は、`recordPrEvidence` の `viewport` に `PHONE_VIEWPORT`（390x844）を渡して撮る。幅だけをそろえ、タッチの操作は再現しない。幅はコメントに書く。

## 未定

次の値は、検証環境ができてから決める。

- 検証シナリオのファイルと pull request の配置先と、検証シナリオのエビデンスの spec の配置先
- 検証環境で撮るときの URL、環境の呼び名、ログインの手順
- 改修前と改修後の web を 1 つの backend につないで起動し、`EVIDENCE_BEFORE_URL` で 1 回で両方を撮るときの起動のしかた
