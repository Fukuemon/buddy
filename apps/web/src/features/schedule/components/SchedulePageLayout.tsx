import { Drawer } from '@buddy/ui'
import { useId, useState, type ReactNode } from 'react'

import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'
import { useIsDesktop } from '#/components/site/useIsDesktop'

import { ScheduleCalendarContainer } from './ScheduleCalendarContainer'
import { ScheduleCancelledToggleContainer } from './ScheduleCancelledToggleContainer'
import { ScheduleMiniCalendarContainer } from './ScheduleMiniCalendarContainer'
import { StaffFilterSidebarContainer } from './StaffFilterSidebarContainer'

export type SchedulePageLayoutProps = {
  /** ナビゲーションの要確認の名前の右に置く、確認が必要な予定の件数の印。 */
  reviewBadge?: ReactNode
  /** カレンダーの上に重ねる、予定の作成と詳細のダイアログ。 */
  children?: ReactNode
}

/**
 * `/schedule` の画面。ナビゲーションをレールで始め、その右の左の欄に、ミニカレンダー、キャンセルした予定の切り替え、職員の絞り込みを置く。
 * 幅 768px 未満では、左の欄をドロワーに入れ、カレンダーのツールバーのボタンで開く。ミニカレンダーの日を押すと、ドロワーを閉じる。
 * ドロワーを開いたまま 768px 以上になると、ドロワーを閉じる。
 */
export const SchedulePageLayout = ({ reviewBadge, children }: SchedulePageLayoutProps) => {
  const isDesktop = useIsDesktop()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerId = useId()
  if (isDesktop && isDrawerOpen) setIsDrawerOpen(false)

  const renderSidebar = (onSelected?: () => void) => (
    <>
      <div className="border-b border-border px-4 pt-4 pb-5">
        <ScheduleMiniCalendarContainer onSelected={onSelected} />
      </div>
      <ScheduleCancelledToggleContainer />
      <StaffFilterSidebarContainer />
    </>
  )

  return (
    <SiteLayoutContainer
      current="/schedule"
      reviewBadge={reviewBadge}
      sidebar={renderSidebar()}
      startsWithRail
    >
      {!isDesktop && (
        <Drawer
          closeButtonTestId="site-sidebar-close"
          data-testid="site-sidebar-drawer"
          id={drawerId}
          isOpen={isDrawerOpen}
          onCloseRequest={() => setIsDrawerOpen(false)}
          title="日付と絞り込み"
        >
          {renderSidebar(() => setIsDrawerOpen(false))}
        </Drawer>
      )}
      <main className="min-h-0 min-w-0 grow">
        <ScheduleCalendarContainer
          staffFilterToggle={
            isDesktop
              ? undefined
              : { isOpen: isDrawerOpen, controlsId: drawerId, onOpen: () => setIsDrawerOpen(true) }
          }
        />
      </main>
      {children}
    </SiteLayoutContainer>
  )
}
