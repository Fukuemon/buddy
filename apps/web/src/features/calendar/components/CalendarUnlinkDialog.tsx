import { Button } from '@buddy/ui'
import { useId } from 'react'

import { BusyLabel } from './BusyLabel'
import { CalendarDialog } from './CalendarDialog'

export type CalendarUnlinkDialogProps = {
  staffName: string
  calendarId: string
  isSubmitting: boolean
  /** 外せなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/** 職員に結び付けたカレンダーを外す前に、外すと何が残るかを示して確かめるダイアログ。 */
export const CalendarUnlinkDialog = ({
  staffName,
  calendarId,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: CalendarUnlinkDialogProps) => {
  const titleId = useId()
  return (
    <CalendarDialog
      canClose={!isSubmitting}
      data-testid="calendar-unlink-dialog"
      labelledBy={titleId}
      onClose={onCancel}
      role="alertdialog"
    >
      <h2 className="text-heading-sm" id={titleId}>
        カレンダーを外しますか
      </h2>
      <p className="text-body">
        {staffName} の Google カレンダー（{calendarId}
        ）を外します。取り込んだ予定は buddy
        に残ります。結び付け直すと、取り込み済みの予定は重ならずに数えられます。
      </p>
      {errorMessage !== undefined && (
        <p
          className="border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
          data-testid="calendar-unlink-error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          data-testid="calendar-unlink-cancel"
          disabled={isSubmitting}
          onClick={onCancel}
          size="S"
          variant="secondary"
        >
          キャンセル
        </Button>
        <Button
          data-testid="calendar-unlink-submit"
          disabled={isSubmitting}
          onClick={onSubmit}
          size="S"
          variant="destructive"
        >
          <BusyLabel busy={isSubmitting}>外す</BusyLabel>
        </Button>
      </div>
    </CalendarDialog>
  )
}
