import type { Meta, StoryObj } from '@storybook/react-vite'

import { SITE_NAV_ITEMS, SiteNav } from './SiteNav'

const meta = {
  title: '画面/Common/SiteNav',
  component: SiteNav,
  args: { items: SITE_NAV_ITEMS, current: '/schedule' },
} satisfies Meta<typeof SiteNav>

export default meta
type Story = StoryObj<typeof meta>

export const Schedule: Story = {}

export const Receipt: Story = { args: { current: '/receipt' } }
