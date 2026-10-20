import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ScheduleCategoryCheckboxGroup } from './ScheduleCategoryCheckboxGroup'

const meta = {
  title: 'Schedule/ScheduleCategoryCheckboxGroup',
  component: ScheduleCategoryCheckboxGroup,
  args: { value: [], onChange: fn() },
} satisfies Meta<typeof ScheduleCategoryCheckboxGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Emergency: Story = { args: { value: ['emergency'] } }
