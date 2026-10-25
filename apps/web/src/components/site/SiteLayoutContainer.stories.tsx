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

/** 職員の管理の権限を持つ職員。左端に、取り込みと要確認を含む 4 つのリンクを出す。 */
export const StaffManager: Story = {}

/** 職員の管理の権限を持たない職員。取り込みと要確認のリンクを出さない。 */
export const Staff: Story = {
  parameters: route({ viewer: { ...FAKE_VIEWER, canManageStaff: false } }),
}

/** 幅 768px 未満。リンクは閉じたドロワーにあり、ヘッダーの左のメニューのボタンで開く。 */
export const Mobile: Story = { globals: MOBILE }

/** 幅 768px 未満で、メニューのボタンからドロワーを開いた状態。 */
export const MobileOpen: Story = {
  globals: MOBILE,
  play: async ({ canvas, userEvent }) => {
    // Docs のページのように幅が 768px 以上で描くときは、メニューのボタンが無い
    const opener = await canvas.findByTestId('site-nav-open').catch(() => null)
    if (opener !== null) await userEvent.click(opener)
  },
}
