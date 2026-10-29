import { Outlet, createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { SchedulePageLayout } from '#/features/schedule/components/SchedulePageLayout'
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
    <SchedulePageLayout>
      <Outlet />
    </SchedulePageLayout>
  )
}
