import type { Meta, StoryObj } from '@storybook/react-vite'

import { CALENDAR_NAV_ITEM, IMPORT_NAV_ITEM, REVIEW_NAV_ITEM } from './SiteNav'
import { SiteSubNav } from './SiteSubNav'

const meta = {
  title: '画面/Common/SiteSubNav',
  component: SiteSubNav,
  args: {
    label: '予定の画面',
    items: [CALENDAR_NAV_ITEM, IMPORT_NAV_ITEM, REVIEW_NAV_ITEM],
    current: CALENDAR_NAV_ITEM.href,
  },
} satisfies Meta<typeof SiteSubNav>

export default meta
type Story = StoryObj<typeof meta>

export const Calendar: Story = {}

export const Import: Story = { args: { current: IMPORT_NAV_ITEM.href } }

export const Review: Story = { args: { current: REVIEW_NAV_ITEM.href } }
