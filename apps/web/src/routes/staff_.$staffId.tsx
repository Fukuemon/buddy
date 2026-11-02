import { createFileRoute } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { StaffDetailContainer } from '#/features/staff/components/StaffDetailContainer'

// `/staff` の子にすると職員の一覧の上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/staff_/$staffId')({
  // フェイクの API はデータをブラウザのメモリに持つため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '職員の詳細 | buddy' }] }),
  component: StaffDetailPage,
})

function StaffDetailPage() {
  const { staffId } = Route.useParams()
  return (
    <SiteLayoutContainer current="/staff" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <StaffDetailContainer key={staffId} staffId={staffId} />
      </main>
    </SiteLayoutContainer>
  )
}
