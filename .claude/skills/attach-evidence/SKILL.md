---
name: attach-evidence
description: 機能の追加と改修の pull request と issue に、確かめたことの証跡の動画を撮り、gh の --attach で直接添付するときに使う。「証跡の動画を付けて」「動画を pull request に添付して」「確認したことを動画で示して」で読み込む。人手検証のシナリオを packages/e2e/kit で撮る spec を書くときは write-verification-spec を、流して確かめるときは run-verification-scenarios を使う。
---

# attach-evidence

証跡を付ける変更、元のファイルの置き場、写してよいデータは、`context/testing/evidence.md` が持つ。  
このスキルは、撮る、変換する、添付する、本文に書くときの判断だけを持つ。

## 始める前に読むもの

- `context/testing/evidence.md` の「証跡を付ける変更」と「格納先」
- 対応する issue の完了の条件と、pull request の差分

## 撮る観点を決める

観点は、変更の受け入れ条件から作る。推測で足さない。

- 観点と要件の文は、スキル design-test-cases で作る。入っていなければ、issue の完了の条件の項目ごとに 1 つの観点にする。
- 人手検証のシナリオ（前提、もし、かつ、ならば の文）があれば、観点はシナリオに従う。
- 1 本の動画には 1 つの観点だけを撮る。レビューする人が、観点と動画を 1 対 1 で読み合わせられる。
- 撮る観点の一覧を、撮る前に利用者に見せる。

## 撮る

元のファイルは `.ai-out/evidence/<pull request か issue の番号>/` に置く。  
写すデータは、手元のシードとテストデータだけにする。

| 変更 | 撮るもの | 撮り方 |
| --- | --- | --- |
| 人手検証のシナリオがある | 検証環境か手元の compose の画面 | E2E の kit の `recording`。spec は write-verification-spec、流し方と確かめ方は run-verification-scenarios |
| 画面の UI と見た目 | Storybook の story | agent-browser の `record` |
| 画面仕様書とモック | 画面仕様書のモック | agent-browser の `record` |
| 画面の操作から API までを通す | 手元の compose の画面 | agent-browser の `record` |
| API だけ | 手元の compose の画面か、文書のサイトの API の仕様のページ（Scalar） | agent-browser の `record` |

- Storybook は `pnpm --filter @buddy/web storybook` で開く。録画は、Storybook の枠を外した `iframe.html?id=<story の ID>&viewMode=story` の URL で撮る。
- 画面仕様書のモックは、`uv run zensical serve` で開いた文書のサイトの「別タブで開く」の URL で撮る。
- API の仕様のページから手元の API を呼ぶ手順は、CONTRIBUTING.md の「手元で全部を動かす」にある。トークンの値が映る欄は、撮る範囲に入れない。
- スマートフォンの幅で確かめる変更は、`agent-browser set viewport` で幅をそろえてから撮る。幅は本文に書く。

agent-browser では、画面を開いて操作の位置を確かめてから、録画を始める。

```sh
agent-browser open <URL>
agent-browser record start .ai-out/evidence/<番号>/<名前>.webm
# 観点の操作
agent-browser record stop
```

- 名前は、観点が分かる英数字とハイフンにする。添付したファイル名は、動画の上に表示される。
- 操作の間に `agent-browser wait` を入れ、結果の画面を 1 秒以上映す。速すぎる動画では、レビューする人が結果を読み取れない。
- 撮り終えたら、run-verification-scenarios の「確かめる」にある 1 秒ごとの一覧で、失敗の通知、空白の画面、実在のデータが映っていないかを見る。

## mp4 に変換する

agent-browser は WebM で書き出す。  
GitHub の動画のプレイヤーで再生できる形にそろえるため、H.264 の mp4 にする。

```sh
ffmpeg -i <名前>.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart <名前>.mp4
```

E2E の kit は mp4 を書き出すので、変換しない。

## 添付する

`--attach` は gh の 2.99 以降にある。  
先に `gh --version` を確かめる。  
2.99 より古ければ、リポジトリの `mise.toml` の gh を `mise install` で入れ、`mise which gh` で表示されたパスの gh を使う。

- 観点ごとに、pull request のコメントに 1 本ずつ添付する。本文は、観点と撮った場所を 1 文から 2 文で書く。

  ```sh
  gh pr comment <番号> -b "証跡: <観点の文>。<撮った場所。story の名前、画面、幅>で撮った。" --attach .ai-out/evidence/<番号>/<名前>.mp4
  ```

- 画像は `--attach '<パス>#<代替テキスト>'` で代替テキストを付ける。動画には代替テキストを付けられないので、コメントの文で中身を説明する。
- 本文に同じパスへの参照（`![代替テキスト](./<名前>.png)`）を書くと、gh がその参照を添付したファイルの URL に置き換える。参照の無いファイルは本文の末尾に付く。
- issue に添付するのは、不具合の再現と改修前の動きのように、pull request より先に示すものだけにする。`gh issue comment <番号> --attach` を使う。
- 1 回の実行で付けられるのは 50 ファイルまで。一部の添付だけが失敗すると、gh は 0 以外で終わる。終了コードを見て、失敗したファイルだけを付け直す。

## 本文の「確認したこと」に書く

- 観点ごとに 1 項目にし、確かめた結果を 1 文で書く。項目の入れ子に、その観点の証跡のコメントへのリンクを置く。
- 自動のテストとチェック（コマンドと結果）は、証跡の動画と別の項目に書く。
- 撮らなかった観点は「未実施」と理由を書く。

## 終えたら

- 添付した動画をコメントで開き、再生できることを確かめる。
- `.ai-out/evidence/<番号>/` の元のファイルのうち、自分が作ったものを消す。
- 利用者に、撮った観点と本数、証跡のコメントの URL、撮らなかった観点を伝える。
