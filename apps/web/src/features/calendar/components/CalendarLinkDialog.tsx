import { Button } from '@buddy/ui'
import { useId } from 'react'

import { BusyLabel } from './BusyLabel'
import { CalendarDialog } from './CalendarDialog'

/** 読めるかの確かめの状態。failed は、確かめか結び付けが失敗したときである。 */
export type CalendarCheckStatus = 'idle' | 'checking' | 'readable' | 'failed'

/** 読めたときの確かめの結果の文。 */
const READABLE_MESSAGE = '読めました。結び付けると、予定の取り込みでこのカレンダーを選べます。'

export type CalendarLinkDialogProps = {
  staffName: string
  calendarId: string
  onCalendarIdChange: (value: string) => void
  checkStatus: CalendarCheckStatus
  /** checkStatus が failed のときの理由の文。 */
  errorMessage?: string
  isSubmitting: boolean
  onCheck: () => void
  onSubmit: () => void
  onClose: () => void
}

const inputClassName =
  'min-h-11 w-full rounded-8 px-3 text-body ring-1 ring-border-field ring-inset focus-visible:focus-ring disabled:bg-surface-disabled disabled:text-text-disabled'

/** 1 人の職員に Google カレンダーを結び付けるダイアログ。読めると確かめたカレンダーだけを結び付けられる。 */
export const CalendarLinkDialog = ({
  staffName,
  calendarId,
  onCalendarIdChange,
  checkStatus,
  errorMessage,
  isSubmitting,
  onCheck,
  onSubmit,
  onClose,
}: CalendarLinkDialogProps) => {
  const titleId = useId()
  const inputId = useId()
  const hintId = useId()
  const checking = checkStatus === 'checking'
  return (
    <CalendarDialog
      canClose={!isSubmitting}
      data-testid="calendar-link-dialog"
      labelledBy={titleId}
      onClose={onClose}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-heading-sm" id={titleId}>
          カレンダーを結び付ける
        </h2>
        <button
          aria-disabled={isSubmitting || undefined}
          aria-label="閉じる"
          className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring aria-disabled:text-text-disabled"
          data-testid="calendar-link-dialog-close"
          onClick={() => {
            if (!isSubmitting) onClose()
          }}
          type="button"
        >
          <svg aria-hidden height="20" viewBox="0 0 20 20" width="20">
            <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-caption text-text-secondary">職員</span>
        <span className="text-body" data-testid="calendar-link-staff">
          {staffName}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-label" htmlFor={inputId}>
          カレンダーの ID
        </label>
        <input
          aria-describedby={hintId}
          autoComplete="off"
          className={inputClassName}
          data-testid="calendar-link-input"
          disabled={isSubmitting}
          id={inputId}
          onChange={(event) => onCalendarIdChange(event.target.value)}
          type="text"
          value={calendarId}
        />
        <span className="text-caption text-text-secondary" id={hintId}>
          Google カレンダーの「カレンダーの統合」にある ID。個人のカレンダーでは、Google
          のメールアドレスです。
        </span>
      </div>
      <div>
        <Button
          data-testid="calendar-link-check"
          disabled={calendarId.trim() === '' || checking || isSubmitting}
          onClick={onCheck}
          size="S"
          variant="secondary"
        >
          <BusyLabel busy={checking}>読めるか確かめる</BusyLabel>
        </Button>
      </div>
      {checkStatus === 'readable' && (
        <output
          className="block border-l-4 border-primary bg-primary-surface px-3 py-2 text-label"
          data-testid="calendar-link-check-result"
        >
          {READABLE_MESSAGE}
        </output>
      )}
      {checkStatus === 'failed' && (
        <p
          className="border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
          data-testid="calendar-link-check-result"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          data-testid="calendar-link-cancel"
          disabled={isSubmitting}
          onClick={onClose}
          size="S"
          variant="secondary"
        >
          キャンセル
        </Button>
        <Button
          data-testid="calendar-link-submit"
          disabled={checkStatus !== 'readable' || isSubmitting}
          onClick={onSubmit}
          size="S"
        >
          <BusyLabel busy={isSubmitting}>結び付ける</BusyLabel>
        </Button>
      </div>
    </CalendarDialog>
  )
}
