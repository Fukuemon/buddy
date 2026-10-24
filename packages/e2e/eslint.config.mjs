// E2E のテストのコードの書き方の規則。規則は npm の kit（@fukuemon/e2e-kit/eslint）にあり、何を止めるかは DesignDoc.md にある。
// 規則は、この設定のあるディレクトリ（ESLint の cwd）から見た tests/ の下だけを見る。
import { plugin } from '@fukuemon/e2e-kit/eslint'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['tests/**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { e2e: plugin },
    rules: {
      'e2e/e2e-authoring-rule': [
        'error',
        {
          timeoutDefinitionFile: 'tests/fixtures/timeouts.ts',
          screenIdPattern:
            '\\b(schedule|receipt|account|patient|staff)-(list|calendar|detail|new|edit|upload|result|login|error|profile|link|import|review)\\b',
        },
      ],
    },
  },
]
