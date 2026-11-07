import { useId, type ReactNode } from 'react'

import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  type DialogProps,
} from '../base/Dialog/Dialog'
import { SubmitButtons, type DialogSubmitProps } from './DialogSubmit'

export type InputDialogProps = DialogSubmitProps & {
  title: string
  /** タイトルの右に置く要素。? のヘルプを置く。 */
  titleAddon?: ReactNode
  /** children を form にしたときの form の id。確定のボタンをその form の送信のボタンにする。 */
  formId?: string
  /** formId を渡さないときに、確定のボタンで呼ぶ。 */
  onSubmit?: () => void
  /** 開いたときにフォーカスを移す欄。Dialog の initialFocusRef に渡す。 */
  initialFocusRef?: DialogProps['initialFocusRef']
  /** 「キャンセル」、覆い、Escape キーで呼ぶ。送っている間は呼ばない。 */
  onClose: () => void
  children: ReactNode
}

/**
 * 入力のダイアログ。ヘッダーの左にタイトルを置き、フッターの右に「キャンセル」と確定のボタンを置く。
 * フッターで閉じるので、右上に閉じるボタン（×）を置かない。
 * 「キャンセル」、覆い、Escape キーは、何も変えずに閉じる。送っている間は閉じない。
 */
export const InputDialog = ({
  title,
  titleAddon,
  formId,
  onSubmit,
  onClose,
  initialFocusRef,
  error,
  children,
  ...submitProps
}: InputDialogProps) => {
  const titleId = useId()
  const close = () => {
    if (!submitProps.isSubmitting) onClose()
  }
  return (
    <Dialog
      canClose={!submitProps.isSubmitting}
      initialFocusRef={initialFocusRef}
      data-testid={`${submitProps.testIdPrefix}-dialog`}
      labelledBy={titleId}
      onClose={onClose}
    >
      <DialogHeader title={title} titleAddon={titleAddon} titleId={titleId} />
      <DialogBody>{children}</DialogBody>
      <DialogFooter error={error}>
        <SubmitButtons {...submitProps} formId={formId} onCancel={close} onSubmit={onSubmit} />
      </DialogFooter>
    </Dialog>
  )
}
