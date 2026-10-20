import { clsx } from 'clsx'
import type { ReactNode } from 'react'

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
            'flex w-full flex-col gap-1 rounded-xl px-4 py-3 text-left ring-1 ring-inset',
            item.id === activeId
              ? 'bg-action-bg ring-action-main'
              : 'ring-gray-200 hover:bg-gray-10',
            item.error !== undefined && 'ring-incorrect-main',
          )}
          data-testid={`schedule-field-${item.id}`}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          <span className="text-xs text-text-secondary">{item.label}</span>
          <span className="text-sm">{item.content}</span>
          {item.error !== undefined && (
            <span className="text-xs text-incorrect-main" role="alert">
              {item.error}
            </span>
          )}
        </button>
      </li>
    ))}
  </ul>
)
