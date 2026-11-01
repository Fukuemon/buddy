import { useId, type ReactNode } from 'react'

import { Dialog, DialogBody, DialogFooter } from '../base/Dialog/Dialog'
import { SubmitButtons, type DialogSubmitProps } from './DialogSubmit'

export type ConfirmDialogProps = DialogSubmitProps & {
  /** 問いの形のタイトル（「カレンダーを外しますか」）。 */
  title: string
  onSubmit: () => void
  /** 「キャンセル」、覆い、Escape キーで呼ぶ。送っている間は呼ばない。 */
  onCancel: () => void
  /** 何が失われ、何が残るかの説明。 */
  children: ReactNode
}

/**
 * 確認のダイアログ。× を置かず、本文に問いの形のタイトルと説明を、フッターの右に「キャンセル」と確定のボタンを置く。
 * Escape キーと覆いは「キャンセル」と同じく何も変えずに閉じる。送っている間は閉じない。
 */
export const ConfirmDialog = ({
  title,
  onSubmit,
  onCancel,
  error,
  children,
  ...submitProps
}: ConfirmDialogProps) => {
  const titleId = useId()
  const cancel = () => {
    if (!submitProps.isSubmitting) onCancel()
  }
  return (
    <Dialog
      canClose={!submitProps.isSubmitting}
      data-testid={`${submitProps.testIdPrefix}-dialog`}
      labelledBy={titleId}
      onClose={onCancel}
      role="alertdialog"
      width="narrow"
    >
      <DialogBody>
        <h2 className="text-heading-sm" id={titleId}>
          {title}
        </h2>
        {children}
      </DialogBody>
      <DialogFooter error={error}>
        <SubmitButtons {...submitProps} onCancel={cancel} onSubmit={onSubmit} />
      </DialogFooter>
    </Dialog>
  )
}
