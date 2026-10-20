import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { StaffFilterSidebar } from './StaffFilterSidebar'
import { storyStaff, storyTeams } from './storyData'

const meta = {
  title: 'Schedule/StaffFilterSidebar',
  component: StaffFilterSidebar,
  args: {
    teams: storyTeams,
    staffList: storyStaff,
    selectedStaffIds: [],
    onChange: fn(),
  },
} satisfies Meta<typeof StaffFilterSidebar>

export default meta
type Story = StoryObj<typeof meta>

export const AllStaff: Story = {}

export const PartiallySelected: Story = { args: { selectedStaffIds: ['staff-1', 'staff-3'] } }
