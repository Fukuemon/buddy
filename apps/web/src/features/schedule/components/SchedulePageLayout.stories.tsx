import type { Meta, StoryObj } from '@storybook/react-vite'

import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { SchedulePageLayout } from './SchedulePageLayout'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/schedule', url: '/schedule', ...appRouter },
})

const meta = {
  title: '画面/Schedule/SchedulePageLayout',
  component: SchedulePageLayout,
  decorators: [
    withAppRouter,
    (Story) => (
      <div className="flex h-[778px] flex-col">
        <Story />
      </div>
    ),
  ],
  // showModal は文書の全体を操作できなくするので、Docs のページでは story ごとに iframe で描く
  parameters: {
    ...route({}),
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 778 } },
  },
} satisfies Meta<typeof SchedulePageLayout>

export default meta
type Story = StoryObj<typeof meta>

export const Month: Story = { parameters: route({ url: '/schedule' }) }

export const Week: Story = { parameters: route({ url: '/schedule?view=week' }) }

/** 週が年をまたぎ、表示の期間の見出しが最も長くなる。 */
export const WeekAcrossYears: Story = {
  parameters: route({ url: '/schedule?view=week&date=2026-12-29' }),
}

export const Day: Story = { parameters: route({ url: '/schedule?view=day' }) }

/** 幅 768px 未満。日付と絞り込みは閉じたドロワーにあり、ツールバーのボタンで開く。 */
export const Mobile: Story = {
  parameters: route({ url: '/schedule?view=week' }),
  globals: { viewport: { value: 'mobile2', isRotated: false } },
}

/** キャンセルした予定を出す切り替えを入れた日の表示。 */
export const DayWithCancelled: Story = {
  parameters: route({ url: '/schedule?view=day&cancelled=true' }),
}
