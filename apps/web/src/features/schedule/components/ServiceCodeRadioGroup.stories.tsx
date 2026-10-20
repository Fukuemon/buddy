import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ServiceCodeRadioGroup } from './ServiceCodeRadioGroup'

const meta = {
  title: '画面/Schedule/ServiceCodeRadioGroup',
  component: ServiceCodeRadioGroup,
  args: { value: '訪看I2', onChange: fn() },
} satisfies Meta<typeof ServiceCodeRadioGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
