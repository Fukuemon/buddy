import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  // packages/ui の原則、トークン、コンポーネントと、apps/web の画面を 1 つのカタログにする（ADR-0004）。
  stories: [
    '../../../packages/ui/src/**/*.mdx',
    '../../../packages/ui/src/**/*.stories.@(ts|tsx)',
    '../src/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
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
