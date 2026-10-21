import { Drawer } from '@buddy/ui'
import { useId, useState, type ReactNode } from 'react'

import { useIsDesktop } from '../lib/useIsDesktop'
import type { StaffFilterToggle } from './ScheduleCalendarToolbar'

export type StaffFilterLayoutProps = {
  /** 職員の絞り込みの中身 */
  staffFilter: ReactNode
  /** カレンダーを描く。幅 768px 未満では、ドロワーを開くボタンに渡す値を受ける。 */
  renderCalendar: (staffFilterToggle: StaffFilterToggle | undefined) => ReactNode
}

/**
 * 職員の絞り込みとカレンダーを並べる。
 * 幅 768px 以上では、絞り込みを左のサイドバーに常に出す。未満では、左端から開くドロワーに入れ、閉じた状態で始める。
 */
export const StaffFilterLayout = ({ staffFilter, renderCalendar }: StaffFilterLayoutProps) => {
  const isDesktop = useIsDesktop()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerId = useId()

  return (
    <div className="flex min-h-0 grow flex-col desktop:flex-row">
      {isDesktop ? (
        <aside className="w-56 shrink-0 overflow-auto border-r border-border">{staffFilter}</aside>
      ) : (
        <Drawer
          closeButtonTestId="staff-filter-close"
          data-testid="staff-filter-drawer"
          id={drawerId}
          isOpen={isDrawerOpen}
          onCloseRequest={() => setIsDrawerOpen(false)}
          title="職員の絞り込み"
        >
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
