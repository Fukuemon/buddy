import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, STAFF_MANAGE } from '#/api/permissions'
import { CalendarImportContainer } from '#/features/calendar/components/CalendarImportContainer'
import { calendarImportSearchSchema } from '#/features/calendar/schema/calendarImportSearch'

export const Route = createFileRoute('/schedule_/import')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  validateSearch: calendarImportSearchSchema,
  // 期間のデフォルト値を、職員のデバイスの日付で決めるため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '予定の取り込み | buddy' }] }),
  component: CalendarImportPage,
})

function CalendarImportPage() {
  const { staff } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <CalendarImportContainer
      onStaffChange={(staffId) => navigate({ search: { staff: staffId }, replace: true })}
      staffId={staff}
    />
  )
}
