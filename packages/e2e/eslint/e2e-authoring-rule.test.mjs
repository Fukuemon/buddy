import { after, describe, it } from 'node:test'
import path from 'node:path'
import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { rule } from './e2e-authoring-rule.mjs'

RuleTester.afterAll = after
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
})
const at = (file, code) => ({ code, filename: path.join(process.cwd(), file) })
const invalid = (file, code) => ({
  ...at(file, code),
  errors: [{ messageId: 'e2e-authoring-rule' }],
})

tester.run('e2e-authoring-rule', rule, {
  valid: [
    at('tests/specs/12/a.e2e.ts', "import { DIFF } from './differences';"),
    at('tests/specs/12/sub/a.e2e.ts', "import { DIFF } from '../differences';"),
    at('tests/specs/12/a.e2e.ts', "import { DIFF } from '.';"),
    at('tests/specs/12/differences.ts', "export const DIFF = '差';"),
    at('tests/specs/12/differences.ts', 'export type Diff = { text: string };'),
    at(
      'tests/specs/12/differences.ts',
      "import type { Scenario } from '../../kit/evidence/index.js';\nexport const s = { id: 'VP-1' } satisfies Partial<Scenario>;",
    ),
    at(
      'tests/specs/12/differences.ts',
      "import type { Page } from '@playwright/test';\nexport type Op = (page: Page) => Promise<void>;",
    ),
    at('tests/specs/12/differences.ts', 'export const next = (page: number) => page + 1;'),
  ],
  invalid: [
    invalid('tests/specs/12/a.e2e.ts', "import { DIFF } from '../13/differences';"),
    invalid('tests/specs/12/a.e2e.ts', "import { x } from './b.e2e';"),
    invalid('tests/screens/x.ts', "import { DIFF } from '../specs/12/differences';"),
    invalid('tests/specs/differences.ts', "export const DIFF = '差';"),
    invalid('tests/screens/x.ts', "export * from '../specs/12/differences';"),
    invalid('tests/screens/x.ts', "export { DIFF } from '../specs/12/differences';"),
    invalid('tests/screens/x.ts', "export const load = () => import('../specs/12/differences');"),
    invalid('tests/specs/12/ops.ts', 'export const open = async (page) => page;'),
    invalid('tests/specs/12/ops.ts', 'export const open = async ({ page }) => page;'),
    invalid('tests/specs/12/ops.ts', 'export const open = async (p: pw.Page) => p;'),
    invalid('tests/specs/12/ops.ts', 'export const open = async (p: Page | undefined) => p;'),
    invalid('tests/specs/12/ops.ts', 'export const open = async (page = x) => page;'),
    invalid(
      'tests/specs/12/ops.ts',
      "import { test } from '@playwright/test';\ntest.beforeEach(() => {});",
    ),
  ],
})
