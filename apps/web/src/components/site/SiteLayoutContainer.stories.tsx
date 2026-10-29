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

/** 照合の画面。ヘッダーに機能のタブを出し、照合に印を付ける。左の欄とメニューのボタンは出さない。 */
export const StaffManager: Story = {}

/** 職員の管理の権限を持つ職員が、確認が必要な予定を開いているとき。画面の中身の上端に、予定の中のタブを出す。 */
export const ScheduleManager: Story = {
  parameters: route({ route: '/schedule_/review', url: '/schedule/review' }),
  args: { current: '/schedule/review' },
}

/** 職員の管理の権限を持たない職員が、確認が必要な予定を開いているとき。予定の中のタブを出さない。 */
export const Staff: Story = {
  parameters: route({
    route: '/schedule_/review',
    url: '/schedule/review',
    viewer: { ...FAKE_VIEWER, canManageStaff: false },
  }),
  args: { current: '/schedule/review' },
}

/** 幅 768px 未満。ヘッダーに機能のタブを出す。 */
export const Mobile: Story = { globals: MOBILE }
