import { createFileRoute } from '@tanstack/react-router'

import { SiteHeaderContainer } from '#/components/site/SiteHeaderContainer'
import { IMPORT_NAV_ITEM } from '#/components/site/SiteNav'
import { CalendarImportContainer } from '#/features/calendar/components/CalendarImportContainer'
import { calendarImportSearchSchema } from '#/features/calendar/schema/calendarImportSearch'

// `/schedule` の子にすると予定のカレンダーの上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/schedule_/import')({
  validateSearch: calendarImportSearchSchema,
  // 期間の既定の値を、職員の端末の日付で決めるため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '予定の取り込み | buddy' }] }),
  component: CalendarImportPage,
})

function CalendarImportPage() {
  const { staff } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeaderContainer current={IMPORT_NAV_ITEM.href} />
      <main className="min-w-0 p-4 desktop:p-6">
        <CalendarImportContainer
          onStaffChange={(staffId) => navigate({ search: { staff: staffId }, replace: true })}
          staffId={staff}
        />
      </main>
    </div>
  )
}
