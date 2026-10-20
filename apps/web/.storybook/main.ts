import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
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
