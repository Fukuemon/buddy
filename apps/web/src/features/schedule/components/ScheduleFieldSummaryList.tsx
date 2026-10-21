import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/** 一覧の 1 項目。content に今の値の要約を渡す。 */
export type ScheduleFieldSummaryItem<Id extends string> = {
  id: Id
  label: string
  content: ReactNode
  /** 項目の中の検証のエラー。編集の欄が閉じていても気づけるよう、ここに出す。 */
  error?: string
}

export type ScheduleFieldSummaryListProps<Id extends string> = {
  items: ScheduleFieldSummaryItem<Id>[]
  activeId: Id
  onSelect: (id: Id) => void
}

/** 予定のフォームの項目の一覧。今の値を要約して出し、押した項目を編集の欄に開く。 */
export const ScheduleFieldSummaryList = <Id extends string>({
  items,
  activeId,
  onSelect,
}: ScheduleFieldSummaryListProps<Id>) => (
  <ul className="flex flex-col gap-2">
    {items.map((item) => (
      <li key={item.id}>
        <button
          aria-current={item.id === activeId || undefined}
          className={clsx(
            'flex w-full flex-col gap-1 rounded-8 px-4 py-3 text-left ring-1 ring-inset focus-visible:focus-ring',
            item.id === activeId
              ? 'bg-primary-surface ring-2 ring-primary'
              : 'ring-border-field hover:bg-surface-subtle',
            item.error !== undefined && 'ring-2 ring-danger',
          )}
          data-testid={`schedule-field-${item.id}`}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          <span className="text-caption text-text-secondary">{item.label}</span>
          <span className="text-body-dense">{item.content}</span>
          {item.error !== undefined && (
            <span className="text-caption text-danger" role="alert">
              {item.error}
            </span>
          )}
        </button>
      </li>
    ))}
  </ul>
)
