import type { Meta, StoryObj } from '@storybook/react-vite'

import { FAKE_VIEWER } from '#/api/fake/fixtures'
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

/** 職員の管理の権限を持つ職員の照合の画面。ナビゲーションの予定の下に、カレンダー、取り込み、要確認、連携を並べる。 */
export const StaffManager: Story = {}

/** 職員の管理の権限を持たず、照合の権限を持つ職員（事務）の照合の画面。予定の下はカレンダーだけになる。 */
export const Staff: Story = {
  parameters: route({ viewer: { ...FAKE_VIEWER, policyCodes: ['receipt.check'] } }),
}

/** 職員の管理の権限も照合の権限も持たない職員（チームリーダーとメンバー）のカレンダー。照合を出さない。 */
export const Member: Story = {
  parameters: route({
    route: '/schedule',
    url: '/schedule',
    viewer: { ...FAKE_VIEWER, policyCodes: [] },
  }),
  args: { current: '/schedule' },
}

/** 確認が必要な予定の画面。要確認に印が付く。 */
export const Review: Story = {
  parameters: route({ route: '/schedule_/review', url: '/schedule/review' }),
  args: { current: '/schedule/review' },
}

/** 職員の管理の権限を持たない職員が、確認が必要な予定の画面を開いた状態。どの項目にも印を付けない。 */
export const ReviewForbidden: Story = {
  parameters: route({
    route: '/schedule_/review',
    url: '/schedule/review',
    viewer: { ...FAKE_VIEWER, policyCodes: ['receipt.check'] },
  }),
  args: { current: '/schedule/review' },
}

/** 幅 768px 未満。ナビゲーションはメニューのボタンで開くドロワーに入る。 */
export const Mobile: Story = { globals: MOBILE }
