import type { Preview } from '@storybook/react-vite'

/**
 * packages/ui と apps/web の 2 つの Storybook が共有する preview の設定。
 * a11y のアドオンの違反をテストの失敗にする。
 * CSS は読み込まないので、使う側の preview が自分の Tailwind の入口を読み込む。
 * サイドバーの並び（storySort）は Storybook が preview のファイルから静的に読むので、各 preview に書く。
 */
const sharedPreview = {
  parameters: {
    a11y: { test: 'error' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
} satisfies Preview

export default sharedPreview
