import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { Button } from './Button'
import { Modal } from './Modal'

const meta = {
  title: 'Base/Modal',
  component: Modal,
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
