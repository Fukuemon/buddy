import { Outlet, createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { SchedulePageLayout } from '#/features/schedule/components/SchedulePageLayout'
import {
  scheduleSearchDefaults,
  scheduleSearchSchema,
} from '#/features/schedule/schema/scheduleSearch'

export const Route = createFileRoute('/schedule')({
  beforeLoad: requirePermission('none'),
  validateSearch: scheduleSearchSchema,
  search: { middlewares: [stripSearchParams(scheduleSearchDefaults)] },
  // 表示する日のデフォルトを職員のデバイスの日付で決め、FullCalendar がデバイスの時間帯で描くため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '予定 | buddy' }] }),
  staticData: { ownsSiteLayout: true },
  component: SchedulePage,
})

function SchedulePage() {
  return (
    <SchedulePageLayout reviewBadge={<CalendarReviewBadgeContainer />}>
      <Outlet />
    </SchedulePageLayout>
  )
}
