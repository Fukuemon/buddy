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
  /** 閉じるボタン（×）の testid。省くと `<接頭辞>-close` にする。 */
  closeTestId?: string
  /** children を form にしたときの form の id。確定のボタンをその form の送信のボタンにする。 */
  formId?: string
  /** formId を渡さないときに、確定のボタンで呼ぶ。 */
  onSubmit?: () => void
  /** 開いたときにフォーカスを移す欄。Dialog の initialFocusRef に渡す。 */
  initialFocusRef?: DialogProps['initialFocusRef']
  /** ×、「キャンセル」、覆い、Escape キーで呼ぶ。送っている間は呼ばない。 */
  onClose: () => void
  children: ReactNode
}

/**
 * 入力のダイアログ。ヘッダーの左にタイトル、右上に閉じるボタン（×）を置き、フッターの右に「キャンセル」と確定のボタンを置く。
 * ×、「キャンセル」、覆い、Escape キーは、何も変えずに閉じる。送っている間は閉じない。
 * 閉じるボタンには `<接頭辞>-close` を付ける。
 */
export const InputDialog = ({
  title,
  titleAddon,
  closeTestId,
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
      <DialogHeader
        closeTestId={closeTestId ?? `${submitProps.testIdPrefix}-close`}
        isCloseDisabled={submitProps.isSubmitting}
        onClose={close}
        title={title}
        titleAddon={titleAddon}
        titleId={titleId}
      />
      <DialogBody>{children}</DialogBody>
      <DialogFooter error={error}>
        <SubmitButtons {...submitProps} formId={formId} onCancel={close} onSubmit={onSubmit} />
      </DialogFooter>
    </Dialog>
  )
}
