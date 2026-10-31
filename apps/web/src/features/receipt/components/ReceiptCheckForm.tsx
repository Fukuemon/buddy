import { Button, SegmentedControl } from '@buddy/ui'
import { useId, type FormEvent } from 'react'

import { CsvFileField } from './CsvFileField'

/** 予定の取り方。calendar は Google カレンダーの対象の月、csv は予定の CSV。 */
export type ScheduleSource = 'calendar' | 'csv'

const SOURCE_OPTIONS = [
  { id: 'calendar', label: 'Google カレンダー' },
  { id: 'csv', label: '予定の CSV' },
] as const

export type ReceiptCheckFormProps = {
  source: ScheduleSource
  onSourceChange: (source: ScheduleSource) => void
  /** 対象の月（`YYYY-MM`）。 */
  month: string
  onMonthChange: (month: string) => void
  onSchedulesChange: (file: File | null) => void
  onVisitsChange: (file: File | null) => void
  /** 入力がそろっていなければ false。送信のボタンを押せなくする。 */
  canSubmit: boolean
  isSubmitting: boolean
  onSubmit: () => void
  /** 照合の失敗の文。 */
  errorMessage?: string
  /** 失敗の文の下に並べる、入力の CSV の誤りの文。csvErrorLines で作る。 */
  errorLines?: readonly string[]
}

/** 照合の入力。予定の取り方、対象の月か予定の CSV、実績の CSV を選んで送る。 */
export const ReceiptCheckForm = ({
  source,
  onSourceChange,
  month,
  onMonthChange,
  onSchedulesChange,
  onVisitsChange,
  canSubmit,
  isSubmitting,
  onSubmit,
  errorMessage,
  errorLines = [],
}: ReceiptCheckFormProps) => {
  const monthId = useId()
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit && !isSubmitting) onSubmit()
  }
  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={handleSubmit}
      data-testid="receipt-check-form"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <span className="text-label">予定の取り方</span>
        <SegmentedControl
          label="予定の取り方"
          options={SOURCE_OPTIONS}
          value={source}
          onChange={onSourceChange}
          data-testid="receipt-source"
        />
      </div>
      {source === 'calendar' ? (
        <div className="flex flex-col gap-2">
          <label className="text-label" htmlFor={monthId}>
            対象の月
          </label>
          <input
            id={monthId}
            type="month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
            className="min-h-11 w-56 rounded-8 bg-surface px-3 text-body ring-1 ring-border-field ring-inset focus-visible:focus-ring"
            data-testid="receipt-month"
          />
          <span className="text-caption text-text-secondary">
            その月の 1 日から月末までの予定を、職員の Google カレンダーから取ります。
          </span>
        </div>
      ) : (
        <CsvFileField
          label="予定の CSV"
          onChange={onSchedulesChange}
          data-testid="receipt-schedules-file"
        />
      )}
      <CsvFileField
        label="実績の CSV"
        description="電子カルテから書き出した CSV。UTF-8 か Shift_JIS で、10 MB まで。"
        onChange={onVisitsChange}
        data-testid="receipt-visits-file"
      />
      {errorMessage !== undefined && (
        <div className="flex flex-col gap-2" role="alert" data-testid="receipt-check-error">
          <p className="text-body text-danger">{errorMessage}</p>
          {errorLines.length > 0 && (
            <ul className="list-disc pl-6 text-body-dense text-danger">
              {errorLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <Button
          type="submit"
          disabled={!canSubmit}
          isLoading={isSubmitting}
          data-testid="receipt-check-submit"
        >
          照合する
        </Button>
      </div>
    </form>
  )
}
