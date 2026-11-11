# @buddy/e2e

buddy の E2E のテストと、手動検証のエビデンスを撮る spec。

- `tests/`: E2E のテスト
  - 層（specs、setup、screens、widgets、selectors、fixtures）は [DesignDoc.md](DesignDoc.md) にある。
  - `tests/evidence/`: エビデンスの動画を撮る spec
    - 字幕の関数は `tests/fixtures/caption.ts`、録画の外の前準備は `tests/fixtures/recording.ts` にある。
    - Storybook の story と画面仕様書のモックを開く URL の関数は `tests/fixtures/evidence.ts` にある。
- `templates/`: 検証シナリオのエビデンスを撮る spec のテンプレート
  - 型のチェックと ESLint の対象の外に置く。
- `eslint/`: テストの書き方の ESLint の規則。agent-harness のスキル setup-e2e-lint から写したもの
- `playwright.capture.config.ts`: エビデンスを撮るときの config。E2E の config に録画と字幕を足す

録画と字幕は、Playwright の録画と、agent-harness のスキル playwright-capture から写した撮影の config と字幕の関数で撮る。  
ログインの状態は、setup の project が流すたびにログインして保存する。

書き方は、agent-harness のパッケージ e2e、capture、verification のスキルが持つ。テストは write-e2e-test、pull request の動作確認は capture-pull-request にある。検証シナリオは write-verification-spec と run-verification-scenarios にある。  
buddy で決めた値は `context/testing/e2e.md` と `context/testing/evidence.md` にある。

## Tests and Checks

| コマンド | 確認すること |
| --- | --- |
| `pnpm e2e`（ルート） | compose に向けて E2E を流す。エビデンスの spec は流さない |
| `pnpm --filter @buddy/e2e evidence` | 撮影の config でエビデンスの spec を流し、`evidence/` に元の録画と HTML report を書き出す。まとめ方と環境変数は `context/testing/evidence.md` にある |
| `pnpm --filter @buddy/e2e check` | 整形と lint（Vite+）、E2E の書き方の規則（ESLint）、型のチェック |

録画を mp4 にまとめるには、`ffmpeg` が要る。

## Documentation

- [DesignDoc.md](DesignDoc.md): テストのコードの層、配置先、名前、待ち方、確認の方法
- 撮影の仕組みの設計: [agent-harness の capture の Design Doc](https://github.com/Fukuemon/agent-harness/blob/88837579581c259011789bdf423483bccefe919f/packages/capture/DesignDoc.md)
- [CONTRIBUTING.md の E2E Tests](../../CONTRIBUTING.md#e2e-tests): テストの流し方
