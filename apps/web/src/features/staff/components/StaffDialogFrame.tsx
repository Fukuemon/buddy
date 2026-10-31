import { Button, type ButtonVariant } from '@buddy/ui'
import { useId, type ReactNode } from 'react'

import { BusyLabel } from '#/components/site/BusyLabel'
import { SiteDialog } from '#/components/site/SiteDialog'

export type StaffDialogFrameProps = {
  /** testid の接頭辞。`<接頭辞>-dialog`、`-cancel`、`-submit`、`-error` を付ける。 */
  testIdPrefix: string
  title: string
  /** 送る前と、送っている間のボタンの文字。 */
  submitLabel: string
  busyLabel: string
  submitVariant?: ButtonVariant
  /** false の間は、送るボタンを押せない。 */
  canSubmit: boolean
  isSubmitting: boolean
  /** 送れなかったときの文。送るボタンの左に出す。 */
  errorMessage?: string
  role?: 'dialog' | 'alertdialog'
  onSubmit: () => void
  onCancel: () => void
  children: ReactNode
}

/**
 * 職員の詳細に重ねる、役職、権限、休職、退職のダイアログの枠。タイトル、本文、理由の文、キャンセルと送るボタンを並べる。
 * 送っている間は、覆い、Escape キー、キャンセルで閉じない。
 */
export const StaffDialogFrame = ({
  testIdPrefix,
  title,
  submitLabel,
  busyLabel,
  submitVariant = 'primary',
  canSubmit,
  isSubmitting,
  errorMessage,
  role = 'dialog',
  onSubmit,
  onCancel,
  children,
}: StaffDialogFrameProps) => {
  const titleId = useId()
  return (
    <SiteDialog
      canClose={!isSubmitting}
      data-testid={`${testIdPrefix}-dialog`}
      labelledBy={titleId}
      onClose={onCancel}
      role={role}
    >
      <h2 className="text-heading-sm" id={titleId}>
        {title}
      </h2>
      {children}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {errorMessage !== undefined && (
          <p
            className="mr-auto border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
            data-testid={`${testIdPrefix}-error`}
            role="alert"
          >
            {errorMessage}
          </p>
        )}
        <Button
          data-testid={`${testIdPrefix}-cancel`}
          disabled={isSubmitting}
          onClick={onCancel}
          size="S"
          variant="secondary"
        >
          キャンセル
        </Button>
        <Button
          data-testid={`${testIdPrefix}-submit`}
          disabled={!canSubmit || isSubmitting}
          onClick={onSubmit}
          size="S"
          variant={submitVariant}
        >
          <BusyLabel busy={isSubmitting}>{isSubmitting ? busyLabel : submitLabel}</BusyLabel>
        </Button>
      </div>
    </SiteDialog>
  )
}
