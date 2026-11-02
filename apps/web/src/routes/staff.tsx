import { Outlet, createFileRoute } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { StaffListContainer } from '#/features/staff/components/StaffListContainer'

export const Route = createFileRoute('/staff')({
  // フェイクの API はデータをブラウザのメモリに持つため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '職員 | buddy' }] }),
  component: StaffPage,
})

function StaffPage() {
  return (
    <SiteLayoutContainer current="/staff" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <StaffListContainer />
      </main>
      <Outlet />
    </SiteLayoutContainer>
  )
}
