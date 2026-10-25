import { ScheduleCalendarContainer } from './ScheduleCalendarContainer'
import { ScheduleCancelledToggleContainer } from './ScheduleCancelledToggleContainer'
import { ScheduleMiniCalendarContainer } from './ScheduleMiniCalendarContainer'
import { StaffFilterLayout } from './StaffFilterLayout'
import { StaffFilterSidebarContainer } from './StaffFilterSidebarContainer'

/** `/schedule` のヘッダーより下。左のサイドバーに、キャンセルした予定の切り替え、職員の絞り込み、ミニカレンダーを置き、右にカレンダーを置く。 */
export const SchedulePageLayout = () => (
  <StaffFilterLayout
    renderCalendar={(staffFilterToggle) => (
      <ScheduleCalendarContainer staffFilterToggle={staffFilterToggle} />
    )}
    renderMiniCalendar={(onSelected) => <ScheduleMiniCalendarContainer onSelected={onSelected} />}
    staffFilter={
      <>
        <ScheduleCancelledToggleContainer />
        <StaffFilterSidebarContainer />
      </>
    }
  />
)
