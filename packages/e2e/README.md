# @buddy/e2e

buddy の E2E のテストと、人手検証の証跡を撮る仕組み。

- `kit/`: 録画（`recording`）、証跡の置き場と名前（`evidence`）、ログインの状態の保存（`auth`）
- `eslint/`: E2E のテストのコードの書き方の規則（`e2e-authoring-rule.mjs`）と、そのテスト
- `tests/`: E2E のテスト。層（specs、setup、screens、widgets、selectors、fixtures）は [DesignDoc.md](DesignDoc.md) にある

書き方は、スキル write-e2e-test、write-verification-spec、run-verification-scenarios（`.claude/skills/`）が持つ。buddy で決めた値は `context/conventions.md` と `context/testing.md` の E2E の節にある。

## 元のリポジトリ

kit、規則、スキル、Design Doc は、[Fukuemon/verification](https://github.com/Fukuemon/verification) のコミット 0376e6b から写した。依存として入れず、buddy で使いながら直し、後で汎用の形に戻す。  
地図の操作（`map/google`）は、buddy に地図が無いので写していない。

## 確かめる

| コマンド | 確かめること |
| --- | --- |
| `pnpm --filter @buddy/e2e check` | 整形と lint（Vite+）、E2E の書き方の規則（ESLint）、型のチェック |
| `pnpm --filter @buddy/e2e test:rules` | ESLint の規則のテスト |

録画には、`ffmpeg` と `ffprobe` が要る。
