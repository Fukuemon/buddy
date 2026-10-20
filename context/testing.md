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

- E2E のテストは `packages/e2e/tests/` に置き、ルートの compose で立てた全体に向けて流す。手順は CONTRIBUTING.md の「E2E のテストを流す」にある。
  - API と IdP は置き換えず、compose の本物を使う。テストのデータは予定の API に作り、消さない。spec は、題名に時刻を入れて自分の作ったデータを見分ける。
  - project は 2 つある。`setup` は compose の IdP にログインした状態を `packages/e2e/.auth/` に保存し、`e2e` はその状態で spec を流す。
  - 環境変数 `E2E_BASE_URL`（既定は `http://localhost:3000`）と `E2E_LOGIN_NAME`（既定は `dev-aoki`）で、向ける画面とログインの名前を変える。
  - schedule-api は初回のログインで `sub` を職員に結び付ける。手元で青木 陽菜に別の名前で入ったことがあれば、`E2E_LOGIN_NAME` をその名前にするか、`docker compose down -v` でデータを消す。
- 画面を変える pull request では、その画面の流れの E2E を流す。testid を変えたら、E2E と画面仕様書の両方を直す。
- lint と型のチェックは、`packages/e2e` で `pnpm check` を流す。ESLint の規則（`packages/e2e/eslint/e2e-authoring-rule.mjs`）と、その規則のテスト（`pnpm test:rules`）もここにある。
  - 規則は ESLint の cwd から見た `tests/` だけを見る。ルートやエディタから流すと、違反があっても何も言わずに通る。

## Evidence

人手検証の証跡は、`packages/e2e/kit/` の `recording` と `evidence` で撮る。撮り方は、スキル write-verification-spec と run-verification-scenarios にある。次の値は、どれも未定である。検証環境ができてから決める。

- 検証シナリオのファイルと pull request の置き場
- 証跡の spec の置き場（`evidenceDir` の `<root>` と、その下の `<issue>/`）と、spec の名前の付け方
- 撮る URL、改修前の URL、実施日、環境の名前を渡す環境変数
- 証跡の格納先と、フォルダの名前の決まり
- ログインの手順と、テストデータを作る手順
- 撮るコマンド
- kit を呼ぶ薄い層（`recordEvidence` に置き場とアプリの値を付けて呼ぶもの、`variants` に環境変数を渡すもの）の置き場
