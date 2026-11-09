import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { createModalDocsParameters } from '../../../.storybook/sharedPreview'
import { BusyLabel } from '../Button/BusyLabel'
import { Button } from '../Button/Button'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from './Dialog'

const TITLE_ID = 'dialog-story-title'

const ReasonField = () => (
  <label className="flex flex-col gap-2 text-label">
    理由
    <textarea
      className="min-h-24 rounded-8 bg-surface p-3 text-body ring-1 ring-border-field ring-inset outline-none focus-visible:focus-ring"
      defaultValue="利用者の都合で時間を変えました"
    />
  </label>
)

const meta = {
  title: 'コンポーネント/Base/Dialog',
  component: Dialog,
  parameters: createModalDocsParameters(),
  args: {
    labelledBy: TITLE_ID,
    onClose: fn(),
    children: null,
  },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

/** 入力のダイアログの形。ヘッダー、本文、フッターで組み、フッターに「キャンセル」と確定のボタンを置く。 */
export const Default: Story = {
  render: (args) => (
    <Dialog {...args}>
      <DialogHeader title="予定の理由を直す" titleId={TITLE_ID} />
      <DialogBody>
        <ReasonField />
      </DialogBody>
      <DialogFooter>
        <Button onClick={args.onClose} size="S" variant="secondary">
          キャンセル
        </Button>
        <Button size="S">保存</Button>
      </DialogFooter>
    </Dialog>
  ),
}

/** 送れなかったときは、フッターのボタンの左に文を出す。 */
export const WithError: Story = {
  render: (args) => (
    <Dialog {...args}>
      <DialogHeader title="予定の理由を直す" titleId={TITLE_ID} />
      <DialogBody>
        <ReasonField />
      </DialogBody>
      <DialogFooter
        error={{
          message: '保存できませんでした。もう一度お試しください。',
          testId: 'dialog-error',
        }}
      >
        <Button onClick={args.onClose} size="S" variant="secondary">
          キャンセル
        </Button>
        <Button size="S">保存</Button>
      </DialogFooter>
    </Dialog>
  ),
}

/** 送っている間は、覆い、Escape キー、閉じるボタン、「キャンセル」で閉じない。 */
export const Submitting: Story = {
  args: { canClose: false },
  render: (args) => (
    <Dialog {...args}>
      <DialogHeader title="予定の理由を直す" titleId={TITLE_ID} />
      <DialogBody>
        <ReasonField />
      </DialogBody>
      <DialogFooter>
        <Button disabled onClick={args.onClose} size="S" variant="secondary">
          キャンセル
        </Button>
        <Button disabled size="S">
          <BusyLabel busy>保存しています</BusyLabel>
        </Button>
      </DialogFooter>
    </Dialog>
  ),
}

/**
 * 入力の無い詳細に、選べる操作を並べるダイアログ。勧める操作が無いので、主のボタンを置かない。
 * データを失う操作の起点（書き直す）は赤い文字にしてフッターの左端に 1 つだけ置き、「閉じる」を右に置く。
 */
export const OperationsOnly: Story = {
  render: (args) => (
    <Dialog {...args}>
      <DialogHeader title="Google カレンダーと内容が違います" titleId={TITLE_ID} />
      <DialogBody>
        <p>
          青木 一郎の 11 月 4 日の予定は、Google カレンダーでは 10:00〜11:00、buddy では
          10:30〜11:30 です。
        </p>
      </DialogBody>
      <DialogFooter>
        <Button className="mr-auto" size="S" variant="destructive">
          buddy の内容で書き直す
        </Button>
        <Button onClick={args.onClose} size="S" variant="secondary">
          閉じる
        </Button>
      </DialogFooter>
    </Dialog>
  ),
}

/** フッターを置かないダイアログだけは、右上に閉じるボタン（×）を置き、× で閉じる。 */
export const WithCloseButton: Story = {
  render: (args) => (
    <Dialog {...args}>
      <DialogHeader onClose={args.onClose} title="予定の理由" titleId={TITLE_ID} />
      <DialogBody>
        <p>利用者の都合で時間を変えました。</p>
      </DialogBody>
    </Dialog>
  ),
}
