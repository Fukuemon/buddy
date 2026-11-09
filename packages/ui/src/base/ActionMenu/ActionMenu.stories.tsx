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

/**
 * 文言のボタンで、上に開くメニュー。モーダルの下端の「編集」に使う。
 * 押せない項目には、押せない理由を補足に出す。
 */
export const TextTriggerOpensUp: Story = {
  decorators: [
    (Story) => (
      <div className="flex min-h-64 items-end justify-end p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    label: '編集',
    triggerLabel: '編集',
    placement: 'top',
    'data-testid': 'schedule-edit-menu',
    items: [
      { label: 'この予定を編集', onSelect: fn(), 'data-testid': 'schedule-edit-occurrence' },
      {
        label: '繰り返しを変更',
        onSelect: fn(),
        'data-testid': 'schedule-edit-recurrence',
        disabled: true,
        description: '今日より前の回からは、繰り返しを変えられません。',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '編集' }))
    const item = canvas.getByRole('menuitem', { name: /^繰り返しを変更/ })
    await expect(item).toHaveAttribute('aria-disabled', 'true')
    await expect(item).toHaveAccessibleDescription(
      '今日より前の回からは、繰り返しを変えられません。',
    )
  },
}
