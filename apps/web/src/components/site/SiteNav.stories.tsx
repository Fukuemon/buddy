import type { Meta, StoryObj } from '@storybook/react-vite'

import { SiteNav, siteNavItems } from './SiteNav'

const meta = {
  title: '画面/Common/SiteNav',
  component: SiteNav,
  decorators: [
    (Story) => (
      <div className="w-64 p-2">
        <Story />
      </div>
    ),
  ],
  args: { items: siteNavItems(false), current: '/schedule' },
} satisfies Meta<typeof SiteNav>

export default meta
type Story = StoryObj<typeof meta>

export const Schedule: Story = {}

export const Receipt: Story = { args: { current: '/receipt' } }

/** 職員の管理の権限を持つ職員が、予定の取り込みかカレンダーの連携を開いているとき。予定の下に、取り込みと要確認を字下げして出す。 */
export const Import: Story = { args: { items: siteNavItems(true), current: '/schedule/import' } }

/** 職員の管理の権限を持つ職員が、予定のカレンダーを開いているとき。 */
export const List: Story = { args: { items: siteNavItems(true) } }

/** 職員の管理の権限を持つ職員が、確認が必要な予定を開いているとき。 */
export const Review: Story = { args: { items: siteNavItems(true), current: '/schedule/review' } }
