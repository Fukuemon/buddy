import type { Meta, StoryObj } from '@storybook/react-vite'

import { SiteNav, siteNavItems } from './SiteNav'

const meta = {
  title: '画面/Common/SiteNav',
  component: SiteNav,
  decorators: [
    (Story) => (
      <div className="flex h-14 items-stretch">
        <Story />
      </div>
    ),
  ],
  args: { items: siteNavItems(true), current: '/schedule' },
} satisfies Meta<typeof SiteNav>

export default meta
type Story = StoryObj<typeof meta>

export const Schedule: Story = {}

export const Receipt: Story = { args: { current: '/receipt' } }

/** 予定の中の画面（確認が必要な予定）を開いているとき。予定のタブに印が付く。 */
export const Review: Story = { args: { current: '/schedule/review' } }
