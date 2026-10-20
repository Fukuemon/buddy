import { Outlet, createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { SiteHeader } from '#/components/site/SiteHeader'
import { ScheduleCalendarContainer } from '#/features/schedule/components/ScheduleCalendarContainer'
import { StaffFilterSidebarContainer } from '#/features/schedule/components/StaffFilterSidebarContainer'
import {
  scheduleSearchDefaults,
  scheduleSearchSchema,
} from '#/features/schedule/schema/scheduleSearch'

export const Route = createFileRoute('/schedule')({
  validateSearch: scheduleSearchSchema,
  search: { middlewares: [stripSearchParams(scheduleSearchDefaults)] },
  // 予定は手元の偽物の API がブラウザのメモリに持つため、サーバーで描画しない。HTTP の API に替えたら見直す。
  ssr: false,
  head: () => ({ meta: [{ title: '予定 | buddy' }] }),
  component: SchedulePage,
})

function SchedulePage() {
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
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
