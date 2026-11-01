import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/** 一覧の 1 項目。content に今の値の要約を渡す。値を入れていなければ content を省く。 */
export type ScheduleFieldSummaryItem<Id extends string> = {
  id: Id
  label: string
  content?: ReactNode
  /** content を省いたときに薄い色で出す文。省くと何も出さない。読み上げでは、代わりに「未入力」を読ませる。 */
  placeholder?: string
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
          <span className="min-h-[1lh] text-body-dense">
            {item.content ?? (
              <>
                {item.placeholder !== undefined && (
                  <span aria-hidden className="text-text-secondary">
                    {item.placeholder}
                  </span>
                )}
                <span className="sr-only">未入力</span>
              </>
            )}
          </span>
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
