import type { Meta, StoryObj } from '@storybook/react-vite'

import { FAKE_VIEWER } from '#/api/fake/fixtures'
import { withAppRouter, type AppRouterParameters } from '#/storybook/withAppRouter'

import { ReceiptPermissionGate } from './ReceiptPermissionGate'

const route = (appRouter: Partial<AppRouterParameters>) => ({
  appRouter: { route: '/receipt/', url: '/receipt/', ...appRouter },
})

const meta = {
  title: '画面/Receipt/ReceiptPermissionGate',
  component: ReceiptPermissionGate,
  decorators: [withAppRouter],
  parameters: route({}),
  args: { children: <h1 className="text-heading-md">照合</h1> },
} satisfies Meta<typeof ReceiptPermissionGate>

export default meta
type Story = StoryObj<typeof meta>

/** 照合の権限を持つ職員。中身をそのまま出す。 */
export const Allowed: Story = {}

/** 照合の権限を持たない職員。中身を出さず、権限が無いことを示す。 */
export const Forbidden: Story = {
  parameters: route({ viewer: { ...FAKE_VIEWER, canCheckReceipt: false } }),
}
