import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { CalendarReviewContainer } from '#/features/calendar/components/CalendarReviewContainer'
import { exportIssueListQueryOptions } from '#/features/calendar/queries'

export const Route = createFileRoute('/schedule_/review')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  ssr: RENDER_DATA_ON_SERVER,
  loader: ({ context: { api, queryClient, viewer } }) =>
    awaitOnServer([queryClient.prefetchQuery(exportIssueListQueryOptions(api, viewer.facilityId))]),
  head: () => ({ meta: [{ title: '確認が必要な予定 | buddy' }] }),
  component: CalendarReviewPage,
})

function CalendarReviewPage() {
  return (
    <SiteLayoutContainer current="/schedule/review" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <CalendarReviewContainer />
      </main>
    </SiteLayoutContainer>
  )
}
