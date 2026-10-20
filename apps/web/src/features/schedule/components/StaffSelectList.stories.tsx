import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { StaffSelectList } from './StaffSelectList'
import { storyStaff } from './storyData'

const meta = {
  title: '画面/Schedule/StaffSelectList',
  component: StaffSelectList,
  args: { staffList: storyStaff, value: 'staff-2', onChange: fn() },
} satisfies Meta<typeof StaffSelectList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Unselected: Story = { args: { value: '' } }
