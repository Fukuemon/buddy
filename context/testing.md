---
type: context
title: テスト
description: テストの種類ごとの責務、実行に要る環境の条件、置き換えの方針、変更に足すテスト
status: draft
---

# テスト

## Test Types and Guarantees

<!-- テストの種類ごとに、何を保証し、どこに置くか。テストの基盤の構成は Design Doc へリンクする -->

## Runtime Requirements

<!-- 実行に要る環境。環境変数、ポート、外部のサービス -->

## Mocking and Test Data

<!-- 何を本物で動かし、何を置き換えるか。テストのデータの用意の仕方 -->

## Required Tests

<!-- どの変更にどの種類のテストを足すか。リリースの前に通すテスト -->

## E2E

- E2E のテストは `packages/e2e/tests/` に置き、ルートの compose で立てた全体に向けて流す。流すコマンドと project は未定（#9 で決める）。
- lint と型のチェックは、`packages/e2e` で `pnpm check` を流す。ESLint の規則（`packages/e2e/eslint/e2e-authoring-rule.mjs`）と、その規則のテスト（`pnpm test:rules`）もここにある。

## Evidence

人手検証の証跡は、`packages/e2e/kit/` の `recording` と `evidence` で撮る。撮り方は、スキル write-verification-spec と run-verification-scenarios にある。

- 検証シナリオと証跡の spec の置き場、撮る URL と実施日の環境変数、証跡の格納先、ログインの手順は未定。検証環境ができてから決める。
