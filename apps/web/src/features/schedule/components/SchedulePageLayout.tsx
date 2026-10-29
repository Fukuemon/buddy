import type { ReactNode } from 'react'

import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'

import { ScheduleCalendarContainer } from './ScheduleCalendarContainer'
import { ScheduleCancelledToggleContainer } from './ScheduleCancelledToggleContainer'
import { ScheduleMiniCalendarContainer } from './ScheduleMiniCalendarContainer'
import { StaffFilterSidebarContainer } from './StaffFilterSidebarContainer'

export type SchedulePageLayoutProps = {
  /** カレンダーの上に重ねる、予定の作成と詳細のダイアログ。 */
  children?: ReactNode
}

/**
 * `/schedule` の画面。左のサイドバーの、画面の間を移るリンクの下に、ミニカレンダー、キャンセルした予定の切り替え、職員の絞り込みを置き、右にカレンダーを置く。
 * 幅 768px 未満では、ミニカレンダーの日を押すと、サイドバーのドロワーを閉じる。
 */
export const SchedulePageLayout = ({ children }: SchedulePageLayoutProps) => (
  <SiteLayoutContainer
    current="/schedule"
    renderSidebar={(closeDrawer) => (
      <>
        <div className="border-b border-border px-1 py-2">
          <ScheduleMiniCalendarContainer onSelected={closeDrawer} />
        </div>
        <ScheduleCancelledToggleContainer />
        <StaffFilterSidebarContainer />
      </>
    )}
  >
    <main className="min-h-0 min-w-0 grow">
      <ScheduleCalendarContainer />
    </main>
    {children}
  </SiteLayoutContainer>
)
