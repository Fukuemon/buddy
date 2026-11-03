import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'

import { createModalDocsParameters } from '../../../.storybook/sharedPreview'
import { Button } from '../Button/Button'
import { Drawer } from './Drawer'

const DRAWER_ID = 'drawer-story'

const meta = {
  title: 'コンポーネント/Base/Drawer',
  component: Drawer,
  parameters: createModalDocsParameters(),
  args: {
    id: DRAWER_ID,
    isOpen: true,
    title: '絞り込み',
    onCloseRequest: fn(),
    children: (
      <div className="flex flex-col gap-2 p-4">
        <label className="flex min-h-11 items-center gap-2">
          <input defaultChecked type="checkbox" />
          青木 一郎
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input defaultChecked type="checkbox" />
          石井 花子
        </label>
      </div>
    ),
  },
} satisfies Meta<typeof Drawer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Closed: Story = { args: { isOpen: false } }

/** 開くボタンから開き、閉じるとフォーカスが開くボタンへ戻る。 */
export const WithOpener: Story = {
  args: { isOpen: false },
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(args.isOpen)
    return (
      <>
        <Button
          aria-controls={DRAWER_ID}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
          size="S"
          variant="secondary"
        >
          絞り込みを開く
        </Button>
        <Drawer
          {...args}
          isOpen={isOpen}
          onCloseRequest={() => {
            args.onCloseRequest()
            setIsOpen(false)
          }}
        />
      </>
    )
  },
}
