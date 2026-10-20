---
type: context
title: 証跡
description: 人手検証の証跡の置き場、名前、撮り方の値。検証環境ができてから決める
status: draft
---

# 証跡

人手検証の証跡は、`packages/e2e/kit/` の `recording` と `evidence` で撮る。撮り方は、スキル write-verification-spec と run-verification-scenarios にある。次の値は、どれも未定である。検証環境ができてから決める。

- 検証シナリオのファイルと pull request の置き場
- 証跡の spec の置き場（`evidenceDir` の `<root>` と、その下の `<issue>/`）と、spec の名前の付け方
- 撮る URL、改修前の URL、実施日、環境の名前を渡す環境変数
- 証跡の格納先と、フォルダの名前の決まり
- ログインの手順と、テストデータを作る手順
- 撮るコマンド
- kit を呼ぶ薄い層（`recordEvidence` に置き場とアプリの値を付けて呼ぶもの、`variants` に環境変数を渡すもの）の置き場
