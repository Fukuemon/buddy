---
type: context
title: 証跡
description: 人手検証の証跡の置き場、名前、撮り方の値。検証環境ができてから決める
status: draft
---

# 証跡

人手検証の証跡は、`packages/e2e/kit/` の `recording` と `evidence` で撮る。撮り方は、スキル write-verification-spec と run-verification-scenarios にある。

## 格納先

- 証跡（画像と動画）はリポジトリに置かず、利用者が管理する Google Drive の共有のフォルダに置く。リポジトリは将来 public にする可能性があり、証跡に画面の値が写るためである。
- フォルダの場所はリポジトリ、issue、pull request に書かない。pull request からは、そのフォルダの中の証跡へのリンクだけを張る。リンクは、共有の設定で見られる人を絞ったものにする。
- Drive に置くのは、自前の閲覧の環境（#69）ができるまでである。

## 未定

次の値は、検証環境ができてから決める。

- 検証シナリオのファイルと pull request の置き場
- 証跡の spec の置き場（`evidenceDir` の `<root>` と、その下の `<issue>/`）と、spec の名前の付け方
- 撮る URL、改修前の URL、実施日、環境の名前を渡す環境変数
- 格納先の中のフォルダの名前の決まり
- ログインの手順と、テストデータを作る手順
- 撮るコマンド
- kit を呼ぶ薄い層（`recordEvidence` に置き場とアプリの値を付けて呼ぶもの、`variants` に環境変数を渡すもの）の置き場
