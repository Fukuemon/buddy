import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  // packages/ui の原則、トークン、コンポーネントと、apps/web の画面を 1 つのカタログにする（ADR-0018）。
  stories: [
    '../../../packages/ui/src/**/*.mdx',
    '../../../packages/ui/src/**/*.stories.@(ts|tsx)',
    '../src/**/*.stories.@(ts|tsx)',
  ],
  // pseudo-states は、状態の story で hover の見た目をマウスを乗せずに出す
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', 'storybook-addon-pseudo-states'],
  framework: '@storybook/react-vite',
  core: {
    builder: {
      name: '@storybook/builder-vite',
      // アプリの vite.config.ts は TanStack Start の plugin を持ち、Storybook の中では動かない。
      options: { viteConfigPath: '.storybook/vite.config.ts' },
    },
  },
}

export default config
