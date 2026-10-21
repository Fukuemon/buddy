---
type: context
title: エビデンス
description: エビデンスを付ける変更、格納先（pull request と issue への添付）、手動検証のエビデンスの配置先と撮り方の値。手動検証の値は検証環境ができてから決める
status: draft
---

# エビデンス

機能の追加と改修で何を確かめたかを示す動画と画像の取り決め。  
撮り方と添付の手順は、スキル attach-evidence にある。  
手動検証のエビデンスは、`packages/e2e/kit/` の `recording` と `evidence` で撮る。撮り方は、スキル write-verification-spec と run-verification-scenarios にある。

## エビデンスを付ける変更

- 機能の追加と改修の pull request には、確かめたことのエビデンスの動画を付ける。画面の変更に限らず、API だけの変更にも付ける。
- 文書、スキル、設定だけの変更には付けない。
  - 振る舞いが変わりうる設定の変更には付ける。例は、依存のライブラリの更新である。
- 不具合の再現と改修前の動きは、issue に付けてよい。

## 格納先

- エビデンスはリポジトリにコミットせず、pull request と issue に gh の `--attach` で直接添付する。添付した動画は、本文の中で再生できる。
- Google Drive には置かない。
- 添付する前の元のファイルは、`.ai-out/evidence/<pull request か issue の番号>/` に一時的に置く。`.ai-out/` は Git で追跡しない。添付を終えたら消す。
  - E2E の kit で撮ったエビデンスは、kit の配置先（`evidenceDir` の `<issue>/<アクター>/S<n>_<シナリオ名>/`）から添付する。隠しフォルダの `.records/` は添付しない。
- 添付したファイルは、リポジトリを見られる人が開ける。リポジトリを public にすると、見られる人が誰にでも広がる。
  - 写すのは、ローカルのシード、テストデータ、仮の名前だけにする。実在の利用者、職員、事業所のデータは、検証環境で撮るときも写さない。
  - ログインの値とトークンを、画面と字幕に写さない。
- 添付は、pull request と issue ごとにエビデンスを見る形である。要求をまたぐエビデンスの一覧と、改修前と改修後を並べた比較の画面は持たない。それらを見る自前の閲覧の環境は、#69 で扱う。

## 未定

次の値は、検証環境ができてから決める。

- 検証シナリオのファイルと pull request の配置先
- エビデンスの spec の配置先（`evidenceDir` の `<root>` と、その下の `<issue>/`）と、spec の名前の付け方
- 撮る URL、改修前の URL、実施日、環境の名前を渡す環境変数
- ログインの手順と、テストデータを作る手順
- 撮るコマンド。改修前と改修後の web を 2 つ起動して 1 回で両方を撮るときの起動のしかたも含む
- エビデンスの spec を CI の E2E から外す方法。`packages/e2e/playwright.config.ts` の `e2e` の project は、`tests/specs/` の下の `.e2e.ts` を全て流す
- エビデンスの出力（`evidenceDir` の `<root>/<issue>/evidence/`）を Git で追跡しない設定。`.gitignore` には、`<root>` を決めてから足す
- kit を呼ぶ薄い層（`recordEvidence` に配置先とアプリの値を付けて呼ぶもの、`variants` に環境変数を渡すもの）の配置先
