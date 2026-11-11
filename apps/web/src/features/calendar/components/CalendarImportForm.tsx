import { Button, formFieldControlClassName, Select } from '@buddy/ui'
import { useId, type FormEvent } from 'react'

import type { Staff } from '#/api/types'

import { formatDateRange } from '../lib/format'
import type { ImportRangeErrors } from '../lib/importRange'

export type CalendarImportFormProps = {
  /** Google カレンダーを結び付けた職員。名前の順に並べて渡す。 */
  staffOptions: readonly Pick<Staff, 'id' | 'name'>[]
  staffId: Staff['id']
  onStaffChange: (staffId: Staff['id']) => void
  /** 期間の開始日（`YYYY-MM-DD`）。 */
  start: string
  onStartChange: (value: string) => void
  /** 期間の終了日（`YYYY-MM-DD`）。この日を含む。 */
  end: string
  onEndChange: (value: string) => void
  rangeErrors: ImportRangeErrors
  /** false なら、プレビューするを押せない。 */
  canPreview: boolean
  /** true の間は、職員と期間を変えられない。プレビュー中と取り込み中である。 */
  isLocked: boolean
  isPreviewing: boolean
  onPreview: () => void
  /** プレビューの失敗の文。 */
  errorMessage?: string
  /**
   * 予定の管理の移行の取り込みの期間の最初の日（`YYYY-MM-DD`）。渡すと、期間の入力を出さず、この日から先の全ての予定を読む
   * ことを示す。移行の間の取り込みの期間は、API が決めた期間だけである。
   */
  cutoverRangeStart?: string
}

/**
 * 予定を取り込む職員と期間の入力。幅 768px 以上では、職員と期間を横に並べる。
 * 予定の管理の移行の間は、期間の入力の代わりに、移行の期間を示す。
 */
export const CalendarImportForm = ({
  staffOptions,
  staffId,
  onStaffChange,
  start,
  onStartChange,
  end,
  onEndChange,
  rangeErrors,
  canPreview,
  isLocked,
  isPreviewing,
  onPreview,
  errorMessage,
  cutoverRangeStart,
}: CalendarImportFormProps) => {
  const staffFieldId = useId()
  const startId = useId()
  const endId = useId()
  const startErrorId = useId()
  const endErrorId = useId()
  const hintId = useId()
  const previewHintId = useId()
  // 期間の誤りは欄の下に出るので、日付が欠けて押せないときだけ、押せる条件をボタンの横に出す
  const showsPreviewHint =
    !canPreview && !isLocked && cutoverRangeStart === undefined && (start === '' || end === '')
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (canPreview && !isLocked) onPreview()
  }
  return (
    <>
      <form
        className="flex flex-col gap-3"
        data-testid="calendar-import-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 desktop:grid-cols-[16rem_11rem_11rem] desktop:items-start">
          <div className="flex flex-col gap-3">
            <label className="text-label" htmlFor={staffFieldId}>
              職員
            </label>
            <Select
              data-testid="calendar-import-staff"
              disabled={isLocked}
              id={staffFieldId}
              onChange={(event) => onStaffChange(event.target.value)}
              value={staffId}
            >
              {staffOptions.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </Select>
          </div>
          {cutoverRangeStart !== undefined ? (
            <div className="flex flex-col gap-3 desktop:col-span-2">
              <span className="text-label">期間</span>
              <span className="text-body" data-testid="calendar-import-cutover-range">
                {formatDateRange(cutoverRangeStart, null)}（移行の月の初日から先の全て）
              </span>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <label className="text-label" htmlFor={startId}>
                  期間の開始日
                </label>
                <input
                  aria-describedby={
                    rangeErrors.start === undefined ? hintId : `${startErrorId} ${hintId}`
                  }
                  aria-invalid={rangeErrors.start !== undefined || undefined}
                  className={formFieldControlClassName}
                  data-testid="calendar-import-start"
                  disabled={isLocked}
                  id={startId}
                  onChange={(event) => onStartChange(event.target.value)}
                  type="date"
                  value={start}
                />
                {rangeErrors.start !== undefined && (
                  <span className="text-caption text-danger" id={startErrorId}>
                    {rangeErrors.start}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-label" htmlFor={endId}>
                  期間の終了日
                </label>
                <input
                  aria-describedby={rangeErrors.end === undefined ? undefined : endErrorId}
                  aria-invalid={rangeErrors.end !== undefined || undefined}
                  className={formFieldControlClassName}
                  data-testid="calendar-import-end"
                  disabled={isLocked}
                  id={endId}
                  onChange={(event) => onEndChange(event.target.value)}
                  type="date"
                  value={end}
                />
                {rangeErrors.end !== undefined && (
                  <span className="text-caption text-danger" id={endErrorId}>
                    {rangeErrors.end}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        <span className="text-caption text-text-secondary" id={hintId}>
          {cutoverRangeStart !== undefined
            ? '移行の月の初日から先に始まる全ての予定を、職員の Google カレンダーから読みます。繰り返しの予定は、規則のまま取り込みます。'
            : '開始日から終了日までに始まる予定を、職員の Google カレンダーから読みます。'}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            aria-describedby={showsPreviewHint ? previewHintId : undefined}
            data-testid="calendar-import-preview"
            disabled={!canPreview || isLocked}
            size="S"
            type="submit"
            variant="secondary"
          >
            プレビューする
          </Button>
          {showsPreviewHint && (
            <span
              className="text-caption text-text-secondary"
              data-testid="calendar-import-preview-hint"
              id={previewHintId}
            >
              開始日と終了日を入れると、プレビューできます。
            </span>
          )}
        </div>
      </form>
      {isPreviewing && (
        <output
          className="flex items-center gap-3 text-body"
          data-testid="calendar-import-previewing"
        >
          <span
            aria-hidden
            className="size-6 animate-spin rounded-full border-3 border-surface-disabled border-t-primary"
          />
          Google カレンダーの予定を読んでいます
        </output>
      )}
      {errorMessage !== undefined && (
        <p className="text-body text-danger" data-testid="calendar-import-error" role="alert">
          {errorMessage}
        </p>
      )}
    </>
  )
}
