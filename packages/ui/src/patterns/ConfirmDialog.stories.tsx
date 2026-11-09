import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { createModalDocsParameters } from '../../.storybook/sharedPreview'
import { ConfirmDialog } from './ConfirmDialog'

const meta = {
  title: 'パターン/ConfirmDialog',
  component: ConfirmDialog,
  parameters: createModalDocsParameters(),
  args: {
    title: 'カレンダーを外しますか',
    testIdPrefix: 'calendar-remove',
    submitLabel: '外す',
    busyLabel: '外しています',
    submitVariant: 'danger',
    canSubmit: true,
    isSubmitting: false,
    onSubmit: fn(),
    onCancel: fn(),
    children: <p>石井 花子の Google カレンダーを外します。取り込んだ予定は buddy に残ります。</p>,
  },
} satisfies Meta<typeof ConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

/** データを失う操作の確定は、submitVariant を danger にする。 */
export const Default: Story = {}

/** 送っている間は、確定のボタンに回転の印と送っている間の文字を出し、閉じる操作を全て止める。 */
export const Submitting: Story = { args: { isSubmitting: true } }

/** 確定の文字に「キャンセル」が入る確認は、閉じる側を「戻る」にし、同じ語のボタンを並べない。 */
export const CancelAction: Story = {
  args: {
    title: 'この予定をキャンセルしますか',
    testIdPrefix: 'schedule-cancel',
    submitLabel: '予定をキャンセルする',
    busyLabel: 'キャンセルしています',
    cancelLabel: '戻る',
    children: <p>キャンセルした予定は、カレンダーに残り、理由を見られます。</p>,
  },
}

export const WithError: Story = {
  args: {
    error: {
      message: '外せませんでした。もう一度お試しください。',
      testId: 'calendar-remove-error',
      isBlock: true,
    },
  },
}
