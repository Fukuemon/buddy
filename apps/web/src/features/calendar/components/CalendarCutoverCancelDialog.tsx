import { ConfirmDialog } from '@buddy/ui'

export type CalendarCutoverCancelDialogProps = {
  isSubmitting: boolean
  /** やめられなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/**
 * 予定の管理の移行をやめる前に、取り込んだ予定が消え、予定を Google カレンダーで管理したままになることを示して確認するダイアログ。
 * 閉じる側のボタンは、「キャンセル」と確定の「やめる」がどちらも取り消しに読めるので「戻る」にする。
 */
export const CalendarCutoverCancelDialog = ({
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: CalendarCutoverCancelDialogProps) => (
  <ConfirmDialog
    busyLabel="やめています"
    canSubmit
    cancelLabel="戻る"
    error={
      errorMessage === undefined
        ? undefined
        : { message: errorMessage, testId: 'calendar-cutover-cancel-confirm-error', isBlock: true }
    }
    isSubmitting={isSubmitting}
    onCancel={onCancel}
    onSubmit={onSubmit}
    submitLabel="やめる"
    submitVariant="danger"
    testIdPrefix="calendar-cutover-cancel-confirm"
    title="移行をやめますか"
  >
    <p className="text-body">
      この移行で取り込んだ予定を、buddy から消します。事業所の予定は、Google
      カレンダーで管理したままです。もう一度始めると、初めから取り込み直します。
    </p>
  </ConfirmDialog>
)
