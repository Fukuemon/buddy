import type { Meta, StoryObj } from '@storybook/react-vite'
import { createModalDocsParameters } from '@buddy/ui/storybook-preview'

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
  parameters: {
    ...route({}),
    ...createModalDocsParameters(778),
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SchedulePageLayout>

export default meta
type Story = StoryObj<typeof meta>

export const Month: Story = { parameters: route({ url: '/schedule?view=month' }) }

export const Week: Story = { parameters: route({ url: '/schedule?view=week' }) }

/** 週が年をまたぎ、表示の期間の見出しが最も長くなる。 */
export const WeekAcrossYears: Story = {
  parameters: route({ url: '/schedule?view=week&date=2026-12-29' }),
}

export const Day: Story = { parameters: route({ url: '/schedule?view=day' }) }

/** 幅 768px 未満。週の表示は週の一覧で出す。日付と絞り込みは閉じたドロワーにあり、ヘッダーのメニューのボタンで開く。 */
export const Mobile: Story = {
  parameters: route({ url: '/schedule?view=week' }),
  globals: { viewport: { value: 'mobile2', isRotated: false } },
}

/** キャンセルした予定を出す切り替えを入れた日の表示。 */
export const DayWithCancelled: Story = {
  parameters: route({ url: '/schedule?view=day&cancelled=true' }),
}
