import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { Button } from './Button'

const meta = {
  title: 'Base/Button',
  component: Button,
  args: { children: '保存', onClick: fn() },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { variant: 'primary' } }

export const PrimaryDisabled: Story = { args: { variant: 'primary', disabled: true } }

export const Secondary: Story = { args: { variant: 'secondary' } }

export const Destructive: Story = { args: { variant: 'destructive', children: '削除' } }

export const Small: Story = { args: { size: 'S' } }

export const Large: Story = { args: { size: 'L' } }

export const Wide: Story = { args: { isWide: true } }

export const Loading: Story = { args: { isLoading: true } }
