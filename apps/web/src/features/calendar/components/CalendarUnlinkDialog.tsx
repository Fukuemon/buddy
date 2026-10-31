import { ConfirmDialog } from '@buddy/ui'

export type CalendarUnlinkDialogProps = {
  staffName: string
  calendarId: string
  isSubmitting: boolean
  /** 外せなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/** 職員に結び付けたカレンダーを外す前に、外すと何が残るかを示して確認するダイアログ。確定のボタンを赤にする。 */
export const CalendarUnlinkDialog = ({
  staffName,
  calendarId,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: CalendarUnlinkDialogProps) => (
  <ConfirmDialog
    busyLabel="外す"
    canSubmit
    error={
      errorMessage === undefined
        ? undefined
        : { message: errorMessage, testId: 'calendar-unlink-error', isBlock: true }
    }
    isSubmitting={isSubmitting}
    onCancel={onCancel}
    onSubmit={onSubmit}
    submitLabel="外す"
    submitVariant="danger"
    testIdPrefix="calendar-unlink"
    title="カレンダーを外しますか"
  >
    <p className="text-body">
      {staffName} の Google カレンダー（{calendarId}）を外します。取り込んだ予定は buddy
      に残ります。結び付け直しても、同じ予定を二度は取り込みません。
    </p>
  </ConfirmDialog>
)
