import { readdirSync } from 'node:fs'
import { defineConfig } from 'vite-plus'

const WEB_SRC = 'apps/web/src'
const BOUNDARY = 'context/codebase.md の Dependency Rules を見る'

// 機能は features/ の下のディレクトリから集め、足した機能にも同じ規則を当てる。
const features = readdirSync(new URL(`./${WEB_SRC}/features`, import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

// テストと story の補助のファイル。fake と http を import してよい。
const testFiles = ['**/*.test.ts', '**/*.test.tsx', '**/*.stories.tsx', '**/storyData.ts']

const serverPatterns = [
  {
    regex: '^(#/|(\\.\\./)+)server(/|$)',
    message: `画面のコードから server/ を import しない。${BOUNDARY}`,
  },
]

const implPatterns = [
  {
    regex: '^(#/|(\\.\\./)+)api/(fake|http)(/|$)',
    message: `画面のコードから api/fake と api/http を import せず、useBuddyApi を使う。テストと story だけは使ってよい。${BOUNDARY}`,
  },
]

const otherFeaturePatterns = (feature: string) => {
  const others = features.filter((name) => name !== feature).join('|')
  return [
    {
      regex: `^(#/features/|(\\.\\./)+(features/)?)(${others})(/|$)`,
      message: `ほかの機能を import しない。2 つの機能が使うものは src/components/、src/api/、@buddy/ui に置く。${BOUNDARY}`,
    },
  ]
}

const featurePatterns = [
  {
    regex: '^(#/|(\\.\\./)+)features(/|$)',
    message: `src/components/ から機能を import しない。${BOUNDARY}`,
  },
]

// no-restricted-imports の設定は override ごとに置き換わるので、テストと story の override にも fake と http 以外の規則を書く。
const screenOverrides = (dir: string, patterns: object[]) => [
  {
    files: [`${WEB_SRC}/${dir}/**`],
    excludeFiles: testFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...patterns, ...serverPatterns, ...implPatterns] },
      ],
    },
  },
  {
    files: testFiles.map((glob) => `${WEB_SRC}/${dir}/${glob}`),
    rules: { 'no-restricted-imports': ['error', { patterns: [...patterns, ...serverPatterns] }] },
  },
]

export default defineConfig({
  fmt: {
    singleQuote: true,
    semi: false,
    ignorePatterns: [
      '**/routeTree.gen.ts',
      '**/src/api/generated/**',
      'pnpm-lock.yaml',
      'apm.lock.yaml',
      '**/*.md',
    ],
  },
  lint: {
    plugins: ['typescript', 'react', 'jsx-a11y', 'import', 'vitest'],
    ignorePatterns: [
      '**/routeTree.gen.ts',
      '**/src/api/generated/**',
      '**/dist/**',
      '**/storybook-static/**',
      // 写して <…> を埋める spec の見本。埋める前は import の先が無い
      'packages/e2e/templates/**',
    ],
    jsPlugins: [
      { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' },
      { name: 'jsdoc-js', specifier: 'eslint-plugin-jsdoc' },
    ],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'jsdoc-js/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
          },
          contexts: [
            // オブジェクトのプロパティの関数（Story の play と render、クエリキー）は対象にしない
            'VariableDeclarator > ArrowFunctionExpression',
            'VariableDeclarator > FunctionExpression',
            'TSInterfaceDeclaration:not([id.name=/Props$/])',
            'TSTypeAliasDeclaration:not([id.name=/Props$/])',
            'TSEnumDeclaration',
          ],
        },
      ],
    },
    overrides: [
      ...features.flatMap((feature) =>
        screenOverrides(`features/${feature}`, otherFeaturePatterns(feature)),
      ),
      ...screenOverrides('components', featurePatterns),
    ],
    options: { typeAware: true, typeCheck: true },
  },
})
