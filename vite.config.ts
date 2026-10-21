import { defineConfig } from 'vite-plus'

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
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            FunctionExpression: true,
          },
          contexts: [
            'TSInterfaceDeclaration:not([id.name=/Props$/])',
            'TSTypeAliasDeclaration:not([id.name=/Props$/])',
            'TSEnumDeclaration',
          ],
        },
      ],
    },
    options: { typeAware: true, typeCheck: true },
  },
})
