import type { ButtonVariant } from '@buddy/ui'
import { useId, type ReactNode } from 'react'

import { DialogFooter } from './InputDialog'
import { SiteDialog } from './SiteDialog'

export type ConfirmDialogProps = {
  /** testid の接頭辞。`<接頭辞>-dialog`、`-cancel`、`-submit` を付ける。 */
  testIdPrefix: string
  /** 問いの形のタイトル。 */
  title: string
  /** 確定のボタンの文字。操作の動詞にする。 */
  submitLabel: string
  busyLabel: string
  /** データを失う操作は destructive にする。 */
  submitVariant?: ButtonVariant
  canSubmit: boolean
  isSubmitting: boolean
  /** 確定できなかったときの文。フッターのボタンの左に出す。 */
  error?: { message: ReactNode; testId: string }
  onSubmit: () => void
  onCancel: () => void
  /** 何が失われ、何が残るかの説明。 */
  children: ReactNode
}

/**
 * 確認のダイアログ。× を置かず、本文に問いの形のタイトルと説明を、フッターの右に「キャンセル」と確定のボタンを置く。
 * Escape キーと覆いは「キャンセル」と同じく何も変えずに閉じる。送っている間は閉じない。
 */
export const ConfirmDialog = ({
  testIdPrefix,
  title,
  submitLabel,
  busyLabel,
  submitVariant = 'primary',
  canSubmit,
  isSubmitting,
  error,
  onSubmit,
  onCancel,
  children,
}: ConfirmDialogProps) => {
  const titleId = useId()
  return (
    <SiteDialog
      canClose={!isSubmitting}
      data-testid={`${testIdPrefix}-dialog`}
      labelledBy={titleId}
      onClose={onCancel}
      role="alertdialog"
      width="narrow"
    >
      <h2 className="text-heading-sm" id={titleId}>
        {title}
      </h2>
      {children}
      <DialogFooter
        busyLabel={busyLabel}
        canSubmit={canSubmit}
        error={error}
        isSubmitting={isSubmitting}
        onCancel={() => {
          if (!isSubmitting) onCancel()
        }}
        onSubmit={onSubmit}
        submitLabel={submitLabel}
        submitVariant={submitVariant}
        testIdPrefix={testIdPrefix}
      />
    </SiteDialog>
  )
}
