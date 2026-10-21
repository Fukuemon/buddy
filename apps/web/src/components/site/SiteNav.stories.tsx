import type { Meta, StoryObj } from '@storybook/react-vite'

import { SITE_NAV_ITEMS, SiteNav, siteNavItems } from './SiteNav'

const meta = {
  title: '画面/Common/SiteNav',
  component: SiteNav,
  args: { items: SITE_NAV_ITEMS, current: '/schedule' },
} satisfies Meta<typeof SiteNav>

export default meta
type Story = StoryObj<typeof meta>

export const Schedule: Story = {}

export const Receipt: Story = { args: { current: '/receipt' } }

/** 職員の管理の権限を持つ職員が、予定の取り込みかカレンダーの連携を開いているとき。 */
export const Import: Story = { args: { items: siteNavItems(true), current: '/schedule/import' } }
