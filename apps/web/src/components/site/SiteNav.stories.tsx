import type { Meta, StoryObj } from '@storybook/react-vite'

import { SITE_NAV_ITEMS, SiteNav } from './SiteNav'

const meta = {
  title: '画面/Common/SiteNav',
  component: SiteNav,
  args: { items: SITE_NAV_ITEMS, current: '/schedule' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByTestId('site-apps-open'))
  },
} satisfies Meta<typeof SiteNav>

export default meta
type Story = StoryObj<typeof meta>

/** 予定の画面でアプリのメニューを開いた状態。予定に印が付く。 */
export const Schedule: Story = {}

/** 照合の画面でアプリのメニューを開いた状態。 */
export const Receipt: Story = { args: { current: '/receipt' } }

/** 予定の中の画面（確認が必要な予定）でアプリのメニューを開いた状態。予定に印が付く。 */
export const Review: Story = { args: { current: '/schedule/review' } }
