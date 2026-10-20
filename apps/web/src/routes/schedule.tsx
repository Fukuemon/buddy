import { Outlet, createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { SiteHeaderContainer } from '#/components/site/SiteHeaderContainer'
import { ScheduleCalendarContainer } from '#/features/schedule/components/ScheduleCalendarContainer'
import { StaffFilterSidebarContainer } from '#/features/schedule/components/StaffFilterSidebarContainer'
import {
  scheduleSearchDefaults,
  scheduleSearchSchema,
} from '#/features/schedule/schema/scheduleSearch'

export const Route = createFileRoute('/schedule')({
  validateSearch: scheduleSearchSchema,
  search: { middlewares: [stripSearchParams(scheduleSearchDefaults)] },
  // 偽物の API は予定をブラウザのメモリに持つため、サーバーで描画しない。bff ではサーバーで描画できるので見直す。
  ssr: false,
  head: () => ({ meta: [{ title: '予定 | buddy' }] }),
  component: SchedulePage,
})

function SchedulePage() {
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeaderContainer current="/schedule" />
      <div className="flex min-h-0 grow">
        <aside className="w-56 shrink-0 overflow-auto border-r border-border">
          <StaffFilterSidebarContainer />
        </aside>
        <main className="min-w-0 grow">
          <ScheduleCalendarContainer />
        </main>
      </div>
      <Outlet />
    </div>
  )
}
