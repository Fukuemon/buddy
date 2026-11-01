import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { ActionMenu } from './ActionMenu'

const meta = {
  title: 'コンポーネント/Base/ActionMenu',
  component: ActionMenu,
  // メニューはボタンの下の右端にそろえて開くので、右に寄せ、下に開く分の高さを取る
  decorators: [
    (Story) => (
      <div className="flex min-h-48 justify-end p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    label: '青木 一郎の操作',
    'data-testid': 'staff-menu',
    // 外す（isDanger）を先に渡しても、メニューでは最後に置く
    items: [
      { label: '外す', onSelect: fn(), 'data-testid': 'staff-menu-remove', isDanger: true },
      { label: '取り込む', onSelect: fn(), 'data-testid': 'staff-menu-import' },
    ],
  },
} satisfies Meta<typeof ActionMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '青木 一郎の操作' }))
    await expect(canvas.getByRole('menu')).toBeVisible()
  },
}

/** 押せない項目は、フォーカスを受けるが、選んでも何もしない。 */
export const WithDisabledItem: Story = {
  args: {
    items: [
      {
        label: '取り込む',
        onSelect: fn(),
        'data-testid': 'staff-menu-import',
        disabled: true,
      },
      { label: '外す', onSelect: fn(), 'data-testid': 'staff-menu-remove', isDanger: true },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '青木 一郎の操作' }))
    await expect(canvas.getByRole('menuitem', { name: '取り込む' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  },
}
