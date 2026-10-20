import { Outlet, createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { SiteHeader } from '#/components/site/SiteHeader'
import { ViewerMenu } from '#/components/site/ViewerMenu'
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
  const { viewer, mode } = Route.useRouteContext()
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader
        actions={
          viewer !== null && <ViewerMenu staffName={viewer.staffName} canLogout={mode === 'bff'} />
        }
      />
      <div className="flex min-h-0 grow flex-col desktop:flex-row">
        <aside className="max-h-40 w-full shrink-0 overflow-auto border-b border-border desktop:max-h-none desktop:w-56 desktop:border-r desktop:border-b-0">
          <StaffFilterSidebarContainer />
        </aside>
        <main className="min-h-0 min-w-0 grow">
          <ScheduleCalendarContainer />
        </main>
      </div>
      <Outlet />
    </div>
  )
}
