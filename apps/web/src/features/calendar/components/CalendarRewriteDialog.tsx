import { Button } from '@buddy/ui'
import { useId } from 'react'

import { BusyLabel } from './BusyLabel'
import { CalendarDialog } from './CalendarDialog'

export type CalendarRewriteDialogProps = {
  /** 書き直す予定の日時と職員。 */
  target: string
  /** buddy でキャンセルした単発の予定か。書き直すと Google カレンダーの予定を消すので、注意の文を替える。 */
  cancelled?: boolean
  isSubmitting: boolean
  /** 書き直す待ちにできなかったときの文。 */
  errorMessage?: string
  onSubmit: () => void
  onCancel: () => void
}

/** Google カレンダーの予定を buddy の内容で書き直す前に、Google カレンダーでの変更が消えることを示して確かめるダイアログ。 */
export const CalendarRewriteDialog = ({
  target,
  cancelled = false,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: CalendarRewriteDialogProps) => {
  const titleId = useId()
  return (
    <CalendarDialog
      canClose={!isSubmitting}
      data-testid="calendar-rewrite-dialog"
      labelledBy={titleId}
      onClose={onCancel}
      role="alertdialog"
    >
      <h2 className="text-heading-sm" id={titleId}>
        buddy の内容で書き直しますか
      </h2>
      <p className="text-body" data-testid="calendar-rewrite-target">
        {target}
      </p>
      <p className="text-body" data-testid="calendar-rewrite-notice">
        {cancelled
          ? 'buddy でキャンセルした予定なので、Google カレンダーの予定を消します。Google カレンダーで直したタイトルと日時も消えます。書き直しは、数十秒のうちに Google カレンダーに出ます。'
          : 'Google カレンダーの予定のタイトルと日時を buddy の内容にします。Google カレンダーで直したタイトルと日時は消えます。消された予定は作り直します。書き直しは、数十秒のうちに Google カレンダーに出ます。'}
      </p>
      {errorMessage !== undefined && (
        <p
          className="border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
          data-testid="calendar-rewrite-error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          data-testid="calendar-rewrite-cancel"
          disabled={isSubmitting}
          onClick={onCancel}
          size="S"
          variant="secondary"
        >
          キャンセル
        </Button>
        <Button
          data-testid="calendar-rewrite-submit"
          disabled={isSubmitting}
          onClick={onSubmit}
          size="S"
        >
          <BusyLabel busy={isSubmitting}>書き直す</BusyLabel>
        </Button>
      </div>
    </CalendarDialog>
  )
}
