import { Button } from '@buddy/ui'
import { useId } from 'react'

import { BusyLabel } from './BusyLabel'
import { CalendarDialog } from './CalendarDialog'

export type CalendarAcceptDialogProps = {
  /** Google カレンダーの内容に合わせる予定の日時と職員。 */
  target: string
  isSubmitting: boolean
  /** Google カレンダーの内容に合わせられなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/** buddy の予定を Google カレンダーの内容に合わせる前に、buddy での変更が消えることを示して確認するダイアログ。 */
export const CalendarAcceptDialog = ({
  target,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: CalendarAcceptDialogProps) => {
  const titleId = useId()
  return (
    <CalendarDialog
      canClose={!isSubmitting}
      data-testid="calendar-accept-dialog"
      labelledBy={titleId}
      onClose={onCancel}
      role="alertdialog"
    >
      <h2 className="text-heading-sm" id={titleId}>
        Google カレンダーの内容に合わせますか
      </h2>
      <p className="text-body" data-testid="calendar-accept-target">
        {target}
      </p>
      <p className="text-body">
        buddy の予定のタイトルと日時を、Google カレンダーの今の内容にします。buddy
        で変えたタイトルと日時は消えます。Google カレンダーで消された予定は、buddy
        でもキャンセルします。
      </p>
      {errorMessage !== undefined && (
        <p
          className="border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
          data-testid="calendar-accept-error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          data-testid="calendar-accept-cancel"
          disabled={isSubmitting}
          onClick={onCancel}
          size="S"
          variant="secondary"
        >
          キャンセル
        </Button>
        <Button
          data-testid="calendar-accept-submit"
          disabled={isSubmitting}
          onClick={onSubmit}
          size="S"
        >
          <BusyLabel busy={isSubmitting}>合わせる</BusyLabel>
        </Button>
      </div>
    </CalendarDialog>
  )
}
