import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    singleQuote: true,
    semi: false,
    ignorePatterns: ['**/routeTree.gen.ts', 'pnpm-lock.yaml', 'apm.lock.yaml', '**/*.md'],
  },
  lint: {
    plugins: ['typescript', 'react', 'jsx-a11y', 'import', 'vitest'],
    ignorePatterns: ['**/routeTree.gen.ts', '**/dist/**', '**/storybook-static/**'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
})
