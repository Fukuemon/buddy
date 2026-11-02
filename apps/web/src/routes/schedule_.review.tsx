import { createFileRoute } from '@tanstack/react-router'

import { RENDER_DATA_ON_SERVER } from '#/api/createBuddyApi'
import { awaitOnServer } from '#/api/prefetch'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { CalendarReviewContainer } from '#/features/calendar/components/CalendarReviewContainer'
import { exportIssueListQueryOptions } from '#/features/calendar/queries'

// `/schedule` の子にすると予定のカレンダーの上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/schedule_/review')({
  ssr: RENDER_DATA_ON_SERVER,
  // 権限が無ければ、Container が権限が無いことを示すので、API を呼ばない
  loader: ({ context: { api, queryClient, viewer } }) =>
    viewer?.canManageStaff
      ? awaitOnServer([
          queryClient.prefetchQuery(exportIssueListQueryOptions(api, viewer.facilityId)),
        ])
      : undefined,
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
