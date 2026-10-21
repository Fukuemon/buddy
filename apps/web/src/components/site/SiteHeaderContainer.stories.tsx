import type { Meta, StoryObj } from '@storybook/react-vite'

import { FAKE_VIEWER } from '#/api/fake/fixtures'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { SiteHeaderContainer } from './SiteHeaderContainer'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/receipt/', url: '/receipt/', ...appRouter },
})

const meta = {
  title: '画面/Common/SiteHeaderContainer',
  component: SiteHeaderContainer,
  decorators: [withAppRouter],
  parameters: route({}),
  args: { current: '/receipt' },
} satisfies Meta<typeof SiteHeaderContainer>

export default meta
type Story = StoryObj<typeof meta>

/** 職員の管理の権限を持つ職員。取り込みのリンクを出す。 */
export const StaffManager: Story = {}

/** 職員の管理の権限を持たない職員。取り込みのリンクを出さない。 */
export const Staff: Story = {
  parameters: route({ viewer: { ...FAKE_VIEWER, canManageStaff: false } }),
}
