import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { createModalDocsParameters } from '../../.storybook/sharedPreview'
import { HelpToggle } from '../base/HelpToggle/HelpToggle'
import { InputDialog } from './InputDialog'

const meta = {
  title: 'パターン/InputDialog',
  component: InputDialog,
  parameters: createModalDocsParameters(),
  args: {
    title: '予定の理由を直す',
    testIdPrefix: 'reason',
    submitLabel: '保存',
    busyLabel: '保存しています',
    canSubmit: true,
    isSubmitting: false,
    onSubmit: fn(),
    onClose: fn(),
    children: (
      <label className="flex flex-col gap-2 text-label">
        理由
        <textarea
          className="min-h-24 rounded-8 bg-surface p-3 text-body ring-1 ring-border-field ring-inset outline-none focus-visible:focus-ring"
          defaultValue="利用者の都合で時間を変えました"
        />
      </label>
    ),
  },
} satisfies Meta<typeof InputDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** 入力が足りない間は、確定のボタンを押せない。ボタンの左に、押せるようにする条件の文を出す。 */
export const CannotSubmit: Story = {
  args: { canSubmit: false, submitHint: '理由を入れてください。' },
}

/** 送っている間は、確定のボタンに回転の印と送っている間の文字を出し、閉じる操作を全て止める。 */
export const Submitting: Story = { args: { isSubmitting: true } }

export const WithError: Story = {
  args: {
    error: { message: '保存できませんでした。もう一度お試しください。', testId: 'reason-error' },
  },
}

/** タイトルの右に ? のヘルプを置く。 */
export const WithTitleAddon: Story = {
  args: {
    titleAddon: (
      <HelpToggle data-testid="reason-help">
        理由は、予定の詳細と確認が必要な予定の一覧に出ます。
      </HelpToggle>
    ),
  },
}
