import { Drawer } from '@buddy/ui'
import { useId, useState, type ReactNode } from 'react'

import { useIsDesktop } from '#/components/site/useIsDesktop'
import type { StaffFilterToggle } from './ScheduleCalendarToolbar'

export type StaffFilterLayoutProps = {
  /** ミニカレンダーの下に置く、キャンセルした予定の切り替えと職員の絞り込み */
  staffFilter: ReactNode
  /** サイドバーの先頭に置くミニカレンダーを描く。幅 768px 未満では、日を押した後にドロワーを閉じる関数を受ける。 */
  renderMiniCalendar: (onSelected: (() => void) | undefined) => ReactNode
  /** カレンダーを描く。幅 768px 未満では、ドロワーを開くボタンに渡す値を受ける。 */
  renderCalendar: (staffFilterToggle: StaffFilterToggle | undefined) => ReactNode
}

/**
 * 職員の絞り込みとミニカレンダーを左に、カレンダーを右に並べる。
 * 幅 768px 以上では、左のサイドバーに常に出す。サイドバーは、ミニカレンダーから職員の一覧までを 1 つの領域でスクロールする。
 * 未満では、左端から開くドロワーに入れ、閉じた状態で始める。ミニカレンダーの日を押すと、ドロワーを閉じる。
 * ドロワーを開いたまま 768px 以上になると、ドロワーを閉じる。
 */
export const StaffFilterLayout = ({
  staffFilter,
  renderMiniCalendar,
  renderCalendar,
}: StaffFilterLayoutProps) => {
  const isDesktop = useIsDesktop()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerId = useId()
  if (isDesktop && isDrawerOpen) setIsDrawerOpen(false)

  return (
    <div className="flex min-h-0 grow flex-col desktop:flex-row">
      {isDesktop ? (
        <aside className="w-80 shrink-0 overflow-auto border-r border-border">
          <div className="border-b border-border px-1 py-2">{renderMiniCalendar(undefined)}</div>
          {staffFilter}
        </aside>
      ) : (
        <Drawer
          closeButtonTestId="staff-filter-close"
          data-testid="staff-filter-drawer"
          id={drawerId}
          isOpen={isDrawerOpen}
          onCloseRequest={() => setIsDrawerOpen(false)}
          title="日付と絞り込み"
        >
          <div className="border-b border-border px-1 py-2">
            {renderMiniCalendar(() => setIsDrawerOpen(false))}
          </div>
          {staffFilter}
        </Drawer>
      )}
      <main className="min-h-0 min-w-0 grow">
        {renderCalendar(
          isDesktop
            ? undefined
            : { isOpen: isDrawerOpen, controlsId: drawerId, onOpen: () => setIsDrawerOpen(true) },
        )}
      </main>
    </div>
  )
}
