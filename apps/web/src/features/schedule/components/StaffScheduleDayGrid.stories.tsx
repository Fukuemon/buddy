import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { StaffScheduleDayGrid } from './StaffScheduleDayGrid'
import { storyEvents, storyStaff } from './storyData'

const meta = {
  title: '画面/Schedule/StaffScheduleDayGrid',
  component: StaffScheduleDayGrid,
  args: {
    staffList: storyStaff,
    events: storyEvents,
    onSlotClick: fn(),
    onEventClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-[720px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StaffScheduleDayGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SingleStaff: Story = { args: { staffList: storyStaff.slice(0, 1) } }
