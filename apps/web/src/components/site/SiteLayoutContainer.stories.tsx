import type { Meta, StoryObj } from '@storybook/react-vite'

import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { SiteLayoutContainer } from './SiteLayoutContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/receipt/', url: '/receipt/', ...appRouter },
})

const MOBILE = { viewport: { value: 'mobile2', isRotated: false } }

const meta = {
  title: '画面/Common/SiteLayoutContainer',
  component: SiteLayoutContainer,
  decorators: [withAppRouter],
  parameters: route({}),
  args: {
    current: '/receipt',
    children: (
      <main className="p-6">
        <h1 className="text-heading-md">照合</h1>
      </main>
    ),
  },
} satisfies Meta<typeof SiteLayoutContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 照合の画面。ヘッダーに「照合」の名前、アプリのボタン、アカウントのボタンを出す。左の欄とメニューのボタンは出さない。 */
export const StaffManager: Story = {}

/** 確認が必要な予定の画面。ヘッダーに「予定」の名前を出す。 */
export const Review: Story = {
  parameters: route({ route: '/schedule_/review', url: '/schedule/review' }),
  args: { current: '/schedule/review' },
}

/** 幅 768px 未満。 */
export const Mobile: Story = { globals: MOBILE }
