import { ConfirmDialog } from '@buddy/ui'

export type CalendarCutoverCancelDialogProps = {
  isSubmitting: boolean
  /** やめられなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/** 予定の正本の切り替えをやめる前に、取り込んだ予定が消え、Google カレンダーを正本にしたままになることを示して確認するダイアログ。 */
export const CalendarCutoverCancelDialog = ({
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: CalendarCutoverCancelDialogProps) => (
  <ConfirmDialog
    busyLabel="やめています"
    canSubmit
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
    title="切り替えをやめますか"
  >
    <p className="text-body">
      この切り替えで取り込んだ予定を、buddy から消します。事業所の予定は、Google
      カレンダーで管理したままです。もう一度始めると、初めから取り込み直します。
    </p>
  </ConfirmDialog>
)
