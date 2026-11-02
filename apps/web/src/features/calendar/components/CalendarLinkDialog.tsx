import { BusyLabel, Button, formFieldControlClassName, HelpToggle, InputDialog } from '@buddy/ui'
import { useId } from 'react'

/** 読めるかの確認の状態。failed は、確認か結び付けが失敗したときである。 */
export type CalendarCheckStatus = 'idle' | 'checking' | 'readable' | 'failed'

/** 読めたときの確認の結果の文。 */
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

/**
 * 1 人の職員に Google カレンダーを結び付けるダイアログ。読めると確認したカレンダーだけを結び付けられる。
 * カレンダーの ID がどこにあるかは、初めて結び付けるときだけ要る説明なので、見出しの右の ? のヘルプに入れる。
 */
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
  const inputId = useId()
  const checking = checkStatus === 'checking'
  return (
    <InputDialog
      busyLabel="結び付ける"
      canSubmit={checkStatus === 'readable'}
      closeTestId="calendar-link-dialog-close"
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="結び付ける"
      testIdPrefix="calendar-link"
      title="カレンダーを結び付ける"
    >
      <div className="flex flex-col gap-3">
        <span className="text-caption text-text-secondary">職員</span>
        <span className="text-body" data-testid="calendar-link-staff">
          {staffName}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <div className="relative flex items-center gap-1">
          <label className="text-label" htmlFor={inputId}>
            カレンダーの ID
          </label>
          <HelpToggle data-testid="schedule-link-calendar-id-help">
            Google カレンダーの「カレンダーの統合」にある ID です。個人のカレンダーでは、Google
            のメールアドレスです。
          </HelpToggle>
        </div>
        <input
          autoComplete="off"
          className={formFieldControlClassName}
          data-testid="calendar-link-input"
          disabled={isSubmitting}
          id={inputId}
          onChange={(event) => onCalendarIdChange(event.target.value)}
          type="text"
          value={calendarId}
        />
      </div>
      <div>
        <Button
          data-testid="calendar-link-check"
          disabled={calendarId.trim() === '' || checking || isSubmitting}
          onClick={onCheck}
          size="S"
          variant="secondary"
        >
          <BusyLabel busy={checking}>読めるか確認する</BusyLabel>
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
    </InputDialog>
  )
}
