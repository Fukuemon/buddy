// E2E のテストのコードの書き方の規則。規則は agent-harness のスキル setup-e2e-lint から eslint/ に写したもので、何を止めるかは DesignDoc.md にある。
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
          // 字幕の関数は、撮るときだけ字幕を読ませるために止まる
          fixedWaitAllowedFiles: ['tests/fixtures/caption.ts'],
          timeoutDefinitionFile: 'tests/fixtures/timeouts.ts',
          screenIdPattern:
            '\\b(schedule|receipt|account|patient|staff)-(list|calendar|detail|new|edit|upload|result|login|error|profile|link|import|review)\\b',
        },
      ],
    },
  },
]
