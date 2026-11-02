import { Drawer, useIsDesktop } from '@buddy/ui'
import { useId, useState, type ReactNode } from 'react'

import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'

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
 * 左の欄は、カレンダーのツールバーのボタンで開閉する。幅 768px 以上では開いた状態で始め、たたむとカレンダーを広げる。
 * 幅 768px 未満では、左の欄をドロワーに入れ、閉じた状態で始める。ミニカレンダーの日を押すと、ドロワーを閉じる。
 * ドロワーを開いたまま 768px 以上になると、ドロワーを閉じる。
 */
export const SchedulePageLayout = ({ reviewBadge, children }: SchedulePageLayoutProps) => {
  const isDesktop = useIsDesktop()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const sidebarId = useId()
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
      isSidebarOpen={isSidebarOpen}
      sidebar={<div id={sidebarId}>{renderSidebar()}</div>}
      startsWithRail
    >
      {!isDesktop && (
        <Drawer
          closeButtonTestId="site-sidebar-close"
          data-testid="site-sidebar-drawer"
          id={sidebarId}
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
              ? {
                  isOpen: isSidebarOpen,
                  controlsId: sidebarId,
                  opensDialog: false,
                  onToggle: () => setIsSidebarOpen((open) => !open),
                }
              : {
                  isOpen: isDrawerOpen,
                  controlsId: sidebarId,
                  opensDialog: true,
                  onToggle: () => setIsDrawerOpen(true),
                }
          }
        />
      </main>
      {children}
    </SiteLayoutContainer>
  )
}
