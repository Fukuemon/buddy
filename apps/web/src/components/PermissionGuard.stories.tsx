import type { Meta, StoryObj } from '@storybook/react-vite'

import { FAKE_VIEWER } from '#/api/fake/fixtures'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { PermissionGuard } from './PermissionGuard'

const route = (appRouter: Partial<AppRouterParameters> = {}) => ({
  appRouter: { route: '/staff', url: '/staff', ...appRouter },
})

const meta = {
  title: '画面/Common/PermissionGuard',
  component: PermissionGuard,
  decorators: [withAppRouter],
  parameters: route(),
  args: {
    permission: 'staff.manage',
    children: <button type="button">職員を登録</button>,
    fallback: <p>職員の管理の権限がありません</p>,
  },
} satisfies Meta<typeof PermissionGuard>

export default meta
type Story = StoryObj<typeof meta>

/** 権限を持つ職員。children を出す。 */
export const Allowed: Story = {}

/** 権限を持たない職員。fallback を出す。 */
export const Denied: Story = {
  parameters: route({ viewer: { ...FAKE_VIEWER, policyCodes: ['receipt.check'] } }),
}
