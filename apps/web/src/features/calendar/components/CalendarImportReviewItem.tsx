import { formFieldControlClassName, Select } from '@buddy/ui'
import { useId, useState } from 'react'

import type { ImportReviewItem, Patient } from '#/api/types'

import { formatRecurrence, formatReviewDateTime } from '../lib/format'
import type { ImportAction, ReviewChoice } from '../lib/importSummary'

export type CalendarImportReviewItemProps = {
  item: ImportReviewItem
  choice?: ReviewChoice
  onChoiceChange: (choice: ReviewChoice) => void
  /** 事業所の全ての利用者。同じ名前の利用者の後に、名前の順で並べる。 */
  patients: readonly Patient[]
  disabled: boolean
}

const ACTIONS: { action: ImportAction; label: string; testid: string }[] = [
  { action: 'patient', label: '利用者を選ぶ', testid: 'patient' },
  { action: 'normal', label: '通常の予定にする', testid: 'normal' },
  { action: 'skip', label: '取り込まない', testid: 'skip' },
]

const reasonLabel = (item: ImportReviewItem) => {
  switch (item.reason) {
    case 'patient_ambiguous':
      return `同じ名前の利用者が ${item.candidates.length} 人いる`
    case 'recurrence_unsupported':
      return '繰り返しの規則を buddy に写せない'
    default:
      return '利用者が見つからない'
  }
}

/**
 * タイトルから利用者を 1 人に決められなかった予定か、繰り返しの規則を buddy に写せない予定 1 件と、その取り込み方の選択。
 * 規則に写せない予定（予定の正本の切り替えの取り込みだけが返す）は、取り込まないだけを選べる。
 * 「利用者を選ぶ」を選ぶと、利用者の欄を出す。同じ名前の利用者は、担当の職員の名前を添えて先に並べる。
 */
export const CalendarImportReviewItem = ({
  item,
  choice,
  onChoiceChange,
  patients,
  disabled,
}: CalendarImportReviewItemProps) => {
  const id = item.external_event_id
  const legendId = useId()
  const patientFieldId = useId()
  const [filter, setFilter] = useState('')
  const dateTime = formatReviewDateTime(item)
  const isUnsupported = item.reason === 'recurrence_unsupported'
  const actions = isUnsupported ? ACTIONS.filter(({ action }) => action === 'skip') : ACTIONS
  const candidateIds = new Set(item.candidates.map((c) => c.patient_id))
  const query = filter.trim()
  const matches = (name: string) => query === '' || name.includes(query)
  const candidates = item.candidates.filter(
    (c) => matches(c.name) || c.patient_id === choice?.patientId,
  )
  const others = patients
    .filter((p) => !candidateIds.has(p.id) && (matches(p.name) || p.id === choice?.patientId))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  return (
    <li
      className="grid gap-3 rounded-8 border border-border bg-warning-surface px-4 py-3 desktop:grid-cols-[minmax(0,1fr)_18rem]"
      data-testid={`calendar-import-review-${id}`}
    >
      <div className="flex flex-col gap-0.5">
        <strong className="text-label">{dateTime}</strong>
        {item.client_name !== '' && (
          <span className="text-body">
            タイトルから読んだ利用者: {item.client_name}（{item.service}）
          </span>
        )}
        <span className="text-label">{reasonLabel(item)}</span>
        {isUnsupported && (
          <span className="text-caption text-text-secondary">
            隔週や複数の曜日のような規則は、buddy の繰り返しにできません。Google
            カレンダーで規則を直してから取り込み直すか、取り込まないを選んでください
          </span>
        )}
        {item.recurrence !== null && (
          <span className="text-caption text-text-secondary">
            {formatRecurrence(item.recurrence)}。選んだ取り込み方は全ての回に当てる
          </span>
        )}
      </div>
      <fieldset aria-labelledby={legendId} className="flex flex-col gap-1">
        <legend className="sr-only" id={legendId}>
          {dateTime}の予定の取り込み方
        </legend>
        {actions.map(({ action, label, testid }) => (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body" key={action}>
            <input
              checked={choice?.action === action}
              className="size-5"
              data-testid={`calendar-import-review-${testid}-${id}`}
              disabled={disabled}
              name={`review-${id}`}
              onChange={() =>
                onChoiceChange(
                  action === 'patient' ? { action, patientId: choice?.patientId } : { action },
                )
              }
              type="radio"
              value={action}
            />
            {label}
          </label>
        ))}
        {choice?.action === 'patient' && (
          <div className="ml-7 flex flex-col gap-3">
            <label className="text-label" htmlFor={patientFieldId}>
              利用者
            </label>
            <input
              aria-label="利用者を名前で絞り込む"
              className={formFieldControlClassName}
              disabled={disabled}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="名前で絞り込む"
              type="search"
              value={filter}
            />
            <Select
              data-testid={`calendar-import-review-patient-select-${id}`}
              disabled={disabled}
              id={patientFieldId}
              onChange={(event) =>
                onChoiceChange({
                  action: 'patient',
                  patientId: event.target.value === '' ? undefined : event.target.value,
                })
              }
              value={choice.patientId ?? ''}
            >
              <option value="">選んでください</option>
              {candidates.map((c) => (
                <option key={c.patient_id} value={c.patient_id}>
                  {c.name}（担当 {c.assigned_staff_name}）
                </option>
              ))}
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </fieldset>
    </li>
  )
}
