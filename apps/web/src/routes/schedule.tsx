import { Outlet, createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'
import { ScheduleCalendarContainer } from '#/features/schedule/components/ScheduleCalendarContainer'
import { StaffFilterLayout } from '#/features/schedule/components/StaffFilterLayout'
import { StaffFilterSidebarContainer } from '#/features/schedule/components/StaffFilterSidebarContainer'
import {
  scheduleSearchDefaults,
  scheduleSearchSchema,
} from '#/features/schedule/schema/scheduleSearch'

export const Route = createFileRoute('/schedule')({
  validateSearch: scheduleSearchSchema,
  search: { middlewares: [stripSearchParams(scheduleSearchDefaults)] },
  // フェイクの API は予定をブラウザのメモリに持つため、サーバーで描画しない。bff ではサーバーで描画できるので見直す。
  ssr: false,
  head: () => ({ meta: [{ title: '予定 | buddy' }] }),
  component: SchedulePage,
})

function SchedulePage() {
  return (
    <SiteLayoutContainer current="/schedule">
      <StaffFilterLayout
        renderCalendar={(staffFilterToggle) => (
          <ScheduleCalendarContainer staffFilterToggle={staffFilterToggle} />
        )}
        staffFilter={<StaffFilterSidebarContainer />}
      />
      <Outlet />
    </SiteLayoutContainer>
  )
}
