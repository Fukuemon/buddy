import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { Button } from './Button'
import { BusyLabel } from './BusyLabel'

const meta = {
  title: 'コンポーネント/Base/Button',
  component: Button,
  args: { children: '保存', onClick: fn() },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { variant: 'primary' } }

export const PrimaryDisabled: Story = { args: { variant: 'primary', disabled: true } }

export const Secondary: Story = { args: { variant: 'secondary' } }

export const Destructive: Story = { args: { variant: 'destructive', children: '削除' } }

export const Danger: Story = { args: { variant: 'danger', children: '外す' } }

export const DangerDisabled: Story = {
  args: { variant: 'danger', children: '外す', disabled: true },
}

/** 送っている間に、文字を残したまま前に回転の印を出す。確認のダイアログの確定のボタンに使う。 */
export const Busy: Story = {
  args: { variant: 'danger', disabled: true, children: <BusyLabel busy>外す</BusyLabel> },
}

export const Small: Story = { args: { size: 'S' } }

export const Large: Story = { args: { size: 'L' } }

export const Wide: Story = { args: { isWide: true } }

export const Loading: Story = { args: { isLoading: true } }
