---
type: context
title: コードと文書の規約
description: 命名、コメント、文書の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない
status: draft
---

# コードと文書の規約

## Naming

<!-- ファイル、識別子、API の名前の付け方。lint で検出できる規則は書かず、判断が要るものだけを書く -->

## Comments

<!-- コメントに何を書き、何を書かないか。使う言語 -->

## Documents

<!-- 文書の書き方のうち、このリポジトリだけの規則。用語の表記、文の区切り方、文書の置き場など。どの文書にも当てはまる一般の規則は書かない -->

## Shared Configuration

<!-- lint、型、テストの共有の設定をどこに置き、どう参照するか -->

## Check Exclusions

<!-- 自動チェックから除外しているものと、その理由 -->

## E2E

E2E のテストのコード（`packages/e2e/tests/`）の書き方は、スキル write-e2e-test と [E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) に従う。ここには、buddy で決めた値だけを書く。

- testid は、画面仕様書（`docs/screens/<画面 ID>.md`）の構成要素の表の `data-testid` の列を正本にする。testid を足すときは、同じ pull request で仕様書の表とワイヤーフレームの `data-testid` にも足す。
  - 形は、小文字の英語と `-` で、`<画面か部品>-<要素>` にする（例: `receipt-check-submit`）。一覧の行のように同じ要素が並ぶものは、末尾に ID を付ける（例: `staff-filter-staff-{職員の id}`）。
- 画面 ID の形は、`docs/screens/index.md` の「画面の ID の規則」にある。`packages/e2e/eslint.config.mjs` の `screenIdPattern` は、その表のドメインと種類の組を止める。ドメインか種類を足したら、`screenIdPattern` にも足す。
  - `schedule-calendar` や `receipt-result-table` のように、画面 ID で始まる testid は `widgets/` に直に書けない。`widgets/` では testid の接頭辞を引数で受ける。
- 固定の待ちを許すファイルは無い。
- 待つ時間の名前は、`packages/e2e/tests/fixtures/timeouts.ts` に置く。
