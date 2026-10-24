# @buddy/e2e

buddy の E2E のテストと、手動検証のエビデンスを撮る spec。

- `tests/`: E2E のテスト。層（specs、setup、screens、widgets、selectors、fixtures）は [DesignDoc.md](DesignDoc.md) にある
  - `tests/evidence/`: エビデンスの動画を撮る spec。kit を呼ぶ薄い層は `tests/fixtures/evidence.ts` にある
- `templates/`: 検証シナリオのエビデンスを撮る spec の見本。型のチェックと ESLint の対象の外に置く

録画、エビデンスの配置先と名前、ログインの状態の保存、テストの書き方の ESLint の規則は、npm の kit `@fukuemon/e2e-kit` が持つ。バージョンは `package.json` に固定で書き、agent-harness のパッケージ e2e のスキル setup-e2e の `kit-version.json` とそろえる。  
書き方は、agent-harness のパッケージ e2e と verification のスキル write-e2e-test、write-verification-spec、run-verification-scenarios が持つ。buddy で決めた値は `context/testing/e2e.md` と `context/testing/evidence.md` にある。

## テストとチェック

| コマンド | 確認すること |
| --- | --- |
| `pnpm e2e`（ルート） | compose に向けて、ログイン、予定の作成、照合の流れを流す。先に `docker compose up --build --wait` で起動する。エビデンスの spec は流さない |
| `pnpm --filter @buddy/e2e evidence` | エビデンスの spec を流し、`.ai-out/evidence/<入れる先>/` に mp4 を書き出す。入れる先と環境変数は `context/testing/evidence.md` にある |
| `pnpm --filter @buddy/e2e check` | 整形と lint（Vite+）、E2E の書き方の規則（ESLint）、型のチェック |

録画には、`ffmpeg` と `ffprobe` が要る。

## ドキュメント

- [DesignDoc.md](DesignDoc.md): テストのコードの層、配置先、名前、待ち方、確認の方法
- kit の録画とエビデンスの配置先の設計: [agent-harness の e2e の Design Doc](https://github.com/Fukuemon/agent-harness/blob/5560ae1e031686f5821ecac0d7c12d8fb6ea3499/packages/e2e/DesignDoc.md)
- 流し方は [CONTRIBUTING.md](../../CONTRIBUTING.md) の「E2E のテストを流す」にある
