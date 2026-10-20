// E2E のテストのコードの書き方の規則。何を止めるかは eslint/e2e-authoring-rule.mjs と DesignDoc.md にある。
// 規則は、この設定のあるディレクトリ（ESLint の cwd）から見た tests/ の下だけを見る。
import tsParser from '@typescript-eslint/parser'

import { rule } from './eslint/e2e-authoring-rule.mjs'

export default [
  {
    files: ['tests/**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { e2e: { rules: { 'e2e-authoring-rule': rule } } },
    rules: {
      'e2e/e2e-authoring-rule': [
        'error',
        {
          timeoutDefinitionFile: 'tests/fixtures/timeouts.ts',
          screenIdPattern:
            '\\b(schedule-(calendar|new|detail|edit)|receipt-(upload|result)|account-(login|error|profile)|patient-(list|new|edit)|staff-(list|detail|new|edit))\\b',
        },
      ],
    },
  },
]
