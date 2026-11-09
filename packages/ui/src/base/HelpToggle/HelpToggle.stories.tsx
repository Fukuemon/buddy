import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { HelpToggle } from './HelpToggle'

const meta = {
  title: 'コンポーネント/Base/HelpToggle',
  component: HelpToggle,
  args: {
    'data-testid': 'review-help',
    children:
      'Google カレンダーと buddy で内容が違う予定です。どちらの内容に合わせるかを選びます。',
  },
  // 見出しと並べる親の要素に relative を付け、説明をその下の左端にそろえる
  render: (args) => (
    <div className="min-h-40">
      <div className="relative flex items-center gap-1">
        <h2 className="text-heading-sm">確認が必要な予定</h2>
        <HelpToggle {...args} />
      </div>
    </div>
  ),
} satisfies Meta<typeof HelpToggle>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'ヘルプ' }))
    await expect(canvas.getByTestId('review-help-text')).toBeVisible()
  },
}
