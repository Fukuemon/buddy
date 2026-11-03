import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'

import { createModalDocsParameters } from '../../../.storybook/sharedPreview'
import { Button } from '../Button/Button'
import { Modal } from './Modal'

const meta = {
  title: 'コンポーネント/Base/Modal',
  component: Modal,
  parameters: createModalDocsParameters(),
  args: {
    isOpen: true,
    title: '予定の詳細',
    onCloseRequest: fn(),
    children: <p className="p-5">モーダルの本文。</p>,
  },
} satisfies Meta<typeof Modal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithStickyFooter: Story = {
  args: { stickyFooter: <Button>作成</Button> },
}

/** 関数で渡した stickyFooter は、閉じる要求を受け取り、「キャンセル」で閉じるボタンと同じく閉じる。 */
export const WithCancel: Story = {
  args: {
    isDirty: true,
    stickyFooter: (requestClose) => (
      <>
        <Button onClick={requestClose} size="S" variant="secondary">
          キャンセル
        </Button>
        <Button size="S">保存</Button>
      </>
    ),
  },
}

/** headerContent は、タイトルの右に置き、ヘッダーの右端に寄せる。 */
export const WithHeaderContent: Story = {
  args: { headerContent: <Button variant="secondary">切り替え</Button> },
}

export const LongContent: Story = {
  args: {
    children: (
      <div className="p-5">
        {Array.from({ length: 30 }, (_, i) => (
          <p key={i}>{i + 1} 行目の本文。</p>
        ))}
      </div>
    ),
  },
}

export const Closed: Story = { args: { isOpen: false } }

/** 開くボタンから開き、閉じるとフォーカスが開くボタンへ戻る。 */
export const WithOpener: Story = {
  args: { isOpen: false },
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(args.isOpen)
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>予定を開く</Button>
        <Modal
          {...args}
          isOpen={isOpen}
          onCloseRequest={() => {
            args.onCloseRequest?.()
            setIsOpen(false)
          }}
          stickyFooter={<Button>編集</Button>}
        />
      </>
    )
  },
}
